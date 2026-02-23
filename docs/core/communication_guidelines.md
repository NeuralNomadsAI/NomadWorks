# Communication Guidelines

This document outlines the communication protocols for the project.

## Agent Communication
- **PMA Orchestration:** The Product Manager Agent (PMA) is the sole orchestrator. Subagents (Architect, Developer, Reviewer, QA) do not operate autonomously.
- **Synchronous Only:** All inter-agent communication is synchronous and directed by the PMA.
- **Clarification:** Agents must direct all questions to the PMA, who will then query the relevant agent.

## Task Lifecycle & Folders
- **Root Directory:** `tasks/`
- **Folders:** `todo/`, `blocked/`, `done/`.
- **Handoffs:** PMA reviews output -> Updates task file -> Assigns next agent.

## Escalation Policy (The "3-Attempt Rule")
- If a Developer fails to implement a feature or fix a bug after **three consecutive attempts**, the PMA will automatically engage the Technical Lead/Architect to provide direct guidance.
- If any agent reports they cannot complete a task to 100% success, the PMA will request a fix twice more. If unresolved after the 3rd attempt, the issue is escalated to the Technical Architect.

## Product Owner (User) Communication
- **Direct:** Monospaced text in the CLI.
