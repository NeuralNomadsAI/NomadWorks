import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
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
const SYNC_MANIFEST = "manifest.json";

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

function expandHome(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) return inputPath;
  const trimmed = inputPath.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

function globalNomadworksDir(options = {}) {
  const configuredRoot = options.global_root || options.nomadworks_root;
  if (configuredRoot) return path.resolve(expandHome(configuredRoot));
  const base = process.platform === "win32"
    ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
    : path.join(os.homedir(), ".config");
  return path.join(base, "nomadworks");
}

function globalPaiDir(options = {}) {
  return path.resolve(expandHome(options.pai_root || options.sync_repo_path || path.join(globalNomadworksDir(options), "pai")));
}

function globalPaiUserDir(options = {}) {
  return path.join(globalPaiDir(options), "USER");
}

function globalPaiMemoryDir(options = {}) {
  return path.join(globalPaiDir(options), "MEMORY");
}

function globalPaiLearningsDir(options = {}) {
  return path.join(globalPaiDir(options), "LEARNINGS");
}

function workspaceSyncRoot(syncRoot, worktree) {
  return path.join(syncRoot, "WORKSPACES", memoryRepoId(worktree));
}

function workspacePaiDirFromRoot(paiRoot, worktree) {
  return path.join(paiRoot, "WORKSPACES", memoryRepoId(worktree));
}

function workspacePaiMemoryDirFromRoot(paiRoot, worktree) {
  return path.join(workspacePaiDirFromRoot(paiRoot, worktree), "MEMORY");
}

function workspacePaiSessionsDirFromRoot(paiRoot, worktree) {
  return path.join(workspacePaiDirFromRoot(paiRoot, worktree), "SESSIONS");
}

function legacyRepoAgentsDir(worktree) {
  return path.join(legacyNomadworksDir(worktree), "nomadworks", "agents");
}

function memoryRepoId(worktree) {
  return path.basename(worktree).toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "repository";
}

function resolveConfiguredPaiRoot(worktree, repoCfg, options = {}, args = {}) {
  const configuredPath = typeof args.repo_path === "string" && args.repo_path.trim()
    ? args.repo_path.trim()
    : repoCfg.pai?.root || repoCfg.sync?.repo_path || options.pai_root || options.sync_repo_path;
  if (!configuredPath) throw new Error("Configure pai.root, sync.repo_path, pai_root, or sync_repo_path before using PAI sync.");
  const expandedPath = expandHome(configuredPath);
  const resolvedPath = path.isAbsolute(expandedPath)
    ? expandedPath
    : path.resolve(worktree, expandedPath);
  if (isPathInside(worktree, resolvedPath)) {
    throw new Error(`PAI root must be outside the workspace: ${resolvedPath}`);
  }
  return resolvedPath;
}

function resolveWorkspaceExchangeRoot(worktree, repoCfg, options = {}, args = {}) {
  return workspaceSyncRoot(resolveConfiguredPaiRoot(worktree, repoCfg, options, args), worktree);
}

function shouldScaffoldPaiOnLoad(repoCfg, options = {}) {
  return Boolean(repoCfg.pai?.root)
    || Boolean(repoCfg.sync?.repo_path)
    || Boolean(options.pai_root)
    || Boolean(options.sync_repo_path);
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|secret|password|credential)s?\b\s*[:=]\s*['\"]?[^\s'\"]{12,}/i,
  /\b(?:ghp|gho|ghu|ghs|github_pat|sk-[a-z0-9])[a-z0-9_\-]{16,}\b/i
];

function readManifest(manifestPath, fallback) {
  if (!fs.existsSync(manifestPath)) return fallback;
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(manifestPath, "utf8")) };
  } catch {
    return fallback;
  }
}

function parseSessionIds(value) {
  if (Array.isArray(value)) return value.map(String).map(id => id.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[\s,]+/).map(id => id.trim()).filter(Boolean);
}

function sessionTranscriptRelativePath(sessionId) {
  const safeId = sessionId.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "session";
  return path.join("SESSIONS", `${safeId}.json`);
}

function opencodeCommand(repoCfg, args = {}) {
  const configured = typeof args.opencode_command === "string" && args.opencode_command.trim()
    ? args.opencode_command.trim()
    : repoCfg.pai?.opencode_command;
  return configured || "opencode";
}

function runOpenCodeCommand(command, commandArgs, worktree) {
  const result = spawnSync(command, commandArgs, {
    cwd: worktree,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed: ${detail}`);
  }
  return result.stdout || "";
}

async function exportOpenCodeSessions(worktree, repoCfg, options = {}, args = {}) {
  const sessionIds = parseSessionIds(args.session_ids);
  if (sessionIds.length === 0 && args.current_session_id) sessionIds.push(args.current_session_id);
  if (sessionIds.length === 0) throw new Error("Provide at least one session ID in session_ids, or call this tool from an OpenCode session context.");

  const targetRoot = resolveWorkspaceExchangeRoot(worktree, repoCfg, options, args);
  if (!fs.existsSync(targetRoot)) fs.mkdirSync(targetRoot, { recursive: true });

  const manifestPath = path.join(targetRoot, "manifest.json");
  const manifest = readManifest(manifestPath, {
    version: 1,
    repository: path.basename(worktree),
    repository_id: memoryRepoId(worktree),
    exported_at: new Date().toISOString(),
    files: [],
    skipped_sensitive_files: []
  });

  const command = opencodeCommand(repoCfg, args);
  const exported = [];
  const failed = [];
  const manifestFiles = new Set(Array.isArray(manifest.files) ? manifest.files : []);

  for (const sessionId of sessionIds) {
    try {
      const relativePath = sessionTranscriptRelativePath(sessionId).replace(/\\/g, "/");
      const targetPath = path.join(targetRoot, relativePath);
      const content = runOpenCodeCommand(command, ["export", sessionId], worktree);
      if (SECRET_PATTERNS.some(pattern => pattern.test(content))) {
        manifest.skipped_sensitive_files ??= [];
        manifest.skipped_sensitive_files.push(relativePath);
        failed.push({ session_id: sessionId, reason: "native export matched sensitive content patterns" });
        continue;
      }

      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetPath, content, "utf8");
      manifestFiles.add(relativePath);
      exported.push({ session_id: sessionId, file: relativePath, format: "opencode-export-json" });
    } catch (e) {
      failed.push({ session_id: sessionId, reason: e.message });
    }
  }

  manifest.exported_at = new Date().toISOString();
  manifest.files = [...manifestFiles].sort();
  manifest.opencode_sessions ??= [];
  const priorSessions = new Map(manifest.opencode_sessions.map(entry => [entry.session_id, entry]));
  for (const entry of exported) priorSessions.set(entry.session_id, { ...entry, exported_at: manifest.exported_at });
  manifest.opencode_sessions = [...priorSessions.values()].sort((a, b) => a.session_id.localeCompare(b.session_id));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { targetRoot, exported, failed, manifest };
}

function importOpenCodeSessions(worktree, repoCfg, options = {}, args = {}) {
  const sourceRoot = resolveWorkspaceExchangeRoot(worktree, repoCfg, options, args);
  const manifestPath = path.join(sourceRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`PAI workspace manifest not found at ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestFiles = new Set(Array.isArray(manifest.files) ? manifest.files : []);
  const requestedIds = parseSessionIds(args.session_ids);
  const requestedSet = new Set(requestedIds);
  const sessions = Array.isArray(manifest.opencode_sessions) ? manifest.opencode_sessions : [];
  const selectedSessions = requestedSet.size > 0
    ? sessions.filter(session => requestedSet.has(session.session_id))
    : sessions;
  if (selectedSessions.length === 0) throw new Error("No matching OpenCode session exports found in manifest.");

  const command = opencodeCommand(repoCfg, args);
  const imported = [];
  const failed = [];

  for (const session of selectedSessions) {
    try {
      if (session.format !== "opencode-export-json") {
        failed.push({ session_id: session.session_id, reason: "unsupported session export format" });
        continue;
      }
      const sessionFile = String(session.file || "").replace(/\\/g, "/");
      const normalizedFile = path.posix.normalize(sessionFile);
      if (path.isAbsolute(sessionFile) || sessionFile.split("/").includes("..") || !/^SESSIONS\/[^/]+\.json$/.test(normalizedFile)) {
        failed.push({ session_id: session.session_id, reason: "invalid session export path" });
        continue;
      }
      if (!manifestFiles.has(normalizedFile)) {
        failed.push({ session_id: session.session_id, reason: "session export not listed in manifest files" });
        continue;
      }
      const sourcePath = path.join(sourceRoot, normalizedFile);
      if (!isPathInside(sourceRoot, sourcePath) || !fs.existsSync(sourcePath)) {
        failed.push({ session_id: session.session_id, reason: "export file not found" });
        continue;
      }
      runOpenCodeCommand(command, ["import", sourcePath], worktree);
      imported.push({ session_id: session.session_id, file: normalizedFile });
    } catch (e) {
      failed.push({ session_id: session.session_id, reason: e.message });
    }
  }

  return { sourceRoot, imported, failed };
}

function syncStatus(worktree, repoCfg, options, args = {}) {
  const root = resolveConfiguredPaiRoot(worktree, repoCfg, options, args);
  const workspaceManifestPath = path.join(workspaceSyncRoot(root, worktree), SYNC_MANIFEST);
  const readManifest = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return { error: "manifest is not valid JSON" };
    }
  };
  return {
    pai_root: root,
    is_git_repository: fs.existsSync(path.join(root, ".git")),
    git_status: fs.existsSync(path.join(root, ".git")) ? runGitStatus(root) : null,
    workspace_root: workspaceSyncRoot(root, worktree),
    workspace_manifest: readManifest(workspaceManifestPath)
  };
}

function runGitStatus(syncRoot) {
  const status = runGitSyncCommand(syncRoot, ["status", "--short", "--branch"]);
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  const branchLine = lines[0] || "";
  const divergence = branchLine.match(/\[(.*?)\]/)?.[1] || "";
  return {
    ...status,
    branch: branchLine.replace(/^##\s*/, "").replace(/\s*\[.*\]$/, ""),
    dirty: lines.slice(1).length > 0,
    ahead: Number(divergence.match(/ahead\s+(\d+)/)?.[1] || 0),
    behind: Number(divergence.match(/behind\s+(\d+)/)?.[1] || 0),
    has_upstream: branchLine.includes("...")
  };
}

function runGitSyncCommand(syncRoot, args, options = {}) {
  if (!fs.existsSync(path.join(syncRoot, ".git"))) throw new Error(`Sync root is not an existing Git repository: ${syncRoot}`);
  const result = spawnSync("git", args, { cwd: syncRoot, encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  const allowedStatuses = new Set([0, ...(options.allowStatuses || [])]);
  if (!allowedStatuses.has(result.status)) {
    const detail = (result.stderr || result.stdout || "unknown git error").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function resolvePaiContextFiles(worktree, repoCfg, options = {}) {
  if (repoCfg.features?.pai_context !== true) return [];
  const configuredFiles = Array.isArray(repoCfg.pai?.context_files) ? repoCfg.pai.context_files : [];
  const workspaceFiles = Array.isArray(repoCfg.pai?.workspace?.context_files)
    ? repoCfg.pai.workspace.context_files
    : ["MEMORY/PROJECT.md", "MEMORY/DECISIONS.md", "MEMORY/NOTES.md"];
  const includeGlobal = repoCfg.pai?.global?.enabled !== false && options.pai_global !== false;
  const includeWorkspace = repoCfg.pai?.workspace?.enabled !== false;
  let paiRoot;
  try {
    paiRoot = resolveConfiguredPaiRoot(worktree, repoCfg, options, {});
  } catch {
    return [];
  }
  const files = [];

  if (includeGlobal) {
    files.push(...configuredFiles
      .filter(file => typeof file === "string" && file.trim())
      .map(file => file.trim())
      .map(relativeFile => {
        const normalized = relativeFile.replace(/^[\\/]+/, "");
        const absolutePath = path.join(paiRoot, normalized);
        return { relativePath: path.join("PAI", normalized).replace(/\\/g, "/"), absolutePath, root: paiRoot };
      }));
  }

  if (includeWorkspace) {
    files.push(...workspaceFiles
    .filter(file => typeof file === "string" && file.trim())
    .map(file => file.trim())
    .map(relativeFile => {
      const normalized = relativeFile.replace(/^[\\/]+/, "");
      const workspaceRoot = workspacePaiDirFromRoot(paiRoot, worktree);
      const absolutePath = path.join(workspaceRoot, normalized);
      return { relativePath: path.join("WORKSPACES", memoryRepoId(worktree), normalized).replace(/\\/g, "/"), absolutePath, root: workspaceRoot };
    }));
  }

  return files.filter(file => isPathInside(file.root, file.absolutePath) && fs.existsSync(file.absolutePath) && fs.statSync(file.absolutePath).isFile());
}

function buildPaiContextFragment(agentId, worktree, repoCfg, options = {}) {
  const applyToAgents = Array.isArray(repoCfg.pai?.apply_to_agents) ? repoCfg.pai.apply_to_agents : [];
  if (!applyToAgents.includes(agentId)) return "";
  const files = resolvePaiContextFiles(worktree, repoCfg, options);
  if (files.length === 0) return "";

  const sections = [];
  for (const file of files) {
    const content = fs.readFileSync(file.absolutePath, "utf8").trim();
    if (!content) continue;
    sections.push(`## ${file.relativePath}\n\n${content}`);
  }
  if (sections.length === 0) return "";

  return [
    "# Optional PAI User Context",
    "",
    "Use this context as user/team steering input. It does not override repository truth, SCRs, tasks, evidence, docs, or CodeMaps.",
    "",
    ...sections
  ].join("\n");
}

function scaffoldGlobalPai(options = {}) {
  ensureReadmeFile(globalPaiDir(options), [
    "# NomadWorks Global PAI",
    "",
    "Personal AI Infrastructure context shared across repositories.",
    "",
    "- `USER/` stores identity, TELOS, and steering context.",
    "- `MEMORY/` stores durable cross-project memory.",
    "- `LEARNINGS/` stores reusable lessons and improvement loops.",
    ""
  ].join("\n"));
  ensureReadmeFile(globalPaiUserDir(options), [
    "# Global PAI User Context",
    "",
    "Place ABOUTME.md, TELOS.md, AISTEERINGRULES.md, and other personal context here.",
    ""
  ].join("\n"));
  ensureReadmeFile(globalPaiMemoryDir(options), [
    "# Global PAI Memory",
    "",
    "Durable personal memory shared across NomadWorks repositories.",
    ""
  ].join("\n"));
  ensureReadmeFile(globalPaiLearningsDir(options), [
    "# Global PAI Learnings",
    "",
    "Reusable lessons, preferences, and improvement notes learned across sessions.",
    ""
  ].join("\n"));
}

function scaffoldWorkspacePai(paiRoot, worktree) {
  const workspaceRoot = workspacePaiDirFromRoot(paiRoot, worktree);
  ensureReadmeFile(workspaceRoot, [
    `# Workspace PAI: ${path.basename(worktree)}`,
    "",
    "Project-specific AI memory stored outside the project repository.",
    "",
    "Repository truth still lives in the project repo; this folder is auxiliary AI memory.",
    ""
  ].join("\n"));
  ensureReadmeFile(workspacePaiMemoryDirFromRoot(paiRoot, worktree), [
    "# Workspace Memory",
    "",
    "Durable project-specific learnings, decisions, and context for NomadWorks agents.",
    ""
  ].join("\n"));
  ensureReadmeFile(workspacePaiSessionsDirFromRoot(paiRoot, worktree), [
    "# OpenCode Sessions",
    "",
    "Native `opencode export` JSON files for sessions related to this workspace.",
    ""
  ].join("\n"));
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
  return repoCfg.team_mode;
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
  const pluginOptions = input.options || input.config || {};
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
  if (shouldScaffoldPaiOnLoad(repoCfg, pluginOptions)) {
    try {
      const paiRoot = resolveConfiguredPaiRoot(worktree, repoCfg, pluginOptions, {});
      scaffoldGlobalPai({ ...pluginOptions, pai_root: paiRoot });
      scaffoldWorkspacePai(paiRoot, worktree);
    } catch (e) {
      console.error(`[NomadWorks] PAI scaffolding skipped for ${worktree}:`, e);
    }
  }
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
    nomadworks_session_export: tool({
      description: "Export selected OpenCode sessions with the native opencode export command into the workspace PAI sessions directory",
      args: {
        session_ids: tool.schema.string().describe("Optional OpenCode session IDs, separated by commas or whitespace. Uses the current session when empty."),
        repo_path: tool.schema.string().describe("Optional PAI root path. Uses pai.root, sync.repo_path, or plugin pai_root when empty."),
        opencode_command: tool.schema.string().describe("Optional OpenCode executable path or command. Defaults to pai.opencode_command or 'opencode'.")
      },
      async execute(args, context) {
        try {
          const currentSessionId = context.sessionId || context.sessionID;
          const exported = await exportOpenCodeSessions(context.worktree, repoCfg, pluginOptions, { ...args, current_session_id: currentSessionId });
          return JSON.stringify({
            exported_to: exported.targetRoot,
            exported_sessions: exported.exported,
            failed_sessions: exported.failed,
            next_step: "Commit and push the PAI repository with Git from the exported_to path or its parent repository. Import later with nomadworks_session_import."
          }, null, 2);
        } catch (e) {
          return `FAIL: ${e.message}`;
        }
      }
    }),
    nomadworks_session_import: tool({
      description: "Import selected OpenCode sessions from native opencode export JSON files in the workspace PAI sessions directory",
      args: {
        session_ids: tool.schema.string().describe("Optional session IDs to import. Imports all exported OpenCode sessions in the manifest when empty."),
        repo_path: tool.schema.string().describe("Optional PAI root path. Uses pai.root, sync.repo_path, or plugin pai_root when empty."),
        opencode_command: tool.schema.string().describe("Optional OpenCode executable path or command. Defaults to pai.opencode_command or 'opencode'.")
      },
      async execute(args, context) {
        try {
          const imported = importOpenCodeSessions(context.worktree, repoCfg, pluginOptions, args);
          return JSON.stringify({
            imported_from: imported.sourceRoot,
            imported_sessions: imported.imported,
            failed_sessions: imported.failed
          }, null, 2);
        } catch (e) {
          return `FAIL: ${e.message}`;
        }
      }
    }),
    nomadworks_sync_status: tool({
      description: "Show global PAI and workspace sync status",
      args: {
        repo_path: tool.schema.string().describe("Optional sync Git repository path. Uses pai.root, sync.repo_path, pai_root, or plugin sync_repo_path.")
      },
      async execute(args, context) {
        try {
          return JSON.stringify(syncStatus(context.worktree, repoCfg, pluginOptions, args), null, 2);
        } catch (e) {
          return `FAIL: ${e.message}`;
        }
      }
    }),
    nomadworks_sync_pull: tool({
      description: "Run git pull in the configured sync repository",
      args: {
        repo_path: tool.schema.string().describe("Optional sync Git repository path.")
      },
      async execute(args, context) {
        try {
          const root = resolveConfiguredPaiRoot(context.worktree, repoCfg, pluginOptions, args);
          return JSON.stringify({ sync_root: root, pull: runGitSyncCommand(root, ["pull", "--ff-only"]) }, null, 2);
        } catch (e) {
          return `FAIL: ${e.message}`;
        }
      }
    }),
    nomadworks_sync_push: tool({
      description: "Commit and push the configured sync repository",
      args: {
        repo_path: tool.schema.string().describe("Optional sync Git repository path."),
        message: tool.schema.string().describe("Optional commit message. Defaults to 'sync nomadworks pai'.")
      },
      async execute(args, context) {
        try {
          const root = resolveConfiguredPaiRoot(context.worktree, repoCfg, pluginOptions, args);
          const message = typeof args.message === "string" && args.message.trim() ? args.message.trim() : "sync nomadworks pai";
          const add = runGitSyncCommand(root, ["add", "."]);
          const commit = runGitSyncCommand(root, ["commit", "-m", message], { allowStatuses: [1] });
          const commitOutput = `${commit.stdout}\n${commit.stderr}`.toLowerCase();
          if (commit.status !== 0 && (commitOutput.includes("nothing to commit") || commitOutput.includes("no changes added to commit"))) {
            return JSON.stringify({
              sync_root: root,
              add,
              commit,
              push: null,
              status: "no_changes",
              message: "No PAI changes to commit."
            }, null, 2);
          }
          if (commit.status !== 0) {
            const detail = (commit.stderr || commit.stdout || "unknown git error").trim();
            return `FAIL: git commit -m ${message} failed: ${detail}`;
          }
          const push = runGitSyncCommand(root, ["push"]);
          return JSON.stringify({ sync_root: root, add, commit, push }, null, 2);
        } catch (e) {
          return `FAIL: ${e.message}`;
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
            ? "You are the Workflow Runner. Execute the full lifecycle (Task Readiness Check -> Pre-Task Sync -> Workflow Execution Plan -> Delegate Implementation -> Delegate Verification -> Post-Task Sync -> Commit -> Archive). Read the task file first and verify it has sufficient PMA-provided task management context before doing anything else. Do not implement code directly. If implementation is required, delegate it to developer. If verification is required, delegate it to qa_engineer and tech_lead. If you hit a hard blocker, stop and END your run with a final summary that starts with 'HARD BLOCKER:' so the plugin can relay it back to PMA. Provide a final summary."
            : workflowTrack === "spec"
              ? "You are the Workflow Runner. Execute the full spec lifecycle for this task, delegate specialist work as needed, update the required documentation artifacts, and provide a final summary."
              : "You are the Workflow Runner. Execute the investigation lifecycle for this task, delegate specialist work as needed, capture findings clearly, and provide a final summary.";

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

        const paiContextFragment = buildPaiContextFragment(id, worktree, repoCfg, pluginOptions);
        if (paiContextFragment) {
          finalPrompt = `${finalPrompt}\n\n${paiContextFragment}`;
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
      const preserveExistingAgents = repoCfg.features?.keep_builtin_agents === true;
      const allToDisable = preserveExistingAgents
        ? new Set()
        : new Set([...builtInAgents, ...Object.keys(cfg.agent)]);

      // Some users want to keep OpenCode's existing agents available alongside NomadWorks.
      // In that mode, avoid disabling anything that OpenCode already registered.
      
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
