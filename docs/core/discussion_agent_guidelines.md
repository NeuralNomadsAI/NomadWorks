# Discussion-Capable Agent Guidelines

These rules apply to agents who can talk directly with the user as discussion partners.

Supported discussion-capable agents:

- `product_manager`
- `business_analyst`
- `tech_lead`

Discussion transcript tools:

- `nomadworks_start_discussion(title, previous_message_count)`
- `nomadworks_stop_discussion()`

## Direct User Discussion

- You may speak directly with the user in your area of responsibility.
- Keep responses concise, direct, and documentation-friendly.
- Avoid fluff, repetition, and overlong restatement.
- When starting a tracked discussion, use `previous_message_count` as a number.
- `previous_message_count` means the number of earlier user and assistant messages from the current session that should be included in the discussion before live capture starts.
- Use `0` when no earlier discussion messages need to be included.

## When A Discussion Becomes Workflow-Relevant

If the discussion produces information that should affect workflow execution, specification, implementation, documentation, or handoff decisions:

- create or update a normal task file
- assign it to the next responsible agent
- record the reasoning in the task file's `Discussion Record`
- ensure the task appears under `Active Discussions` in `tasks/current.md` until it resolves

Start a discussion when the user begins discussing new work, feature changes, implementation direction, requirements, or decisions that may need to be preserved for a later task or SCR.

### Start A Discussion Examples

- `product_manager`: "I want to add a new billing retry feature."
- `business_analyst`: "Help me define the acceptance criteria for this feature."
- `tech_lead`: "What is the best technical approach for implementing this new workflow?"
- Any discussion-capable agent: "We need to decide between these two options before we move forward."

### Do Not Start A Discussion Examples

- "What does PMA mean?"
- "Where is `nomadworks.yaml`?"
- "What does this command do?"
- "Can you explain this error message?"

## Handoff Rule

- Direct discussion is allowed.
- Orchestration still belongs to PMA.
- If the discussion needs to move into tracked workflow work, the conversation must be converted into a task-backed handoff rather than relying on chat history alone.
