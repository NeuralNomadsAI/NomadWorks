import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const branch = process.argv[2];
const packageName = packageJson.name;
const baseVersion = packageJson.version;

if (!branch) {
  throw new Error("Branch name is required.");
}

function fail(message) {
  throw new Error(message);
}

function isStableSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function shellValue(value) {
  return String(value).replace(/\r/g, " ").replace(/\n/g, " ");
}

function loadPublishedVersions(name) {
  try {
    const raw = execFileSync("npm", ["view", name, "versions", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") return [parsed];
    return [];
  } catch {
    return [];
  }
}

const publishedVersions = loadPublishedVersions(packageName);

let version = baseVersion;
let publishTag = "latest";
let channel = "release";
let reason = "stable release from main";

if (branch === "dev") {
  if (!isStableSemver(baseVersion)) {
    fail(`dev prereleases require package.json version to be a stable base semver. Found '${baseVersion}'.`);
  }

  const prefix = `${baseVersion}-rc.`;
  const rcNumbers = publishedVersions
    .filter(candidate => candidate.startsWith(prefix))
    .map(candidate => Number(candidate.slice(prefix.length)))
    .filter(Number.isInteger)
    .filter(candidate => candidate >= 0);

  const nextRc = rcNumbers.length === 0 ? 0 : Math.max(...rcNumbers) + 1;
  version = `${baseVersion}-rc.${nextRc}`;
  publishTag = "rc";
  channel = "prerelease";
  reason = rcNumbers.length === 0
    ? `first rc publish for ${baseVersion}`
    : `incremented rc from ${Math.max(...rcNumbers)} to ${nextRc}`;
} else if (branch === "main") {
  if (!isStableSemver(baseVersion)) {
    fail(`main releases require package.json version to be stable semver. Found '${baseVersion}'.`);
  }

  if (publishedVersions.includes(baseVersion)) {
    fail(`version ${baseVersion} is already published on npm. Increment package.json version before merging to main.`);
  }
} else {
  fail(`Unsupported branch '${branch}'. Expected 'dev' or 'main'.`);
}

const outputs = {
  package_name: packageName,
  version,
  publish_tag: publishTag,
  channel,
  should_publish: true,
  reason
};

for (const [key, value] of Object.entries(outputs)) {
  console.log(`${key}=${shellValue(value)}`);
}
