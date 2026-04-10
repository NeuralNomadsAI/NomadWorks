# Reduced Team Mode

Reduced team mode is the lightest supported NomadWorks operating model.

## Available Agents

- `product_manager` (PMA)
- `business_analyst` (BA)
- `tech_lead`

## Supported Work

- `tiny`
- `standard`

Not supported:

- `complex`
- `workflow_runner`

## Reduced Team Task Flow

```text
User request
  -> PMA classifies task
  -> BA clarifies requirements and product truth when needed
  -> Tech Lead executes technical work
  -> Tech Lead performs verification and review as separate task phases
  -> PMA checks evidence and documentation closure
  -> Commit and archive
```

## Reduced Team Responsibilities

- **PMA:** orchestration, routing, closure, documentation closure verification
- **BA:** requirements, acceptance criteria, product documentation
- **Tech Lead:** implementation, technical verification, review, technical documentation

## Escalation Rule

If the task clearly needs architecture decomposition, Workflow Runner orchestration, or broader specialist support, PMA should stop and ask to switch the repository to `full` team mode or rescope the work.
