# Definition Of Ready

A task is ready to begin only when the repository has enough information to execute safely and efficiently without inventing scope.

## Readiness Criteria

- Scope is clear, bounded, and appropriate for the task's declared complexity.
- The task objective is specific enough that the next responsible agent can act without guessing intent.
- Acceptance criteria are present, testable, and aligned with the stated scope.
- Complexity, track, and slice are set correctly for the work being requested.
- Required dependencies, assumptions, blockers, and open questions are either resolved or explicitly recorded.
- Required pre-sync specialists have reviewed the task definition according to the active task model.
- An approved SCR exists whenever the workflow requires one.
- The relevant repository areas are identified well enough to begin safe investigation, design, or implementation.

## Not Ready Conditions

- Requirements are ambiguous or contradictory.
- Acceptance criteria are missing or too vague to verify.
- The task is larger or riskier than its current routing metadata suggests.
- Required specialist review has not happened yet.
- A required SCR is missing or not approved.
- Critical blockers or dependencies are unknown or unrecorded.

## Operational Rule

If the task fails the Definition of Ready, execution should pause until the missing information is resolved or explicitly recorded for follow-up.
