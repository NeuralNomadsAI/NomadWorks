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

## Usage Rules (Anti-Rot)
1. **No Verbose Descriptions:** Pointers only. Use the `docs/` folder for narrative.
2. **Hierarchical:** The root map should point to module maps (`modules` list). Module maps handle local details.
3. **PMA/Architect Review:** Every task implementation must check if the codemap needs updating.
4. **Authoritative Commands:** Agents MUST use the commands defined in the codemap for verification.

## When to Update
- Adding/moving a route or API endpoint.
- Changing a database schema or contract.
- Adding a new module or library.
- Changing how the module is verified (test commands).
