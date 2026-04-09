# Testing Strategy

We adhere to a strict test pyramid strategy to ensure 100% reliability.

## Test Levels
1. **Unit Tests:** Focus on isolated logic, functions, and classes.
2. **Integration Tests:** Verify interactions between multiple modules or external services.
3. **E2E (End-to-End) Tests:** Simulate real user journeys through the entire system.
4. **Manual Verification:** Required for visual UI components that cannot be easily automated.

## Policies
- **100% Pass Rate:** All automated tests MUST pass. No "expected skips" are allowed.
- **Feature-First Placement:** Tests must be placed alongside the code they test (e.g., `src/features/auth/tests/`).
- **Evidence Collection:** Every task must produce proof of testing (logs, screenshots) saved in `evidences/[feature_task_name]/`, where `feature_task_name` is the name of the folder created for the task in `tasks/todo/`.
- **Acceptance Criteria Coverage:** Evidence must map back to the task's numbered acceptance criteria so reviewers can confirm which requirement each artifact verifies.
- **Regression:** A full regression suite must be run by the Developer before handing over to the Reviewer.
