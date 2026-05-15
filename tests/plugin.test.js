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

function createEmptyWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-auto-test-"));
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

  test("auto onboarding honors second-argument options when input options are empty", async () => {
    const worktree = createEmptyGitWorktree();

    await NomadWorksPlugin({ worktree, options: {} }, {
      onboarding: "auto",
      default_team_mode: "mini",
      auto_init_git_repos_only: true
    });

    expect(fs.existsSync(path.join(worktree, ".nomadworks", "nomadworks.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(worktree, "codemap.yml"))).toBe(true);
    const generatedConfig = YAML.parse(fs.readFileSync(path.join(worktree, ".nomadworks", "nomadworks.yaml"), "utf8"));
    expect(generatedConfig.team_mode).toBe("mini");
  });

  test("onboarding off does not scaffold repository files", async () => {
    const worktree = createEmptyGitWorktree();

    await NomadWorksPlugin({ worktree }, {
      onboarding: "off",
      default_team_mode: "mini"
    });

    expect(fs.existsSync(path.join(worktree, ".nomadworks"))).toBe(false);
    expect(fs.existsSync(path.join(worktree, "codemap.yml"))).toBe(false);
  });

  test("default git-only auto onboarding does not scaffold outside a git worktree", async () => {
    const worktree = createEmptyWorktree();

    await NomadWorksPlugin({ worktree }, {
      onboarding: "auto",
      default_team_mode: "mini"
    });

    expect(fs.existsSync(path.join(worktree, ".nomadworks"))).toBe(false);
    expect(fs.existsSync(path.join(worktree, "codemap.yml"))).toBe(false);
  });

  test("auto onboarding preserves an existing repository config", async () => {
    const worktree = createEmptyGitWorktree();
    const configDir = path.join(worktree, ".nomadworks");
    const configPath = path.join(configDir, "nomadworks.yaml");
    const existingConfig = "team_mode: mini\nagents:\n  product_manager:\n    enabled: true\nfeatures:\n  debug_logs: true\n";
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, existingConfig, "utf8");

    await NomadWorksPlugin({ worktree }, {
      onboarding: "auto",
      default_team_mode: "full",
      auto_init_git_repos_only: true
    });

    expect(fs.readFileSync(configPath, "utf8")).toBe(existingConfig);
    expect(fs.existsSync(path.join(worktree, "codemap.yml"))).toBe(false);
  });
});
