# Releasing

NomadWorks publishes to npm as `@neuralnomads/nomadworks`.

## Release Model

- Versioning, build verification, and npm publishing are handled by the GitHub Actions workflow `Release npm package`.
- Pushes to `dev` automatically publish npm prereleases.
- Pushes to `main` automatically publish stable npm releases.
- The workflow does not commit or tag version changes back to the repository. It derives the publish version from `package.json` and npm's already-published versions.

## Required Repository Secret

Add this repository secret before publishing:

- `NPM_TOKEN`: npm access token with permission to publish `@neuralnomads/nomadworks`

## Workflow Behavior

The release workflow performs these steps:

1. Triggers automatically on pushes to `dev` and `main`.
2. Installs dependencies with `npm ci`.
3. Runs `npm run release:check`, which executes tests, builds `dist/`, and previews the publish tarball.
4. Resolves the publish version based on the current branch and npm registry history.
5. Applies that version locally with `npm version --no-git-tag-version`.
6. Publishes the package with `npm publish --provenance`.

## Branch Behavior

### `dev`

- Publishes prereleases using the `rc` dist-tag.
- Reads the stable base version from `package.json`.
- Looks up already published versions on npm.
- Publishes the next version in the sequence: `<package.json version>-rc.N`

Example:

- `package.json`: `1.4.0`
- published prereleases: `1.4.0-rc.0`, `1.4.0-rc.1`
- next `dev` publish: `1.4.0-rc.2`

### `main`

- Publishes stable releases using the default `latest` dist-tag.
- Publishes the exact stable version in `package.json`.
- Skips publishing if that version already exists on npm.

Example:

- `package.json`: `1.4.0`
- push to `main`
- publish: `1.4.0`

## Versioning Expectations

- Keep `package.json` on a stable semver base such as `1.4.0`.
- Do not commit prerelease versions like `1.4.0-rc.2` into `package.json`.
- Use `dev` to publish release candidates for the current base version.
- When the package is ready, merge the versioned changes to `main` to publish the stable release.

## Local Verification

Before triggering a release, you can run the same verification locally:

```bash
npm run release:check
```

This command:

- runs the test suite
- builds `dist/`
- runs `npm pack --dry-run` to preview the package contents

## Notes

- `prepack` runs `npm run build`, so local `npm pack` and `npm publish` always include a fresh `dist/` build.
- `publishConfig.access` is set to `public` so the scoped package can publish correctly on npm.
- The prerelease counter is remembered via npm registry history, not via git tags or committed prerelease versions.
- If you need to dry-run a release locally without publishing, use `npm run release:check` and inspect the tarball preview output.
