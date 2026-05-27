import { nomadworks_validate_logic } from "../src/validate_logic.js";
import NomadWorksPlugin, { extractWorkflowFinalMessage, extractWorkflowSessionId } from "../src/index.js";
import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Helper to create a temporary test environment
function createTestEnv(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomadworks-test-"));
  
  const build = (base, obj) => {
    for (const [name, content] of Object.entries(obj)) {
      const p = path.join(base, name);
      if (typeof content === "string") {
        fs.writeFileSync(p, content);
      } else {
        fs.mkdirSync(p, { recursive: true });
        build(p, content);
      }
    }
  };
  
  build(root, structure);
  return root;
}

function createFullTeamPluginEnv() {
  return createTestEnv({
    ".nomadworks": {
      "nomadworks.yaml": "enabled: true\nteam_mode: full\nfeatures:\n  debug_dumps: false\nagents:\n"
    },
    "tasks": {
      "workflow.md": "---\ntrack: implementation\n---\n# Workflow Task"
    }
  });
}

function nextTick() {
  return new Promise(resolve => setImmediate(resolve));
}

describe("nomadworks_validate", () => {
  test("Passes on valid hierarchical structure", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nmodules: [{path: src}]\nentrypoints: [{path: main.js}]",
      "main.js": "console.log('hi')",
      "src": {
        "codemap.yml": "scope: module\nparent: ../codemap.yml\nentrypoints: [{path: lib.js}]",
        "lib.js": "export const a = 1"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true);
  });

  test("Fails when source folder is missing codemap.yml", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo",
      "src": {
        "logic.ts": "const x = 1;"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing CodeMap: Directory 'src' contains source but has no codemap.yml.");
  });

  test("Fails on dead pointer in codemap", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nentrypoints: [{path: non-existent.js}]"
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("entrypoint path does not exist: non-existent.js");
  });

  test("Fails on Rule of Local Knowledge violation", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nmodules: [{path: src}]",
      "src": {
        "codemap.yml": "scope: module\nentrypoints: [{path: sub/deep.js}]",
        "sub": {
          "deep.js": ""
        }
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("violates Rule of Local Knowledge");
  });

  test("Respects .gitignore", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo",
      ".gitignore": "ignored/",
      "ignored": {
        "logic.ts": "const x = 1;"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true); // Should not fail for missing map in ignored dir
  });

  test("Ignores operational folders (tasks, docs, etc.)", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo",
      "tasks": {
        "001-task.md": "# Task content"
      },
      "docs": {
        "readme.md": "some docs"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true); // Should ignore .md files in operational folders
  });

  test("Ignores hidden tool-owned directory trees like .github/workflows", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo",
      ".github": {
        "workflows": {
          "deploy.yml": "name: CI"
        }
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true);
  });

  test("Fails when source file is not indexed in module codemap", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nmodules: [{path: src}]",
      "src": {
        "codemap.yml": "scope: module\nentrypoints: [{path: index.ts}]",
        "index.ts": "// code",
        "utils.ts": "// unindexed code"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unindexed source file found: 'utils.ts'");
  });

  test("Operational folders are exempt from shadow file check even if they have a codemap", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nmodules: [{path: docs}]",
      "docs": {
        "codemap.yml": "scope: module\nparent: ../codemap.yml\nentrypoints: []",
        "unindexed_doc.md": "# I am not in the codemap"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true); // Should pass despite unindexed_doc.md
  });

  test("Ignores non-source files in shadow file check", async () => {
    const root = createTestEnv({
      "codemap.yml": "scope: repo\nmodules: [{path: src}]",
      "src": {
        "codemap.yml": "scope: module\nparent: ../codemap.yml\nentrypoints: []",
        "image.png": "binary content",
        "notes.txt": "some notes"
      }
    });

    const result = await nomadworks_validate_logic(root);
    expect(result.ok).toBe(true); // Should ignore .png and .txt
  });
});

describe("workflow runner session parenting and response extraction", () => {
  test("nomadflow_run_workflow creates child session with parentID", async () => {
    const root = createFullTeamPluginEnv();
    const create = jest.fn(async () => ({ data: { id: "runner-session" } }));
    const prompt = jest.fn(async () => ({ data: { parts: [{ type: "text", text: "done" }] } }));
    const promptAsync = jest.fn(async () => ({}));

    const plugin = await NomadWorksPlugin({
      worktree: root,
      client: { session: { create, prompt, promptAsync } }
    });

    const result = await plugin.tool.nomadflow_run_workflow.execute(
      { task_path: "tasks/workflow.md", instructions: "Run task" },
      { worktree: root, sessionId: "pma-session" }
    );
    await nextTick();

    expect(result).toContain("SUCCESS: Workflow Runner session started. ID: runner-session");
    expect(create).toHaveBeenCalledWith({
      body: {
        title: "Workflow Run: workflow.md",
        parentID: "pma-session"
      }
    });
  });

  test("extractWorkflowSessionId supports guarded session response shapes", () => {
    expect(extractWorkflowSessionId({ data: { id: "data-id" } })).toBe("data-id");
    expect(extractWorkflowSessionId({ data: { session: { id: "nested-id" } } })).toBe("nested-id");
    expect(extractWorkflowSessionId({ sessionID: "top-session-id" })).toBe("top-session-id");
    expect(() => extractWorkflowSessionId({ data: {} })).toThrow(/missing session ID/);
  });

  test("extractWorkflowFinalMessage supports missing data.parts alternatives", () => {
    expect(extractWorkflowFinalMessage({ data: { message: { parts: [{ text: "nested parts" }] } } })).toBe("nested parts");
    expect(extractWorkflowFinalMessage({ data: { messages: [{ role: "assistant", parts: [{ text: "assistant message" }] }] } })).toBe("assistant message");
    expect(extractWorkflowFinalMessage({ data: { text: "plain text" } })).toBe("plain text");
    expect(() => extractWorkflowFinalMessage({ data: {} })).toThrow(/missing final message text/);
  });
});
