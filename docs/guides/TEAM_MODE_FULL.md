# Full Team Mode

Full team mode enables the complete NomadWorks Collective.

## Available Agents

- `product_manager` (PMA)
- `workflow_runner`
- `business_analyst` (BA)
- `technical_architect`
- `tech_lead`
- `developer`
- `qa_engineer`
- `reviewer`
- `ui_ux_designer`

## Supported Work

- `tiny`
- `standard`
- `complex`

## Full Team Task Flow

```text
User request
  -> PMA classifies task and track
  -> BA + Tech Lead refine or review specification
  -> For standard work, PMA orchestrates specialist handoffs directly
  -> For complex work, PMA starts Workflow Runner in a separate session
  -> Architect decomposes structural work into slices when needed
  -> Developer / QA / Reviewer / UI-UX contribute by specialty
  -> Workflow Runner or PMA returns evidence and completion state
  -> PMA checks documentation closure
  -> Commit and archive
```

## Full Team Responsibilities

- **PMA:** orchestration, routing, final closure
- **Workflow Runner:** separate-session execution for complex workflows
- **BA:** product truth and acceptance criteria
- **Technical Architect:** architecture and decomposition
- **Tech Lead:** technical leadership and behavioral verification
- **Developer / QA / Reviewer / UI-UX:** specialist execution and review
