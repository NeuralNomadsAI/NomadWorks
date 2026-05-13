# Agent Notes

## Project Shape
- This is the npm package `@neuralnomads/nomadworks`, an OpenCode plugin. Source entrypoint is `src/index.js`; package entrypoint is built `dist/index.js`.
- The repo is ESM (`"type": "module"`). `typescript` is installed, but the build only copies JavaScript; there is no TS compile step.
- `npm pack` ships `dist`, `agents`, `docs`, `policies`, `templates`, and `Agents_Common.md`; update package contents with `package.json` `files` in mind.
- `.opencode/` has its own package lock for local OpenCode plugin state; the publishable package is the root npm package.

## Commands
- Install root dependencies with `npm ci`.
- Test all: `npm test`.
- Run one Jest file or focused test: `npm test -- tests/validate.test.js -t "Respects .gitignore"`.
- Build: `npm run build`. It deletes `dist/` and copies only `src/*.js` into `dist/`.
- Release check: `npm run release:check` runs `npm test`, then `npm run build`, then `npm pack --dry-run`.

## Plugin Runtime
- Runtime config is `.nomadworks/nomadworks.yaml`; some paths still fall back to legacy `.codenomad` locations.
- `nomadworks_init` requires `team_mode` of `mini` or `full` and only writes scaffold files when they do not already exist.
- `team_mode` defaults to `full`; `mini` enables only `product_manager`, `business_analyst`, and `tech_lead`. These three mandatory agents cannot be disabled.
- Repo-local full agent overrides live in `.nomadworks/agents/<agent>.md`; additive prompt fragments live in `.nomadworks/agent-additions/<agent>.md`; policy overrides live in `.nomadworks/policies/*.md`.
- Include resolution supports `<include:plugin:...>`, `<include:repo:...>`, and `<include:policy:...>`; policy includes prefer repo-local `.nomadworks/policies/` before bundled `policies/`.
- Unless `features.keep_builtin_agents: true`, config generation disables existing and built-in OpenCode agents (`build`, `plan`, `general`, `explore`) and sets `product_manager` as `default_agent`.
- Unless `features.debug_dumps: false`, resolved agent prompts are dumped to `.nomadworks/generated/agents/` during config resolution.
- `nomadflow_run_workflow` is only usable when `workflow_runner` is enabled and `team_mode` is `full`; it blocks a second active shared-worktree `implementation` workflow.

## Validation And CodeMaps
- `nomadworks_validate` fails immediately if root `codemap.yml` is missing.
- Validation honors `.gitignore`, skips hidden directory trees such as `.github/`, and exempts `tasks`, `evidences`, `docs`, `templates`, and `dist` from mandatory codemap and shadow-file checks.
- Module-scope codemaps must index every sibling source file with the extensions listed in `src/validate_logic.js`; unindexed source files fail validation.
- For `entrypoints`, `sources_of_truth`, and `links`, nested paths with `/` fail the Rule of Local Knowledge unless they start with `./`.
- Markdown placeholders `[To be defined]` and `[Insert ...]` fail validation outside `tasks/done`.

## Release
- CI release runs only on pushes to `dev` and `main` using Node.js 24, `npm ci`, then `npm run release:check`.
- `dev` publishes `<package.json version>-rc.N` with npm dist-tag `rc`; `N` is derived from already-published npm versions.
- `main` publishes the exact stable `package.json` version with dist-tag `latest` and fails if that version already exists.
- Keep `package.json` on a stable semver base; do not commit prerelease versions like `1.4.0-rc.2`.
- Publishing uses npm Trusted Publishing with provenance, not `NPM_TOKEN`.
