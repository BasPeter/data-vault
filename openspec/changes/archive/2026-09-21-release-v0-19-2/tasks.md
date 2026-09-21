## 1. Recovery release metadata

- [x] 1.1 Confirm `main` is synchronized with its remote, `v0.19.1` remains present, and no `v0.19.2` tag or GitHub Release exists.
- [x] 1.2 Update the application and lockfile versions to `0.19.2`, resolve `electron-builder` to `26.16.1`, regenerate the tracked application changelog, and review the resulting metadata diff.

## 2. Recovery validation

- [x] 2.1 Run the configured format, lint, unit, type, build, and supported E2E checks; surface any unavailable checks or pre-existing warnings.
- [x] 2.2 Validate the OpenSpec change and obtain independent Reviewer approval for the release candidate, including confirmation that the dependency update is limited to the upstream temporary-keychain fix.
- [x] 2.3 Confirm only intended files changed and prepare the release commit; obtain explicit approval before committing to `main`.

## 3. Recovery publication

- [x] 3.1 Push the approved `main` commit, create and push the exact `v0.19.2` tag, and leave the existing `v0.19.1` tag unchanged.
- [x] 3.2 Verify the automatically triggered `v0.19.2` workflow completed successfully with signed and notarized macOS artifacts, Windows and Linux installers, updater metadata, and the GitHub Release assets.
