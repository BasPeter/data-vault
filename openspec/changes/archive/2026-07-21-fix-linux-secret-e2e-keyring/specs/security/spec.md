## MODIFIED Requirements

### Requirement: Secret storage refuses insecure persistence

Secret values SHALL be stored only encrypted with OS-keychain-backed encryption in an application-private file with owner-only permissions, and the application SHALL refuse to persist secret values when that encryption is unavailable rather than falling back to plaintext. CI test setup that exercises persisted secrets SHALL use an ephemeral OS-backed encryption backend and SHALL NOT select or permit Electron's plaintext `basic` password store.

Because a test harness MAY override process configuration at runtime, CI SHALL verify the encryption backend the test process actually selected, rather than relying on the backend it was asked to select. Asserting on launch arguments alone is insufficient.

#### Scenario: Encryption is unavailable at save time

- **WHEN** OS-keychain-backed encryption is unavailable and the user attempts to save a secret
- **THEN** the application declines the save, explains that secrets are unavailable on this system, and writes nothing

#### Scenario: Linux end-to-end secret verification runs

- **WHEN** Linux CI runs dashboard end-to-end tests that persist a secret
- **THEN** it starts a real Secret Service/keyring for the test process
- **AND** it does not configure a plaintext or basic password-store fallback

#### Scenario: Linux CI exercises persisted secrets

- **WHEN** Linux CI runs a scenario that persists a dashboard secret
- **THEN** its test environment provides an ephemeral OS-backed encryption backend and does not enable plaintext secret storage
- **AND** the test asserts the backend the running process actually selected, so a harness that silently substitutes a plaintext store fails the run instead of passing
