# CodeMap Conventions

## Purpose
The `codemap.yml` is the authoritative navigation index for both humans and agents. It identifies entrypoints, wiring, and sources of truth without requiring full-repo scans.

## Strict Schema
- **scope:** `repo` (root), `module` (feature-level), or `stub` (pointer).
- **entrypoints:** Where the code "starts" (routes, CLI, UI entry).
- **wiring:** How components are linked (DI, registration, plugins).
- **sources_of_truth:** Definitive files (schemas, API contracts, configs).
- **internals:** All other maintained source files that don't fit the above categories.
- **invariants:** Rules that must never be broken.
- **commands:** Authoritative shell commands to test/build/lint this area.

## Exhaustive Manifest Rule
To prevent "shadow code" and documentation rot, the `nomadworks_validate` tool enforces an exhaustive manifest check:
1. **No Shadow Files:** Every source file present on disk within a module MUST be listed in at least one section of that module's `codemap.yml`.
2. **The 'internals' Section:** Use this section to index utility files, constants, types, or any other source code that isn't a primary entrypoint or source of truth.
3. **Placeholders Forbidden:** A CodeMap cannot be left as an empty placeholder. It must account for the actual contents of its directory.

## Hierarchical Scoping (Rule of Local Knowledge)
To prevent the root `codemap.yml` from becoming a dumping ground, we enforce a strict hierarchical structure:

1. **Local Knowledge Only:** A codemap MUST ONLY contain details about its immediate siblings (files and sub-folders). It must NEVER describe the internal structure of its sub-folders.
2. **Walk-up Resolution:** Agents looking for context should start at their current directory and "walk up" to find the nearest `codemap.yml`.

## Inclusion Policy
A `codemap.yml` is mandatory for any directory that represents a **Maintained Logical Unit**. This includes:
- **Product Source:** Business logic, APIs, UI components.
- **Tooling Source:** Build scripts, migrations, maintenance utilities (e.g., `/scripts/`).

Directories that are purely administrative (e.g., `.github/`, `node_modules/`, `dist/`, `docs/`) SHOULD NOT have their own codemaps. Their key files should be linked in the **Root** codemap.

## Nesting & Granularity
To ensure agents can navigate every level of the codebase effectively, we require a `codemap.yml` at **every level** of the source tree:

1. **Total Coverage:** Every directory within a code root (e.g., `src/`, `packages/`, `scripts/`) MUST contain its own `codemap.yml`. This ensures that an agent always has a local index regardless of how deep it is in the file system.
2. **Sibling-Only Focus:** Following the Rule of Local Knowledge, each map only describes its immediate files and sub-directories. To see deeper, the agent must read the `codemap.yml` of the sub-directory.
3. **Parent Linkage:** Every non-root codemap MUST include a `parent` field pointing to the codemap in the directory above it.

### Example Hierarchy:

**Project Root (`/codemap.yml`):**
```yaml
scope: repo
code_roots: [src/]
modules:
  - path: src
    summary: "Main source directory."
```

**Source Root (`/src/codemap.yml`):**
```yaml
scope: module
parent: ../codemap.yml
modules:
  - path: auth
    summary: "Authentication logic."
  - path: billing
    summary: "Billing logic."
```

**Feature Root (`/src/auth/codemap.yml`):**
```yaml
scope: module
parent: ../codemap.yml
entrypoints:
  - path: index.ts
    description: "Auth entrypoint."
```

## When to Update
- Adding/moving a route or API endpoint.
- Changing a database schema or contract.
- Adding a new module or library.
- Changing how the module is verified (test commands).
