# Configuration

NomadWorks reads repository-local configuration from `.nomadworks/nomadworks.yaml`.

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

policies:
  extract_defaults: none

agents:
  product_manager:
    enabled: true
```

## Top-level sections

- `enabled`: Turns the NomadWorks agent set on for the repository.
- `team_mode`: The supported team preset. Use `mini` for PMA + BA + Tech Lead only, or `full` for the complete collective. If omitted in an existing repository, NomadWorks defaults to `full`.
- `defaults`: Shared defaults for providers, models, permissions, and other agent config fields.
- `features`: Plugin feature flags such as debug dumps and validation behavior.
- `policies`: Policy extraction controls for generated reference policy files.
- `agents`: Per-agent enablement and config overrides from `nomadworks.yaml`.

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

### Generate bundled policy references

```yaml
policies:
  extract_defaults: all
```

This writes the bundled default policy files to `.nomadworks/generated/policies/` for reference. Those generated files are not used directly at runtime. To customize one, copy it into `.nomadworks/policies/` and edit the copy.

### Add repository-specific agent instructions

Create `.nomadworks/agents/<agent>.md` to append repository-specific instructions to one bundled agent prompt.

Use `.nomadworks/agent-overrides/<agent>.md` only for rare advanced cases where you need to replace the bundled base prompt explicitly.

## Operational notes

- The `product_manager` agent becomes the default primary agent when NomadWorks is enabled.
- Repository-local agent additions can live in `.nomadworks/agents/`.
- Explicit full prompt replacements can live in `.nomadworks/agent-overrides/`.
- Repository-local policy overrides can live in `.nomadworks/policies/`.
- Generated reference policy files are written to `.nomadworks/generated/policies/` when `policies.extract_defaults` is set to `all`.
- Final agent prompts are dumped to `.nomadworks/generated/agents/` when `features.debug_dumps` is enabled.
