import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import ignore from "ignore";

import { tool } from "@opencode-ai/plugin/tool";
import { nomadworks_validate_logic } from "./validate_logic.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_AGENTS_DIR = path.join(PKG_ROOT, "agents");
const BUNDLE_POLICIES_DIR = path.join(PKG_ROOT, "policies");
const TEMPLATES_DIR = path.join(PKG_ROOT, "templates");
const MANDATORY_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const MINI_MODE_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const DISCUSSION_BACKFILL_FETCH_LIMIT = 100;
const NOMADWORKS_DIRNAME = ".nomadworks";
const LEGACY_NOMADWORKS_DIRNAME = ".codenomad";

const activeWorkflows = new Map(); // sessionId -> { pmaSessionId, taskPath, track }

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

function toModelString(provider, model) {
  if (!model) return undefined;
  const m = model.trim();
  const p = provider ? provider.trim() : null;

  if (p) {
    if (m.startsWith(`${p}/`)) return m;
    return `${p}/${m}`;
  }
  return m;
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

function hasActiveImplementationWorkflow() {
  for (const workflow of activeWorkflows.values()) {
    if ((workflow.track || "implementation") === "implementation") {
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

function extractTextParts(parts) {
  return parts
    .filter(part => part.type === "text" && !part.ignored && !part.synthetic && typeof part.text === "string")
    .map(part => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

async function fetchSessionMessages(client, sessionID, limit) {
  const response = await client.session.messages({
    path: { id: sessionID },
    query: { limit }
  });
  return response.data || [];
}

function isBackfillableConversationMessage(message) {
  if (!message?.info) return false;
  if (message.info.role !== "user" && message.info.role !== "assistant") return false;
  const text = extractTextParts(message.parts || []);
  return Boolean(text);
}

function selectLastConversationMessages(messages, count) {
  if (count <= 0) return [];
  const eligible = messages.filter(isBackfillableConversationMessage);
  return eligible.slice(-count);
}

async function appendMessageIfNeeded(client, worktree, registry, sessionID, messageID, speaker) {
  const discussion = registry.active[sessionID];
  if (!discussion) return;
  if (discussion.appendedMessageIDs?.includes(messageID)) return;

  const response = await client.session.message({
    path: { id: sessionID, messageID }
  });
  const text = extractTextParts(response.data.parts || []);
  if (!text) return;

  appendDiscussionMessage(path.join(worktree, discussion.transcriptPath), speaker, text, messageID);
  discussion.appendedMessageIDs ??= [];
  discussion.appendedMessageIDs.push(messageID);
  saveDiscussionRegistry(worktree, registry);
}

async function summarizeDiscussionWithBA(client, worktree, discussion) {
  const transcriptPath = path.join(worktree, discussion.transcriptPath);
  const summaryPath = path.join(worktree, discussion.summaryPath);
  const summaryDir = path.dirname(summaryPath);
  if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir, { recursive: true });

  const hasExistingSummary = fs.existsSync(summaryPath);
  const priorMtimeMs = hasExistingSummary ? fs.statSync(summaryPath).mtimeMs : null;
  const summarizerSession = await client.session.create({
    body: { title: `Discussion Summary: ${discussion.id}` }
  });

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

  const response = await client.session.prompt({
    path: { id: summarizerSession.data.id },
    body: {
      agent: "business_analyst",
      parts: [{ type: "text", text: promptText }]
    }
  });

  const confirmation = extractTextParts(response.data.parts || []);
  return { confirmation, summaryPath, transcriptPath, hasExistingSummary, priorMtimeMs };
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

async function finalizeClosingDiscussion(client, worktree, registry, sessionID, discussion) {
  const { confirmation, summaryPath, hasExistingSummary, priorMtimeMs } = await summarizeDiscussionWithBA(client, worktree, discussion);
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
  delete registry.active[sessionID];
  saveDiscussionRegistry(worktree, registry);

  return {
    confirmation,
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
  const hasArchitect = isAgentEffectivelyEnabled("technical_architect", repoCfg);
  const hasRunner = isAgentEffectivelyEnabled("workflow_runner", repoCfg);
  return hasArchitect && hasRunner ? "full" : "mini";
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

export default async function NomadWorksPlugin(input) {
  const worktree = path.resolve(input.worktree || process.cwd());
  const debugDir = generatedAgentsDir(worktree);
  const configPath = resolveConfigPath(worktree);
  const discussionRegistry = loadDiscussionRegistry(worktree);

  // Load project-specific configuration
  let repoCfg = { agents: {}, defaults: {}, features: {} };
  if (fs.existsSync(configPath)) {
    try {
      repoCfg = YAML.parse(fs.readFileSync(configPath, "utf8")) || repoCfg;
    } catch (e) {
      console.error(`[NomadWorks] Failed to parse config at ${configPath}:`, e);
    }
  }
  repoCfg = applyTeamConfigRules(repoCfg);
  scaffoldNomadworksReadmes(worktree);
  syncGeneratedPolicies(worktree, repoCfg);
  const operatingTeamMode = getOperatingTeamMode(repoCfg);

  const startAndMonitorWorkflow = async (sessionId, pmaSessionId, initialText, taskPath = null) => {
    const client = input.client;
    if (!client) {
      console.error("[NomadFlow] No client available for monitoring.");
      return;
    }

      const debug = repoCfg.features?.debug_logs === true;

    const identifier = taskPath || sessionId;
    if (debug) console.log(`[NomadFlow] Starting monitor for session ${sessionId} (Identifier: ${identifier}). Targeted PMA session: ${pmaSessionId}`);

    try {
      // Blocking prompt call in a background promise
      if (debug) console.log(`[NomadFlow] Sending initial/resumed prompt to Workflow Runner session ${sessionId}...`);
      const runResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          agent: "workflow_runner",
          parts: [{ type: "text", text: initialText }]
        }
      });

      if (debug) console.log(`[NomadFlow] Workflow Runner session ${sessionId} returned control.`);

      // Capture final message and notify PMA
      const finalMessage = runResult.data.parts.map(p => p.text).join("\n");
      if (debug) console.log(`[NomadFlow] Attempting to notify PMA session ${pmaSessionId} of completion...`);
      
      await client.session.promptAsync({
        path: { id: pmaSessionId },
        body: {
          parts: [{ 
            type: "text", 
            text: `[NomadFlow Notification] Workflow Runner has finished work for: ${identifier}.\n\nFINAL SUMMARY FROM RUNNER:\n${finalMessage}` 
          }]
        }
      });
      if (debug) console.log(`[NomadFlow] Notification sent successfully to PMA session ${pmaSessionId}.`);
      activeWorkflows.delete(sessionId);
    } catch (err) {
      if (debug) console.error(`[NomadFlow] Error in monitor loop for session ${sessionId}:`, err);
      try {
        await client.session.promptAsync({
          path: { id: pmaSessionId },
          body: {
            parts: [{ type: "text", text: `[NomadFlow Error] Workflow Runner failed for ${identifier}: ${err.message}` }]
          }
        });
      } catch (notifyErr) {
        if (debug) console.error(`[NomadFlow] Failed to send error notification to PMA:`, notifyErr);
      }
      activeWorkflows.delete(sessionId);
    }
  };

  const tools = {
    nomadworks_init: tool({
      description: "Initialize the NomadWorks workflow and CodeMap in the current repository",
      args: {
        team_mode: tool.schema.string().describe("Team mode to initialize: mini or full")
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
        nomadworksConfig = nomadworksConfig.replace("agents:", "agents:\n" + agentsSection);

        let codemapConfig = fs.readFileSync(codemapTmplPath, "utf8");
        codemapConfig = codemapConfig.replace("{{projectName}}", path.basename(context.worktree));

        const cfgFilePath = path.join(cfgDir, "nomadworks.yaml");
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

        const initSummary = `NomadWorks initialized in '${requestedTeamMode}' team mode: .nomadworks/nomadworks.yaml, repo policy/agent folders, registries, and codemap.yml created.`;

        // Ensure OpenCode reloads config/agents after scaffolding changes.
        // Not all environments expose this API, so treat it as best-effort.
        const client = input.client;
        if (client?.instance?.dispose) {
          try {
            const disposeRes = await client.instance.dispose({ query: { directory: context.worktree } });
            if (disposeRes?.data === true) {
              return `${initSummary}\n\nOpenCode instance disposed so the new config can be loaded.`;
            }
            return `${initSummary}\n\nWarning: instance.dispose did not report success. You may need to restart OpenCode to load the new config.`;
          } catch (e) {
            return `${initSummary}\n\nWarning: Failed to dispose OpenCode instance (${e?.message || "unknown error"}). You may need to restart OpenCode to load the new config.`;
          }
        }

        return `${initSummary}\n\nNote: OpenCode instance dispose API unavailable in this environment. Restart OpenCode to load the new config.`;
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
        title: tool.schema.string().describe("Discussion title for a new discussion"),
        existing_discussion_id: tool.schema.string().describe("Existing discussion ID to reopen"),
        previous_message_count: tool.schema.number().describe("Number of earlier user and assistant messages from this session to include in the discussion before live capture starts")
      },
      async execute(args, context) {
        const sessionID = context.sessionId || context.sessionID;
        if (!sessionID) return "Error: Session ID not found in context.";

        const existing = discussionRegistry.active[sessionID];
        if (existing) {
          return `FAIL: An active discussion already exists for this session.\nID: ${existing.id}\nTitle: ${existing.title}\nFile: ${existing.filePath}\nStatus: ${existing.status}`;
        }

        const title = typeof args.title === "string" ? args.title.trim() : "";
        const existingDiscussionID = typeof args.existing_discussion_id === "string" ? args.existing_discussion_id.trim() : "";

        if ((title && existingDiscussionID) || (!title && !existingDiscussionID)) {
          return "Error: Provide exactly one of 'title' or 'existing_discussion_id'.";
        }

        const previousMessageCount = Number.isInteger(args.previous_message_count)
          ? args.previous_message_count
          : Number(args.previous_message_count);
        if (!Number.isFinite(previousMessageCount) || previousMessageCount < 0) {
          return "Error: previous_message_count must be a non-negative number.";
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

        let backfilled = 0;
        if (previousMessageCount > 0) {
          try {
            const messages = await fetchSessionMessages(input.client, sessionID, DISCUSSION_BACKFILL_FETCH_LIMIT);
            const ordered = [...messages].sort((a, b) => a.info.time.created - b.info.time.created);
            const selected = selectLastConversationMessages(ordered, previousMessageCount);

            for (const message of selected) {
              if (message.info.role === "user") {
                const text = extractTextParts(message.parts || []);
                if (text) {
                  appendDiscussionMessage(identity.transcriptAbsolutePath, "User", text, message.info.id);
                  if (!entry.appendedMessageIDs.includes(message.info.id)) entry.appendedMessageIDs.push(message.info.id);
                  backfilled += 1;
                }
              } else if (message.info.role === "assistant") {
                const text = extractTextParts(message.parts || []);
                if (text) {
                  appendDiscussionMessage(identity.transcriptAbsolutePath, agent, text, message.info.id);
                  if (!entry.appendedMessageIDs.includes(message.info.id)) entry.appendedMessageIDs.push(message.info.id);
                  backfilled += 1;
                }
              }
            }
            saveDiscussionRegistry(context.worktree, discussionRegistry);
          } catch {
            // Discussion stays active even if backfill fails.
          }
        }

        const action = existingDiscussionID ? "reopened" : "started";
        return `SUCCESS: Discussion ${action}.\nID: ${entry.id}\nTitle: ${discussionTitle}\nTranscript: ${entry.transcriptPath}\nFinal Summary Target: ${entry.summaryPath}\nStatus: active\nBackfilled messages: ${backfilled}`;
      }
    }),
    nomadworks_stop_discussion: tool({
      description: "Stop the automatic discussion transcript for this session",
      args: {},
      async execute(args, context) {
        const sessionID = context.sessionId || context.sessionID;
        if (!sessionID) return "Error: Session ID not found in context.";

        const existing = discussionRegistry.active[sessionID];
        if (!existing) {
          return "FAIL: No active discussion exists for this session.";
        }

        const discussionPath = path.join(context.worktree, existing.transcriptPath);
        setDiscussionStatus(discussionPath, "summarizing");
        existing.status = "summarizing";
        saveDiscussionRegistry(context.worktree, discussionRegistry);

        try {
          const result = await finalizeClosingDiscussion(input.client, context.worktree, discussionRegistry, sessionID, existing);
          return `SUCCESS: Discussion stopped and summarized.\nID: ${existing.id}\nTitle: ${existing.title}\nFinal Summary: ${result.summaryPath}\nStatus: closed`;
        } catch (err) {
          setDiscussionStatus(discussionPath, "active");
          existing.status = "active";
          saveDiscussionRegistry(context.worktree, discussionRegistry);
          return `FAIL: Discussion summarization failed.\nID: ${existing.id}\nTitle: ${existing.title}\nTranscript: ${existing.transcriptPath}\nFinal Summary Target: ${existing.summaryPath}\nReason: ${err.message}`;
        }
      }
    }),
     nomadflow_run_workflow: tool({
      description: "Start a workflow_runner session for a complex task",
      args: {
        task_path: tool.schema.string().describe("Path to the task markdown file (e.g. tasks/todo/task_001.md)"),
        instructions: tool.schema.string().describe("Detailed instructions for the workflow_runner")
      },
      async execute(args, context) {
        const client = input.client;
        if (!client) return "Error: OpenCode client not available in plugin context.";

        if (!isAgentEffectivelyEnabled("workflow_runner", repoCfg) || operatingTeamMode !== "full") {
          return "FAIL: Workflow Runner is unavailable in the current team configuration. Switch to full team mode to run complex workflows.";
        }

        const pmaSessionId = context.sessionId || context.sessionID;
        if (!pmaSessionId) return "Error: PMA Session ID not found in context.";

        const taskMeta = readTaskMetadata(args.task_path, context.worktree);
        const workflowTrack = taskMeta.track || "implementation";

        if (workflowTrack === "implementation" && hasActiveImplementationWorkflow()) {
          return "FAIL: A shared-worktree implementation workflow is already running. You may continue investigation or spec work separately, but only one implementation workflow can own the shared worktree at a time.";
        }

        try {
          // 1. Create a new session
          const sessionResult = await client.session.create({
            body: { title: `Workflow Run: ${path.basename(args.task_path)}` }
          });
          const sessionId = sessionResult.data.id;

          activeWorkflows.set(sessionId, { pmaSessionId, taskPath: args.task_path, track: workflowTrack });
          
          const metadataSummary = [
            taskMeta.complexity ? `Complexity: ${taskMeta.complexity}` : null,
            workflowTrack ? `Track: ${workflowTrack}` : null,
            taskMeta.slice ? `Slice: ${taskMeta.slice}` : null,
            taskMeta.status ? `Status: ${taskMeta.status}` : null
          ].filter(Boolean).join("\n");

          const lifecycleInstruction = workflowTrack === "implementation"
            ? "Please execute the full lifecycle (Sync -> Delegate Implementation -> Delegate Verification -> Post-Task Sync -> Commit -> Archive). Delegate implementation/QA to specialists by default. If you hit a hard blocker, stop and END your run with a final summary that starts with 'HARD BLOCKER:' so the plugin can relay it back to PMA. Provide a final summary."
            : workflowTrack === "spec"
              ? "Please execute the full spec lifecycle for this task, update the required documentation artifacts, and provide a final summary."
              : "Please execute the investigation lifecycle for this task, capture findings clearly, and provide a final summary.";

          const initialText = `Task File: ${args.task_path}\n${metadataSummary ? `\n${metadataSummary}` : ""}\n\nInstructions: ${args.instructions}\n\n${lifecycleInstruction}`;
          
          // Start monitoring in background (async)
          startAndMonitorWorkflow(sessionId, pmaSessionId, initialText, args.task_path);

          return `SUCCESS: Workflow Runner session started. ID: ${sessionId}\nTrack: ${workflowTrack}\nInstructions sent for ${args.task_path}. You will be notified on completion in this session (${pmaSessionId}).`;
        } catch (e) {
          console.error("[NomadFlow] Failed to start workflow session:", e);
          return `FAIL: Failed to initiate session: ${e.message}`;
        }
      }
    }),
    nomadflow_prompt_workflow: tool({
      description: "Send a message or follow-up prompt to an existing workflow_runner session",
      args: {
        session_id: tool.schema.string().describe("The ID of the session started by nomadflow_run_workflow"),
        text: tool.schema.string().describe("The message or instruction to send to the workflow_runner")
      },
      async execute(args, context) {
        const client = input.client;
        if (!client) return "Error: OpenCode client not available.";

        if (!isAgentEffectivelyEnabled("workflow_runner", repoCfg) || operatingTeamMode !== "full") {
          return "FAIL: Workflow Runner is unavailable in the current team configuration. Switch to full team mode to send workflow runner prompts.";
        }

        const pmaSessionId = context.sessionId || context.sessionID;
        if (!pmaSessionId) return "Error: PMA Session ID not found.";

        const tracking = activeWorkflows.get(args.session_id);

        try {
          // 1. If not currently tracked, start monitoring it now
          if (!tracking) {
            activeWorkflows.set(args.session_id, { pmaSessionId });
            
            // Start monitoring in background
            startAndMonitorWorkflow(args.session_id, pmaSessionId, args.text);
            return `SUCCESS: Session '${args.session_id}' was not tracked. Sent prompt and resumed monitoring. You will be notified on completion in this session (${pmaSessionId}).`;
          }

          // 2. If already tracking (runner is active), send asynchronously so PMA isn't blocked
          await client.session.promptAsync({
            path: { id: args.session_id },
            body: { parts: [{ type: "text", text: args.text }] }
          });

          return `SUCCESS: Prompt sent to active session '${args.session_id}'. Instructions added to queue.`;
        } catch (e) {
          return `FAIL: Could not send prompt: ${e.message}`;
        }
      }
    })
  };

  return {
    tool: tools,
    event: async ({ event }) => {
      const client = input.client;
      if (!client) return;

    const debug = repoCfg.features?.debug_logs === true;


      // Terminal error states: failed or stopped
      if (event.type === "session.failed" || event.type === "session.stopped") {
        const sessionID = event.properties?.sessionID;
        const tracking = activeWorkflows.get(sessionID);

        if (tracking) {
          if (debug) console.log(`[NomadFlow] Terminal event ${event.type} detected for session ${sessionID}. Notifying PMA...`);
          try {
            await client.session.promptAsync({
              path: { id: tracking.pmaSessionId },
              body: {
                parts: [{ 
                  type: "text", 
                  text: `[NomadFlow Error Notification] Workflow Runner session ${sessionID} has ${event.type.split('.')[1]}. Please check the runner session logs.` 
                }]
              }
            });
            activeWorkflows.delete(sessionID);
          } catch (err) {
            console.error(`[NomadFlow] Failed to notify PMA session:`, err);
          }
        }
      }

      if (event.type === "message.updated") {
        const info = event.properties?.info;
        if (!info?.sessionID || !discussionRegistry.active[info.sessionID]) return;

        try {
          if (info.role === "user") {
            await appendMessageIfNeeded(client, worktree, discussionRegistry, info.sessionID, info.id, "User");
          }

          if (info.role === "assistant" && info.time?.completed) {
            const discussion = discussionRegistry.active[info.sessionID];
            await appendMessageIfNeeded(client, worktree, discussionRegistry, info.sessionID, info.id, discussion.agent || "Assistant");
          }
        } catch (err) {
          if (debug) console.error("[NomadWorks] Failed to append discussion transcript:", err);
        }
      }
    },
    async config(cfg) {
      cfg.agent ??= {};
      
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

        const agentConfig = {
          description: data.description,
          mode: agentOverride.mode || data.mode || "subagent",
          prompt: finalPrompt,
          tools: { ...(data.tools || {}), ...(agentOverride.tools || {}) },
          permission: agentOverride.permission || data.permission || data.permissions || repoCfg.defaults?.permissions,
          model: toModelString(provider, model),
          temperature: agentOverride.temperature ?? data.temperature ?? repoCfg.defaults?.temperature,
          disable: false
        };

        const specialKeys = ['description', 'mode', 'model', 'provider', 'temperature', 'permission', 'permissions', 'tools', 'tools_add', 'tools_remove', 'enabled', 'prompt', 'disable'];

        const defaults = repoCfg.defaults || {};
        for (const k of Object.keys(defaults)) {
          if (!specialKeys.includes(k)) agentConfig[k] = defaults[k];
        }
        for (const k of Object.keys(data)) {
          if (!specialKeys.includes(k)) agentConfig[k] = data[k];
        }
        for (const k of Object.keys(agentOverride)) {
          if (!specialKeys.includes(k)) agentConfig[k] = agentOverride[k];
        }

        if (Array.isArray(agentOverride.tools_add)) {
          agentConfig.tools ??= {};
          for (const t of agentOverride.tools_add) agentConfig.tools[t] = true;
        }
        if (Array.isArray(agentOverride.tools_remove)) {
          if (agentConfig.tools) {
            for (const t of agentOverride.tools_remove) delete agentConfig.tools[t];
          }
        }

        if (id === "product_manager" && (!isAgentEffectivelyEnabled("workflow_runner", repoCfg) || operatingTeamMode !== "full")) {
          if (agentConfig.tools) {
            delete agentConfig.tools.nomadflow_run_workflow;
            delete agentConfig.tools.nomadflow_prompt_workflow;
          }
        }

        ourAgents[id] = agentConfig;

        if (repoCfg.features?.debug_dumps !== false) {
          const debugPath = path.join(debugDir, `${id}.md`);
          const { prompt, ...dumpConfig } = agentConfig;
          const debugHeader = `---
${YAML.stringify(dumpConfig).trim()}
---`;
          try {
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(debugPath, `${debugHeader}\n\n${prompt}`, "utf8");
          } catch (e) { /* ignore debug errors */ }
        }
      }

      const builtInAgents = ["build", "plan", "general", "explore"];
      const allToDisable = new Set([...builtInAgents, ...Object.keys(cfg.agent)]);

      // Some users want to keep OpenCode built-in agents available alongside NomadWorks.
      if (repoCfg.features?.keep_builtin_agents === true) {
        for (const id of builtInAgents) allToDisable.delete(id);
      }
      
      for (const id of allToDisable) {
        if (!ourAgents[id]) {
          cfg.agent[id] = { ...(cfg.agent[id] ?? {}), disable: true };
        }
      }

      for (const [id, config] of Object.entries(ourAgents)) {
        cfg.agent[id] = config;
      }

      cfg.default_agent = "product_manager";
    }
  };
}
