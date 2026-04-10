# Workflow Usage

NomadWorks uses three task complexity levels and three work tracks.

## Complexity

- `tiny`: Minimal, low-risk work.
- `standard`: Default bounded delivery work.
- `complex`: Multi-step work that uses decomposition and the Workflow Runner.

## Track

- `implementation`: Delivery work that changes code, tests, config, or linked docs.
- `investigation`: Discovery and debugging work intended to produce findings.
- `spec`: SCR and specification work.

## Slice set

- `foundation`
- `core`
- `logic`
- `ui`
- `polish`
- `qa`
- `docs`

## Routing rules

- Prefer `tiny` when one specialist can complete the task in one slice with lightweight verification.
- Use `standard` for the normal delivery path when a task is still bounded and does not require decomposition.
- Use `complex` when the work needs an approved SCR, multiple handoffs, or slice-based subtasks.

## Team modes

- `reduced`: supports `tiny` and `standard` only, using `product_manager`, `business_analyst`, and `tech_lead`
- `full`: supports `tiny`, `standard`, and `complex`, including `workflow_runner`

See also:

- `docs/guides/TEAM_MODE_REDUCED.md`
- `docs/guides/TEAM_MODE_FULL.md`

## Current parallelism rule

- One shared-worktree implementation task may run at a time.
- Investigation and spec tasks may run in parallel when they avoid conflicting edits.

## Task metadata

Task files use lightweight frontmatter to record only durable workflow fields. Use `scr: null` only for `tiny` work that does not change product behavior or shared specifications.

```yaml
---
id: TASK-001
complexity: standard
track: implementation
slice: logic
status: todo
scr: SCR-001
parent: null
---
```

SCR files use similarly lightweight frontmatter:

```yaml
---
id: SCR-001
status: proposed
tasks: []
---
```

## Documentation lookup

When deciding where documentation belongs:

- use `docs/product/` for whole-product truth
- use `docs/domains/` for stable product areas that contain multiple features
- use `docs/features/` for one concrete capability
- use `docs/architecture/` for technical design and cross-cutting engineering decisions
- use `docs/scrs/` for proposed and approved changes, not steady-state truth

See `docs/core/documentation_structure.md` for the canonical rules.
