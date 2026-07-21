## Why

The `package` job depended on `e2e`, and `release` depends on `package`. The end-to-end suite runs on Linux only, so a Linux-specific CI keyring failure skipped packaging and publishing for every platform.

The result was a silent four-day release outage. v0.16.0, v0.17.0, and v0.17.1 were all tagged and pushed, and none of them published installers. The last release with artifacts is v0.15.1. Because the tags exist and `main` was green in every other respect, the outage was not visible from the repository state — it was only visible in workflow run history.

A Linux test-environment defect should not be able to withhold macOS and Windows installers.

## What Changes

- `package` depends on `test` only, so installers build and publish independently of the Linux end-to-end suite.
- `e2e` continues to run on every push and pull request and still marks the workflow failed, preserving the signal.
- The workflow records that this is temporary and states its exit condition.

## Capabilities

### New Capabilities

- `release-pipeline`: Defines what gates a published release and what merely reports.

## Impact

Release integrity is deliberately reduced. Under the previous configuration a published release implied the full end-to-end suite had passed; it no longer does. Only lint, unit tests, and build gate a release.

This is accepted as a temporary trade against a total release outage, not as a permanent standard. It is reverted once `fix-linux-secret-e2e-keyring` is confirmed green on CI.

## Trade-off Considered

Splitting the suite into keyring-dependent and platform-independent Playwright projects, and gating `package` on the latter, would unblock non-Linux installers while keeping the nine behavioural tests as a release gate. That is the better end state and is deliberately deferred: it is a larger change, and it cannot be validated while the Linux keyring environment is still broken. Tracked as follow-up in `tasks.md`.
