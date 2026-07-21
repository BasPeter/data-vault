## MODIFIED Requirements

### Requirement: Secret storage refuses insecure persistence

Secret values SHALL be stored only encrypted with OS-keychain-backed encryption in an application-private file with owner-only permissions, and the application SHALL refuse to persist secret values when that encryption is unavailable rather than falling back to plaintext. End-to-end CI that verifies dashboard secret persistence SHALL provision OS-keychain-backed encryption and SHALL NOT enable an insecure fallback backend.

#### Scenario: Encryption is unavailable at save time

- **WHEN** OS-keychain-backed encryption is unavailable and the user attempts to save a secret
- **THEN** the application declines the save, explains that secrets are unavailable on this system, and writes nothing

#### Scenario: Linux end-to-end secret verification runs

- **WHEN** Linux CI runs dashboard end-to-end tests that persist a secret
- **THEN** it starts a real Secret Service/keyring for the test process
- **AND** it does not configure a plaintext or basic password-store fallback
