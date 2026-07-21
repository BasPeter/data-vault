## Why

The v0.16.0 release workflow fails on Ubuntu before packaging because the
dashboard end-to-end tests depend on host content dimensions and OS-backed
secret encryption that are not provisioned deterministically in CI. The
application's refusal to persist secrets without OS-keychain encryption must
remain intact.

## What Changes

- Make the disposable dashboard runtime fixture use an explicit content size
  before asserting the bounded dashboard view dimensions.
- Provision a real Linux Secret Service/keyring for the GitHub Actions E2E
  command so secret-storage tests run against OS-backed encryption.
- Keep the production fallback behavior unchanged: unavailable encryption
  continues to refuse secret persistence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `security`: CI verification of dashboard secrets must use OS-keychain-backed
  encryption rather than an insecure fallback.

## Impact

Affected files are the GitHub Actions release workflow and dashboard E2E test
fixtures. No application APIs, persisted data, or production secret-storage
behavior changes.
