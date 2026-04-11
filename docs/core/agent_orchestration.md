# LLM Agent Collaboration Strategy

This project uses a Product Manager-orchestrated synchronous collaboration model.

### 1. Centralized Orchestration
The **Product Manager Agent (PMA)** is the sole orchestrator. Subagents (Architect, Developer, etc.) do not operate autonomously. They receive direct instructions and task files from the PMA.

### 2. File-Based Task Management
- **Tasks Directory:** `tasks/`
- **Central Registries:** 
    *   `tasks/current.md`: The active dashboard. Tracks **Active Discussions**, **Active**, **Todo**, and **Blocked** tasks.
    *   `tasks/done.md`: The historical registry. Maps completed tasks to SCRs and commits.
- **Subdirectories:** `todo/`, `blocked/`, `done/`.
- **Active Task:** The single task currently being worked on resides in the root of the `tasks/` directory.
- **Task Template:** All tasks must follow the standard `task-template.md`.

### 2.1 Task Routing Model
- The canonical task-routing definitions live in `docs/core/task_model.md`.
- `tiny` work stays lightweight and direct.
- `standard` work stays bounded and uses the normal delivery path.
- `complex` implementation work uses slice-based decomposition and `workflow_runner`.
- PMA always facilitates pre-sync, while the required specialist quorum follows the defaults in `docs/core/task_model.md`.

### 3. Operational Flow (Two-Phase Execution)

The workflow is divided into a **Negotiation Phase** (Human-involved) and an **Autonomous Implementation Phase** (Agent-driven).

#### Phase 1: Negotiation & Definition (Human-Centric)
0.  **Requirement Discovery:** User (PO) discusses high-level goals with the PMA and Tech Lead.
1.  **Pre-Spec-Change Sync:** The PMA orchestrates a sync with the **BA** and **Tech Lead** to draft a **Spec Change Request (SCR)** file in `docs/scrs/SCR-YYYY-MM-DD-SEQ.md`.
2.  **Iteration Loop:** The PO, BA, and Tech Lead iterate on the SCR file until all details are clear and approved.
3.  **The Truth Anchor:** Once approved, the SCR file serves as the definitive source of truth for the change.

#### Phase 2: Autonomous Implementation (Agent-Centric)
4.  **Batch Initiation:** The PO identifies one or more **Approved SCRs** for implementation.
5.  **Autonomous Cycle (Sequential Execution):** The PMA processes tasks one-by-one. A task MUST be fully completed (including commit and archiving) before the next task begins.
    *   **Task Decomposition & Impact Mapping:** The PMA and **Technical Architect** review the SCR to map its **Impact Surface**. They then decompose the SCR into slice-based micro-tasks.
    *   **Sequential Loop:** For each Micro-Task:
        1. **Task Initiation:** Activate the task card.
        2. **Pre-Task Sync:** Confirm readiness.
        3. **Implementation:** Delegate Dev/QA.
        4. **Post-Task Sync:** Collective verification of evidence.
        5. **Commit & Archive:** Finalize code and registries.
    *   **Next Task:** Proceed to the next Micro-Task only after the previous one is in `tasks/done/`.

### 3.2 Reopen And Resume
- If a task that was believed to be done later needs discrepancies fixed or minor same-scope changes, PMA should move that same task back into `Active` instead of creating a brand new task.
- The task keeps the same task file ID and records the discrepancy in `Reopen History`.
- When PMA resumes delegated task work, it should reuse the same Task tool `task_id` when possible.
- If the task previously ran through `workflow_runner`, PMA should reuse both the same Task tool `task_id` and the same Workflow Runner `session_id` when possible so the prior context is preserved.
- Create a new task only when the new work is truly follow-up scope rather than unfinished original scope.

### 3.1 Limited Parallelism (Shared Worktree)
- One shared-worktree `implementation` task may be active at a time.
- `investigation` and `spec` tasks may run in parallel with that implementation task when they do not edit the same delivery artifacts.
- Until dedicated git worktree support lands, do not run two shared-worktree implementation tasks in parallel.

### 4. Communication Protocols
- **Clarification/Questions:** Any need for clarification or questions from an agent is directed to the PMA. The PMA then facilitates the inquiry and relays the response.
- **Dependency Management:** The PMA actively tracks and manages all task dependencies.
- **Review & Feedback:** The PMA assigns review and verification work to the appropriate technical specialists, with Tech Lead remaining the default technical review authority.
- **Escalation:** Any persistent blockers or disagreements are escalated directly to the PMA.
- **Orchestrated Discussion Workflow:** The PMA may create a new `Task`, reuse the resulting `session_id`, gather specialist input, and synthesize the final decision.
- **Documentation as the Single Source of Truth:** All agents refer to project documentation in `docs/` as the primary authority, and the PMA ensures it stays current.
- **Git Integration:** Agents use Git under PMA oversight and follow the repository's branching strategy.

### 5. Blocker Management
If an autonomous task cannot proceed due to external factors or missing information:
1.  **Move to Blocked:** The PMA moves the task folder to `tasks/blocked/`.
2.  **Blocker Report:** The PMA creates a `BLOCKER.md` inside the task folder explaining exactly what is missing and what the PO needs to resolve.
3.  **PO Notification:** The PMA informs the Product Owner at the end of the batch summary.
4.  **Batch Completion:** The PMA provides a summary report to the PO only after the entire batch of SCRs is implemented.

### 6. Verification Policies
- **100% Pass Rate:** No task is complete if any test fails.
- **Evidence-First:** Proof of work (screenshots, logs) must be provided for every UI or logic change.
- **Documentation:** All architectural decisions must be updated in the `docs/` folder before a task is closed.
