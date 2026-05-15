# Technical Guidelines & Stack

This document defines the project's tech stack and architectural patterns.

## Tech Stack
- **Language:** JavaScript ES modules, with TypeScript types available for Node compatibility checks.
- **Runtime/Framework:** Node.js OpenCode plugin package using `@opencode-ai/plugin`.
- **Frontend (if applicable):** Not applicable; NomadWorks is a CLI/plugin and documentation package.
- **State Management:** File-backed repository configuration, workflow artifacts, and optional Git-managed PAI roots.
- **Testing Framework:** Jest via `node --experimental-vm-modules`.
- **Database/Storage:** Local filesystem plus Git repositories for durable project and PAI state.

## Architectural Patterns
- **Feature-First:** Organize code into distinct features or modules.
- **Repository Pattern:** Abstract data access behind repository interfaces where applicable.
- **Service Wrappers:** Wrap external APIs in generic, abstract interfaces.
- **Documentation First:** All architectural changes must be documented in `docs/` before implementation begins.

