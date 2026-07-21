## Context

`package` depended on `[test, e2e]` and `release` depends on `package`. The end-to-end suite runs only on `ubuntu-latest`, so any Linux test-environment defect skipped packaging and publishing for all three platforms. A CI keyring defect did exactly that for four days and three tagged versions.

## Goals / Non-Goals

**Goals:** stop a single-platform test environment from withholding installers for every platform; keep the failure signal visible; record the relaxed gate as temporary with an explicit exit condition.

**Non-Goals:** changing what the E2E suite tests, deleting or skipping tests, weakening any security requirement, or making this the permanent release standard.

## Decisions

Depend `package` on `test` only. Keep `e2e` running unconditionally so the workflow is still marked failed.

Rejected `continue-on-error: true` on the `e2e` job: it would unblock packaging while also turning the workflow green, discarding the very signal that makes the residual risk tolerable. Failing loudly but not blocking is the point.

Deferred, and the better end state: split the suite into keyring-dependent and platform-independent Playwright projects and gate `package` on the latter. That preserves a real release gate while removing the Linux coupling. It is deferred because it is a larger change and cannot be validated while the Linux keyring environment is still broken — building a gate on an environment that does not yet work would repeat the mistake this change is responding to.

## Risks / Trade-offs

- [A release can now ship with failing end-to-end tests] → Accepted deliberately and temporarily. `e2e` still fails the workflow, and the exit condition is recorded in the workflow and in `tasks.md`. The nine platform-independent tests are the real loss here, not the five keyring ones.
- [The relaxed gate becomes permanent by neglect] → The workflow comment names the restoring condition and points at this change; `tasks.md` carries the restore task.
- [A tagged push silently fails to publish again] → Not addressed by this change. Tracked as follow-up 3.3, and the reason the outage lasted four days rather than one run.

## Migration Plan

Reverting is a one-line change back to `needs: [test, e2e]`. Kept in its own commit so it reverts independently of the keyring work.

## Open Questions

Whether the follow-up project split should gate `package` or only `release`. Decide when the keyring is green and the suite can actually be exercised.
