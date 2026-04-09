# Domain Map

This document maps the major product domains and the features that belong to them.

## How To Use This File

- Add a new domain entry when the product introduces a stable new area of responsibility.
- Link each feature to one primary domain.
- Keep this file at the summary level. Put detailed rules and workflows into `docs/domains/<domain>/`.

## Domain Entries

### Agent Orchestration

- **Purpose:** Defines how PMA, Workflow Runner, and specialist agents collaborate.
- **Owned Features:** Product Manager routing, Workflow Runner handoff, specialist delegation, discussion protocols.
- **Primary Docs:** `docs/guides/AGENTS.md`, `docs/core/agent_orchestration.md`

### Task Lifecycle

- **Purpose:** Defines how tasks are classified, discussed, executed, verified, and archived.
- **Owned Features:** `tiny` / `standard` / `complex` routing, pre-sync quorum rules, task templates, evidence expectations.
- **Primary Docs:** `docs/domains/task-lifecycle/OVERVIEW.md`, `docs/core/task_model.md`, `tasks/task-template.md`

### Documentation System

- **Purpose:** Defines how product, domain, feature, and architecture truth is organized and maintained.
- **Owned Features:** documentation hierarchy, ownership model, domain map maintenance, feature specification placement.
- **Primary Docs:** `docs/core/documentation_structure.md`, `docs/product/FEATURES_LIST.md`

### Validation And Navigation

- **Purpose:** Keeps the repository navigable and structurally correct for humans and agents.
- **Owned Features:** CodeMap validation, local knowledge rule, source indexing, placeholder detection.
- **Primary Docs:** `docs/core/codemap_conventions.md`, `codemap.yml`

### Plugin Setup And Configuration

- **Purpose:** Defines how NomadWorks is installed, configured, and enabled in an OpenCode environment.
- **Owned Features:** plugin installation, OpenCode config wiring, `nomadworks.yaml`, agent overrides.
- **Primary Docs:** `docs/setup/INSTALLATION.md`, `docs/setup/CONFIGURATION.md`
