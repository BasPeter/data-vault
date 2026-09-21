# Release v0.19.1

## Why

Data Vault needs a patch release that distributes the current reviewed application state to users through the repository's configured GitHub Release workflow.

## What Changes

- Bump the application version from `0.19.0` to `0.19.1` in package metadata and the lockfile.
- Regenerate the tracked application changelog from repository history.
- Validate the release candidate and publish the `v0.19.1` tag so CI produces and uploads signed/notarized installers and updater metadata to a GitHub Release.

## Capabilities

### New Capabilities

- `release-distribution`: Versioned installer release preparation and publication through the existing GitHub Release workflow.

### Modified Capabilities

None.

## Impact

Affected files are `package.json`, `package-lock.json`, and the generated application changelog. Distribution is performed by the existing GitHub Actions release workflow; no application behavior, public API, dependencies, or security requirements change.
