# Testing Guidelines

## Test Levels

1. Unit tests verify isolated logic, functions, and classes.
2. Integration tests verify interactions between multiple modules or external services.
3. End-to-end tests verify real user or system flows through the product.
4. Manual verification is allowed for visual or interaction checks that cannot be automated effectively.

## Verification Policy

- All automated tests must pass. No expected skips or tolerated failures are allowed by default.
- Tests should live close to the code they verify unless the repository uses a clearly defined alternative structure.
- Every `implementation` task must produce the verification artifacts needed for review.
- Verification artifacts should map back to the task's numbered acceptance criteria.
- Run the relevant regression coverage before handing implementation back for technical review.

## Evidence Defaults

By default, implementation evidence should include:

- a short summary of what was verified
- command output or logs for relevant automated checks
- screenshots for UI changes or visual reviews

## Non-Implementation Outputs

- `investigation` tasks should produce findings, reproduction notes, useful logs, and a recommended next step.
- `spec` tasks should produce SCR or documentation updates that define the accepted change and its impact.
