import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Copy all JS files from src to dist
const files = fs.readdirSync(SRC).filter(f => f.endsWith(".js"));
for (const file of files) {
  fs.copyFileSync(path.join(SRC, file), path.join(DIST, file));
}

console.log(`Built dist/ successfully (${files.join(", ")}).`);
