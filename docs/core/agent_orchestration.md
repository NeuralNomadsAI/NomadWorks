# LLM Agent Collaboration Strategy

This project uses a Product Manager-orchestrated synchronous collaboration model.

### 1. Centralized Orchestration
The **Product Manager Agent (PMA)** is the sole orchestrator. Subagents (Architect, Developer, etc.) do not operate autonomously. They receive direct instructions and task files from the PMA.

### 2. File-Based Task Management
- **Tasks Directory:** `tasks/`
- **Central Registries:** 
    *   `tasks/current.md`: The active dashboard. Tracks **Active**, **Todo**, and **Blocked** tasks.
    *   `tasks/done.md`: The historical registry. Maps completed tasks to SCRs and commits.
- **Subdirectories:** `todo/`, `blocked/`, `done/`.
- **Active Task:** The single task currently being worked on resides in the root of the `tasks/` directory.
- **Task Template:** All tasks must follow the standard `task-template.md`.

### 3. Operational Flow (Two-Phase Execution)

The workflow is divided into a **Negotiation Phase** (Human-involved) and an **Autonomous Implementation Phase** (Agent-driven).

#### Phase 1: Negotiation & Definition (Human-Centric)
0.  **Requirement Discovery:** User (PO) discusses high-level goals with the PMA and Tech Lead.
1.  **Pre-Spec-Change Sync:** The PMA orchestrates a sync with the **BA** and **Tech Lead** to draft a **Spec Change Request (SCR)** file in `docs/scrs/SCR-YYYY-MM-DD-SEQ.md`.
2.  **Iteration Loop:** The PO, BA, and Tech Lead iterate on the SCR file until all details are clear and approved.
3.  **The Truth Anchor:** Once approved, the SCR file serves as the definitive source of truth for the change.

#### Phase 2: Autonomous Implementation (Agent-Centric)
4.  **Batch Initiation:** The PO identifies one or more **Approved SCRs** for implementation.
5.  **Autonomous Cycle:** For each assigned SCR, the PMA executes the following:
    *   **Task Decomposition & Impact Mapping:** The PMA and **Technical Architect** review the SCR to map its **Impact Surface** (listing all affected directories and `codemap.yml` files). They then decompose the SCR into **Micro-Tasks**, each represented by a small, atomic task card in `tasks/todo/`.
    *   **Task Initiation:** Activate one task at a time. The task file MUST reference the SCR ID and the mapped Impact Surface.
    *   **Pre-Task Sync:** Gather specialists (internal) to confirm implementation readiness.
    *   **Implementation Phase:** Delegate to Developer and QA.
    *   **Post-Task Sync (Collective Verification):** PMA orchestrates a synchronous review of the **Evidence Packet**.
        *   **BA (Document Steward):** Verifies that the "Truth" documentation updates match the SCR and the implementation.
        *   **Tech Lead:** Verifies behavioral correctness and code quality.
        *   **UI/UX Designer:** Verifies aesthetic compliance using `screenshots/`.
    *   **The "Bounce Back" Loop:** If any specialist rejects the implementation, the PMA resets the sub-task and re-assigns it to the original agent using the **same `task_id`**. If a task fails this sync **twice**, the PMA must pause and trigger a full Pre-Task Sync with the whole team.
    *   **Automated Commitment:** Once 100% approved, the PMA commits the changes and moves the task to `done/`.

### 5. Blocker Management
If an autonomous task cannot proceed due to external factors or missing information:
1.  **Move to Blocked:** The PMA moves the task folder to `tasks/blocked/`.
2.  **Blocker Report:** The PMA creates a `BLOCKER.md` inside the task folder explaining exactly what is missing and what the PO needs to resolve.
3.  **PO Notification:** The PMA informs the Product Owner at the end of the batch summary.
6.  **Batch Completion:** The PMA provides a summary report to the PO only after the entire batch of SCRs is implemented.
2.  **Orchestrated Communication Protocols:**
    *   **Clarification/Questions:** Any need for clarification or questions from an agent is directed to the Product Manager Agent. The PMA then facilitates the inquiry and relays the response.
    *   **Dependency Management:** The PMA actively tracks and manages all task dependencies.
    *   **Review & Feedback:** The PMA assigns review tasks to the designated reviewer agents. Feedback is processed and directed back to the original agent.
    *   **Escalation:** Any persistent blockers or disagreements are escalated directly to the PMA.
3.  **Team Huddle:**
    *   Regular discussions on project status, documentation, and next steps occur during "Team Huddles" initiated by the PMA.
4.  **Orchestrated Discussion Workflow:**
    *   **PMA Initiation:** As the PMA, you will initiate an Orchestrated Discussion by creating a new `Task` and providing the problem statement. This generates a unique `session_id`.
    *   **Agent Participation:** You then orchestrate subagent participation by invoking the `Task` tool for each, *explicitly re-using the `session_id`*.
    *   **Synthesis:** Once all participating agents have provided input, you synthesize the discussion into a conclusive decision.
5.  **Documentation as the Single Source of Truth:**
    *   All agents refer to the project documentation (`docs/`) as the primary authority.
    *   The PMA is responsible for ensuring documentation is up-to-date.
6.  **Version Control System (Git) Integration:**
    *   Agents utilize Git under the direct oversight of the PMA, adhering to the established branching strategy.

### 4. Verification Policies
- **100% Pass Rate:** No task is complete if any test fails.
- **Evidence-First:** Proof of work (screenshots, logs) must be provided for every UI or logic change.
- **Documentation:** All architectural decisions must be updated in the `docs/` folder before a task is closed.
