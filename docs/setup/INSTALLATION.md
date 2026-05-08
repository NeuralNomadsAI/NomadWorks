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

During setup, PMA should ask whether you want:

- `mini` team mode for simple repositories and `tiny` / `standard` work
- `full` team mode for the complete collective, including `complex` workflows

You do not need to manually run NomadWorks initialization commands as a first step.

## 4. Repository initialization artifacts

When PMA initializes the repository, NomadWorks creates:

- `.nomadworks/nomadworks.yaml`
- `.nomadworks/policies/README.md`
- `.nomadworks/agents/README.md`
- `.nomadworks/agent-additions/README.md`
- `.nomadworks/generated/agents/README.md`
- `.nomadworks/generated/policies/README.md`
- `codemap.yml`
- `tasks/current.md`
- `tasks/done.md`
- `docs/scrs/current.md`
- `docs/scrs/done.md`

## 5. Configure NomadWorks

Edit `.nomadworks/nomadworks.yaml` to set defaults, features, policy extraction behavior, and per-agent config overrides. Use `.nomadworks/agents/` for full repository-local agent definitions or custom agents, and `.nomadworks/agent-additions/` for additive repo-specific agent instructions.

See:

- `docs/setup/CONFIGURATION.md`
- `docs/guides/AGENTS.md`
- `docs/guides/WORKFLOW.md`
