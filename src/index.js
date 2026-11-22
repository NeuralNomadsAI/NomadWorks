import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import ignore from "ignore";
import { execFileSync } from "node:child_process";

import { Plugin } from "@opencode/plugin";
import { nomadworks_validate_logic } from "./validate_logic.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_AGENTS_DIR = path.join(PKG_ROOT, "agents");
const BUNDLE_POLICIES_DIR = path.join(PKG_ROOT, "policies");
const TEMPLATES_DIR = path.join(PKG_ROOT, "templates");
const MANDATORY_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const MINI_MODE_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const NOMADWORKS_DIRNAME = ".nomadworks";
const LEGACY_NOMADWORKS_DIRNAME = ".codenomad";

const activeWorkflows = new Map();
const closingDiscussions = new Set();

function checkoutRoot(directory) {
  const root = (() => {
    try {
      return execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
      }).trim();
    } catch {
      return directory;
    }
  })();
  return fs.realpathSync(root);
}

const string = description => ({ type: "string", description });
function tool({ description, args = {}, required = Object.keys(args), execute }) {
  return {
    description,
    input: { type: "object", properties: args, required, additionalProperties: false },
    execute
  };
}

function nomadworksDir(worktree) {
  return path.join(worktree, NOMADWORKS_DIRNAME);
}

function legacyNomadworksDir(worktree) {
  return path.join(worktree, LEGACY_NOMADWORKS_DIRNAME);
}

function repoConfigPath(worktree) {
  return path.join(nomadworksDir(worktree), "nomadworks.yaml");
}

function legacyRepoConfigPath(worktree) {
  return path.join(legacyNomadworksDir(worktree), "nomadworks.yaml");
}

function repoPoliciesDir(worktree) {
  return path.join(nomadworksDir(worktree), "policies");
}

function generatedPoliciesDir(worktree) {
  return path.join(nomadworksDir(worktree), "generated", "policies");
}

function generatedAgentsDir(worktree) {
  return path.join(nomadworksDir(worktree), "generated", "agents");
}

function repoAgentsDir(worktree) {
  return path.join(nomadworksDir(worktree), "agents");
}

function repoAgentAdditionsDir(worktree) {
  return path.join(nomadworksDir(worktree), "agent-additions");
}

function legacyRepoAgentsDir(worktree) {
  return path.join(legacyNomadworksDir(worktree), "nomadworks", "agents");
}

function runtimeDiscussionRegistryPath(worktree) {
  return path.join(nomadworksDir(worktree), "runtime", "discussions.json");
}

function legacyDiscussionRegistryPath(worktree) {
  return path.join(legacyNomadworksDir(worktree), "runtime", "discussions.json");
}

function resolveConfigPath(worktree) {
  const repoPath = repoConfigPath(worktree);
  if (fs.existsSync(repoPath)) return repoPath;

  const legacyPath = legacyRepoConfigPath(worktree);
  if (fs.existsSync(legacyPath)) return legacyPath;

  return repoPath;
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  try {
    return fs.readdirSync(dirPath)
      .filter(file => file.endsWith(".md") && file.toLowerCase() !== "readme.md");
  } catch (e) {
    console.error(`[NomadWorks] Failed to read markdown files from ${dirPath}:`, e);
    return [];
  }
}

function normalizePolicyExtraction(value) {
  if (typeof value !== "string") return "none";
  return value.trim().toLowerCase() === "all" ? "all" : "none";
}

function resolveIncludeFile(includeRef, repoRoot, bundleRoot) {
  const trimmed = includeRef.trim();
  const scopedMatch = trimmed.match(/^([a-z]+):(.*)$/i);
  const scope = scopedMatch?.[1]?.toLowerCase();
  const target = scopedMatch ? scopedMatch[2].trim() : trimmed;

  const resolveRelative = (baseDir, relativePath) => {
    if (!relativePath) return null;
    return path.isAbsolute(relativePath) ? relativePath : path.join(baseDir, relativePath);
  };

  if (scope === "plugin") {
    const filePath = resolveRelative(bundleRoot, target);
    return fs.existsSync(filePath) ? filePath : null;
  }

  if (scope === "repo") {
    const filePath = resolveRelative(nomadworksDir(repoRoot), target);
    return fs.existsSync(filePath) ? filePath : null;
  }

  if (scope === "policy") {
    const repoPolicyPath = resolveRelative(repoPoliciesDir(repoRoot), target);
    if (repoPolicyPath && fs.existsSync(repoPolicyPath)) return repoPolicyPath;

    const bundledPolicyPath = resolveRelative(BUNDLE_POLICIES_DIR, target);
    return bundledPolicyPath && fs.existsSync(bundledPolicyPath) ? bundledPolicyPath : null;
  }

  const repoPath = resolveRelative(repoRoot, target);
  if (repoPath && fs.existsSync(repoPath)) return repoPath;

  const bundlePath = resolveRelative(bundleRoot, target);
  return bundlePath && fs.existsSync(bundlePath) ? bundlePath : null;
}

/**
 * Resolves <include:...> markers recursively.
 * Supported forms:
 * - <include:path/to/file.md> (legacy: repo root first, then plugin bundle)
 * - <include:plugin:path/to/file.md>
 * - <include:repo:path/inside/.nomadworks>
 * - <include:policy:file.md> (.nomadworks/policies first, then bundled defaults)
 */
function resolveIncludes(text, repoRoot, bundleRoot) {
  const includeRegex = /<include:(.*?)>/g;
  return text.replace(includeRegex, (match, includeRef) => {
    const filePath = resolveIncludeFile(includeRef, repoRoot, bundleRoot);

    if (!filePath) {
      console.warn(`[NomadWorks] Include file not found: ${includeRef}`);
      return `\n\n# ERROR: Include file not found: ${includeRef}\n\n`;
    }

    const content = fs.readFileSync(filePath, "utf8");
    // Pass roots forward for recursive resolution
    return resolveIncludes(content, repoRoot, bundleRoot);
  });
}

function parseFrontmatter(mdText) {
  const lines = mdText.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { data: {}, body: mdText };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { data: {}, body: mdText };
  const fmText = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n");
  try {
    return { data: YAML.parse(fmText) || {}, body };
  } catch {
    return { data: {}, body };
  }
}

function modelReference(provider, model, variant) {
  if (!model) return undefined;
  if (typeof model === "object") {
    return modelReference(model.providerID || provider, model.id || model.model, model.variant || variant);
  }
  // With an explicit provider, model IDs may themselves contain a slash.
  model = model.trim();
  provider = provider?.trim();
  const ref = provider && !model.startsWith(`${provider}/`) ? `${provider}/${model}` : model;
  const slash = ref.indexOf("/");
  if (slash <= 0) return undefined;
  const [id, suffix] = ref.slice(slash + 1).split("#", 2);
  if (!id) return undefined;
  const providerID = ref.slice(0, slash);
  return { providerID: ({ "azure-cognitive-services": "azure", "google-vertex-anthropic": "google-vertex" })[providerID] || providerID, id,
    ...(suffix || variant ? { variant: suffix || variant } : {}) };
}

function readTaskMetadata(taskPath, worktree) {
  if (!taskPath) return {};

  const absoluteTaskPath = path.isAbsolute(taskPath)
    ? taskPath
    : path.join(worktree, taskPath);

  if (!fs.existsSync(absoluteTaskPath)) return {};

  try {
    const raw = fs.readFileSync(absoluteTaskPath, "utf8");
    const { data } = parseFrontmatter(raw);
    return {
      complexity: typeof data.complexity === "string" ? data.complexity.trim().toLowerCase() : undefined,
      track: typeof data.track === "string" ? data.track.trim().toLowerCase() : undefined,
      slice: typeof data.slice === "string" ? data.slice.trim().toLowerCase() : undefined,
      status: typeof data.status === "string" ? data.status.trim().toLowerCase() : undefined
    };
  } catch {
    return {};
  }
}

function hasActiveImplementationWorkflow(worktree) {
  for (const workflow of activeWorkflows.values()) {
    if (workflow.worktree === worktree && workflow.track === "implementation") {
      return true;
    }
  }
  return false;
}

function slugifyTitle(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "discussion";
}

function loadDiscussionRegistry(worktree) {
  const registryPath = fs.existsSync(runtimeDiscussionRegistryPath(worktree))
    ? runtimeDiscussionRegistryPath(worktree)
    : legacyDiscussionRegistryPath(worktree);
  if (!fs.existsSync(registryPath)) {
    return { version: 1, active: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    return {
      version: 1,
      active: parsed.active || {}
    };
  } catch {
    return { version: 1, active: {} };
  }
}

function saveDiscussionRegistry(worktree, registry) {
  const registryPath = runtimeDiscussionRegistryPath(worktree);
  const runtimeDir = path.dirname(registryPath);
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf8");
}

function runtimeDiscussionsDir(worktree) {
  return path.join(nomadworksDir(worktree), "runtime", "discussions");
}

function archivedRuntimeDiscussionsDir(worktree) {
  return path.join(runtimeDiscussionsDir(worktree), "archive");
}

function finalDiscussionsDir(worktree) {
  return path.join(worktree, "tasks", "discussions");
}

function nextDiscussionIdentity(worktree, title) {
  const discussionsDir = finalDiscussionsDir(worktree);
  const runtimeDir = runtimeDiscussionsDir(worktree);
  if (!fs.existsSync(discussionsDir)) fs.mkdirSync(discussionsDir, { recursive: true });
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });

  let sequence = 1;
  while (true) {
    const id = `DISCUSSION-${String(sequence).padStart(3, "0")}`;
    const filename = `${id}-${slugifyTitle(title)}.md`;
    const summaryRelativePath = path.join("tasks", "discussions", filename);
    const summaryAbsolutePath = path.join(worktree, summaryRelativePath);
    const transcriptFilename = `${id}-transcript.md`;
    const transcriptRelativePath = path.join(".nomadworks", "runtime", "discussions", transcriptFilename);
    const transcriptAbsolutePath = path.join(worktree, transcriptRelativePath);
    if (!fs.existsSync(summaryAbsolutePath) && !fs.existsSync(transcriptAbsolutePath)) {
      return {
        id,
        filename,
        summaryRelativePath,
        summaryAbsolutePath,
        transcriptFilename,
        transcriptRelativePath,
        transcriptAbsolutePath
      };
    }
    sequence += 1;
  }
}

function findDiscussionById(worktree, discussionID) {
  const discussionsDir = finalDiscussionsDir(worktree);
  if (!fs.existsSync(discussionsDir)) return null;

  const entries = fs.readdirSync(discussionsDir).filter(name => name.startsWith(`${discussionID}-`) && name.endsWith(".md"));
  if (entries.length === 0) return null;

  const filename = entries.sort()[0];
  const transcriptFilename = `${discussionID}-transcript.md`;
  return {
    id: discussionID,
    filename,
    summaryRelativePath: path.join("tasks", "discussions", filename),
    summaryAbsolutePath: path.join(discussionsDir, filename),
    transcriptFilename,
    transcriptRelativePath: path.join(".nomadworks", "runtime", "discussions", transcriptFilename),
    transcriptAbsolutePath: path.join(runtimeDiscussionsDir(worktree), transcriptFilename)
  };
}

function parseDiscussionFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  return { data, body: body.trimStart() };
}

function writeDiscussionFile(filePath, frontmatter, body) {
  const serialized = `---\n${YAML.stringify(frontmatter).trim()}\n---\n\n${body.trimEnd()}\n`;
  fs.writeFileSync(filePath, serialized, "utf8");
}

function setDiscussionStatus(filePath, status) {
  if (!fs.existsSync(filePath)) return;
  const { data, body } = parseDiscussionFile(filePath);
  writeDiscussionFile(filePath, { ...data, status }, body);
}

function appendDiscussionMessage(filePath, speaker, text, messageID = null) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { data, body } = parseDiscussionFile(filePath);
  const entry = `**${speaker}**\n${trimmed}`;
  const nextBody = body.trim() ? `${body.trimEnd()}\n\n${entry}` : entry;
  const nextFrontmatter = { ...data };
  if (messageID) {
    const prior = Array.isArray(nextFrontmatter.appended_message_ids) ? nextFrontmatter.appended_message_ids : [];
    if (!prior.includes(messageID)) {
      nextFrontmatter.appended_message_ids = [...prior, messageID];
    }
  }
  writeDiscussionFile(filePath, nextFrontmatter, nextBody);
}

function messageText(message) {
  if (message?.type === "user") return message.text.trim();
  if (message?.type !== "assistant" || !message.time.completed) return "";
  return message.content.filter(part => part.type === "text")
    .map(part => part.text.trim()).filter(Boolean).join("\n\n");
}

function finalReply(messages, promptID) {
  const index = messages.findIndex(message => message.id === promptID);
  if (index < 0) return "";
  return messages.slice(index + 1).reverse()
    .filter(message => message.type === "assistant")
    .map(messageText).find(Boolean) || "";
}

function appendConversationMessages(worktree, sessionID, messages) {
  const registry = loadDiscussionRegistry(worktree);
  const discussion = registry.active[sessionID];
  if (discussion?.status !== "active") return 0;
  const transcriptPath = path.join(worktree, discussion.transcriptPath);
  const recorded = parseDiscussionFile(transcriptPath).data.appended_message_ids;
  const seen = new Set([...(discussion.appendedMessageIDs || []), ...(recorded || [])]);
  let added = 0;
  for (const message of messages) {
    const text = messageText(message);
    if (!text || seen.has(message.id)) continue;
    appendDiscussionMessage(transcriptPath, message.type === "user" ? "User" : message.agent || discussion.agent || "Assistant", text, message.id);
    seen.add(message.id);
    added++;
  }
  if (added) {
    discussion.appendedMessageIDs = [...seen];
    saveDiscussionRegistry(worktree, registry);
  }
  return added;
}

async function summarizeDiscussionWithBA(ctx, worktree, discussion, signal) {
  const transcriptPath = path.join(worktree, discussion.transcriptPath);
  const summaryPath = path.join(worktree, discussion.summaryPath);
  const summaryDir = path.dirname(summaryPath);
  if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir, { recursive: true });

  const hasExistingSummary = fs.existsSync(summaryPath);
  const priorMtimeMs = hasExistingSummary ? fs.statSync(summaryPath).mtimeMs : null;
  const { id: sessionID } = await ctx.session.create({
    title: `Discussion Summary: ${discussion.id}`,
    agent: "business_analyst",
    location: { directory: worktree }
  }, { signal });

  const promptText = [
    "[Agent Message] From: product_manager To: business_analyst",
    "",
    "Read the full runtime discussion transcript and convert it into a workflow-ready discussion summary.",
    "",
    `Discussion ID: ${discussion.id}`,
    `Discussion Title: ${discussion.title}`,
    `Source transcript: ${discussion.transcriptPath}`,
    hasExistingSummary ? `Existing summary to update: ${discussion.summaryPath}` : "Existing summary to update: (none)",
    `Write the final summary to this exact file path: ${discussion.summaryPath}`,
    "",
    "Do not return the full summary in chat. Write it into the target file and then return only a short confirmation that includes:",
    "- the target file path",
    "- whether the write succeeded",
    "",
    "Requirements:",
    "1. Preserve all workflow-relevant detail.",
    "2. Remove greetings, filler, repetition, and conversational back-and-forth that does not affect execution.",
    "3. Do not omit facts, requests, constraints, non-goals, decisions, assumptions, open questions, risks, or referenced repository areas.",
    "4. If something is unresolved, record it under Open Questions rather than guessing.",
    "5. Convert implied but clearly supported details into explicit bullets when helpful.",
    "6. Optimize the result for PMA and later subagents to act on it efficiently.",
    "7. Do not include transcript-style dialogue formatting in the final artifact.",
    "8. If an existing summary file is present, read it and carry forward its still-valid details while integrating the new transcript content.",
    "",
    "Write the file in this exact structure:",
    "",
    "---",
    `id: ${discussion.id}`,
    `title: ${JSON.stringify(discussion.title)}`,
    "status: closed",
    "summarized_by: business_analyst",
    "source: runtime-transcript",
    "---",
    "",
    "# Discussion Summary",
    "",
    "## Topic",
    "<one short description>",
    "",
    "## Purpose",
    "<why this discussion happened>",
    "",
    "## Repository Truth Relevant To This Discussion",
    "- ...",
    "",
    "## Facts Established",
    "- ...",
    "",
    "## Requirements Captured",
    "- ...",
    "",
    "## Constraints",
    "- ...",
    "",
    "## Non-Goals",
    "- ...",
    "",
    "## Decisions Made",
    "- ...",
    "",
    "## Assumptions",
    "- ...",
    "",
    "## Open Questions",
    "- ...",
    "",
    "## Risks Or Concerns",
    "- ...",
    "",
    "## Referenced Files Or Areas",
    "- ...",
    "",
    "## Recommended Workflow Next Step",
    "- assigned_to: <agent or role>",
    "- why: <reason>",
    "",
    "Quality bar:",
    "- concise but complete",
    "- no fluff",
    "- no invented details",
    "- no lost workflow-relevant detail",
    "",
    "If a later agent could make a wrong decision because a detail was omitted, that omission is a failure."
  ].join("\n");

  try {
    await ctx.session.prompt({ sessionID, text: promptText }, { signal });
    await ctx.session.wait({ sessionID }, { signal });
    signal?.throwIfAborted();
    const session = await ctx.session.get({ sessionID }, { signal });
    if (session.outcome !== "succeeded") throw new Error(`Business Analyst run ${session.outcome || "did not complete"}.`);
    return { summaryPath, hasExistingSummary, priorMtimeMs };
  } finally {
    if (signal?.aborted) await ctx.session.interrupt({ sessionID, resume: false }).catch(console.error);
  }
}

function archiveDiscussionTranscript(worktree, transcriptRelativePath) {
  const sourcePath = path.join(worktree, transcriptRelativePath);
  if (!fs.existsSync(sourcePath)) return null;

  const archiveDir = archivedRuntimeDiscussionsDir(worktree);
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  const targetPath = path.join(archiveDir, path.basename(sourcePath));
  fs.renameSync(sourcePath, targetPath);
  return targetPath;
}

async function finalizeClosingDiscussion(ctx, worktree, sessionID, discussion, signal) {
  const { summaryPath, hasExistingSummary, priorMtimeMs } = await summarizeDiscussionWithBA(ctx, worktree, discussion, signal);
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Discussion summary was not written to ${discussion.summaryPath}`);
  }

  if (hasExistingSummary) {
    const currentMtimeMs = fs.statSync(summaryPath).mtimeMs;
    if (currentMtimeMs <= priorMtimeMs) {
      throw new Error(`Discussion summary file was not updated at ${discussion.summaryPath}`);
    }
  }

  const summaryContent = fs.readFileSync(summaryPath, "utf8").trim();
  if (!summaryContent) {
    throw new Error(`Discussion summary file is empty at ${discussion.summaryPath}`);
  }

  const transcriptPath = path.join(worktree, discussion.transcriptPath);
  setDiscussionStatus(transcriptPath, "closed");
  const archivedTranscriptPath = archiveDiscussionTranscript(worktree, discussion.transcriptPath);
  const registry = loadDiscussionRegistry(worktree);
  delete registry.active[sessionID];
  saveDiscussionRegistry(worktree, registry);

  return {
    summaryPath: discussion.summaryPath,
    archivedTranscriptPath: archivedTranscriptPath
      ? path.relative(worktree, archivedTranscriptPath)
      : path.join(".nomadworks", "runtime", "discussions", "archive", path.basename(discussion.transcriptPath))
  };
}

function normalizeTeamMode(value) {
  if (typeof value !== "string") return "full";
  const normalized = value.trim().toLowerCase();
  if (normalized === "mini") return "mini";
  return "full";
}

function isAgentEnabledForTeamMode(agentId, teamMode) {
  if (teamMode === "full") return true;
  return MINI_MODE_AGENTS.has(agentId);
}

function applyTeamConfigRules(repoCfg) {
  repoCfg.agents ??= {};
  repoCfg.policies ??= {};
  repoCfg.team_mode = normalizeTeamMode(repoCfg.team_mode);
  repoCfg.policies.extract_defaults = normalizePolicyExtraction(repoCfg.policies.extract_defaults);

  for (const id of MANDATORY_AGENTS) {
    if (repoCfg.agents[id]?.enabled === false) {
      console.warn(`[NomadWorks] '${id}' is mandatory and cannot be disabled. Ignoring override.`);
      repoCfg.agents[id] = { ...repoCfg.agents[id], enabled: true };
    }
  }

  return repoCfg;
}

function isAgentEffectivelyEnabled(agentId, repoCfg) {
  if (MANDATORY_AGENTS.has(agentId)) return true;
  const override = repoCfg.agents?.[agentId];
  if (override && typeof override.enabled === "boolean") {
    return override.enabled;
  }
  return isAgentEnabledForTeamMode(agentId, repoCfg.team_mode);
}

function getOperatingTeamMode(repoCfg) {
  return repoCfg.team_mode;
}

function permissionAction(action) {
  return ({ bash: "shell", task: "subagent", write: "edit", patch: "edit", apply_patch: "edit" })[action] || action;
}

function permissionRules(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [{ action: "*", resource: "*", effect: value }];
  return Object.entries(value || {}).flatMap(([action, rules]) =>
    (typeof rules === "string" ? [["*", rules]] : Object.entries(rules || {}))
      .map(([resource, effect]) => ({ action: permissionAction(action), resource, effect })));
}

function readResolvedFile(relativePath, worktree) {
  const filePath = resolveIncludeFile(`plugin:${relativePath}`, worktree, PKG_ROOT);
  if (!filePath || !fs.existsSync(filePath)) return "";
  return resolveIncludes(fs.readFileSync(filePath, "utf8"), worktree, PKG_ROOT).trim();
}

function loadMarkdownFragment(filePath, worktree) {
  if (!fs.existsSync(filePath)) return "";

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const { body } = parseFrontmatter(raw);
    return resolveIncludes(body.trim(), worktree, PKG_ROOT);
  } catch (e) {
    console.error(`[NomadWorks] Failed to read markdown fragment ${filePath}:`, e);
    return "";
  }
}

function loadAgentDefinition(filePath, worktree) {
  if (!fs.existsSync(filePath)) return null;

  try {
    const rawContent = fs.readFileSync(filePath, "utf8");
    const { data, body } = parseFrontmatter(rawContent);
    const prompt = resolveIncludes(body.trim(), worktree, PKG_ROOT);
    return { data, prompt };
  } catch (e) {
    console.error(`[NomadWorks] Failed to read agent definition ${filePath}:`, e);
    return null;
  }
}

function syncGeneratedPolicies(worktree, repoCfg) {
  if (repoCfg.policies?.extract_defaults !== "all") return;
  if (!fs.existsSync(BUNDLE_POLICIES_DIR)) return;

  const generatedDir = generatedPoliciesDir(worktree);
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  const policyFiles = fs.readdirSync(BUNDLE_POLICIES_DIR).filter(file => file.endsWith(".md") && file !== "README.md");

  for (const file of policyFiles) {
    const sourcePath = path.join(BUNDLE_POLICIES_DIR, file);
    const source = fs.readFileSync(sourcePath, "utf8").trimEnd();
    const generated = [
      "<!--",
      "Generated from NomadWorks plugin defaults.",
      "Do not edit this file directly; it may be overwritten.",
      `To customize this policy, copy it to .nomadworks/policies/${file}.`,
      "-->",
      "",
      source,
      ""
    ].join("\n");
    fs.writeFileSync(path.join(generatedDir, file), generated, "utf8");
  }
}

function ensureReadmeFile(dirPath, content) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  const readmePath = path.join(dirPath, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, content, "utf8");
  }
}

function scaffoldNomadworksReadmes(worktree) {
  ensureReadmeFile(repoPoliciesDir(worktree), fs.readFileSync(path.join(BUNDLE_POLICIES_DIR, "README.md"), "utf8"));
  ensureReadmeFile(repoAgentsDir(worktree), [
    "# Repository Agents",
    "",
    "Place full repository-local agent definitions here.",
    "",
    "- Use `.nomadworks/agents/<agent>.md` to override a bundled agent's full base definition.",
    "- Use `.nomadworks/agents/<agent>.md` to define a brand new custom repository agent.",
    "- Files in this folder are treated as full agent definitions.",
    "- `README.md` is ignored by agent discovery.",
    "",
    "## Include Types Available In Custom Agents",
    "",
    "Custom agents can use the same include resolution as bundled agents:",
    "",
    "- `<include:plugin:...>` for plugin-owned shared guidance",
    "- `<include:policy:...>` for repository-overridable policy files with bundled defaults",
    "- `<include:repo:...>` for explicit files under `.nomadworks/`",
    "",
    "## Common Plugin Includes",
    "",
    "- `plugin:Agents_Common.md`",
    "- `plugin:docs/core/agent_orchestration.md`",
    "- `plugin:docs/core/communication_guidelines.md`",
    "- `plugin:docs/core/discussion_agent_guidelines.md`",
    "- `plugin:docs/core/role_contracts.md`",
    "- `plugin:docs/core/task_model.md`",
    "- `plugin:docs/core/codemap_conventions.md`",
    "- `plugin:docs/core/pma_mode_full.md`",
    "- `plugin:docs/core/pma_mode_mini.md`",
    "- `plugin:docs/core/tech_lead_mode_full.md`",
    "- `plugin:docs/core/tech_lead_mode_mini.md`",
    "",
    "## Available Policy Includes",
    "",
    "- `policy:development-guidelines.md`",
    "- `policy:testing-guidelines.md`",
    "- `policy:documentation-guidelines.md`",
    "- `policy:git-commit-messaging.md`",
    "- `policy:product-guidelines.md`",
    "- `policy:ui-ux-guidelines.md`",
    ""
  ].join("\n"));
  ensureReadmeFile(repoAgentAdditionsDir(worktree), [
    "# Repository Agent Additions",
    "",
    "Place additive prompt fragments here to append repository-specific instructions to an existing agent.",
    "",
    "- Use `.nomadworks/agent-additions/<agent>.md` to add instructions to a bundled or custom repo agent.",
    "- The matching base agent must exist in the plugin bundle or `.nomadworks/agents/`.",
    "- `README.md` is ignored by agent discovery.",
    "",
    "## Include Types Available In Additions",
    "",
    "Agent additions can use the same include resolution as bundled agents and custom agents:",
    "",
    "- `<include:plugin:...>` for plugin-owned shared guidance",
    "- `<include:policy:...>` for repository-overridable policy files with bundled defaults",
    "- `<include:repo:...>` for explicit files under `.nomadworks/`",
    "",
    "## Common Plugin Includes",
    "",
    "- `plugin:Agents_Common.md`",
    "- `plugin:docs/core/agent_orchestration.md`",
    "- `plugin:docs/core/communication_guidelines.md`",
    "- `plugin:docs/core/discussion_agent_guidelines.md`",
    "- `plugin:docs/core/role_contracts.md`",
    "- `plugin:docs/core/task_model.md`",
    "- `plugin:docs/core/codemap_conventions.md`",
    "",
    "## Available Policy Includes",
    "",
    "- `policy:development-guidelines.md`",
    "- `policy:testing-guidelines.md`",
    "- `policy:documentation-guidelines.md`",
    "- `policy:git-commit-messaging.md`",
    "- `policy:product-guidelines.md`",
    "- `policy:ui-ux-guidelines.md`",
    ""
  ].join("\n"));
  ensureReadmeFile(generatedAgentsDir(worktree), [
    "# Generated Agent Prompts",
    "",
    "This folder contains generated final prompt dumps for inspection.",
    "",
    "- Files here are generated by NomadWorks and may be overwritten.",
    "- Do not edit files here to customize agent behavior.",
    "- Use `.nomadworks/agents/` for full agent definitions and `.nomadworks/agent-additions/` for additive instructions.",
    ""
  ].join("\n"));
  ensureReadmeFile(generatedPoliciesDir(worktree), [
    "# Generated Policy References",
    "",
    "This folder contains generated reference copies of bundled default policy files.",
    "",
    "- Files here are generated by NomadWorks and may be overwritten.",
    "- Runtime does not read policies from this folder directly.",
    "- Copy a file into `.nomadworks/policies/` if you want to customize it.",
    ""
  ].join("\n"));
}

function getModePromptFragment(agentId, operatingTeamMode, worktree) {
  const fragmentMap = {
    product_manager: {
      mini: "docs/core/pma_mode_mini.md",
      full: "docs/core/pma_mode_full.md"
    },
    tech_lead: {
      mini: "docs/core/tech_lead_mode_mini.md",
      full: "docs/core/tech_lead_mode_full.md"
    }
  };

  const fragmentPath = fragmentMap[agentId]?.[operatingTeamMode];
  if (!fragmentPath) return "";
  return readResolvedFile(fragmentPath, worktree);
}

export default Plugin.define({ id: "nomadworks", setup: setupNomadWorks });

async function setupNomadWorks(ctx) {
  const worktree = checkoutRoot(ctx.location.directory);
  const location = { directory: ctx.location.directory };
  const debugDir = generatedAgentsDir(worktree);
  const lifetime = new AbortController();
  const { signal } = lifetime;
  let repoCfg, operatingTeamMode, agentSnapshot, configError;

  function loadRepository() {
    const configPath = resolveConfigPath(worktree);
    repoCfg = { agents: {}, defaults: {}, features: {} };
    configError = undefined;
    if (fs.existsSync(configPath)) {
      try {
        const parsed = YAML.parse(fs.readFileSync(configPath, "utf8"));
        if (parsed !== null) {
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Expected a YAML mapping.");
          }
          repoCfg = parsed;
        }
      } catch (e) {
        configError = `${path.relative(worktree, configPath)}: ${e.message}`;
        console.error(`[NomadWorks] Failed to parse config at ${configPath}:`, e);
      }
    }

    repoCfg = applyTeamConfigRules(repoCfg);
    operatingTeamMode = getOperatingTeamMode(repoCfg);
    scaffoldNomadworksReadmes(worktree);
    syncGeneratedPolicies(worktree, repoCfg);
    agentSnapshot = compileAgents();
  }

  const canRunWorkflow = () => Boolean(agentSnapshot.workflow_runner) && operatingTeamMode === "full";
  const monitorWorkflow = async (sessionID, tracking) => {
    const identifier = tracking.taskPath || sessionID;
    let notification;
    try {
      while (true) {
        const admission = tracking.admission;
        const receipt = await admission;
        await ctx.session.wait({ sessionID }, { signal });
        signal.throwIfAborted();
        if (tracking.admission !== admission) continue;
        const session = await ctx.session.get({ sessionID }, { signal });
        const messages = session.outcome === "succeeded" ? await ctx.session.context({ sessionID }, { signal }) : [];
        if (tracking.admission !== admission) continue;
        if (session.outcome !== "succeeded") throw new Error(session.outcome || "execution did not complete");
        const reply = finalReply(messages, receipt.id);
        if (!reply) throw new Error("no final assistant reply was found for the latest prompt");
        notification = `[NomadFlow Notification] Workflow Runner has finished work for: ${identifier}.\n\nFINAL SUMMARY FROM RUNNER:\n${reply}`;
        break;
      }
    } catch (err) {
      notification = `[NomadFlow Error] Workflow Runner did not complete ${identifier}: ${err.message}`;
    } finally {
      if (activeWorkflows.get(sessionID) === tracking) activeWorkflows.delete(sessionID);
    }
    if (!signal.aborted) {
      await ctx.session.prompt({ sessionID: tracking.pmaSessionId, text: notification, delivery: "queue" }, { signal })
        .catch(err => console.error("[NomadFlow] Failed to notify PMA:", err));
    }
  };

  const tools = {
    nomadworks_init: tool({
      description: "Initialize the NomadWorks workflow and CodeMap in the current repository",
      args: {
        team_mode: string("Team mode to initialize: mini or full")
      },
      async execute(args, context) {
        const requestedTeamMode = typeof args.team_mode === "string" ? args.team_mode.trim().toLowerCase() : "";
        if (requestedTeamMode !== "mini" && requestedTeamMode !== "full") {
          return "Error: team_mode must be either 'mini' or 'full'.";
        }

        const cfgDir = nomadworksDir(context.worktree);
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

        // Discover all agent IDs to enable them explicitly
        const agentIds = fs.existsSync(BUNDLE_AGENTS_DIR) 
          ? fs.readdirSync(BUNDLE_AGENTS_DIR).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""))
          : [];

        const nomadworksTmplPath = path.join(TEMPLATES_DIR, "nomadworks.yaml.template");
        const codemapTmplPath = path.join(TEMPLATES_DIR, "codemap.yml.template");
        if (!fs.existsSync(nomadworksTmplPath) || !fs.existsSync(codemapTmplPath)) {
          return "Error: Initialization templates not found in plugin.";
        }

        let nomadworksConfig = fs.readFileSync(nomadworksTmplPath, "utf8");
        nomadworksConfig = nomadworksConfig.replace("{{teamMode}}", requestedTeamMode);
        
        // Append dynamically discovered agents to the template
        let agentsSection = "";
        for (const id of agentIds) {
          const enabled = isAgentEnabledForTeamMode(id, requestedTeamMode) ? "true" : "false";
          agentsSection += `  ${id}:\n    enabled: ${enabled}\n`;
        }
        nomadworksConfig = nomadworksConfig.replace(/^agents:$/m, "agents:\n" + agentsSection.trimEnd());

        let codemapConfig = fs.readFileSync(codemapTmplPath, "utf8");
        codemapConfig = codemapConfig.replace("{{projectName}}", path.basename(context.worktree));

        const cfgFilePath = resolveConfigPath(context.worktree);
        const rootCodemapPath = path.join(context.worktree, "codemap.yml");

        if (!fs.existsSync(cfgFilePath)) {
          fs.writeFileSync(cfgFilePath, nomadworksConfig, "utf8");
        }

        if (!fs.existsSync(rootCodemapPath)) {
          fs.writeFileSync(rootCodemapPath, codemapConfig, "utf8");
        }

        scaffoldNomadworksReadmes(context.worktree);

        // Scaffold Task Registries
        const tasksDir = path.join(context.worktree, "tasks");
        const scrsDir = path.join(context.worktree, "docs", "scrs");
        if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
        if (!fs.existsSync(scrsDir)) fs.mkdirSync(scrsDir, { recursive: true });

        const currentPath = path.join(tasksDir, "current.md");
        const donePath = path.join(tasksDir, "done.md");
        const scrsCurrentPath = path.join(scrsDir, "current.md");
        const scrsDonePath = path.join(scrsDir, "done.md");
        
        if (!fs.existsSync(currentPath)) {
          fs.writeFileSync(currentPath, "# Current Tasks (Backlog)\n\n## 💬 Active Discussions\n- (None)\n\n## 🚀 Active\n- (None)\n\n## 📋 Todo\n- (None)\n\n## 🛑 Blocked\n- (None)\n", "utf8");
        }
        if (!fs.existsSync(donePath)) {
          fs.writeFileSync(donePath, "# Completed Tasks (Registry)\n\n| Date | Task ID | SCR ID | Commit | Summary |\n| :--- | :--- | :--- | :--- | :--- |\n", "utf8");
        }
        if (!fs.existsSync(scrsCurrentPath)) {
          fs.writeFileSync(scrsCurrentPath, "# Current Spec Change Requests (Backlog)\n\n## 🚀 Active/Review\n- (None)\n\n## 📋 Approved (Ready for Implementation)\n- (None)\n\n## 💡 Proposed\n- (None)\n", "utf8");
        }
        if (!fs.existsSync(scrsDonePath)) {
          fs.writeFileSync(scrsDonePath, "# Implemented Spec Change Requests\n\n| Date | SCR ID | Title | Related Feature | Task ID |\n| :--- | :--- | :--- | :--- | :--- |\n", "utf8");
        }

        loadRepository();
        if (configError) return `FAIL: Fix the existing NomadWorks configuration before activating the team.\n${configError}`;
        await ctx.agent.reload();
        await ctx.tool.reload();
        if (repoCfg.enabled !== true) {
          return `NomadWorks files are ready, but the team is disabled in ${path.relative(worktree, cfgFilePath)}. Set enabled: true and run /reload to activate it.`;
        }
        return `NomadWorks initialized in '${operatingTeamMode}' team mode. Configuration: ${path.relative(worktree, cfgFilePath)}.`;
      }
    }),
    nomadworks_validate: tool({
      description: "Validate NomadWorks workflow artifacts and CodeMap integrity",
      args: {},
      async execute(args, context) {
        const res = await nomadworks_validate_logic(context.worktree);

        // Defensive: older plugin builds or custom forks may not return `warnings`.
        const warnings = Array.isArray(res?.warnings) ? res.warnings : [];
        const errors = Array.isArray(res?.errors) ? res.errors : [];

        if (res?.ok) {
          return `PASS: All source directories indexed. Hierarchy validated.\nWarnings: ${warnings.length}\n${warnings.map(w => "- " + w).join("\n")}`;
        }

        return `FAIL: Validation errors found:\n${errors.map(e => "- " + e).join("\n")}\nWarnings: ${warnings.length}\n${warnings.map(w => "- " + w).join("\n")}`;
      }
    }),
    nomadworks_start_discussion: tool({
      description: "Start an automatic discussion transcript for this session",
      args: {
        title: string("Discussion title for a new discussion"),
        existing_discussion_id: string("Existing discussion ID to reopen"),
        previous_message_count: { type: "integer", minimum: 0, description: "Number of earlier messages from the active session context to include" }
      },
      required: ["previous_message_count"],
      async execute(args, context) {
        const { sessionID } = context;
        if (!sessionID) return "Error: Session ID not found in context.";

        const history = args.previous_message_count > 0
          ? await ctx.session.context({ sessionID }, { signal: context.signal }).catch(err => {
            if (context.signal?.aborted) throw err;
            console.warn("[NomadWorks] Discussion backfill unavailable:", err);
            return [];
          })
          : [];
        const discussionRegistry = loadDiscussionRegistry(worktree);
        const existing = discussionRegistry.active[sessionID];
        if (existing) {
          return `FAIL: An active discussion already exists for this session.\nID: ${existing.id}\nTitle: ${existing.title}\nFile: ${existing.filePath}\nStatus: ${existing.status}`;
        }

        const title = typeof args.title === "string" ? args.title.trim() : "";
        const existingDiscussionID = typeof args.existing_discussion_id === "string" ? args.existing_discussion_id.trim() : "";

        if ((title && existingDiscussionID) || (!title && !existingDiscussionID)) {
          return "Error: Provide exactly one of 'title' or 'existing_discussion_id'.";
        }

        const previousMessageCount = args.previous_message_count;
        if (!Number.isInteger(previousMessageCount) || previousMessageCount < 0) {
          return "Error: previous_message_count must be a non-negative integer.";
        }

        const agent = context.agent || "assistant";
        let identity;
        let discussionTitle;
        let entry;

        if (existingDiscussionID) {
          identity = findDiscussionById(context.worktree, existingDiscussionID);
          if (!identity) {
            return `Error: Discussion '${existingDiscussionID}' was not found.`;
          }

          for (const [activeSessionID, activeDiscussion] of Object.entries(discussionRegistry.active)) {
            if (activeDiscussion.id === existingDiscussionID) {
              return `FAIL: Discussion '${existingDiscussionID}' is already active in session '${activeSessionID}'.\nFile: ${activeDiscussion.filePath}\nStatus: ${activeDiscussion.status}`;
            }
          }

          const existingFile = parseDiscussionFile(identity.summaryAbsolutePath);
          discussionTitle = existingFile.data.title || existingDiscussionID;
          const frontmatter = {
            id: existingDiscussionID,
            title: discussionTitle,
            status: "active",
            agent,
            session_id: sessionID,
            appended_message_ids: []
          };
          const body = [
            `# Discussion: ${discussionTitle}`,
            "",
            "## Prior Summary Reference",
            `Source summary file: ${identity.summaryRelativePath}`,
            "",
            "## Messages"
          ].join("\n");
          writeDiscussionFile(identity.transcriptAbsolutePath, frontmatter, body);

          entry = {
            id: existingDiscussionID,
            title: discussionTitle,
            transcriptPath: identity.transcriptRelativePath,
            summaryPath: identity.summaryRelativePath,
            status: "active",
            agent,
            appendedMessageIDs: []
          };
        } else {
          discussionTitle = title;
          identity = nextDiscussionIdentity(context.worktree, discussionTitle);
          const frontmatter = {
            id: identity.id,
            title: discussionTitle,
            status: "active",
            agent,
            session_id: sessionID,
            appended_message_ids: []
          };
          writeDiscussionFile(identity.transcriptAbsolutePath, frontmatter, `# Discussion: ${discussionTitle}\n\n## Messages`);

          entry = {
            id: identity.id,
            title: discussionTitle,
            transcriptPath: identity.transcriptRelativePath,
            summaryPath: identity.summaryRelativePath,
            status: "active",
            agent,
            appendedMessageIDs: []
          };
        }

        discussionRegistry.active[sessionID] = entry;
        saveDiscussionRegistry(context.worktree, discussionRegistry);

        const backfilled = previousMessageCount > 0
          ? appendConversationMessages(worktree, sessionID, history.filter(messageText).slice(-previousMessageCount))
          : 0;

        const action = existingDiscussionID ? "reopened" : "started";
        return `SUCCESS: Discussion ${action}.\nID: ${entry.id}\nTitle: ${discussionTitle}\nTranscript: ${entry.transcriptPath}\nFinal Summary Target: ${entry.summaryPath}\nStatus: active\nBackfilled messages: ${backfilled}`;
      }
    }),
    nomadworks_stop_discussion: tool({
      description: "Stop the automatic discussion transcript for this session",
      args: {},
      async execute(args, context) {
        const { sessionID } = context;
        if (!sessionID) return "Error: Session ID not found in context.";

        const discussionRegistry = loadDiscussionRegistry(worktree);
        const existing = discussionRegistry.active[sessionID];
        if (!existing) {
          return "FAIL: No active discussion exists for this session.";
        }
        const discussionPath = path.join(context.worktree, existing.transcriptPath);
        if (closingDiscussions.has(discussionPath)) return "FAIL: This discussion is already being summarized.";
        closingDiscussions.add(discussionPath);

        try {
          setDiscussionStatus(discussionPath, "summarizing");
          existing.status = "summarizing";
          saveDiscussionRegistry(context.worktree, discussionRegistry);
          const result = await finalizeClosingDiscussion(ctx, worktree, sessionID, existing, context.signal);
          return `SUCCESS: Discussion stopped and summarized.\nID: ${existing.id}\nTitle: ${existing.title}\nFinal Summary: ${result.summaryPath}\nStatus: closed`;
        } catch (err) {
          setDiscussionStatus(discussionPath, "active");
          const latest = loadDiscussionRegistry(worktree);
          if (latest.active[sessionID]) {
            latest.active[sessionID].status = "active";
            saveDiscussionRegistry(worktree, latest);
          }
          return `FAIL: Discussion summarization failed.\nID: ${existing.id}\nTitle: ${existing.title}\nTranscript: ${existing.transcriptPath}\nFinal Summary Target: ${existing.summaryPath}\nReason: ${err.message}`;
        } finally {
          closingDiscussions.delete(discussionPath);
        }
      }
    }),
     nomadflow_run_workflow: tool({
      description: "Start a workflow_runner session for a complex task",
      args: {
        task_path: string("Path to the task markdown file (e.g. tasks/todo/task_001.md)"),
        instructions: string("Detailed instructions for the workflow_runner")
      },
      async execute(args, context) {
        if (!canRunWorkflow()) {
          return "FAIL: Workflow Runner is unavailable in the current team configuration. Switch to full team mode to run complex workflows.";
        }

        const pmaSessionId = context.sessionID;
        if (!pmaSessionId) return "Error: PMA Session ID not found in context.";

        const taskMeta = readTaskMetadata(args.task_path, context.worktree);
        const workflowTrack = taskMeta.track || "implementation";

        if (workflowTrack === "implementation" && hasActiveImplementationWorkflow(worktree)) {
          return "FAIL: A shared-worktree implementation workflow is already running. You may continue investigation or spec work separately, but only one implementation workflow can own the shared worktree at a time.";
        }

        const reservation = Symbol("workflow creation");
        const tracking = { pmaSessionId, taskPath: args.task_path, track: workflowTrack, worktree };
        activeWorkflows.set(reservation, tracking);
        let sessionId;
        try {
          const session = await ctx.session.create({
            title: `Workflow Run: ${path.basename(args.task_path)}`,
            agent: "workflow_runner",
            location,
            metadata: { nomadworksWorkflow: { pmaSessionId, taskPath: args.task_path, track: workflowTrack } }
          }, { signal });
          sessionId = session.id;
          activeWorkflows.set(sessionId, tracking);
          
          const metadataSummary = [
            taskMeta.complexity ? `Complexity: ${taskMeta.complexity}` : null,
            workflowTrack ? `Track: ${workflowTrack}` : null,
            taskMeta.slice ? `Slice: ${taskMeta.slice}` : null,
            taskMeta.status ? `Status: ${taskMeta.status}` : null
          ].filter(Boolean).join("\n");

          const lifecycleInstruction = workflowTrack === "implementation"
            ? "You are the Workflow Runner. Execute the full lifecycle (Task Readiness Check -> Pre-Task Sync -> Workflow Execution Plan -> Delegate Implementation -> Delegate Verification -> Post-Task Sync -> Commit -> Archive). Read the task file first and verify it has sufficient PMA-provided task management context before doing anything else. Do not implement code directly. If implementation is required, delegate it to developer. If verification is required, delegate it to qa_engineer and tech_lead. If you hit a hard blocker, stop and END your run with a final summary that starts with 'HARD BLOCKER:' so the plugin can relay it back to PMA. Provide a final summary."
            : workflowTrack === "spec"
              ? "You are the Workflow Runner. Execute the full spec lifecycle for this task, delegate specialist work as needed, update the required documentation artifacts, and provide a final summary."
              : "You are the Workflow Runner. Execute the investigation lifecycle for this task, delegate specialist work as needed, capture findings clearly, and provide a final summary.";

          const initialText = `Task File: ${args.task_path}\n${metadataSummary ? `\n${metadataSummary}` : ""}\n\nInstructions: ${args.instructions}\n\n${lifecycleInstruction}`;
          
          tracking.admission = ctx.session.prompt({ sessionID: sessionId, text: initialText, delivery: "queue" }, { signal });
          await tracking.admission;
          void monitorWorkflow(sessionId, tracking);

          return `SUCCESS: Workflow Runner session started. ID: ${sessionId}\nTrack: ${workflowTrack}\nInstructions sent for ${args.task_path}. You will be notified on completion in this session (${pmaSessionId}).`;
        } catch (e) {
          if (sessionId) activeWorkflows.delete(sessionId);
          console.error("[NomadFlow] Failed to start workflow session:", e);
          return `FAIL: Failed to initiate session: ${e.message}`;
        } finally {
          activeWorkflows.delete(reservation);
        }
      }
    }),
    nomadflow_prompt_workflow: tool({
      description: "Send a message or follow-up prompt to an existing workflow_runner session",
      args: {
        session_id: string("The ID of the session started by nomadflow_run_workflow"),
        text: string("The message or instruction to send to the workflow_runner")
      },
      async execute(args, context) {
        if (!canRunWorkflow()) {
          return "FAIL: Workflow Runner is unavailable in the current team configuration. Switch to full team mode to send workflow runner prompts.";
        }

        const pmaSessionId = context.sessionID;
        if (!pmaSessionId) return "Error: PMA Session ID not found.";

        const sessionID = args.session_id;
        try {
          const session = await ctx.session.get({ sessionID }, { signal });
          const owner = session.metadata?.nomadworksWorkflow;
          if (owner?.pmaSessionId !== pmaSessionId || session.agent !== "workflow_runner" ||
              checkoutRoot(session.location.directory) !== worktree) {
            return "FAIL: This session is not a Workflow Runner owned by this PMA in the current worktree.";
          }
          let tracking = activeWorkflows.get(sessionID);
          if (!tracking) {
            if (owner.track === "implementation" && hasActiveImplementationWorkflow(worktree)) {
              return "FAIL: Another implementation workflow is already running in this worktree.";
            }
            tracking = { ...owner, worktree };
            activeWorkflows.set(sessionID, tracking);
            tracking.admission = ctx.session.prompt({ sessionID, text: args.text, delivery: "queue" }, { signal });
            try {
              await tracking.admission;
            } catch (err) {
              activeWorkflows.delete(sessionID);
              throw err;
            }
            void monitorWorkflow(sessionID, tracking);
          } else {
            const previous = tracking.admission;
            const admission = previous.then(() => ctx.session.prompt({ sessionID, text: args.text, delivery: "queue" }, { signal }));
            // A rejected follow-up does not replace the last admitted input.
            tracking.admission = admission.catch(() => previous);
            await admission;
          }
          return `SUCCESS: Prompt queued for '${sessionID}'. You will be notified when the runner finishes.`;
        } catch (e) {
          return `FAIL: Could not send prompt: ${e.message}`;
        }
      }
    })
  };

  function compileAgents() {
      const nomadworksActive = repoCfg && repoCfg.enabled === true;

      // 1. Identify and compile all NomadWorks agents from bundled bases,
      // repo-local full definitions, and additive repo-local fragments.
      const repoAgentDefinitions = repoAgentsDir(worktree);
      const repoAgentAdditions = repoAgentAdditionsDir(worktree);
      const legacyAgentsDir = legacyRepoAgentsDir(worktree);
      const bundledAgentFiles = listMarkdownFiles(BUNDLE_AGENTS_DIR);
      const repoAgentFiles = listMarkdownFiles(repoAgentDefinitions);
      const legacyAgentFiles = listMarkdownFiles(legacyAgentsDir);
      const agentIds = new Set([
        ...bundledAgentFiles.map(file => file.replace(".md", "")),
        ...repoAgentFiles.map(file => file.replace(".md", "")),
        ...legacyAgentFiles.map(file => file.replace(".md", ""))
      ]);

      const ourAgents = {};

      for (const id of agentIds) {
        const file = `${id}.md`;

        if (!nomadworksActive && id !== "product_manager") {
          continue;
        }

        const agentOverride = repoCfg.agents?.[id] || {};
        const hasRepoDefinedAgent = repoAgentFiles.includes(file) || legacyAgentFiles.includes(file);
        if (nomadworksActive) {
          const enabledByConfig = typeof agentOverride.enabled === "boolean" ? agentOverride.enabled : null;
          const enabled = enabledByConfig !== null
            ? enabledByConfig || MANDATORY_AGENTS.has(id)
            : (hasRepoDefinedAgent ? true : isAgentEffectivelyEnabled(id, repoCfg));
          if (!enabled) continue;
        }

        const bundledDefinition = loadAgentDefinition(path.join(BUNDLE_AGENTS_DIR, file), worktree);
        const repoDefinition = loadAgentDefinition(path.join(repoAgentDefinitions, file), worktree)
          || loadAgentDefinition(path.join(legacyAgentsDir, file), worktree);

        const activeDefinition = repoDefinition || bundledDefinition;
        if (!activeDefinition) continue;
        const { data } = activeDefinition;

        let finalPrompt = activeDefinition.prompt;
        const modePromptFragment = getModePromptFragment(id, operatingTeamMode, worktree);
        if (modePromptFragment) {
          finalPrompt = `${finalPrompt}\n\n${modePromptFragment}`;
        }

        const additionFragment = loadMarkdownFragment(path.join(repoAgentAdditions, file), worktree);
        if (additionFragment) {
          finalPrompt = `${finalPrompt}\n\n# Repository-Specific ${id} Additions\n\n${additionFragment}`;
        }

        const provider = agentOverride.provider || data.provider || repoCfg.defaults?.provider;
        const model = agentOverride.model || data.model || repoCfg.defaults?.model;

        const defaults = repoCfg.defaults || {};
        const settings = { ...defaults, ...data, ...agentOverride };
        const agentTools = { ...data.tools, ...agentOverride.tools };
        for (const name of agentOverride.tools_add || []) agentTools[name] = true;
        for (const name of agentOverride.tools_remove || []) delete agentTools[name];
        const permissions = [
          ...Object.entries(agentTools).map(([name, enabled]) => ({
            action: permissionAction(name), resource: "*", effect: enabled ? "allow" : "deny"
          })),
          ...permissionRules(agentOverride.permissions ?? agentOverride.permission ??
            data.permissions ?? data.permission ?? defaults.permissions ?? defaults.permission)
        ].filter(rule => ["allow", "ask", "deny"].includes(rule.effect));
        const agentConfig = {
          description: settings.description,
          mode: agentOverride.mode || data.mode || "subagent",
          system: finalPrompt,
          model: modelReference(provider, model, settings.variant),
          hidden: settings.hidden === true,
          color: settings.color,
          steps: settings.steps ?? settings.maxSteps,
          permissions
        };

        ourAgents[id] = agentConfig;

        if (repoCfg.features?.debug_dumps !== false) {
          const debugPath = path.join(debugDir, `${id}.md`);
          const { system, ...dumpConfig } = agentConfig;
          const debugHeader = `---
${YAML.stringify(dumpConfig).trim()}
---`;
          try {
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(debugPath, `${debugHeader}\n\n${system}`, "utf8");
          } catch (e) { /* ignore debug errors */ }
        }
      }

      if (operatingTeamMode !== "full" || !ourAgents.workflow_runner) {
        ourAgents.product_manager?.permissions.push(
          { action: "nomadflow_run_workflow", resource: "*", effect: "deny" },
          { action: "nomadflow_prompt_workflow", resource: "*", effect: "deny" }
        );
      }
      return ourAgents;
  }

  loadRepository();
  await ctx.agent.transform(editor => {
    if (repoCfg.features?.keep_builtin_agents !== true) {
      for (const agent of editor.list()) {
        if (!agent.hidden && !Object.hasOwn(agentSnapshot, agent.id)) editor.remove(agent.id);
      }
    }
    for (const [id, config] of Object.entries(agentSnapshot)) {
      editor.update(id, agent => {
        Object.assign(agent, structuredClone(config), { permissions: [...agent.permissions, ...structuredClone(config.permissions)] });
      });
    }
    editor.default("product_manager");
  });
  await ctx.tool.transform(editor => {
    for (const [name, definition] of Object.entries(tools)) {
      if (name.startsWith("nomadflow_") && !canRunWorkflow()) continue;
      editor.add({
        ...definition,
        name,
        options: { permission: name },
        async execute(args, context) {
          const session = await ctx.session.get({ sessionID: context.sessionID });
          if (checkoutRoot(session.location.directory) !== worktree) {
            return { content: "FAIL: This session is outside the plugin's current worktree." };
          }
          return { content: await definition.execute(args, {
            sessionID: context.sessionID, agent: context.agent, signal: context.signal, worktree
          }) };
        }
      });
    }
  });

  void (async () => {
    for await (const event of ctx.event.subscribe({ types: ["session.inbox.delivered", "session.step.ended"], signal })) {
      if (event.location && event.location.directory !== location.directory) continue;
      const { sessionID } = event.data;
      const discussion = loadDiscussionRegistry(worktree).active[sessionID];
      if (discussion?.status !== "active") continue;
      const messageID = event.type === "session.inbox.delivered" ? event.data.inboxID : event.data.assistantMessageID;
      try {
        const messages = await ctx.session.context({ sessionID }, { signal });
        if (!signal.aborted) appendConversationMessages(worktree, sessionID, messages.filter(message => message.id === messageID));
      } catch (err) {
        if (!signal.aborted) console.error("[NomadWorks] Failed to append discussion transcript:", err);
      }
    }
  })().catch(err => {
    if (!signal.aborted) console.error("[NomadWorks] Discussion event subscription stopped:", err);
  });

  return () => lifetime.abort();
}
