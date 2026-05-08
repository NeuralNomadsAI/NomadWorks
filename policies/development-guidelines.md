# Development Guidelines

These defaults are intended to be customized per repository when needed.

## Stack Notes

- Language: define in the repository if needed.
- Runtime / Framework: define in the repository if needed.
- Frontend stack: define in the repository if needed.
- Testing stack: define in the repository if needed.
- Database / storage: define in the repository if needed.

## Default Engineering Conventions

- Prefer clear module or feature boundaries over ad-hoc file placement.
- Keep external integrations behind stable interfaces or wrappers when practical.
- Update `.gitignore` when repository changes introduce generated, temporary, or sensitive files.
- Prefer stable dependency versions unless repository compatibility requires otherwise.
- Use dependency-provided setup or initialization utilities when they are the standard way to integrate the dependency safely.
- Document meaningful architecture changes in the repository's documentation before or alongside implementation.
- Keep code changes aligned with existing repository conventions unless the repository policy explicitly changes them.
