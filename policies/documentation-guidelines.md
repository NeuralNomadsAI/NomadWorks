# Documentation Guidelines

## Documentation Goals

- Keep documentation easy to locate and update.
- Separate steady-state truth from change proposals and workflow records.
- Update documentation in the same change set as the implementation whenever the documented truth changes.

## Default Documentation Layout

- `docs/product/`: whole-product truth and top-level feature inventory
- `docs/domains/`: stable product-area truth shared by multiple features
- `docs/features/`: one concrete capability or feature specification
- `docs/architecture/`: technical design, contracts, and cross-cutting decisions
- `docs/scrs/`: proposed and approved changes, not steady-state truth

## Update Expectations

Update the relevant documentation when work changes:

- product behavior, terminology, or feature inventory
- architecture, interfaces, or technical invariants
- feature specifications or acceptance criteria
- documentation ownership, naming, or structure conventions

## Default Ownership

- Business Analyst: product, domain, and feature truth from the product perspective
- Technical Architect: architecture truth and technical design documentation
- Product Manager: verifies documentation closure during workflow execution
- Developer / Tech Lead / QA: contribute technical accuracy when implementation changes documented truth

## Default Repository Matrix

- Product overview: `docs/product/PRODUCT_OVERVIEW.md`
- Features list: `docs/product/FEATURES_LIST.md`
- Architecture: `docs/architecture/TECHNICAL_ARCHITECTURE.md`
- Feature specification: `docs/features/<feature>/SPECIFICATION.md`
- CodeMap updates: relevant `codemap.yml` files for changed code areas
