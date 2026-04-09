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

## 3. Initialize the repository

After the plugin loads, run `nomadworks_init` from the repository you want to enable.

This creates:

- `.codenomad/nomadworks.yaml`
- `codemap.yml`
- `tasks/current.md`
- `tasks/done.md`
- `docs/scrs/current.md`
- `docs/scrs/done.md`

## 4. Configure NomadWorks

Edit `.codenomad/nomadworks.yaml` to set defaults, features, and per-agent overrides.

See:

- `docs/setup/CONFIGURATION.md`
- `docs/guides/AGENTS.md`
- `docs/guides/WORKFLOW.md`
