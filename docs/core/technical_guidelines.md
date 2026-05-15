# Technical Guidelines & Stack

This document defines the project's tech stack and architectural patterns.

## Tech Stack
- **Language:** JavaScript (ES modules).
- **Runtime/Framework:** Node.js package exposing an OpenCode plugin via `@opencode-ai/plugin`.
- **Frontend (if applicable):** Not applicable; this package provides CLI/plugin workflow tooling.
- **State Management:** Repository-local YAML/Markdown files plus `.nomadworks/runtime/` for generated session state.
- **Testing Framework:** Jest, run through `npm test`.
- **Database/Storage:** Filesystem-based configuration, generated artifacts, task records, and documentation.

## Architectural Patterns
- **Feature-First:** Organize code into distinct features or modules.
- **Repository Pattern:** Abstract data access behind repository interfaces where applicable.
- **Service Wrappers:** Wrap external APIs in generic, abstract interfaces.
- **Documentation First:** All architectural changes must be documented in `docs/` before implementation begins.

