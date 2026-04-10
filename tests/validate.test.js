import { nomadworks_validate_logic } from "../src/validate_logic.js";
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
