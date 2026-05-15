import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { jest } from "@jest/globals";

import NomadWorksPlugin from "../src/index.js";

function createTestEnv(configText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-plugin-test-"));
  fs.mkdirSync(path.join(root, ".nomadworks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".nomadworks", "nomadworks.yaml"), configText, "utf8");
  return root;
}

function createGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-pai-test-"));
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git init failed");
  return root;
}

describe("NomadWorks plugin PAI behavior", () => {
  test("plugin load does not scaffold PAI sync folders without PAI or memory configuration", async () => {
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "  pai_context: false",
      ""
    ].join("\n"));

    await NomadWorksPlugin({ worktree, options: {} });

    expect(fs.existsSync(path.join(worktree, ".nomadworks", "pai"))).toBe(false);
    expect(fs.existsSync(path.join(worktree, ".nomadworks", "memory"))).toBe(false);
    expect(fs.existsSync(path.join(worktree, ".nomadworks", "memory", "sync"))).toBe(false);
  });

  test("PAI context without configured root does not create local sync fallback", async () => {
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "  pai_context: true",
      "pai:",
      "  apply_to_agents:",
      "    - product_manager",
      "  context_files:",
      "    - USER/ABOUTME.md",
      ""
    ].join("\n"));

    await NomadWorksPlugin({ worktree, options: {} });

    expect(fs.existsSync(path.join(worktree, ".nomadworks", "memory", "sync"))).toBe(false);
  });

  test("sync push requires an explicit configured Git-backed PAI root", async () => {
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    await expect(plugin.tool.nomadworks_sync_push.execute({}, { worktree })).resolves.toMatch(/^FAIL: Configure pai\.root/);
  });

  test("sync pull requires an explicit configured Git-backed PAI root", async () => {
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    await expect(plugin.tool.nomadworks_sync_pull.execute({}, { worktree })).resolves.toMatch(/^FAIL: Configure pai\.root/);
  });

  test("sync status includes real Git status for configured PAI repo", async () => {
    const paiRoot = createGitRepo();
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    const result = JSON.parse(await plugin.tool.nomadworks_sync_status.execute({}, { worktree }));

    expect(result.is_git_repository).toBe(true);
    expect(result.git_status.status).toBe(0);
    expect(result.git_status.stdout).toContain("##");
  });

  test("global PAI options from second plugin argument are honored when input options are empty", async () => {
    const paiRoot = createGitRepo();
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));

    const plugin = await NomadWorksPlugin({ worktree, options: {} }, { pai_root: paiRoot });
    const result = JSON.parse(await plugin.tool.nomadworks_sync_status.execute({}, { worktree }));

    expect(result.pai_root).toBe(paiRoot);
    expect(result.is_git_repository).toBe(true);
  });

  test("sync push reports failed Git commands as FAIL", async () => {
    const paiRoot = createGitRepo();
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    await expect(plugin.tool.nomadworks_sync_push.execute({}, { worktree })).resolves.toMatch(/^FAIL: git (commit|push)/);
  });

  test("sync push reports no changes as a no-op instead of failure", async () => {
    const paiRoot = createGitRepo();
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: paiRoot, encoding: "utf8", shell: false });
    spawnSync("git", ["config", "user.name", "NomadWorks Test"], { cwd: paiRoot, encoding: "utf8", shell: false });
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });
    spawnSync("git", ["add", "."], { cwd: paiRoot, encoding: "utf8", shell: false });
    spawnSync("git", ["commit", "-m", "seed pai"], { cwd: paiRoot, encoding: "utf8", shell: false });

    const secondResult = JSON.parse(await plugin.tool.nomadworks_sync_push.execute({}, { worktree }));

    expect(secondResult.status).toBe("no_changes");
    expect(secondResult.push).toBeNull();
  });

  test("session export requires an explicit configured PAI root", async () => {
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    await expect(plugin.tool.nomadworks_session_export.execute({ session_ids: "abc" }, { worktree })).resolves.toMatch(/^FAIL: Configure pai\.root/);
  });

  test("session import rejects manifest entries outside SESSIONS json exports", async () => {
    const paiRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-pai-test-"));
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      ""
    ].join("\n"));
    const workspaceRoot = path.join(paiRoot, "WORKSPACES", path.basename(worktree).toLowerCase().replace(/[^a-z0-9._-]+/g, "-"));
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "README.md"), "not a session", "utf8");
    fs.writeFileSync(path.join(workspaceRoot, "manifest.json"), JSON.stringify({
      version: 1,
      files: ["README.md"],
      opencode_sessions: [{ session_id: "abc", file: "README.md", format: "opencode-export-json" }]
    }), "utf8");
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    const result = JSON.parse(await plugin.tool.nomadworks_session_import.execute({}, { worktree }));

    expect(result.imported_sessions).toEqual([]);
    expect(result.failed_sessions).toEqual([{ session_id: "abc", reason: "invalid session export path" }]);
  });

  test("configured PAI root inside the workspace is rejected", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      "  root: .nomadworks/pai",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });
    consoleError.mockRestore();

    await expect(plugin.tool.nomadworks_sync_status.execute({}, { worktree })).resolves.toMatch(/^FAIL: PAI root must be outside the workspace/);
    expect(fs.existsSync(path.join(worktree, ".nomadworks", "pai"))).toBe(false);
  });
});
