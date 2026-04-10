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

## Task Flow

```mermaid
flowchart TD
    A[Stage 1: Intake<br/>PMA receives request] --> B{Gate 1:<br/>Track?}

    B -->|spec| C[Stage 2A: Spec definition<br/>PMA facilitates<br/>BA + Tech Lead draft or refine SCR]
    C --> D{Gate 2:<br/>SCR approved?}
    D -->|No| C
    D -->|Yes| E[Stage 3: Implementation task created<br/>PMA sets complexity, track, slice]

    B -->|investigation| F[Stage 2B: Investigation task created<br/>PMA assigns relevant specialist]
    F --> G[Stage 3: Investigation execution<br/>Specialist or Workflow Runner gathers findings]
    G --> H[Stage 4: Findings review gate<br/>PMA reviews outputs and next action]

    B -->|implementation| E

    E --> I{Gate 3:<br/>Complexity?}
    I -->|tiny| J[Stage 4A: Tiny path<br/>PMA direct delegation]
    I -->|standard| K[Stage 4B: Standard path<br/>PMA orchestrated bounded delivery]
    I -->|complex| L[Stage 4C: Complex path<br/>Workflow Runner owns end-to-end execution]

    J --> M[Stage 5: Pre-sync gate<br/>Developer + Tech Lead<br/>Add BA if product truth changes<br/>Add UI/UX if interface changes]
    K --> N[Stage 5: Pre-sync gate<br/>Business Analyst + Technical Architect<br/>Add Tech Lead if risk is elevated<br/>Add UI/UX if interface changes]
    L --> O[Stage 5: Pre-sync gate<br/>Business Analyst + Technical Architect + Tech Lead<br/>Add UI/UX for interface slices]

    M --> P[Stage 6: Execution<br/>Assigned specialist implements or investigates]
    N --> Q[Stage 6: Execution<br/>PMA coordinates specialist handoffs]
    O --> R[Stage 6: Execution<br/>Workflow Runner coordinates slice-based subtasks]

    P --> S[Stage 7: Verification and evidence<br/>Developer or specialist + QA or Tech Lead]
    Q --> S
    R --> S

    S --> T{Gate 4:<br/>All ACs covered with evidence?}
    T -->|No| U[Return for fixes or clarification]
    U --> M
    T -->|Yes| V[Stage 8: Documentation closure<br/>Relevant agents update product and technical docs<br/>PMA verifies closure]

    V --> W{Gate 5:<br/>Docs updated or explicitly not required?}
    W -->|No| U
    W -->|Yes| X[Stage 9: Commit and archive<br/>Tech Lead or workflow path commits<br/>PMA archives task and updates registries]
```
```

## Parallelism

Until dedicated git worktree support lands, NomadWorks supports limited parallelism:

- one shared-worktree implementation task at a time
- parallel investigation and spec tasks when they avoid conflicting edits

For deeper workflow details, use the linked docs above.
