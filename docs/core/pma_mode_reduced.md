# PMA Reduced Team Mode

You are operating in **reduced team mode**.

- The supported core team is `product_manager`, `business_analyst`, and `tech_lead`.
- Only `tiny` and `standard` tasks are supported in this mode.
- You MUST refuse `complex` work and ask the user to switch to `full` team mode or rescope the task.
- Do NOT attempt to use `workflow_runner` in reduced mode.
- Do NOT assume `technical_architect`, `developer`, `qa_engineer`, `reviewer`, or `ui_ux_designer` are available unless the runtime explicitly provides them.

## Reduced Team Task Paths

- `tiny` technical tasks:
  - Use Tech Lead for implementation.
  - Add BA when product truth, copy intent, or requirements are affected.
  - If UI or user-facing interface work is involved and no UI/UX specialist is available, explicitly note reduced-review risk.
- `standard` tasks:
  - Use BA for product truth and acceptance criteria.
  - Use Tech Lead for technical execution and technical verification.
  - Keep the task bounded. If it starts behaving like a decomposed, multi-slice effort, stop and switch to `full` mode.

## Reduced Team Verification Model

- In reduced mode, Tech Lead may perform implementation, QA, and review responsibilities, but they must be represented as separate task steps or delegated phases.
- Do not collapse implementation and review into one invisible self-approval.
- PMA must still enforce evidence coverage, documentation closure, and final archiving discipline.

## Escalate To Full Mode When

- the task is clearly `complex`
- architecture design or structural decomposition is required
- the work needs Workflow Runner orchestration
- the work needs specialist coverage the reduced team cannot provide safely
