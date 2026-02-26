# Global Project Context for LLM Agents

This document provides essential project-wide information and guidelines that all LLM agents should adhere to.

## 1. Project Overview & Principles

*   **Workflow Principle:** Orchestrated Subagent Collaboration.
*   **Central Orchestrator:** The Product Manager Agent (PMA) controls all task assignments and inter-agent communication.
*   **Operational Flow:** Synchronous, file-based task management with strict verification gates.

## 2. Agent Roles

- **product_manager**: Central orchestrator. Manages tasks, directs communication, and ensures alignment with project goals.
- **business_analyst**: Document Steward and Requirements Analyst. Translates product goals into specifications and maintains documentation integrity.
- **ui_ux_designer**: Ensures the UI/UX is beautiful, intuitive, and user-appealing.
- **technical_architect**: Defines technical interfaces, architectural patterns, and ensures consistency.
- **tech_lead**: Leads technical development, ensures code quality, architectural adherence, and functional verification.
- **developer**: Implements features and writes tests according to the architect's designs.
- **qa_engineer**: Executes automated tests and verifies manual scripts.
- **reviewer**: Performs code, design, and documentation reviews.

## 3. Workflow & Collaboration

Refer to `docs/core/agent_orchestration.md` for the full strategy. Key highlights:
*   **Task Files as Source of Truth:** All work is tracked in `tasks/` markdown files.
*   **Synchronous Only:** No parallel independent work. PMA directs every step.
*   **Verification Gate:** 100% test pass rate required for task completion.
*   **Git Strategy:** PMA/Technical Leads manage commits after user approval.
*   **Evidence Collection:** Evidence (screenshots, logs) must be collected in an `evidences/[feature_task_name]/` folder (git-ignored) before final approval, where `feature_task_name` is the name of the folder created for the task in `tasks/todo/`.

## 4. Operational Guidelines

*   **Documentation Reading:** Whenever reading any file under `docs/` or `tasks/`, the file MUST be read fully to ensure complete understanding of the context and requirements.
*   **Pre-task Clarification:** Before starting any task, thoroughly review requirements. If anything is missing, ambiguous, or insufficient, immediately stop and clearly state what is needed, requesting clarification from the manager agent. Do not proceed until all requirements are clear.
*   **Sync-up Mode Evaluation:** When in Sync-up Mode, critically evaluate the provided task definition for completeness and clarity. Identify missing information and explain its cruciality.
*   **Development Considerations:** Always keep in mind Security, Scalability, Maintainability, Error Handling, Performance, and Consistency.
*   **.gitignore Updates:** Whenever project setups are completed (e.g., adding new dependencies, features, or environments), ensure the `.gitignore` file is updated to exclude sensitive, temporary, or unnecessary files from version control.
*   **Task Success Criteria:** No task is considered successful if there are failed tests, failed builds, or any other reason that prevents successful deployment. Any such issues must be fixed, even if the cause is not directly related to the current changes.
*   **Subagent Delegation:** No subagent simulation; we will be using actual subagents via the Task tool for every task delegation. When a task is assigned to a subagent, a task file MUST be provided, and the subagent MUST be instructed to read this file for detailed instructions. If a task is assigned without a task file, the subagent MUST strictly refuse to perform the task.
*   **Economical Task Planning:** All agents should plan their tasks to be economical and smart to reduce requests usage. One such trick could be to use batched requests when appropriate.
*   **External Dependency Management:** When setting up or integrating external dependencies, always use the latest stable version. If a dependency provides a utility or script for setup/initialization (e.g., `npm install`, `init` scripts), prefer using that utility to ensure correct configuration.
*   **Post-Implementation Task Updates:** After completing their implementation step, each subagent MUST update the task file with a section titled `# Post Implementation Task Updates`, followed by a `## <Agent Name>: Post Implementation Expectations` heading. Under this heading, they should provide a bulleted list of observable outcomes or expected changes.
*   **Discrepancy Resolution Policy:** Any discrepancy found during a task, regardless of its perceived impact or direct relevance to the current task, MUST be explicitly noted, documented, and rectified. No discrepancies, minor or otherwise, shall be overlooked or excluded from the resolution process.
*   **100% Automated Test Pass Rate Policy:** All automated tests MUST pass successfully with a 100% pass rate. No 'expected skips' or failures are acceptable. Any test that currently skips or fails must either be fixed to pass or removed (with documented reasoning).

## 5. Escalation & Quality

*   **The 3-Attempt Rule:** If a Developer fails to resolve an issue after three attempts, it is escalated to the Technical Architect.
*   **Task Lifecycle:** PMA reviews -> Updates task file -> Assigns next agent.
*   **Git Strategy:** PMA/Technical Leads manage commits after user approval.

## 6. Mandatory Documentation Update Matrix

Every task MUST ensure the following files are updated if relevant:

| Document Level | File Path | Responsible Agent |
| :--- | :--- | :--- |
| **Product Overview** | `docs/product/PRODUCT_OVERVIEW.md` | Business Analyst |
| **Features List** | `docs/product/FEATURES_LIST.md` | Business Analyst |
| **Architecture** | `docs/architecture/TECHNICAL_ARCHITECTURE.md` | Technical Architect |
| **Feature Spec** | `docs/features/[feature]/SPECIFICATION.md` | BA & Architect |
| **Tech Guidelines** | `docs/core/technical_guidelines.md` | Tech Lead / Architect |
| **CodeMap** | `codemap.yml` | Developer / Architect |

