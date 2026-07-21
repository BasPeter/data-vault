## MODIFIED Requirements

### Requirement: Secret storage refuses insecure persistence

Secret values SHALL be stored only encrypted with OS-keychain-backed encryption in an application-private file with owner-only permissions, and the application SHALL refuse to persist secret values when that encryption is unavailable rather than falling back to plaintext. CI test setup that exercises persisted secrets SHALL use an ephemeral OS-backed encryption backend and SHALL NOT select or permit Electron's plaintext `basic` password store.

#### Scenario: Encryption is unavailable at save time

- **WHEN** OS-keychain-backed encryption is unavailable and the user attempts to save a secret
- **THEN** the application declines the save, explains that secrets are unavailable on this system, and writes nothing

#### Scenario: Linux CI exercises persisted secrets

- **WHEN** Linux CI runs a scenario that persists a dashboard secret
- **THEN** its test environment provides an ephemeral OS-backed encryption backend and does not enable plaintext secret storage
