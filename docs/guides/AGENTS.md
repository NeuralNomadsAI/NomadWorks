# Workflow Agents

NomadWorks installs the **NomadWorks Collective** into OpenCode: a role-based AI software development team that behaves more like a delivery organization than a single assistant.

The collective is designed so each agent represents a professional function inside an AI-native software company. Instead of one model improvising across all concerns, NomadWorks distributes responsibility across product, architecture, implementation, QA, technical review, and design roles.

## Primary orchestration agents

- `product_manager`: The default primary agent. Routes work by complexity, delegates specialists, and decides when to use the Workflow Runner.
- `workflow_runner`: Autonomous executor for complex implementation tasks. Owns pre-task sync, implementation orchestration, post-task sync, and final reporting.

## Specialist agents

- `business_analyst`: Maintains product truth, clarifies requirements, and improves SCR quality.
- `technical_architect`: Defines interfaces, impact surfaces, and architectural consistency.
- `tech_lead`: Performs behavioral verification, code quality checks, and technical sign-off.
- `developer`: Implements code and tests.
- `qa_engineer`: Designs and executes verification and test coverage.
- `ui_ux_designer`: Reviews visual and interaction quality for UI-facing work.

## Typical usage by task complexity

### Tiny

- PMA routes directly to the most relevant specialist.
- Verification stays lightweight.
- Use a single primary slice.

### Standard

- PMA orchestrates a bounded delivery sequence.
- One primary slice, with adjacent work only when necessary.
- Verification and documentation expectations remain normal.

### Complex

- PMA links the task to an approved SCR.
- Architect helps decompose the work into slice-based subtasks.
- `workflow_runner` executes the end-to-end delivery cycle.
