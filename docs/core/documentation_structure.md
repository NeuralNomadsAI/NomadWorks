# Documentation Structure

This document defines where documentation belongs in a NomadWorks repository and how agents should distinguish between product, domain, feature, architecture, and change-tracking documents.

## Goals

- Keep documentation easy for agents to locate and update.
- Prevent the `docs/` tree from becoming a mixed dump of unrelated notes.
- Separate steady-state truth from change proposals and implementation work.

## Documentation Hierarchy

Use this hierarchy from broadest to most specific:

1. `docs/product/`: Whole-product truth.
2. `docs/domains/`: Stable product-area truth.
3. `docs/features/`: Specific capability truth.
4. `docs/architecture/`: Technical design and system patterns.
5. `docs/scrs/`: Proposed and approved changes.
6. `docs/core/`: Workflow rules, operational guidance, and agent instructions.
7. `docs/setup/` and `docs/guides/`: Operator-facing setup and usage documentation.

## Product vs Domain vs Feature

### Product

Product documentation explains the application as a whole.

Use product docs for:

- product purpose and target audience
- top-level feature inventory
- major product areas
- cross-product language and positioning

### Domain

A domain is a stable product area or business capability boundary that can contain multiple features.

Use domain docs for:

- shared concepts and terminology
- cross-feature workflows
- business rules and invariants
- entities and relationships used by multiple features
- boundaries between one product area and another

Examples of domain-style areas in NomadWorks include task lifecycle, agent orchestration, and documentation management.

### Feature

A feature is a specific user or system capability that belongs to one primary domain.

Use feature docs for:

- exact behavior of one capability
- acceptance criteria
- edge cases and expected outcomes
- user-facing or system-facing flows specific to that capability
- dependencies on other features or domains

## Directory Rules

### `docs/product/`

This directory holds product-wide truth only.

Expected files:

- `PRODUCT_OVERVIEW.md`
- `FEATURES_LIST.md`
- `DOMAIN_MAP.md`

Do not place detailed feature specifications here.

### `docs/domains/<domain>/`

This directory holds truth for one domain.

Recommended files:

- `OVERVIEW.md`
- `RULES.md`
- `WORKFLOWS.md`
- `ENTITIES.md`

At minimum, each domain should have an `OVERVIEW.md`.

### `docs/features/<feature>/`

This directory holds truth for one feature.

Required file:

- `SPECIFICATION.md`

Optional files:

- `UX_NOTES.md`
- `TECH_NOTES.md`

Every feature should point to one primary domain, even if it touches others.

### `docs/architecture/`

This directory holds technical design, patterns, contracts, and cross-cutting engineering decisions.

Do not use it for product behavior specifications unless the content is primarily technical.

### `docs/scrs/`

This directory holds change proposals and approval history.

SCRs are not the steady-state source of truth. Once a change is implemented, the steady-state docs in `docs/product/`, `docs/domains/`, `docs/features/`, and `docs/architecture/` must reflect the final result.

## Ownership

- **Business Analyst:** Product docs, domain docs, and feature docs from the product perspective.
- **Technical Architect:** Architecture docs and technical sections of feature/domain docs.
- **Product Manager:** Ensures the correct documents are updated during workflow execution.
- **Developer / Tech Lead / QA:** Contribute technical accuracy when implementation changes the documented truth.

## Creation Rules

Create or update a domain doc when:

- the change affects shared business rules across multiple features
- a new stable product area is introduced
- terminology, concepts, or workflows span more than one feature

Create or update a feature doc when:

- the change affects one concrete capability
- acceptance criteria or user/system behavior need to be recorded
- the feature belongs primarily to one domain and needs a dedicated specification

## Anti-Patterns

Avoid these mistakes:

- putting feature-level acceptance criteria into `PRODUCT_OVERVIEW.md`
- turning domain docs into architecture docs
- using SCRs as the only record of steady-state product behavior
- creating feature docs without assigning them to a primary domain
- storing random implementation notes directly under `docs/` with no folder classification

## Navigation Rule

When locating documentation:

1. Check `docs/product/` for product-wide truth.
2. Check `docs/domains/` for the relevant product area.
3. Check `docs/features/` for the exact capability.
4. Check `docs/architecture/` for technical design.
5. Check `docs/scrs/` for proposed or recently approved change history.
