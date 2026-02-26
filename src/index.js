import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { tool } from "@opencode-ai/plugin/tool";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_DIR = path.join(PKG_ROOT, "agents");
const TEMPLATES_DIR = path.join(PKG_ROOT, "templates");

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
  if (model.includes("/")) return model;
  if (!provider) return model;
  return `${provider}/${model}`;
}

export default async function NomadWorksPlugin(input) {
  const worktree = path.resolve(input.worktree || process.cwd());
  const debugDir = path.join(worktree, ".nomadworks", "agents");
  const configPath = path.join(worktree, ".codenomad", "nomadworks.yaml");

  // Load project-specific configuration
  let repoCfg = { agents: {}, defaults: {}, features: {} };
  if (fs.existsSync(configPath)) {
    try {
      repoCfg = YAML.parse(fs.readFileSync(configPath, "utf8")) || repoCfg;
    } catch (e) {
      console.error(`[NomadWorks] Failed to parse config at ${configPath}:`, e);
    }
  }

  const tools = {
    nomadworks_init: tool({
      description: "Initialize the NomadWorks workflow and CodeMap in the current repository",
      args: {},
      async execute(args, context) {
        const cfgDir = path.join(context.worktree, ".codenomad");
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

        // Discover all agent IDs to enable them explicitly
        const agentIds = fs.existsSync(AGENTS_DIR) 
          ? fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""))
          : [];

        const nomadworksTmplPath = path.join(TEMPLATES_DIR, "nomadworks.yaml.template");
        const codemapTmplPath = path.join(TEMPLATES_DIR, "codemap.yml.template");

        if (!fs.existsSync(nomadworksTmplPath) || !fs.existsSync(codemapTmplPath)) {
          return "Error: Initialization templates not found in plugin.";
        }

        let nomadworksConfig = fs.readFileSync(nomadworksTmplPath, "utf8");
        
        // Append dynamically discovered agents to the template
        let agentsSection = "";
        for (const id of agentIds) {
          agentsSection += `  ${id}:\n    enabled: true\n`;
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

        return "NomadWorks initialized: .codenomad/nomadworks.yaml and codemap.yml created.";
      }
    }),
    nomadworks_validate: tool({
      description: "Validate NomadWorks workflow artifacts and CodeMap integrity",
      args: {},
      async execute(args, context) {
        const rootCodemapPath = path.join(context.worktree, "codemap.yml");
        if (!fs.existsSync(rootCodemapPath)) return "FAIL: Root codemap.yml not found.";

        const errors = [];
        const warnings = [];

        function validateMap(filePath) {
          const content = fs.readFileSync(filePath, "utf8");
          let map;
          try {
            map = YAML.parse(content);
          } catch (e) {
            errors.push(`${filePath}: Invalid YAML.`);
            return;
          }

          const dir = path.dirname(filePath);

          // Check if all module pointers have their own codemaps
          if (Array.isArray(map.modules)) {
            for (const mod of map.modules) {
              const modPath = path.join(context.worktree, mod.path);
              const modCodemap = path.join(modPath, "codemap.yml");
              if (!fs.existsSync(modPath)) {
                errors.push(`${filePath}: Module path does not exist: ${mod.path}`);
              } else if (!fs.existsSync(modCodemap)) {
                errors.push(`${filePath}: Module '${mod.path}' is missing its mandatory codemap.yml.`);
              }
            }
          }

          // Rule of Local Knowledge: Ensure no deep paths in entrypoints or sources_of_truth
          const pathKeys = ["entrypoints", "sources_of_truth", "links"];
          for (const key of pathKeys) {
            if (Array.isArray(map[key])) {
              for (const entry of map[key]) {
                if (entry.path && entry.path.includes("/") && !entry.path.startsWith("./")) {
                  // If it contains a slash, it must be a sibling directory or file relative to this map
                  // We only warn if it's deeper than 1 level
                  const parts = entry.path.split("/").filter(p => p && p !== ".");
                  if (parts.length > 1 && map.scope !== "repo") {
                     warnings.push(`${filePath}: Path '${entry.path}' violates Rule of Local Knowledge (too deep).`);
                  }
                }
              }
            }
          }
        }

        validateMap(rootCodemapPath);
        
        // Recursively find all codemaps in the project to validate them all
        const allFiles = (dir) => {
          let results = [];
          const list = fs.readdirSync(dir);
          for (let file of list) {
            if (file === "node_modules" || file.startsWith(".")) continue;
            file = path.resolve(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
              results = results.concat(allFiles(file));
            } else if (file.endsWith("codemap.yml")) {
              results.push(file);
            }
          }
          return results;
        };

        const maps = allFiles(context.worktree);
        for (const m of maps) {
          if (m !== rootCodemapPath) validateMap(m);
        }

        if (errors.length === 0) {
          return `PASS: CodeMap hierarchy validated.\nWarnings: ${warnings.length}\n${warnings.map(w => "- " + w).join("\n")}`;
        } else {
          return `FAIL: Validation errors found:\n${errors.map(e => "- " + e).join("\n")}\nWarnings: ${warnings.length}\n${warnings.map(w => "- " + w).join("\n")}`;
        }
      }
    })
  };

  return {
    tool: tools,
    async config(cfg) {
      cfg.agent ??= {};
      
      const nomadworksActive = repoCfg && repoCfg.enabled === true;

      // 1. Disable built-in OpenCode agents and any existing agents
      const builtInAgents = ["build", "plan", "general", "explore"];
      for (const id of builtInAgents) {
        cfg.agent[id] = { ...(cfg.agent[id] ?? {}), disable: true };
      }
      
      // Also disable any other registered agents to ensure full takeover
      for (const agentID of Object.keys(cfg.agent)) {
        cfg.agent[agentID] = { ...(cfg.agent[agentID] ?? {}), disable: true };
      }

      // 2. Set default agent to Product Manager
      cfg.default_agent = "product_manager";

      if (!fs.existsSync(AGENTS_DIR)) return;

      const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));

      // 2. Determine which agents to register from our bundle
      for (const file of files) {
        const id = file.replace(".md", "");
        
        // If not active, only register the Product Manager Agent (so user can run init)
        if (!nomadworksActive && id !== "product_manager") {
          continue;
        }

        const agentOverride = repoCfg.agents?.[id] || {};

        // If an agent is explicitly disabled in the repo config, skip registration
        if (nomadworksActive && agentOverride.enabled === false) continue;

        const filePath = path.join(AGENTS_DIR, file);
        const rawContent = fs.readFileSync(filePath, "utf8");
        const { data, body } = parseFrontmatter(rawContent);

        // Resolve includes using both the current repo and the plugin bundle as base paths
        const finalPrompt = resolveIncludes(body.trim(), worktree, PKG_ROOT);

        // Merge hierarchies: Global Defaults -> Agent Frontmatter -> Repo Overrides
        const provider = agentOverride.provider || data.provider || repoCfg.defaults?.provider;
        const model = agentOverride.model || data.model || repoCfg.defaults?.model;
        
        const agentConfig = {
          description: data.description,
          mode: agentOverride.mode || data.mode || "subagent",
          prompt: finalPrompt,
          tools: { ...(data.tools || {}), ...(agentOverride.tools || {}) },
          permission: agentOverride.permission || data.permission || data.permissions || repoCfg.defaults?.permissions,
          model: toModelString(provider, model),
          temperature: agentOverride.temperature ?? data.temperature ?? repoCfg.defaults?.temperature
        };

        // Collect extra options for pass-through (e.g. reasoningEffort, textVerbosity)
        const specialKeys = ['description', 'mode', 'model', 'provider', 'temperature', 'permission', 'permissions', 'tools', 'tools_add', 'tools_remove', 'enabled', 'prompt'];
        
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

        // Add additional tools if defined
        if (Array.isArray(agentOverride.tools_add)) {
          agentConfig.tools ??= {};
          for (const t of agentOverride.tools_add) agentConfig.tools[t] = true;
        }

        // Remove tools if defined
        if (Array.isArray(agentOverride.tools_remove)) {
          if (agentConfig.tools) {
            for (const t of agentOverride.tools_remove) delete agentConfig.tools[t];
          }
        }

        cfg.agent[id] = agentConfig;

        // Dump final config for verification
        if (repoCfg.features?.debug_dumps !== false) {
          const debugPath = path.join(debugDir, `${id}.md`);
          
          // Separate prompt from other config for YAML header
          const { prompt, ...dumpConfig } = agentConfig;
          const debugHeader = `---
${YAML.stringify(dumpConfig).trim()}
---`;
          fs.writeFileSync(debugPath, `${debugHeader}\n\n${prompt}`, "utf8");
        }
      }
    }
  };
}
