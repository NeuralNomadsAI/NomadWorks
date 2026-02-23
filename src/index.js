import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_DIR = path.join(PKG_ROOT, "agents");

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

export default async function NomadWorksPlugin(input) {
  const worktree = path.resolve(input.worktree || process.cwd());
  const debugDir = path.join(worktree, ".nomadworks", "agents");

  return {
    async config(cfg) {
      cfg.agent ??= {};
      
      if (!fs.existsSync(AGENTS_DIR)) return;

      const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith(".md"));

      // Ensure debug directory exists if we want to dump final configs
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      for (const file of files) {
        const id = file.replace(".md", "");
        const filePath = path.join(AGENTS_DIR, file);
        const rawContent = fs.readFileSync(filePath, "utf8");
        const { data, body } = parseFrontmatter(rawContent);

        // Resolve includes using both the current repo and the plugin bundle as base paths
        const finalPrompt = resolveIncludes(body.trim(), worktree, PKG_ROOT);

        const agentConfig = {
          description: data.description,
          mode: data.mode || "subagent",
          prompt: finalPrompt,
          tools: data.tools,
          permission: data.permission || data.permissions,
          model: data.model,
          temperature: data.temperature
        };

        cfg.agent[id] = agentConfig;

        // Dump final config to .nomadworks/agents/id.md for verification
        const debugPath = path.join(debugDir, `${id}.md`);
        const debugHeader = `---
description: ${data.description || ""}
mode: ${agentConfig.mode}
model: ${data.model || "default"}
tools: ${JSON.stringify(data.tools || {})}
---`;
        fs.writeFileSync(debugPath, `${debugHeader}\n\n${finalPrompt}`, "utf8");
      }
    }
  };
}
