## Context

Secret persistence deliberately requires Electron `safeStorage` with OS-keychain-backed encryption. Headless Linux release CI did not establish a usable GNOME Secret Service login keyring, causing the secret tests to fail with the correct encryption-unavailable error.

## Goals / Non-Goals

**Goals:** establish an ephemeral CI keyring, select `gnome-libsecret` for E2E Electron, and fail setup clearly if encryption remains unavailable.

**Non-Goals:** changing production secret storage, accepting Electron `basic`, logging a keyring password or secret value, or weakening encryption requirements.

## Decisions

Provision libsecret and run E2E inside a D-Bus session. Add the Electron password-store switch only in the E2E launcher. Test setup asserts safe storage availability before persisting a secret.

Establish the keyring with a single `gnome-keyring-daemon --daemonize --unlock --components=secrets` invocation, then prove the Secret Service works with a `secret-tool` store/lookup/clear probe of the default collection before Playwright starts.

**Superseded approach:** `gnome-keyring-daemon --login` followed by `--start --components=secrets`, consumed via `eval "$(...)"`. This shipped twice and failed twice on CI, and neither failure could be diagnosed. Two independent mechanisms hid it:

- `gkd_main_complete_initialization` discards the return values of its startup and initialize steps, so gnome-keyring exits 0 even when the login keyring was never created, `org.freedesktop.secrets` was never owned, or no default collection exists.
- A non-zero exit inside `eval "$(cmd)"` does not trip `bash -e`, so the step could not fail on keyring setup failure.

Chromium compounds this from the other side: `KeyStorageLibsecret::Init()` returns true if `libsecret-1.so.0` merely loads, without ever contacting the Secret Service. A backend is therefore "selected" even when no daemon is running, and the failure only surfaces much later as `isEncryptionAvailable() === false`.

The probe is the load-bearing part of this decision. `secret-tool` with no `--collection` resolves `SECRET_COLLECTION_DEFAULT` and issues the same D-Bus sequence Chromium's `AddRandomPasswordInLibsecret()` does — `ReadAlias("default")` then `CreateItem` — so it covers all three hidden failure modes at their source. The goal is not to make gnome-keyring honest but to verify its outcome from outside.

**Alternative considered:** use Electron `basic`. Rejected because it permits plaintext persistence and violates the secret-storage security invariant.

## Risks / Trade-offs

- [Headless desktop integration differs by runner] → Explicitly set the libsecret backend and assert availability before test scenarios.
- [Credentials leak in CI] → Use a fixed ephemeral keyring password only via stdin and never log it; do not use application secret values.
- [CI setup regresses] → Keep keyring setup isolated to Linux E2E and fail before tests with a diagnostic.
- [Probe hangs instead of failing] → If the default collection is locked with no prompter available, or D-Bus auto-activates a fresh daemon with no unlocked keyring, the store call blocks on a prompt that never resolves. That would recreate the opaque failure this change exists to remove, so the probe is wrapped in `timeout` and the job is bounded by `timeout-minutes`.

## Migration Plan

The change affects only CI/test launch. Rollback removes the test environment setup; production behavior and stored secrets are unchanged.

## Open Questions

None.
