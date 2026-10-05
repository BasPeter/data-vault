## 1. Release preparation

- [x] 1.1 Fetch remote state and confirm `main`, `v0.19.2`, and the absence of any local or remote `v0.19.3` tag or GitHub Release.
- [x] 1.2 Update `package.json` and `package-lock.json` to `0.19.3`, regenerate the tracked application changelog, and review the metadata diff.

## 2. Release validation

- [x] 2.1 Run format check, lint, unit tests, typecheck, build, and end-to-end tests; surface all warnings or unavailable checks.
- [x] 2.2 Strictly validate the OpenSpec change and obtain independent Verifier and Reviewer approval for the full release candidate.
- [x] 2.3 Confirm only intended files changed, prepare the one-line release commit message, and obtain explicit approval before committing.

## 3. Publication

- [ ] 3.1 Push the approved release commit to `main`, create the exact `v0.19.3` tag on that commit, and push the tag without altering existing tags.
- [ ] 3.2 Monitor the tag-triggered workflow to completion and verify the GitHub Release includes expected Windows, Linux, macOS, and updater assets with macOS signing/notarization evidence.

## 4. Finalization

- [ ] 4.1 Sync the completed release delta into the main release-distribution spec and archive the OpenSpec change.
- [ ] 4.2 Commit and push the archived release record after explicit commit-message approval, leaving `main` clean and synchronized.
