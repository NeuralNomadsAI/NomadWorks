import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import ignore from "ignore";

export async function nomadworks_validate_logic(worktree) {
  const rootCodemapPath = path.join(worktree, "codemap.yml");
  if (!fs.existsSync(rootCodemapPath)) {
    return { ok: false, errors: ["Root codemap.yml not found."] };
  }

  const errors = [];
  const warnings = [];

  // Load .gitignore if it exists
  const ig = ignore();
  ig.add(".git");
  const gitignorePath = path.join(worktree, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }

  const sourceExtensions = [
    ".js", ".ts", ".tsx", ".jsx", ".dart", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".cs", 
    ".php", ".rb", ".swift", ".kt", ".m", ".sh", ".sql", ".yaml", ".yml", ".json", ".md"
  ];

  const isSourceDir = (dirPath) => {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const relPath = path.relative(worktree, path.join(dirPath, item.name));
      if (ig.ignores(relPath)) continue;

      if (item.isFile() && sourceExtensions.includes(path.extname(item.name))) return true;
      if (item.isDirectory()) {
        if (isSourceDir(path.join(dirPath, item.name))) return true;
      }
    }
    return false;
  };

  function validateMap(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    let map;
    try {
      map = YAML.parse(content);
      if (!map || typeof map !== "object") {
        errors.push(`${filePath}: CodeMap is empty or invalid.`);
        return;
      }
    } catch (e) {
      errors.push(`${filePath}: Invalid YAML.`);
      return;
    }

    const dir = path.dirname(filePath);

    // Collect all paths mentioned in the codemap to ensure exhaustive indexing
    const indexedPaths = new Set();
    const sectionsToVerify = ["modules", "entrypoints", "sources_of_truth", "links", "internals"];
    
    for (const section of sectionsToVerify) {
      if (Array.isArray(map[section])) {
        for (const item of map[section]) {
          if (item.path) {
            // Normalize path for comparison
            indexedPaths.add(path.normalize(item.path));
            
            if (section === "links" && (item.path.startsWith("http://") || item.path.startsWith("https://"))) {
              continue;
            }

            const absPath = path.isAbsolute(item.path) ? item.path : path.join(dir, item.path);
            if (!fs.existsSync(absPath)) {
              errors.push(`${filePath}: ${section.slice(0, -1)} path does not exist: ${item.path}`);
            }
          }
        }
      }
    }

    // Shadow File Check: Ensure all source files in this directory are indexed (Module scope only)
    const relDir = path.relative(worktree, dir);
    const operationalFolders = ["tasks", "evidences", "docs", "templates", "dist"];
    const isOperational = operationalFolders.some(f => relDir === f || relDir.startsWith(f + "/"));

    if (map.scope === "module" && !isOperational) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile() && sourceExtensions.includes(path.extname(item.name))) {
          if (item.name === "codemap.yml") continue;
          if (!indexedPaths.has(path.normalize(item.name))) {
            errors.push(`${filePath}: Unindexed source file found: '${item.name}'. Every source file must be categorized in a section (e.g., 'internals').`);
          }
        }
      }
    }

    // Rule of Local Knowledge
    const pathKeys = ["entrypoints", "sources_of_truth", "links"];
    for (const key of pathKeys) {
      if (Array.isArray(map[key])) {
        for (const entry of map[key]) {
          if (entry.path && entry.path.includes("/") && !entry.path.startsWith("./")) {
            const parts = entry.path.split("/").filter(p => p && p !== ".");
            if (parts.length > 1) {
               errors.push(`${filePath}: Path '${entry.path}' violates Rule of Local Knowledge (must only describe immediate siblings).`);
            }
          }
        }
      }
    }
  }

  const walk = (dir) => {
    const relDir = path.relative(worktree, dir);
    if (relDir && ig.ignores(relDir)) return;

    const hasCodemap = fs.existsSync(path.join(dir, "codemap.yml"));
    const items = fs.readdirSync(dir, { withFileTypes: true });

    // Exclusion list for mandatory codemaps (operational folders)
    const operationalFolders = ["tasks", "evidences", "docs", "templates", "dist"];
    const isOperational = operationalFolders.some(f => relDir === f || relDir.startsWith(f + "/"));

    if (relDir !== "" && !hasCodemap && isSourceDir(dir) && !isOperational) {
      if (!path.basename(dir).startsWith(".")) {
        errors.push(`Missing CodeMap: Directory '${relDir}' contains source but has no codemap.yml.`);
      }
    }

    if (hasCodemap) validateMap(path.join(dir, "codemap.yml"));

    for (const item of items) {
      if (item.isDirectory()) walk(path.join(dir, item.name));
    }
  };

  walk(worktree);

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}
