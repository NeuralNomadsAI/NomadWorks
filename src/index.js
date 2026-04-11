import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import ignore from "ignore";

import { tool } from "@opencode-ai/plugin/tool";
import { nomadworks_validate_logic } from "./validate_logic.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_AGENTS_DIR = path.join(PKG_ROOT, "agents");
const TEMPLATES_DIR = path.join(PKG_ROOT, "templates");
const MANDATORY_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const MINI_MODE_AGENTS = new Set(["product_manager", "business_analyst", "tech_lead"]);
const DISCUSSION_BACKFILL_FETCH_LIMIT = 100;

const activeWorkflows = new Map(); // sessionId -> { pmaSessionId, taskPath, track }

/**
 * Resolves <include:filename.md> markers recursively.
 * Checks repo (worktree) first, then falls back to bundle root.
 */
function resolveIncludes(text, repoRoot, bundleRoot) {
  const includeRegex = /<include:(.*?)>/g;
  return text.replace(includeRegex, (match, filename) => {
    // Check repo first, then bundle
    const repoPath = path.isAbsolute(filename) ? filename : path.join(repoRoot, filename);
    const bundlePath = path.isAbsolute(filename) ? filename : path.join(bundleRoot, filename);

    let filePath = null;
    if (fs.existsSync(repoPath)) {
      filePath = repoPath;
    } else if (fs.existsSync(bundlePath)) {
      filePath = bundlePath;
    }

    if (!filePath) {
      console.warn(`[NomadWorks] Include file not found: ${filename}`);
      return `\n\n# ERROR: Include file not found: ${filename}\n\n`;
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

function discussionRegistryPath(worktree) {
  return path.join(worktree, ".codenomad", "runtime", "discussions.json");
}

function loadDiscussionRegistry(worktree) {
  const registryPath = discussionRegistryPath(worktree);
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
  const registryPath = discussionRegistryPath(worktree);
  const runtimeDir = path.dirname(registryPath);
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf8");
}

function nextDiscussionIdentity(worktree, title) {
  const discussionsDir = path.join(worktree, "tasks", "discussions");
  if (!fs.existsSync(discussionsDir)) fs.mkdirSync(discussionsDir, { recursive: true });

  let sequence = 1;
  while (true) {
    const id = `DISCUSSION-${String(sequence).padStart(3, "0")}`;
    const filename = `${id}-${slugifyTitle(title)}.md`;
    const relativePath = path.join("tasks", "discussions", filename);
    const absolutePath = path.join(worktree, relativePath);
    if (!fs.existsSync(absolutePath)) {
      return { id, filename, relativePath, absolutePath };
    }
    sequence += 1;
  }
}

function findDiscussionById(worktree, discussionID) {
  const discussionsDir = path.join(worktree, "tasks", "discussions");
  if (!fs.existsSync(discussionsDir)) return null;

  const entries = fs.readdirSync(discussionsDir).filter(name => name.startsWith(`${discussionID}-`) && name.endsWith(".md"));
  if (entries.length === 0) return null;

  const filename = entries.sort()[0];
  return {
    filename,
    relativePath: path.join("tasks", "discussions", filename),
    absolutePath: path.join(discussionsDir, filename)
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

  appendDiscussionMessage(path.join(worktree, discussion.filePath), speaker, text, messageID);
  discussion.appendedMessageIDs ??= [];
  discussion.appendedMessageIDs.push(messageID);
  saveDiscussionRegistry(worktree, registry);
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
  repoCfg.team_mode = normalizeTeamMode(repoCfg.team_mode);

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
  const repoPath = path.join(worktree, relativePath);
  const bundlePath = path.join(PKG_ROOT, relativePath);
  const filePath = fs.existsSync(repoPath) ? repoPath : bundlePath;
  if (!fs.existsSync(filePath)) return "";
  return resolveIncludes(fs.readFileSync(filePath, "utf8"), worktree, PKG_ROOT).trim();
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
  const debugDir = path.join(worktree, ".nomadworks", "agents");
  const configPath = path.join(worktree, ".codenomad", "nomadworks.yaml");
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

        const cfgDir = path.join(context.worktree, ".codenomad");
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

        return `NomadWorks initialized in '${requestedTeamMode}' team mode: .codenomad/nomadworks.yaml, registries, and codemap.yml created.`;
      }
    }),
    nomadworks_validate: tool({
      description: "Validate NomadWorks workflow artifacts and CodeMap integrity",
      args: {},
      async execute(args, context) {
        const res = await nomadworks_validate_logic(context.worktree);
        if (res.ok) {
          return `PASS: All source directories indexed. Hierarchy validated.\nWarnings: ${res.warnings.length}\n${res.warnings.map(w => "- " + w).join("\n")}`;
        } else {
          return `FAIL: Validation errors found:\n${res.errors.map(e => "- " + e).join("\n")}\nWarnings: ${res.warnings.length}\n${res.warnings.map(w => "- " + w).join("\n")}`;
        }
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

          const existingFile = parseDiscussionFile(identity.absolutePath);
          discussionTitle = existingFile.data.title || existingDiscussionID;
          writeDiscussionFile(identity.absolutePath, {
            ...existingFile.data,
            status: "active",
            agent,
            session_id: sessionID
          }, existingFile.body);

          entry = {
            id: existingDiscussionID,
            title: discussionTitle,
            filePath: identity.relativePath,
            status: "active",
            agent,
            appendedMessageIDs: Array.isArray(existingFile.data.appended_message_ids) ? [...existingFile.data.appended_message_ids] : []
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
          writeDiscussionFile(identity.absolutePath, frontmatter, `# Discussion: ${discussionTitle}\n\n## Messages`);

          entry = {
            id: identity.id,
            title: discussionTitle,
            filePath: identity.relativePath,
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
                  appendDiscussionMessage(identity.absolutePath, "User", text, message.info.id);
                  if (!entry.appendedMessageIDs.includes(message.info.id)) entry.appendedMessageIDs.push(message.info.id);
                  backfilled += 1;
                }
              } else if (message.info.role === "assistant") {
                const text = extractTextParts(message.parts || []);
                if (text) {
                  appendDiscussionMessage(identity.absolutePath, agent, text, message.info.id);
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
        return `SUCCESS: Discussion ${action}.\nID: ${entry.id}\nTitle: ${discussionTitle}\nFile: ${identity.relativePath}\nStatus: active\nBackfilled messages: ${backfilled}`;
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

        const discussionPath = path.join(context.worktree, existing.filePath);
        setDiscussionStatus(discussionPath, "closing");
        existing.status = "closing";
        saveDiscussionRegistry(context.worktree, discussionRegistry);

        return `SUCCESS: Discussion stop requested.\nID: ${existing.id}\nTitle: ${existing.title}\nFile: ${existing.filePath}\nStatus: closing`;
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
            ? "Please execute the full lifecycle (Sync -> Implementation -> Commit -> Archive) and provide a final summary."
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
            if (discussion?.status === "closing") {
              setDiscussionStatus(path.join(worktree, discussion.filePath), "closed");
              delete discussionRegistry.active[info.sessionID];
              saveDiscussionRegistry(worktree, discussionRegistry);
            }
          }
        } catch (err) {
          if (debug) console.error("[NomadWorks] Failed to append discussion transcript:", err);
        }
      }
    },
    async config(cfg) {
      cfg.agent ??= {};
      
      const nomadworksActive = repoCfg && repoCfg.enabled === true;

      // 1. Identify and compile all NomadWorks agents
      const repoAgentsDir = path.join(worktree, ".codenomad", "nomadworks", "agents");
      const agentSources = [];
      if (fs.existsSync(BUNDLE_AGENTS_DIR)) agentSources.push(BUNDLE_AGENTS_DIR);
      if (fs.existsSync(repoAgentsDir)) agentSources.push(repoAgentsDir);

      const ourAgents = {};

      for (const agentsDir of agentSources) {
        if (!fs.existsSync(agentsDir)) continue;
        
        let files = [];
        try {
          files = fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"));
        } catch (e) {
          console.error(`[NomadWorks] Failed to read agents from ${agentsDir}:`, e);
          continue;
        }

        for (const file of files) {
          const id = file.replace(".md", "");
          
          if (!nomadworksActive && id !== "product_manager") {
            continue;
          }

          const agentOverride = repoCfg.agents?.[id] || {};
          if (nomadworksActive && !isAgentEffectivelyEnabled(id, repoCfg)) continue;

          const filePath = path.join(agentsDir, file);
          let rawContent;
          try {
            rawContent = fs.readFileSync(filePath, "utf8");
          } catch (e) {
            console.error(`[NomadWorks] Failed to read agent file ${filePath}:`, e);
            continue;
          }

          const { data, body } = parseFrontmatter(rawContent);
          let finalPrompt = resolveIncludes(body.trim(), worktree, PKG_ROOT);
          const modePromptFragment = getModePromptFragment(id, operatingTeamMode, worktree);
          if (modePromptFragment) {
            finalPrompt = `${finalPrompt}\n\n${modePromptFragment}`;
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
      }

      const builtInAgents = ["build", "plan", "general", "explore"];
      const allToDisable = new Set([...builtInAgents, ...Object.keys(cfg.agent)]);
      
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
