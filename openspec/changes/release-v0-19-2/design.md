## Context

The `v0.19.1` release commit and tag are already published. Its tag-triggered GitHub Actions workflow completed Windows and Linux packaging but failed macOS signing while importing the certificate into electron-builder's temporary keychain; GitHub therefore did not create a Release. The current resolved `electron-builder` version is `26.15.3`; upstream electron-builder PR #10172 fixes the temporary-keychain password handling in `26.16.1`.

The existing release workflow is the authoritative distribution path. The current token cannot rerun the historical failed `v0.19.1` GitHub Actions job with the required administration permission; that limitation does not affect a new `v0.19.2` tag-triggered workflow.

## Goals / Non-Goals

**Goals:**

- Produce a traceable `v0.19.2` release commit that contains the packaging fix and consistent release metadata.
- Preserve `v0.19.1` as an immutable record of the failed release attempt.
- Publish only through the existing tag-triggered CI workflow, then verify all expected platform artifacts and the GitHub Release.

**Non-Goals:**

- Change application behavior, release workflow configuration, signing credentials, certificate provisioning, artifact formats, or npm publication policy.
- Retag, replace, delete, or manually create a GitHub Release for `v0.19.1`.

## Decisions

- Update the resolved `electron-builder` dependency to `26.16.1`, which contains upstream PR #10172, and commit its lockfile resolution. This is the smallest targeted remedy for the temporary-keychain password regression. Changing signing secrets or certificates is excluded because the same credentials succeeded for the preceding release and the failing integration is fixed upstream.
- Generate `electron/app-changelog.generated.ts` through the existing prebuild generator after changing the release version. The generator remains the source of truth for the tracked application changelog.
- Create a distinct `v0.19.2` tag from the reviewed release commit. Existing tags are immutable release evidence; moving `v0.19.1` would make the failed run and its source commit ambiguous.
- Require all configured local checks, OpenSpec verification, and an independent review before commit and tag publication. The macOS result can only be proven from tagged CI, where signing and notarization run with repository secrets.
- Push the new `v0.19.2` tag after approval so the existing tag trigger starts a new workflow automatically. Verify the completed job and GitHub Release before considering distribution successful.

## Risks / Trade-offs

- [The upstream patch may not resolve the hosted macOS runner interaction] → Verify signed and notarized macOS artifacts from the `v0.19.2` tagged workflow before release acceptance.
- [The historical `v0.19.1` workflow cannot be rerun with the current token] → Preserve it as failed-release evidence and use the new `v0.19.2` tag-triggered workflow for recovery publication.
- [The generated changelog can differ from expected history] → Review the generated diff with the version and lockfile changes before committing.
- [Release tags are externally visible and cannot safely be repointed] → Confirm `main`, remote state, version availability, review outcome, and commit contents before pushing only the new `v0.19.2` tag.
