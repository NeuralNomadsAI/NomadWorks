# Task Lifecycle

## Purpose

This domain defines how work is classified, discussed, executed, verified, and archived inside NomadWorks.

It is the primary product area responsible for turning approved work into structured task execution with the right amount of process for the task's complexity and risk.

## Scope

This domain includes:

- task classification by `tiny`, `standard`, and `complex`
- task routing by `implementation`, `investigation`, and `spec`
- slice-based task planning using `foundation`, `core`, `logic`, `ui`, `polish`, `qa`, and `docs`
- pre-sync quorum rules
- task execution flow and handoff expectations
- verification and archiving expectations

This domain does not include:

- low-level technical architecture details
- plugin installation and configuration guidance
- CodeMap schema rules

## Core Concepts

- **Complexity:** The process weight of the task.
- **Track:** The type of work being performed.
- **Slice:** The dominant work surface for the task.
- **Pre-Sync:** The required specialist discussion before execution starts.
- **Decomposition:** Breaking `complex` work into slice-based subtasks.
- **Verification:** The proof and checks required before closure.

## Owned Features

- task template structure
- complexity-based routing
- pre-sync specialist defaults
- slice-based decomposition for complex work
- evidence and verification expectations
- task completion and archiving flow

## Shared Rules

- `tiny` work should stay narrowly scoped within one primary slice.
- `standard` work should remain bounded and keep one dominant slice.
- `complex` work should be decomposed into slice-based subtasks.
- PMA always facilitates the discussion, but the required specialist quorum depends on task complexity and impact.
- UI and other user-facing interface work must include `ui_ux_designer` in pre-sync.

## Key Workflows

- classify task complexity and track
- select the required specialist quorum
- define objective and acceptance criteria
- decompose complex work when needed
- execute, verify, and archive the task

## Related Documents

- `docs/core/task_model.md`
- `docs/core/agent_orchestration.md`
- `tasks/task-template.md`
- `tasks/subtask-template.md`
- `docs/core/documentation_structure.md`
