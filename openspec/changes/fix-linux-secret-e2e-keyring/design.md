## Context

Secret persistence deliberately requires Electron `safeStorage` with OS-keychain-backed encryption. Headless Linux release CI did not establish a usable GNOME Secret Service login keyring, causing the secret tests to fail with the correct encryption-unavailable error.

## Goals / Non-Goals

**Goals:** establish an ephemeral CI keyring, select `gnome-libsecret` for E2E Electron, and fail setup clearly if encryption remains unavailable.

**Non-Goals:** changing production secret storage, accepting Electron `basic`, logging a keyring password or secret value, or weakening encryption requirements.

## Decisions

Use `gnome-keyring-daemon --login` followed by its secrets component inside a D-Bus session, provision libsecret, and run E2E in that session. Add the Electron password-store switch only in the E2E launcher. Test setup will assert safe storage availability before persisting a secret.

**Alternative considered:** use Electron `basic`. Rejected because it permits plaintext persistence and violates the secret-storage security invariant.

## Risks / Trade-offs

- [Headless desktop integration differs by runner] → Explicitly set the libsecret backend and assert availability before test scenarios.
- [Credentials leak in CI] → Use a fixed ephemeral keyring password only via stdin and never log it; do not use application secret values.
- [CI setup regresses] → Keep keyring setup isolated to Linux E2E and fail before tests with a diagnostic.

## Migration Plan

The change affects only CI/test launch. Rollback removes the test environment setup; production behavior and stored secrets are unchanged.

## Open Questions

None.
