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
- For autonomous delivery, PO-proxy decision boundaries are recorded and any core PO decisions required before execution are either resolved or explicitly blocked.

## Not Ready Conditions

- Requirements are ambiguous or contradictory.
- Acceptance criteria are missing or too vague to verify.
- The task is larger or riskier than its current routing metadata suggests.
- Required specialist review has not happened yet.
- A required SCR is missing or not approved.
- Critical blockers or dependencies are unknown or unrecorded.
- Autonomous delivery is requested but missing readiness inputs, decision boundaries, or required core PO decisions are unresolved.

## Autonomous Delivery Readiness

Autonomous delivery may begin only when PMA has enough information to drive the task without inventing user intent:

- objective and user/problem context
- acceptance criteria
- scope boundaries and non-goals
- complexity, track, and slice
- required SCR status
- known constraints, dependencies, assumptions, blockers, and open questions
- evidence and testing expectations
- documentation expectations
- commit/finalization expectations
- PO-proxy decision boundaries

During autonomous delivery, PMA and Workflow Runner may make routine execution decisions on the PO's behalf only when repository precedent is clear and the decision does not alter core product behavior, core documentation truth, scope, constraints, or acceptance criteria.

Routine PO-proxy decisions must be recorded in the task file under `Decisions Taken On PO Behalf` and reported to the PO after implementation.

Core decisions must stop autonomous execution and be returned to the PO. Core decisions include product behavior, scope, acceptance criteria, core documentation truth, security/privacy/payment/auth/compliance, data/storage model, destructive or irreversible actions, new external dependencies, and high-risk deployment or release choices.

## Operational Rule

If the task fails the Definition of Ready, execution should pause until the missing information is resolved or explicitly recorded for follow-up.
