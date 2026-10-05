## Context

`main` contains the reviewed Mermaid vector-zoom fix one commit beyond `origin/main`. Package metadata and the latest tag remain at `0.19.2`. The existing workflow builds on `main` pushes and publishes installers plus updater metadata when a `v*` tag is pushed.

## Goals / Non-Goals

**Goals:**

- Prepare a consistent, reviewable `0.19.3` patch-release commit.
- Publish the exact reviewed commit through the existing immutable `v0.19.3` tag.
- Verify the tag-triggered workflow and cross-platform GitHub Release assets.

**Non-Goals:**

- Change application behavior beyond the already committed Mermaid fix.
- Change dependencies, signing configuration, workflow structure, installer formats, or historical tags.
- Publish to npm.

## Decisions

- Treat the Mermaid correction as a patch release and increment `0.19.2` to `0.19.3` in `package.json` and `package-lock.json`.
- Regenerate `electron/app-changelog.generated.ts` with the repository script after the version bump so it records the commits since `v0.19.2`.
- Run the full configured quality gate and independent review before creating the release commit or tag.
- Push `main` before creating and pushing the exact `v0.19.3` tag. The tag remains the sole publication trigger; release success is determined from the resulting GitHub Actions run and GitHub Release assets.

## Risks / Trade-offs

- [A remote `v0.19.3` tag or release may already exist] → Fetch and query the remote immediately before publication; stop rather than overwrite anything.
- [Hosted signing or packaging can fail after local validation] → Monitor every platform job and require the expected GitHub Release assets before declaring success.
- [Generated changelog metadata can drift] → Review its diff alongside package versions and regenerate only through the repository script.
- [A tag is externally visible and effectively immutable] → Require explicit approval of the prepared release commit and confirm its hash before tagging.
