import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

import NomadWorksPlugin from "../src/index.js";

function createEmptyGitWorktree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-auto-test-"));
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git init failed");
  return root;
}

describe("NomadWorks plugin auto-onboarding", () => {
  test("auto onboarding reads tuple plugin options from second argument", async () => {
    const worktree = createEmptyGitWorktree();

    await NomadWorksPlugin({ worktree }, {
      onboarding: "auto",
      default_team_mode: "mini",
      auto_init_git_repos_only: true
    });

    expect(fs.existsSync(path.join(worktree, ".nomadworks", "nomadworks.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(worktree, "codemap.yml"))).toBe(true);
    const generatedConfig = YAML.parse(fs.readFileSync(path.join(worktree, ".nomadworks", "nomadworks.yaml"), "utf8"));
    expect(generatedConfig.team_mode).toBe("mini");
    expect(generatedConfig.agents.product_manager.enabled).toBe(true);
  });
});
