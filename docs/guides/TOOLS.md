# Plugin Tools

This page documents the tools provided by the NomadWorks plugin.

## `nomadworks_init`

Initializes NomadWorks in the current repository.

### Arguments

- `team_mode`: `mini` or `full`

### What it creates

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

### Notes

- Full repository-local agent definitions or custom agents are optional and can be created later under `.nomadworks/agents/`.
- Repository-specific additive agent instructions are optional and can be created later under `.nomadworks/agent-additions/`.
- Generated prompt dumps go to `.nomadworks/generated/agents/` when `features.debug_dumps` is enabled.
- Generated reference policy files go to `.nomadworks/generated/policies/` when `policies.extract_defaults` is set to `all`.
- The scaffolded README files in `.nomadworks/agents/` and `.nomadworks/agent-additions/` list common `plugin:` and `policy:` includes that custom agents can reuse.
- After a successful init, NomadWorks will request the OpenCode instance be disposed so the new config/agents can be reloaded.

## `nomadworks_validate`

Validates NomadWorks workflow artifacts and CodeMap integrity.

It checks things like:

- missing root `codemap.yml`
- invalid or broken codemap references
- missing codemaps in maintained source directories
- placeholder documentation problems
- hidden/tool-owned trees such as `.github/workflows/` are ignored

## `nomadworks_start_discussion`

Starts or reopens an automatic discussion transcript for the current session.

### Arguments

Provide exactly one of:

- `title`: title for a new discussion
- `existing_discussion_id`: existing discussion ID to reopen

Also provide:

- `previous_message_count`: number of earlier **user and assistant** messages from the current session to include before live capture starts or before a discussion is reopened

### Notes

- Use `0` if the discussion starts now.
- Use `existing_discussion_id` plus `previous_message_count` to reopen an older discussion and include a small amount of newer conversation that happened before the reopen call.
- Only one active discussion is allowed per session.
- While active, raw discussion transcripts are stored in `.nomadworks/runtime/discussions/`.
- The durable workflow artifact is written to `tasks/discussions/` when the discussion is stopped and summarized.
- Active discussion state is persisted in `.nomadworks/runtime/discussions.json`.
- Only discussion-capable agents should use these discussion tools.

## `nomadworks_stop_discussion`

Stops the automatic discussion transcript for the current session.

This tool performs the full close flow synchronously:

- marks the runtime transcript as summarizing
- invokes `business_analyst` with a blocking prompt to write the structured summary to `tasks/discussions/`
- verifies the summary file was written successfully
- archives the raw runtime transcript
- returns the final closed result from the tool call itself

## `nomadworks_session_export`

Exports selected OpenCode sessions with the native `opencode export <sessionID>` command into the workspace area of the Git-managed PAI root. If no `session_ids` are provided, it exports the current OpenCode session only when the runtime supplies a current session ID in tool context; otherwise it fails and asks for explicit session IDs.

### Arguments

- `session_ids`: optional OpenCode session IDs, separated by commas or whitespace. Uses the current session when empty.
- `repo_path`: optional PAI root path. Uses `pai.root`, `sync.repo_path`, plugin `pai_root`, or plugin `sync_repo_path` when empty.
- `opencode_command`: optional OpenCode executable path or command. Uses `pai.opencode_command` or `opencode` when empty.

### Notes

- Generated files live under `WORKSPACES/<repo-id>/SESSIONS/` inside the PAI repository.
- To export outside a live OpenCode session context, pass explicit `session_ids`.
- Run `nomadworks_session_import` on another machine to import them with the native `opencode import <file>` command.

## `nomadworks_session_import`

Imports selected OpenCode sessions from native `opencode export` JSON files in the workspace area of the Git-managed PAI root.

### Arguments

- `session_ids`: optional session IDs to import. Imports all exported OpenCode sessions in the manifest when empty.
- `repo_path`: optional PAI root path. Uses `pai.root`, `sync.repo_path`, plugin `pai_root`, or plugin `sync_repo_path` when empty.
- `opencode_command`: optional OpenCode executable path or command. Uses `pai.opencode_command` or `opencode` when empty.

### Notes

- Uses the native `opencode import <file>` command in the current worktree.

## `nomadworks_sync_status`

Shows sync repository status for global PAI and the current workspace.

### Arguments

- `repo_path`: optional sync Git repository path. Uses `pai.root`, `sync.repo_path`, plugin `pai_root`, or plugin `sync_repo_path`.

## `nomadworks_sync_pull`

Runs `git pull --ff-only` in the configured sync repository.

## `nomadworks_sync_push`

Runs `git add .`, `git commit`, and `git push` in the configured sync repository. If there are no changes to commit, it returns status `no_changes` with `push: null` and does not run `git push`.

### Arguments

- `repo_path`: optional sync Git repository path.
- `message`: optional commit message. Defaults to `sync nomadworks pai`.

## `nomadflow_run_workflow`

Starts a `workflow_runner` session for a complex task.

### Arguments

- `task_path`: path to the task markdown file
- `instructions`: detailed instructions for the workflow runner

### Notes

- Only available in `full` team mode.
- Used for `complex` implementation tasks.
- The runner executes in a separate session and reports completion back to PMA.
- The runner is expected to orchestrate the lifecycle by validating task readiness, delegating implementation and verification work to specialists, and driving the task to delivery or a hard blocker.
- For implementation tasks, the runner must create or append a Workflow Execution Plan in the task file after Pre-Task Sync and before implementation starts.
- The runner must not directly edit product source code, tests, application configuration, or implementation files.
- When a hard blocker is reached, the runner should end its run and return a final summary starting with `HARD BLOCKER:` so the plugin relays it back to the PMA session.

## `nomadflow_prompt_workflow`

Sends a follow-up prompt to an existing `workflow_runner` session.

### Arguments

- `session_id`: workflow runner session ID
- `text`: follow-up message for that session

### Notes

- Only available in `full` team mode.
- Useful for bounce-backs, clarifications, and resumed runner work.
