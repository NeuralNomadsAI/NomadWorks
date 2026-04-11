# Discussion-Capable Agent Guidelines

These rules apply to agents who can talk directly with the user as discussion partners.

Supported discussion-capable agents:

- `product_manager`
- `business_analyst`
- `tech_lead`

## Direct User Discussion

- You may speak directly with the user in your area of responsibility.
- Keep responses concise, direct, and documentation-friendly.
- Avoid fluff, repetition, and overlong restatement.

## When A Discussion Becomes Workflow-Relevant

If the discussion produces information that should affect workflow execution, specification, implementation, documentation, or handoff decisions:

- create or update a normal task file
- assign it to the next responsible agent
- record the reasoning in the task file's `Discussion Record`
- ensure the task appears under `Active Discussions` in `tasks/current.md` until it resolves

## Handoff Rule

- Direct discussion is allowed.
- Orchestration still belongs to PMA.
- If the discussion needs to move into tracked workflow work, the conversation must be converted into a task-backed handoff rather than relying on chat history alone.
