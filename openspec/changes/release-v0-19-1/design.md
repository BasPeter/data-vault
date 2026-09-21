# Release v0.19.1 design

## Context

The current application version is `0.19.0`. The configured distribution path is a tag-triggered GitHub Actions workflow that builds platform installers, signs and notarizes macOS artifacts on tagged runs, and creates a GitHub Release. The npm package is private and is not a distribution channel.

## Goals / Non-Goals

**Goals:**

- Produce a traceable `v0.19.1` GitHub installer release from the reviewed `main` branch.
- Keep the version metadata, lockfile, and generated application changelog consistent.
- Prevent publication until local checks, OpenSpec verification, and required review complete.

**Non-Goals:**

- Change application functionality, dependencies, release automation, npm publishing policy, or release asset formats.

## Decisions

- Use the existing GitHub Release workflow rather than npm publishing because the application package is private and CI already packages platform installers. Alternative: make the package public and publish to npm; rejected because that changes distribution policy and is outside this patch release.
- Let `prebuild` regenerate `electron/app-changelog.generated.ts` after the version bump. Alternative: edit the generated artifact manually; rejected because the repository defines generation from Git history as the source of truth.
- Tag only the reviewed, pushed release commit as `v0.19.1`. Alternative: create the release manually; rejected because CI is responsible for signing, notarization, packaging, and asset upload.

## Risks / Trade-offs

- [A failing E2E job blocks packaging] → Run all local checks possible and inspect the tagged CI workflow before considering the release published.
- [macOS signing or notarization configuration is unavailable] → Do not claim release success until tagged CI completes and the expected macOS assets are present.
- [Generated changelog differs from expectations] → Review the generated diff and include it with the release metadata commit.
- [A tag cannot be revised safely after publication] → Confirm branch, remote state, version availability, review, and commit contents before pushing the tag.
