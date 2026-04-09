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
