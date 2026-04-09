# Configuration

NomadWorks reads repository-local configuration from `.codenomad/nomadworks.yaml`.

## Minimal config

```yaml
enabled: true

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
- `defaults`: Shared defaults for providers, models, permissions, and other agent config fields.
- `features`: Plugin feature flags such as debug dumps and validation behavior.
- `agents`: Per-agent enablement and overrides.

## Common uses

### Override a model for one agent

```yaml
agents:
  developer:
    provider: openai
    model: gpt-5.4
```

### Disable an agent in a repo

```yaml
agents:
  reviewer:
    enabled: false
```

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
