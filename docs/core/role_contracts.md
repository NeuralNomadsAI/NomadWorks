# Role Contracts

This document defines the workflow verbs and handoff output contract used across the NomadWorks Collective.

## Ownership Verbs

- **Owns:** Accountable for the correctness and completeness of that class of work.
- **Updates:** May edit the artifact during execution.
- **Verifies:** Checks that the artifact is sufficient for closure.
- **Closes:** Final workflow authority that decides whether the work can be considered complete.

## Commit And Closure Authority

- **Product Manager Agent (PMA):** Owns workflow closure in all modes. PMA decides whether evidence, documentation, and registry state are sufficient for final closure.
- **Tech Lead:** Default commit authority for direct execution paths and mini-team work.
- **Workflow Runner:** Delegated commit authority only for full-team complex workflow-runner paths that PMA explicitly starts.
- **Task Archiving:** Archive and registry updates are part of finalization and must be included in the final committed state.

## Documentation Responsibility Model

- **Business Analyst:** Owns product truth and product-facing feature documentation.
- **Technical Architect:** Owns architecture truth and technical design documentation.
- **Tech Lead / Developer / Workflow Runner:** May update code-adjacent documentation during execution.
- **PMA:** Verifies documentation closure and decides whether documentation impact has been fully resolved for the task.

## Specialist Output Contract

When handing work back to PMA or Workflow Runner, specialists should return these sections in a concise format:

- **Summary:** What was done or decided.
- **Work Performed:** Files changed, reviewed, or key areas analyzed.
- **Acceptance Criteria Coverage:** Which ACs are satisfied, blocked, or still unclear.
- **Documentation Impact:** Product or technical docs updated, or explicitly not required.
- **Open Risks:** Remaining risks, gaps, or assumptions.
- **Recommended Next Step:** Who should act next and why.
