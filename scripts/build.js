import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// For now, we are just copying index.js to dist/ since we're using vanilla ESM Node
// In a real TS setup, we'd run `tsc` here.
fs.copyFileSync(path.join(SRC, "index.js"), path.join(DIST, "index.js"));

console.log("Built dist/index.js successfully.");
