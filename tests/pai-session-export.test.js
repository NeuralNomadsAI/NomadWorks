import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";

const spawnSyncMock = jest.fn();

jest.unstable_mockModule("node:child_process", () => ({
  spawnSync: spawnSyncMock
}));

const { default: NomadWorksPlugin } = await import("../src/index.js");

function createTestEnv(configText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-plugin-test-"));
  fs.mkdirSync(path.join(root, ".nomadworks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".nomadworks", "nomadworks.yaml"), configText, "utf8");
  return root;
}

function createPaiRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-pai-test-"));
  fs.mkdirSync(path.join(root, ".git"));
  return root;
}

describe("NomadWorks session export command behavior", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockImplementation((command, args) => {
      if (command === "opencode" && args[0] === "export") {
        return { status: 0, stdout: JSON.stringify({ command, args }), stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
  });

  test("session export uses native OpenCode sanitization by default", async () => {
    const paiRoot = createPaiRoot();
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      "  workspace:",
      "    id: export-test",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    const result = JSON.parse(await plugin.tool.nomadworks_session_export.execute({ session_ids: "abc" }, { worktree }));

    expect(spawnSyncMock).toHaveBeenCalledWith("opencode", ["export", "--sanitize", "abc"], expect.any(Object));
    expect(result.exported_sessions).toEqual([{ session_id: "abc", file: "SESSIONS/abc.json", format: "opencode-export-json", sanitized: true }]);
  });

  test("session export only uses raw OpenCode export with explicit raw_export opt-in", async () => {
    const paiRoot = createPaiRoot();
    const worktree = createTestEnv([
      "features:",
      "  debug_dumps: false",
      "pai:",
      `  root: ${JSON.stringify(paiRoot)}`,
      "  workspace:",
      "    id: export-test",
      ""
    ].join("\n"));
    const plugin = await NomadWorksPlugin({ worktree, options: {} });

    const result = JSON.parse(await plugin.tool.nomadworks_session_export.execute({ session_ids: "abc", raw_export: true }, { worktree }));

    expect(spawnSyncMock).toHaveBeenCalledWith("opencode", ["export", "abc"], expect.any(Object));
    expect(result.exported_sessions).toEqual([{ session_id: "abc", file: "SESSIONS/abc.json", format: "opencode-export-json", sanitized: false }]);
  });
});
