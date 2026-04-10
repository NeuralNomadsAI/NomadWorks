# NomadWorks

NomadWorks is an OpenCode plugin that installs the **NomadWorks Collective**: an AI-native software development team composed of specialized agents with distinct roles, handoff rules, and verification gates.

Instead of giving you a single generic assistant flow, NomadWorks gives you a small software company inside OpenCode. The collective includes product, architecture, development, QA, review, and design roles that collaborate through explicit artifacts such as SCRs, task files, evidence packets, and documentation updates.

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@neuralnomads/nomadworks"]
}
```

Then restart OpenCode, open the target repository, and start talking to the `product_manager` agent (PMA).

PMA will guide the repository setup flow and, when needed, initialize NomadWorks inside the repo for you. The user does not need to manually run NomadWorks commands to get started.

## Configure

During setup, PMA can initialize the repository and create `.codenomad/nomadworks.yaml`. NomadWorks reads this file for repository-local defaults, feature flags, and per-agent overrides.

NomadWorks supports two team presets:

- `mini`: PMA + BA + Tech Lead for simple repositories and `tiny` / `standard` tasks
- `full`: the complete collective, including advanced specialists and `workflow_runner`

If `team_mode` is not set in an existing repository, NomadWorks treats it as `full` by default.

Quick links:

- [Installation](docs/setup/INSTALLATION.md)
- [Configuration](docs/setup/CONFIGURATION.md)
- [Workflow Agents](docs/guides/AGENTS.md)
- [Workflow Model](docs/guides/WORKFLOW.md)
- [Mini Team Mode](docs/guides/TEAM_MODE_MINI.md)
- [Full Team Mode](docs/guides/TEAM_MODE_FULL.md)
- [Documentation Structure](docs/core/documentation_structure.md)

## Team Modes

| Team Mode | Available Agents | Supported Task Complexity | Flow Guide |
| :--- | :--- | :--- | :--- |
| `mini` | `product_manager`, `business_analyst`, `tech_lead` | `tiny`, `standard` | [Mini Team Mode](docs/guides/TEAM_MODE_MINI.md) |
| `full` | Full NomadWorks Collective, including `workflow_runner`, `technical_architect`, `developer`, `qa_engineer`, and `ui_ux_designer` | `tiny`, `standard`, `complex` | [Full Team Mode](docs/guides/TEAM_MODE_FULL.md) |

## Workflow Agents

The NomadWorks Collective operates like a role-based software development team:

- `product_manager` (Product Manager Agent, PMA): Default orchestrator and routing agent.
- `workflow_runner` (Workflow Runner): Autonomous executor for complex implementation tasks.
- `business_analyst` (Business Analyst, BA): Requirements and product-truth steward.
- `technical_architect` (Technical Architect): Architecture, interfaces, and impact mapping.
- `tech_lead` (Tech Lead): Behavioral verification and technical sign-off.
- `developer` (Developer): Implementation and test authoring.
- `qa_engineer` (QA Engineer): Verification and test coverage.
- `ui_ux_designer` (UI/UX Designer): Visual and interaction review.

Together, these agents act as a coordinated delivery team rather than a loose set of tools. PMA manages the work, specialists own their disciplines, and the workflow enforces that major changes are specified, verified, and documented before closure.

## Task Model

- **Complexity:** `tiny`, `standard`, `complex`
- **Track:** `implementation`, `investigation`, `spec`
- **Slice:** `foundation`, `core`, `logic`, `ui`, `polish`, `qa`, `docs`

Use `complex` for work that needs an approved SCR, slice-based decomposition, and `workflow_runner`. Keep `tiny` and `standard` tasks direct and bounded.

## Discussion Handoffs

NomadWorks also supports tracked discussion handoffs between `product_manager`, `business_analyst`, and `tech_lead`.

When a direct discussion becomes workflow-relevant:

- create or update a normal task file
- assign it to the next responsible agent
- record the reasoning in the task file's `Discussion Record`
- track it in `tasks/current.md` under `Active Discussions`

This keeps product and technical discussions durable, visible, and easy to hand over between agents instead of losing them in chat history.

## What Is An SCR?

`SCR` stands for **Spec Change Request**.

An SCR is the workflow artifact used to define and approve a meaningful change before implementation starts. It records:

- the problem being solved
- the proposed specification change
- the intended implementation direction
- acceptance criteria
- review and approval state

NomadWorks uses SCRs so the team does not jump straight from a vague request into code. The SCR gives the Product Manager Agent, Business Analyst, Tech Lead, and other specialists a shared source of truth for what the change is supposed to achieve before delivery work begins.

In practice, SCRs help:

- reduce missed requirements and hidden assumptions
- separate proposed change from implemented truth
- make complex work reviewable before coding starts
- provide a stable anchor for decomposition into tasks

## Task Flow

NomadWorks uses different operating flows depending on the configured team mode.

- For the lightweight operating path, see [Mini Team Mode](docs/guides/TEAM_MODE_MINI.md)
- For the complete collective path, see [Full Team Mode](docs/guides/TEAM_MODE_FULL.md)

## Parallelism

Until dedicated git worktree support lands, NomadWorks supports limited parallelism:

- one shared-worktree implementation task at a time
- parallel investigation and spec tasks when they avoid conflicting edits

For deeper workflow details, use the linked docs above.
