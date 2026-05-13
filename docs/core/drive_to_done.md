# Drive-To-Done

Drive-To-Done is an explicit NomadWorks execution discipline. It does not replace PMA, Workflow Runner, task files, SCRs, or evidence requirements.

## Terminal States

When Drive-To-Done is active, PMA or Workflow Runner continues the current task lifecycle until exactly one terminal state is reached:

- `DONE`: Definition of Done is satisfied, evidence is recorded, required docs/registries are updated, and closure authority has approved the result.
- `HARD BLOCKER`: a specific missing input, failed dependency, rejected verification result, or unresolved contradiction prevents further safe progress.
- `CYCLE LIMIT`: the configured continuation limit is reached before `DONE` or `HARD BLOCKER`.

## Operating Rules

- Use the existing task file, acceptance criteria, verification map, and Definition of Done as the source of truth.
- Do not broaden scope to achieve completion. If scope must change, return to PMA/user for approval.
- After each continuation cycle, identify the next concrete unfinished closure requirement.
- If an implementation or verification handoff fails, bounce back to the responsible specialist with the same task context when possible.
- If progress cannot continue safely, stop with `HARD BLOCKER:` and name the exact missing input or failed condition.

## Cycle Limit

The default continuation limit is `drive_to_done.max_cycles` from `.nomadworks/nomadworks.yaml`. If absent, use `5`.

When the limit is reached, report:

- completed cycles
- remaining Definition of Done gaps
- recommended owner for the next action
- whether the task should be resumed with the same Task tool `task_id` or Workflow Runner `session_id`
