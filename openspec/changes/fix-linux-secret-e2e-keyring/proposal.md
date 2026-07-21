## Why

The v0.17.0 Linux release E2E job lacks a usable Secret Service keyring, so tests that intentionally persist test secrets fail even though the application correctly refuses insecure storage. CI must provision a real OS-backed test keyring without weakening production secret handling.

## What Changes

- Initialize a fresh GNOME Secret Service keyring and libsecret backend for Linux E2E runs.
- Force only the test Electron process to use `gnome-libsecret`, never Electron's insecure `basic` password store.
- Add an E2E setup assertion that encryption is available before secret-persistence scenarios run.
- Preserve the product behavior of refusing to persist secrets when OS-backed encryption is unavailable.

## Capabilities

### New Capabilities

- `linux-e2e-secret-storage`: Provides a reproducible OS-backed Secret Service environment for Linux secret-persistence E2E tests.

### Modified Capabilities

- `security`: Define that CI test setup for persisted secrets must use an OS-backed encryption backend and must not enable a plaintext fallback.

## Impact

Changes affect the Linux CI release test environment and test Electron launch configuration, with targeted E2E setup coverage. No production secret-storage fallback, API, or persisted data format changes.
