## ADDED Requirements

### Requirement: Secret values never cross the dashboard or agent boundary

The application SHALL keep decrypted secret values confined to transient use inside the main process, and SHALL ensure no IPC payload, dashboard API result, agent-accessible channel, renderer surface, error message, or log line contains a secret value in any form.

#### Scenario: Dashboard code probes for secret values

- **WHEN** arbitrary dashboard JavaScript calls any dashboard API operation, inspects any API result or error, or exercises the secrets metadata and host-mediated request operations
- **THEN** it observes at most secret names and set/unset status and never a secret value, prefix, length-revealing encoding, or ciphertext

#### Scenario: Host-mediated request fails

- **WHEN** a host-mediated secret-injected request fails at validation, resolution, network, or response stage
- **THEN** the returned error and any diagnostic logging exclude the secret value and the injected header content

### Requirement: Secret storage refuses insecure persistence

Secret values SHALL be stored only encrypted with OS-keychain-backed encryption in an application-private file with owner-only permissions, and the application SHALL refuse to persist secret values when that encryption is unavailable rather than falling back to plaintext.

#### Scenario: Encryption is unavailable at save time

- **WHEN** OS-keychain-backed encryption is unavailable and the user attempts to save a secret
- **THEN** the application declines the save, explains that secrets are unavailable on this system, and writes nothing

### Requirement: Host-mediated network egress requires explicit scoped consent

Host-mediated outbound requests on behalf of a dashboard SHALL require the granted privileged secrets capability, SHALL be validated against a fixed bounded request schema, SHALL send a secret only to an exact HTTPS origin declared for that secret name in the digest-bound manifest declaration, SHALL not follow redirects, SHALL prevent caller-supplied fields from overriding the injected secret, and SHALL enforce fixed response size, time, and rate bounds.

#### Scenario: Dashboard attempts secret exfiltration through the host

- **WHEN** dashboard code requests a host-mediated call whose URL origin is not exactly declared for the referenced secret, including via redirect, non-HTTPS scheme, userinfo tricks, or header override of the injection point
- **THEN** the application rejects or bounds the request so the secret value is never transmitted to an undeclared origin

#### Scenario: Ungranted dashboard requests egress

- **WHEN** a dashboard without the granted secrets capability requests a host-mediated call
- **THEN** the application rejects it with a bounded denial and performs no network activity

## MODIFIED Requirements

### Requirement: Dashboard file and data access is least-privilege

Dashboard runtime operations SHALL use fixed dashboard-local state, structured vault snapshot, secret metadata, and host-mediated request APIs, SHALL enforce real-path containment and current document validation, and SHALL never accept arbitrary filesystem paths, repository locations, raw credential values, or general query expressions; secrets SHALL be referenced only by declared name.

#### Scenario: Dashboard attempts path injection

- **WHEN** dashboard code includes an absolute path, traversal segment, symlink escape, path-like document identifier, or unsupported query field in an API request
- **THEN** the operation is rejected before filesystem access

#### Scenario: Index response is produced

- **WHEN** a permitted dashboard requests vault intelligence
- **THEN** the result excludes absolute paths, repository remotes, Git configuration, credentials, hidden files, application settings, and unapproved document bodies and is bounded by the versioned response schema

#### Scenario: Dashboard supplies a raw credential

- **WHEN** dashboard code passes a literal credential value, an undeclared secret name, or a value-bearing injection field in any API request
- **THEN** the operation is rejected without network or filesystem activity
