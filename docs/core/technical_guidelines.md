# Technical Guidelines & Stack

This document defines the project's tech stack and architectural patterns.

## Tech Stack
- **Language:** JavaScript (ES modules). TypeScript is available for tooling types, but package builds copy JavaScript sources without a TypeScript compile step.
- **Runtime/Framework:** Node.js package for the OpenCode plugin runtime.
- **Frontend (if applicable):** Not applicable; this repository does not ship a browser or native UI.
- **State Management:** YAML and JSON files for repository configuration, generated OpenCode configuration, task registries, SCR registries, and optional external workflow manifests.
- **Testing Framework:** Jest via `npm test`.
- **Database/Storage:** Filesystem-backed repository artifacts and optional external workflow storage; no application database is used.

## Architectural Patterns
- **Feature-First:** Organize code into distinct features or modules.
- **Repository Pattern:** Abstract data access behind repository interfaces where applicable.
- **Service Wrappers:** Wrap external APIs in generic, abstract interfaces.
- **Documentation First:** All architectural changes must be documented in `docs/` before implementation begins.

