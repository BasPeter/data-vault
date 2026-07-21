## ADDED Requirements

### Requirement: Linux secret-persistence E2E uses OS-backed encryption

The Linux CI E2E environment SHALL create an ephemeral GNOME Secret Service keyring in its D-Bus session, provision the libsecret backend, and launch the E2E Electron process with `gnome-libsecret`. It SHALL fail setup before secret-persistence scenarios if Electron safe storage is unavailable and SHALL NOT select or fall back to Electron's `basic` password store.

#### Scenario: Linux E2E runs secret-persistence tests

- **WHEN** Linux CI starts the E2E suite that persists dashboard secrets
- **THEN** the test Electron process has OS-backed encryption available through the ephemeral Secret Service keyring and the persistence scenarios can exercise encrypted storage

#### Scenario: Keyring setup is unavailable

- **WHEN** the Linux E2E environment cannot provide OS-backed encryption
- **THEN** setup fails with a diagnostic before a dashboard secret is persisted and does not enable plaintext storage
