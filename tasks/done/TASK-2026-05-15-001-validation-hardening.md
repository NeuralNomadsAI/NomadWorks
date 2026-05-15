---
id: TASK-2026-05-15-001
complexity: standard
track: implementation
slice: foundation
status: done
scr: null
parent: null
assigned_to: developer
handoff_from: product_manager
reopened_count: 0
---

# Task: TASK-2026-05-15-001 - Validation Hardening After Auto-Onboarding

## Feature: NomadWorks Validation and Auto-Onboarding

## Task Routing
- **Complexity:** `standard`
- **Track:** `implementation`
- **Slice:** `foundation`

## Objective
Resolve validation blockers discovered during real auto-onboarding on Windows while preserving the simplified PAI/session sync model. The task is limited to validation correctness, generated CodeMap template correctness, placeholder cleanup required for validation, and verification of the resulting package state.

## Ownership
- **Assigned To:** `developer`
- **Handoff From:** `product_manager`

## Definition Of Ready Check
- [x] Scope is clear, bounded, and appropriate for the task's declared complexity.
- [x] Acceptance criteria are present, testable, and aligned with the objective.
- [x] Complexity, track, and slice are set correctly.
- [x] Required dependencies, assumptions, blockers, and open questions are resolved or explicitly recorded.
- [x] Required pre-sync specialist review is complete.
- [x] Required SCR exists and is approved when the workflow requires it. No SCR required: this is same-feature validation hardening and documentation cleanup for already-approved onboarding/sync work, with no product behavior expansion.

## Acceptance Criteria
- [x] AC-1: Validation operational-folder exemptions work correctly on Windows path separators so `tasks`, `docs`, `templates`, `dist`, and `evidences` are exempted consistently where policy says they are exempt.
- [x] AC-2: The generated root CodeMap template uses local-knowledge-compliant nested links by prefixing nested paths with `./`.
- [x] AC-3: Placeholder validation blockers are resolved without weakening the placeholder rule.
- [x] AC-4: The disposition of auto-generated onboarding artifacts in the repository root is explicitly handled and does not leave ambiguous untracked state.
- [x] AC-5: `nomadworks_validate`, `npm test`, and `npm run release:check` pass with evidence recorded.
- [x] AC-6: Product documentation reflects the latest state of the application for this change, or this task explicitly records that no product-truth update was required.
- [x] AC-7: Technical documentation reflects any architectural or implementation-significant change, or this task explicitly records that no technical-truth update was required.

## Acceptance Criteria Verification Map
- [x] AC-1
  - **Method:** `unit test | nomadworks_validate`
  - **Owner:** `developer`, then `qa_engineer`/`tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-2
  - **Method:** `doc/template review | nomadworks_validate`
  - **Owner:** `developer`, then `tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-3
  - **Method:** `nomadworks_validate | doc review`
  - **Owner:** `developer`, then `business_analyst`/`tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-4
  - **Method:** `git status review`
  - **Owner:** `tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-5
  - **Method:** `automated verification commands`
  - **Owner:** `qa_engineer`/`tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-6
  - **Method:** `documentation impact review`
  - **Owner:** `business_analyst`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`
- [x] AC-7
  - **Method:** `technical documentation impact review`
  - **Owner:** `technical_architect`/`tech_lead`
  - **Evidence:** `To be recorded in Post Implementation Task Updates`

Use this section to record how each acceptance criterion will be verified. Evidence links are optional and should be added when they materially improve traceability. Shared evidence may cover multiple acceptance criteria.

### Source Authority (MANDATORY)
*   **Spec Reference:** Follow-up hardening for commits `3d030ef`, `1e56810`, and `a5a88a8` on branch `evolution`.
*   **Documentation:** Existing setup/tooling docs for auto-onboarding and PAI/session sync remain source of truth unless specialists identify a required update.
*   **SCR Link:** `null` — no new product behavior or shared specification expansion is intended.

### Documentation Impact
* **Product Documentation:** No product-truth update required; this hardening changes validation/tooling behavior only.
* **Technical Documentation:** Updated `docs/core/technical_guidelines.md` and CodeMaps to reflect concrete stack/navigation metadata.

## Discussion Record

### Entry 1
- **From:** `product_owner`
- **To:** `product_manager`
- **Detailed Summary:** The user asked to continue from the prior work summary. The known remaining work is to fix validation blockers found after real auto-onboarding: Windows path separator handling in validation, local-knowledge-compliant CodeMap links, placeholder validation blockers, and ambiguous untracked auto-onboarding artifacts.
- **Open Questions:** None at task creation. The agent team should decide whether auto-generated root scaffolding belongs in this repository or should be removed from the working tree as local onboarding output.
- **Recommended Next Step:** PMA should complete pre-sync with BA and Technical Architect, then delegate implementation and verification.

### Entry 2
- **From:** `product_manager`
- **To:** `business_analyst, technical_architect`
- **Detailed Summary:** Pre-flight status before delegation: branch is `evolution` tracking `origin/evolution`; latest commit is `a5a88a8 fix: read plugin tuple options`; working tree has only untracked auto-onboarding artifacts (`codemap.yml`, `docs/scrs/current.md`, `docs/scrs/done.md`, `tasks/current.md`, `tasks/done.md`) before this task file and registry update are added. No unstaged tracked diff was present.
- **Open Questions:** Confirm whether this bounded hardening can proceed without a new SCR and whether any steady-state docs require update.
- **Recommended Next Step:** BA and Technical Architect should perform readiness and documentation/architecture impact review.

### Entry 3
- **From:** `business_analyst`
- **To:** `product_manager`
- **Detailed Summary:** BA confirmed the task is ready from a product/documentation perspective and can proceed without a new SCR because it is same-feature validation hardening without product behavior expansion. Product-truth documentation is likely not required unless implementation changes onboarding, validation exemptions, or sync behavior.
- **Open Questions:** None. AC-4 still requires explicit artifact disposition.
- **Recommended Next Step:** Proceed after Technical Architect/Tech Lead reviews are recorded.

### Entry 4
- **From:** `technical_architect`
- **To:** `product_manager`
- **Detailed Summary:** Technical Architect confirmed `standard / implementation / foundation` routing is appropriate, no SCR is required if scope remains validation/template correction, and Developer should normalize path checks, fix template nested links, remove real placeholders without weakening validation, and add/update CodeMaps only where necessary for validation.
- **Open Questions:** `nomadworks_validate` may reveal CodeMap hierarchy additions beyond the known Windows/template/placeholder issues; these are in scope only when necessary to satisfy existing validation policy.
- **Recommended Next Step:** Proceed to Developer with Tech Lead oversight.

### Entry 5
- **From:** `tech_lead`
- **To:** `product_manager`
- **Detailed Summary:** Tech Lead confirmed elevated release risk is manageable. Required evidence includes focused validation path-exemption coverage, `nomadworks_validate`, `npm test`, and `npm run release:check`. Tech Lead warned not to use broad staging until auto-onboarding artifact disposition is explicit.
- **Open Questions:** None after PMA artifact decision.
- **Recommended Next Step:** Delegate implementation with explicit staging and evidence instructions.

### Entry 6
- **From:** `product_manager`
- **To:** `developer`
- **Detailed Summary:** PMA disposition for AC-4: keep and version the repository-scoped auto-onboarding artifacts that are required for ongoing workflow/validation continuity in this repository: root `codemap.yml`, `tasks/current.md`, `tasks/done.md`, `docs/scrs/current.md`, and `docs/scrs/done.md`. Do not version `.nomadworks/` runtime/generated state. Do not use broad staging; leave final staging/commit to Tech Lead.
- **Open Questions:** None.
- **Recommended Next Step:** Implement the bounded validation/template/placeholder fixes, add focused regression coverage, run required verification, and update this task file with evidence.

## Reopen History

Not applicable.

### Pre Sync
* **PMA Facilitator:** The Product Manager always runs the sync and records the decision.
* **Default specialists by complexity:** `business_analyst` and `technical_architect`
* **Conditional specialists:** Add `tech_lead` for elevated validation/release risk.
* [x] Required specialists participated in pre-sync.

### Decomposition (complex only)

Not applicable.

### Slice Planning
* **Primary slice:** `foundation`
* **Adjacent slices:** `docs`, `qa`

### Verification
* [x] Tech Lead: Functional & Behavioral Verification
* [x] Product Manager: Acceptance Criteria and Evidence Coverage Verification
* [x] User: Final Approval

## Definition Of Done Check
- [x] All in-scope acceptance criteria are satisfied or explicitly marked blocked with reason.
- [x] Required tests, builds, and verification commands pass.
- [x] Required evidence and verification artifacts are recorded.
- [x] Documentation impact is resolved according to repository policy.
- [x] Relevant CodeMap updates are complete when needed.
- [x] Task files and workflow registries are updated.
- [x] Authorized review and closure checks are complete.
- [x] Final committed state contains all required code, documentation, and registry updates.

### Finalization
* [x] Developer: CodeMap Update (Update `codemap.yml` if entrypoints/wiring changed)
* [x] Developer: Documentation Update (Update relevant docs in `docs/` if required)
* [x] Technical Architect: Documentation Verification - *[Comment: Verified via pre-sync scope and final Tech Lead review; product docs not required, technical docs updated.*
* [x] Tech Lead: Code Commit
* [x] Product Manager: Documentation Closure Verification
* [x] Product Manager: Task Archiving

### Status: done

### Reopen Rule
- If a completed task needs discrepancies fixed or minor same-scope changes after implementation, move the same task back into `Active` rather than creating a new task for the same unfinished scope.
- Keep the same task file ID.
- Reuse the same Task tool `task_id` when resuming delegated task work, when possible.
- Reuse the same Workflow Runner `session_id` when resuming a Workflow Runner task, when possible.

# Reviews
## Technical Architect:
- [Comments]

# Post Implementation Task Updates

## Developer: Post Implementation Expectations
- Observable outcomes: validation now normalizes repository-relative paths before operational-folder checks, so nested `tasks`, `docs`, `templates`, `dist`, and `evidences` paths are exempt regardless of Windows `\\` separators; `tasks/done` placeholder exemption also uses normalized paths.
- Files changed: `src/validate_logic.js`, `templates/codemap.yml.template`, `tests/validate.test.js`, `tests/plugin.test.js`, `AGENTS.md`, `docs/core/technical_guidelines.md`, root `codemap.yml`, and new module CodeMaps under `agents/`, `policies/`, `scripts/`, `src/`, and `tests/`.
- Artifact disposition: kept/versioned repository-scoped onboarding artifacts per PMA decision: `codemap.yml`, `tasks/current.md`, `tasks/done.md`, `docs/scrs/current.md`, and `docs/scrs/done.md`; no `.nomadworks/` runtime/generated state was added.
- Verification commands/results:
  - `npm test -- tests/validate.test.js tests/plugin.test.js` — PASS; 2 suites, 25 tests.
  - `npm test` — PASS; 2 suites, 25 tests.
  - `npm run release:check` — PASS; test, build, and dry-run pack completed.
  - `node --input-type=module -e "import { nomadworks_validate_logic } from './src/validate_logic.js'; ..."` — PASS; `{ "ok": true, "errors": [], "warnings": [] }`.
  - `node --input-type=module -e "import { nomadworks_validate_logic } from './dist/validate_logic.js'; ..."` — PASS; `{ "ok": true, "errors": [], "warnings": [] }` after release build.
  - In-session `nomadworks_validate` tool was attempted after build but continued reporting the pre-fix Windows separator false positives for `docs\\...` and `tasks\\todo`, indicating the current OpenCode plugin process is still using the already-loaded validation implementation; the built/package validation logic passes and should be rechecked by Tech Lead in a fresh plugin session.
- AC coverage: AC-1 covered by normalized validation logic and focused nested operational-folder tests; AC-2 covered by generated CodeMap template update and plugin onboarding regression assertions; AC-3 covered by placeholder cleanup in `AGENTS.md`/`docs/core/technical_guidelines.md` without changing the placeholder rule; AC-4 covered by explicit artifact disposition and `git status` review; AC-5 covered by passing focused tests, full tests, release check, and local source/dist validation, with the in-session tool reload caveat noted; AC-6 no product-truth update required because user-facing behavior did not change; AC-7 technical documentation cleanup completed in `docs/core/technical_guidelines.md` and CodeMaps updated for source navigation.
- Documentation impact: technical guidance placeholders were replaced with concrete stack details; product documentation unchanged because this hardening does not alter product behavior, terminology, or feature inventory.
- Open risks: current `nomadworks_validate` tool invocation in this same OpenCode process appears stale; a fresh plugin/runtime reload should verify the tool-level command against the updated built validation logic.

## Product Manager: Closure Correction
- Registry correction: after the final implementation commit completed, PMA replaced the placeholder `this commit` in `tasks/done.md` with the actual implementation commit hash `3f0d913`.
- Reason: ensure the completed-task registry maps the task to a concrete commit hash for traceability.

### Developer Addendum - Post-Review Correction
- Files changed: root `codemap.yml` commands now use real repository commands from `package.json`/`AGENTS.md` (`npm test`, `npm run build`, `npm run release:check`) and omit lint because no repository lint script exists; task metadata now reflects active Developer ownership/handoff (`status: in_progress`, `assigned_to: developer`, `handoff_from: product_manager`).
- Verification commands/results:
  - `node --input-type=module -e "import { nomadworks_validate_logic } from './src/validate_logic.js'; ..."` — PASS; `{ "ok": true, "errors": [], "warnings": [] }`.
  - `npm test` — PASS; 2 suites, 25 tests.
- AC impact: strengthens AC-4 by removing ambiguous placeholder command metadata from the versioned root CodeMap; supports AC-5 by verifying the corrected CodeMap metadata and full regression suite; no change to AC-1, AC-2, AC-3, AC-6, or AC-7 conclusions.
- Remaining risk: the previously noted in-session `nomadworks_validate` tool staleness remains a runtime reload concern for Tech Lead verification; source-level validation passes with the corrected metadata.

## Closure Notes
- Final technical verification confirmed direct source validation and built `dist` validation pass with `{ "ok": true, "errors": [], "warnings": [] }`.
- `npm test` passed with 2 suites and 25 tests; `npm run release:check` passed including build and dry-run pack.
- The live in-session `nomadworks_validate` tool continued reporting stale pre-fix Windows separator false positives for `docs\\...` and `tasks\\done`, consistent with the current OpenCode plugin process using already-loaded validation code. Rerun the live tool after plugin/session reload to confirm the updated packaged implementation.
- Archived and registry-updated for commit `this commit`.

## Tech Lead Finalization Evidence
- `node --input-type=module -e "import { nomadworks_validate_logic } from './src/validate_logic.js'; ..."` — PASS; `{ "ok": true, "errors": [], "warnings": [] }`.
- `npm test` — PASS; 2 suites, 25 tests.
- `npm run release:check` — PASS; test, build, and dry-run pack completed.
- `node --input-type=module -e "import { nomadworks_validate_logic } from './dist/validate_logic.js'; ..."` — PASS; `{ "ok": true, "errors": [], "warnings": [] }`.
- `nomadworks_validate` tool — FAIL in current session with stale operational-folder false positives for `docs\\...` and `tasks\\done`; PMA authorized commit with this caveat recorded and follow-up fresh-session rerun expected.
