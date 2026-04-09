# NomadWorks

NomadWorks is an OpenCode plugin that installs a structured multi-agent workflow into a repository.

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@neuralnomads/nomadworks"]
}
```

Then restart OpenCode and run `nomadworks_init` inside the target repository.

## Configure

Initialization creates `.codenomad/nomadworks.yaml`. NomadWorks reads this file for repository-local defaults, feature flags, and per-agent overrides.

Quick links:

- [Installation](docs/setup/INSTALLATION.md)
- [Configuration](docs/setup/CONFIGURATION.md)
- [Workflow Agents](docs/guides/AGENTS.md)
- [Workflow Model](docs/guides/WORKFLOW.md)
- [Documentation Structure](docs/core/documentation_structure.md)

## Workflow Agents

- `product_manager`: Default orchestrator and routing agent.
- `workflow_runner`: Autonomous executor for complex implementation tasks.
- `business_analyst`: Requirements and product-truth steward.
- `technical_architect`: Architecture, interfaces, and impact mapping.
- `tech_lead`: Behavioral verification and technical sign-off.
- `developer`: Implementation and test authoring.
- `qa_engineer`: Verification and test coverage.
- `reviewer`: Independent review.
- `ui_ux_designer`: Visual and interaction review.

## Task Model

- **Complexity:** `tiny`, `standard`, `complex`
- **Track:** `implementation`, `investigation`, `spec`
- **Slice:** `foundation`, `core`, `logic`, `ui`, `polish`, `qa`, `docs`

Use `complex` for work that needs an approved SCR, slice-based decomposition, and `workflow_runner`. Keep `tiny` and `standard` tasks direct and bounded.

## Parallelism

Until dedicated git worktree support lands, NomadWorks supports limited parallelism:

- one shared-worktree implementation task at a time
- parallel investigation and spec tasks when they avoid conflicting edits

For deeper workflow details, use the linked docs above.
