# Technical Architecture

This document defines the global patterns and technical strategy for this project.

## Global Patterns
- **Orchestrated Subagent Workflow:** Using Product Manager as central coordinator.
- **File-Based Task Management:** All work is tracked in the `tasks/` directory.
- **Complexity-Based Routing:** The workflow weight is determined by task complexity: `tiny`, `standard`, or `complex`.
- **Slice-Based Decomposition:** Complex work is decomposed into `foundation`, `core`, `logic`, `ui`, `polish`, `qa`, and `docs` slices.
- **Shared-Worktree Concurrency Guard:** Only one implementation workflow may own the shared worktree at a time.

## Tech Stack
- **Runtime:** Node.js with ECMAScript modules
- **Plugin SDK:** `@opencode-ai/plugin`
- **Configuration Format:** YAML for NomadWorks config and CodeMaps
- **Tests:** Jest

## Architectural Patterns
- **Feature-First Organization:** Code and documentation are grouped by feature.
- **Prompt-Driven Agent Composition:** Agents are defined as markdown prompts with frontmatter and reusable includes.
- **Tool-Supervised Orchestration:** The plugin supervises session creation, agent registration, and workflow handoff tools.
