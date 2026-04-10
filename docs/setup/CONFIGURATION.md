# Configuration

NomadWorks reads repository-local configuration from `.codenomad/nomadworks.yaml`.

This file is typically created during the PMA-led repository setup flow.

## Minimal config

```yaml
enabled: true
team_mode: full

defaults:
  # provider: openai
  # model: gpt-5.4

features:
  debug_dumps: true
  codemap_verification: true

agents:
  product_manager:
    enabled: true
```

## Top-level sections

- `enabled`: Turns the NomadWorks agent set on for the repository.
- `team_mode`: The supported team preset. Use `mini` for PMA + BA + Tech Lead only, or `full` for the complete collective. If omitted in an existing repository, NomadWorks defaults to `full`.
- `defaults`: Shared defaults for providers, models, permissions, and other agent config fields.
- `features`: Plugin feature flags such as debug dumps and validation behavior.
- `agents`: Per-agent enablement and overrides.

## Supported team modes

### `mini`

- Enabled by default: `product_manager`, `business_analyst`, `tech_lead`
- Intended for: `tiny` and `standard` tasks in simple repositories
- Not supported: `complex` work and `workflow_runner`

### `full`

- Enables the full NomadWorks Collective by default
- Intended for: repositories that need the complete role set, including `workflow_runner`
- Supports: `tiny`, `standard`, and `complex`

## Common uses

### Override a model for one agent

```yaml
agents:
  developer:
    provider: openai
    model: gpt-5.4
```

### Disable an optional agent in a repo

```yaml
agents:
  ui_ux_designer:
    enabled: false
```

Mandatory agents cannot be disabled:

- `product_manager`
- `business_analyst`
- `tech_lead`

### Extend agent tools

```yaml
agents:
  workflow_runner:
    tools_add:
      - nomadworks_validate
```

## Operational notes

- The `product_manager` agent becomes the default primary agent when NomadWorks is enabled.
- Repository-local agent markdown overrides can live in `.codenomad/nomadworks/agents/`.
- Final agent prompts are dumped to `.nomadworks/agents/` when `features.debug_dumps` is enabled.
