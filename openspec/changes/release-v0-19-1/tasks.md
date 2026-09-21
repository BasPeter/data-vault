# Release v0.19.1 tasks

## 1. Release metadata

- [x] 1.1 Confirm `main` is clean, synchronized with its remote, and has no existing `v0.19.1` tag or GitHub Release.
- [x] 1.2 Bump the application and lockfile version to `0.19.1`, then regenerate and review the tracked application changelog.

## 2. Release validation

- [x] 2.1 Complete the outstanding verification task in `add-pi-skill-provider`, including its required independent security review.
- [x] 2.2 Run the configured format, lint, unit, type, build, and supported E2E checks; surface any unavailable checks.
- [x] 2.3 Obtain independent Reviewer approval for the release candidate and confirm only intended files changed.

## 3. Publication

- [x] 3.1 Prepare the release commit and obtain explicit approval before committing it to `main`.
- [ ] 3.2 Push the approved `main` commit, create and push the exact `v0.19.1` tag, and verify tagged CI and GitHub Release assets.
