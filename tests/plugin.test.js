import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";

import NomadWorksPlugin from "../src/index.js";

function createTestEnv(configText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-plugin-test-"));
  fs.mkdirSync(path.join(root, ".nomadworks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".nomadworks", "nomadworks.yaml"), configText, "utf8");
  return root;
}

async function waitForMockCall(mockFn) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (mockFn.mock.calls.length > 0) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for expected mock call");
}

describe("NomadWorks workflow runner monitoring", () => {
  test("workflow runner monitor handles prompt results without data.parts", async () => {
    const worktree = createTestEnv([
      "enabled: true",
      "team_mode: full",
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));
    const promptAsync = jest.fn().mockResolvedValue({ data: true });
    const client = {
      session: {
        create: jest.fn().mockResolvedValue({ data: { id: "runner-no-parts" } }),
        prompt: jest.fn().mockResolvedValue({ data: {} }),
        promptAsync
      }
    };
    const plugin = await NomadWorksPlugin({ worktree, options: {}, client });

    const result = await plugin.tool.nomadflow_run_workflow.execute(
      { task_path: "missing-task.md", instructions: "Audit only." },
      { worktree, sessionId: "pma-session" }
    );
    await waitForMockCall(promptAsync);

    expect(result).toContain("SUCCESS: Workflow Runner session started");
    expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
      path: { id: "pma-session" },
      body: expect.objectContaining({
        parts: [expect.objectContaining({
          text: expect.stringContaining("No final text was returned by the Workflow Runner session.")
        })]
      })
    }));
  });

  test("workflow runner monitor falls back when prompt result parts are empty", async () => {
    const worktree = createTestEnv([
      "enabled: true",
      "team_mode: full",
      "features:",
      "  debug_dumps: false",
      ""
    ].join("\n"));
    const promptAsync = jest.fn().mockResolvedValue({ data: true });
    const client = {
      session: {
        create: jest.fn().mockResolvedValue({ data: { id: "runner-empty-parts" } }),
        prompt: jest.fn().mockResolvedValue({
          data: {
            parts: [{ type: "text", text: "   " }],
            text: "fallback final summary"
          }
        }),
        promptAsync
      }
    };
    const plugin = await NomadWorksPlugin({ worktree, options: {}, client });

    const result = await plugin.tool.nomadflow_run_workflow.execute(
      { task_path: "missing-task.md", instructions: "Audit only." },
      { worktree, sessionId: "pma-session" }
    );
    await waitForMockCall(promptAsync);

    expect(result).toContain("SUCCESS: Workflow Runner session started");
    expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({
      path: { id: "pma-session" },
      body: expect.objectContaining({
        parts: [expect.objectContaining({
          text: expect.stringContaining("fallback final summary")
        })]
      })
    }));
  });
});
