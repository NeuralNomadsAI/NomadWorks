# CodeMap Conventions

## Purpose
The `codemap.yml` is the authoritative navigation index for both humans and agents. It identifies entrypoints, wiring, and sources of truth without requiring full-repo scans.

## Strict Schema
- **scope:** `repo` (root), `module` (feature-level), or `stub` (pointer).
- **entrypoints:** Where the code "starts" (routes, CLI, UI entry).
- **wiring:** How components are linked (DI, registration, plugins).
- **sources_of_truth:** Definitive files (schemas, API contracts, configs).
- **invariants:** Rules that must never be broken.
- **commands:** Authoritative shell commands to test/build/lint this area.

## Hierarchical Scoping (Rule of Local Knowledge)
To prevent the root `codemap.yml` from becoming a dumping ground, we enforce a strict hierarchical structure:

1. **Local Knowledge Only:** A codemap MUST ONLY contain details about its immediate siblings (files and sub-folders). It must NEVER describe the internal structure of its sub-folders.
2. **Mandatory Module Maps:** Every directory representing a logical module, feature, or service MUST have its own `scope: module` codemap. It is not optional. The parent codemap simply points to it in the `modules` list.
3. **Walk-up Resolution:** Agents looking for context should start at their current directory and "walk up" to find the nearest `codemap.yml`.

### Example Hierarchy:

**Root `codemap.yml` (at `/`):**
```yaml
scope: repo
code_roots: [src/, docs/]
modules:
  - path: src/auth
    summary: "Handles user identity."
```

**Module `codemap.yml` (at `/src/auth/codemap.yml`):**
```yaml
scope: module
parent: ../../codemap.yml
entrypoints:
  - path: routes.ts
    description: "Auth API entrypoint."
```

## When to Update
- Adding/moving a route or API endpoint.
- Changing a database schema or contract.
- Adding a new module or library.
- Changing how the module is verified (test commands).
