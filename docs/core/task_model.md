# Task Model

NomadWorks classifies work across three orthogonal dimensions.

## 1. Complexity

- `tiny`: Very small, low-risk work such as copy edits, typos, trivial config fixes, or narrowly scoped non-behavioral changes.
- `standard`: The default delivery path for bounded bug fixes, focused features, and moderate documentation or QA work.
- `complex`: Multi-step work that benefits from decomposition, multiple specialist handoffs, and full Workflow Runner orchestration.

## 2. Track

- `implementation`: Code, tests, configuration, or documentation changes that advance approved delivery work.
- `investigation`: Discovery, debugging, audits, reproduction, or scoping work intended to produce findings rather than a full product change.
- `spec`: Requirement and specification work centered on SCRs and supporting documentation.

## 3. Slice

- `foundation`: Setup, scaffolding, interfaces, and plumbing.
- `core`: Shared services, domain primitives, and reusable data structures.
- `logic`: Feature behavior, orchestration, and business rules.
- `ui`: Components, screens, interactions, and visual styling.
- `polish`: Accessibility, performance, edge-case cleanup, and refinement.
- `qa`: Automated and manual verification work.
- `docs`: Product, architecture, and task documentation updates.

## Routing Rules

- `tiny` tasks should stay within one slice and usually one specialist handoff.
- `standard` tasks should keep one primary slice even if they touch adjacent areas.
- `complex` tasks should be decomposed into slice-based subtasks.
- `complex + implementation` is the default case for using `workflow_runner`.
- While one implementation task is active in the shared worktree, parallel work should be limited to `investigation` or `spec` tasks that avoid conflicting edits.

## Pre-Sync Specialist Defaults

- `tiny`: `developer` and `tech_lead`
- `standard`: `business_analyst` and `technical_architect`
- `complex`: `business_analyst`, `technical_architect`, and `tech_lead`
- Add `ui_ux_designer` to any task with UI, UX, or other user-facing interface impact.
- Add `business_analyst` to `tiny` work when product behavior, copy intent, or requirements are affected.
- Add `tech_lead` to `standard` work when technical risk or cross-cutting impact is elevated.
