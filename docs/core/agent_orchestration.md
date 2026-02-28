# LLM Agent Collaboration Strategy

This project uses a Product Manager-orchestrated synchronous collaboration model.

### 1. Centralized Orchestration
The **Product Manager Agent (PMA)** is the sole orchestrator. Subagents (Architect, Developer, etc.) do not operate autonomously. They receive direct instructions and task files from the PMA.

### 2. File-Based Task Management
- **Tasks Directory:** `tasks/`
- **Subdirectories:** `todo/`, `blocked/`, `done/`.
- **Active Task:** The single task currently being worked on resides in the root of the `tasks/` directory.
- **Task Template:** All tasks must follow the standard `task-template.md`.

### 3. Operational Flow (Spec-Driven Trigger)

All engineering work MUST originate from a committed change in the product specification.

0.  **Requirement Discovery (PO & PMA):** The User (Product Owner) discusses high-level goals with the PMA.
1.  **Pre-Spec-Change Sync (Discovery):** The PMA orchestrates a synchronous discussion with the **BA** and **Tech Lead** to translate goals into concrete specification changes. This follows the same rigorous process as a Pre-Task Sync.
2.  **Spec Commitment (The Truth Anchor):** Once the PO approves the spec changes, the PMA commits the documentation.
    *   **SCR ID Format:** `SCR-YYYY-MM-DD-SEQ` (e.g., SCR-2026-02-26-01).
    *   **Commit Message:** `SCR-<ID>: Update [Feature] spec for [Context]`. The body must include detailed "Why" and key decisions.
3.  **Task Initiation:** Only after the spec is committed does the PMA create the task folder. The task file MUST reference the **Spec Commit Hash**.
4.  **Pre-Task Sync (Execution):** Before implementation starts, the PMA initiates a synchronous sync with ALL relevant agents to share task details, identify blockers, and confirm readiness.
5.  **Directed Task Handoffs:** The PMA assigns sub-tasks based on the committed spec.
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
