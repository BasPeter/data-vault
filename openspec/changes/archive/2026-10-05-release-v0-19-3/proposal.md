## Why

The Mermaid vector-zoom fix is committed on `main` but is not yet available through the installer distribution channel. A `0.19.3` patch release is needed to publish that focused correction without expanding product scope.

## What Changes

- Bump application and lockfile metadata from `0.19.2` to `0.19.3` and regenerate the tracked application changelog.
- Validate and independently review the release candidate before publishing the immutable `v0.19.3` tag.
- Publish through the existing tag-triggered GitHub Actions workflow and verify the cross-platform GitHub Release assets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-distribution`: Advance the version-specific release metadata, verification gate, and publication contract from the completed `0.19.2` recovery release to the `0.19.3` patch release.

## Impact

Affected repository files are `package.json`, `package-lock.json`, the generated application changelog, and OpenSpec release artifacts. Operational impact is limited to pushing `main` and the `v0.19.3` tag to the existing GitHub Actions/GitHub Release pipeline; no application API, dependency, installer-format, or security-mode changes are introduced.
