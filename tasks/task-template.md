---
id: TASK-[ID]
complexity: standard
track: implementation
slice: logic
status: todo
scr: null
parent: null
---

# Task: [Task ID] - [Short Description]

## Feature: [Feature Name]

## Task Routing
- **Complexity:** `[tiny | standard | complex]`
- **Track:** `[implementation | investigation | spec]`
- **Slice:** `[foundation | core | logic | ui | polish | qa | docs]`

## Objective
[Short description of the intended outcome and scope.]

## Acceptance Criteria
- [ ] [Overall success condition 1]
- [ ] [Overall success condition 2]
- [ ] [Overall success condition 3]

### Source Authority (MANDATORY)
*   **Spec Reference:** [Commit Hash or SCR ID from documentation update]
*   **Documentation:** [Link to updated SPECIFICATION.md or FEATURES_LIST.md]
*   **SCR Link:** Use `null` only for `tiny` work that does not change product behavior or shared specifications.

### Pre Sync
* **PMA Facilitator:** The Product Manager always runs the sync and records the decision.
* **Default specialists by complexity:**
  * `tiny`: `developer`, `tech_lead`
  * `standard`: `business_analyst`, `technical_architect`
  * `complex`: `business_analyst`, `technical_architect`, `tech_lead`
* **Conditional specialists:**
  * Add `ui_ux_designer` for UI, UX, or other user-facing interface work.
  * Add `business_analyst` to `tiny` tasks when product behavior, copy intent, or requirements change.
  * Add `tech_lead` to `standard` tasks when technical risk or cross-cutting impact is elevated.
* [ ] Required specialists participated in pre-sync.

### Decomposition (complex only)
* Leave this section empty for `tiny` and `standard` tasks.
* Use this section only when `complexity: complex`.
* Add slice-based subtasks here as needed.

### Slice Planning
* **Use one primary slice for `tiny` and `standard` tasks.**
* **Use multiple slice-based subtasks for `complex` tasks.**
* **Standard slice meanings:**
  * `foundation`: setup, scaffolding, interfaces, plumbing
  * `core`: shared services, domain primitives, shared data structures
  * `logic`: feature behavior and orchestration
  * `ui`: components, screens, interactions, styling
  * `polish`: accessibility, performance, edge-case cleanup, refinement
  * `qa`: automated/manual verification work
  * `docs`: product, architecture, and task documentation updates

### Verification
* [ ] Tech Lead: Functional & Behavioral Verification
* [ ] UI / UX Designer: Visual UI/UX Review
* [ ] Product Manager: Evidence Verification (Screenshots/Logs)
* [ ] User: Final Approval

### Finalization
* [ ] [Assigned Agent]: CodeMap Update (Update `codemap.yml` if entrypoints/wiring changed)
* [ ] [Assigned Agent]: Documentation Update (Update relevant docs in `docs/`)
* [ ] Technical Architect: Documentation Verification - *[Comment: ]*
* [ ] Tech Lead: Code Commit
* [ ] Product Manager: Task Archiving

### Status: [todo / in_progress / review / done / blocked]

# Reviews
## Technical Architect:
- [Comments]
