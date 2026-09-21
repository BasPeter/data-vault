## Why

The `v0.19.1` tag exists, but its GitHub Actions run failed during macOS code-signing and did not create a GitHub Release. A recovery patch release is needed so users can receive the reviewed application state through the existing installer distribution channel.

## What Changes

- Bump the application and lockfile version from `0.19.1` to `0.19.2`, regenerate the tracked application changelog, and update `electron-builder` to a release containing the upstream temporary-keychain password fix.
- Validate and review the recovery candidate before publishing a new, immutable `v0.19.2` tag.
- Verify the tagged workflow produces signed and notarized macOS artifacts, Windows and Linux installers, updater metadata, and a GitHub Release.
- Retain the existing `v0.19.1` tag unchanged; do not retag, replace, or manually publish it.

## Capabilities

### New Capabilities

- `release-distribution`: Versioned installer release preparation, recovery publication, and cross-platform artifact verification through the existing GitHub Release workflow.

### Modified Capabilities

None.

## Impact

Affected files are `package.json`, `package-lock.json`, and the generated application changelog. The existing GitHub Actions release workflow and GitHub Release are affected operational systems. This change upgrades the existing development-only packaging tool; it does not change application functionality, public APIs, installer formats, or security requirements.
