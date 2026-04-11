# Plugin Tools

This page documents the tools provided by the NomadWorks plugin.

## `nomadworks_init`

Initializes NomadWorks in the current repository.

### Arguments

- `team_mode`: `mini` or `full`

### What it creates

- `.codenomad/nomadworks.yaml`
- `codemap.yml`
- `tasks/current.md`
- `tasks/done.md`
- `docs/scrs/current.md`
- `docs/scrs/done.md`

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

- `previous_message_count`: number of earlier **user and assistant** messages from the current session to include before live capture starts

### Notes

- Use `0` if the discussion starts now.
- Only one active discussion is allowed per session.
- Discussion transcripts are stored in `tasks/discussions/`.
- Active discussion state is persisted in `.codenomad/runtime/discussions.json`.

## `nomadworks_stop_discussion`

Stops the automatic discussion transcript for the current session.

The discussion is first marked `closing`, the current assistant reply is captured, and then the file is marked `closed`.

## `nomadflow_run_workflow`

Starts a `workflow_runner` session for a complex task.

### Arguments

- `task_path`: path to the task markdown file
- `instructions`: detailed instructions for the workflow runner

### Notes

- Only available in `full` team mode.
- Used for `complex` implementation tasks.
- The runner executes in a separate session and reports completion back to PMA.

## `nomadflow_prompt_workflow`

Sends a follow-up prompt to an existing `workflow_runner` session.

### Arguments

- `session_id`: workflow runner session ID
- `text`: follow-up message for that session

### Notes

- Only available in `full` team mode.
- Useful for bounce-backs, clarifications, and resumed runner work.
