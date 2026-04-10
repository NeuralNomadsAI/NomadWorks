# Installation

## 1. Install the package

Add the NomadWorks plugin package to the environment where OpenCode resolves plugins.

```json
{
  "plugin": ["@neuralnomads/nomadworks"]
}
```

OpenCode's config schema allows plugin entries to be strings or `[package, options]` tuples. Use the form that matches your broader OpenCode setup.

## 2. Add the plugin to OpenCode config

Add NomadWorks to your OpenCode configuration file and restart OpenCode so the plugin is loaded.

Minimal example:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@neuralnomads/nomadworks"]
}
```

## 3. Start with PMA

After the plugin loads, open the repository you want to enable and start talking to the `product_manager` agent (PMA).

PMA is the default orchestrator and will help you set up the repository for NomadWorks. If the repository has not been initialized yet, PMA can trigger the required setup flow on your behalf.

You do not need to manually run NomadWorks initialization commands as a first step.

## 4. Repository initialization artifacts

When PMA initializes the repository, NomadWorks creates:

- `.codenomad/nomadworks.yaml`
- `codemap.yml`
- `tasks/current.md`
- `tasks/done.md`
- `docs/scrs/current.md`
- `docs/scrs/done.md`

## 5. Configure NomadWorks

Edit `.codenomad/nomadworks.yaml` to set defaults, features, and per-agent overrides.

See:

- `docs/setup/CONFIGURATION.md`
- `docs/guides/AGENTS.md`
- `docs/guides/WORKFLOW.md`
