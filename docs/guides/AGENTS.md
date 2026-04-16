# Workflow Agents

NomadWorks installs the **NomadWorks Collective** into OpenCode: a role-based AI software development team that behaves more like a delivery organization than a single assistant.

The collective is designed so each agent represents a professional function inside an AI-native software company. Instead of one model improvising across all concerns, NomadWorks distributes responsibility across product, architecture, implementation, QA, technical review, and design roles.

## Primary orchestration agents

- `product_manager`: The default primary agent. Routes work by complexity, delegates specialists, and decides when to use the Workflow Runner.
- `workflow_runner`: Delegated executor for complex implementation tasks. Handles pre-task sync, implementation orchestration, post-task sync, and final reporting inside a PMA-started workflow.

## Specialist agents

- `business_analyst`: Maintains product truth, clarifies requirements, and improves SCR quality.
- `technical_architect`: Defines interfaces, impact surfaces, and architectural consistency.
- `tech_lead`: Performs behavioral verification, code quality checks, and technical sign-off.
- `developer`: Implements code and tests.
- `qa_engineer`: Designs and executes verification and test coverage.
- `ui_ux_designer`: Reviews visual and interaction quality for UI-facing work.

## Discussion-Capable Agents

These agents can talk directly with the user and turn meaningful discussions into tracked handoff tasks:

- `product_manager`
- `business_analyst`
- `tech_lead`

## Agent Mode Semantics

- `primary`: The default main agent the user lands in for the repository.
- `subagent`: Intended for delegated specialist work rather than direct primary use.
- `all`: Can be used either as a directly selected agent or as a delegated specialist, depending on the workflow.

`mode: all` does not make an agent an orchestrator by default. PMA remains the sole workflow orchestrator. Discussion-capable agents may speak directly with the user, but workflow-relevant work must still be handed back through task files and PMA-owned orchestration.

## Repository Customization

- `.nomadworks/agents/<agent>.md`: appends repository-specific instructions to the bundled agent prompt.
- `.nomadworks/agent-overrides/<agent>.md`: explicitly replaces the bundled base prompt for advanced cases.
- `.nomadworks/policies/*.md`: overrides shared repository policy files used by multiple agents.

Use additive agent files and shared policies by default. Prefer explicit full prompt replacement only when a repository truly needs to take over an agent's base prompt.

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
