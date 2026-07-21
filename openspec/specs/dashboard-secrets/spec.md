# dashboard-secrets Specification

## Purpose

TBD - created by archiving change dashboard-storage-and-secrets. Update Purpose after archive.

## Requirements

### Requirement: Secrets are managed only through trusted host UI

The application SHALL provide a trusted secrets panel, outside any dashboard execution surface, that lists every secret name required by installed dashboards together with the dashboards requiring it and its set/unset status, and SHALL let the user set, update, and delete secret values there. The panel and every other trusted surface SHALL never display a stored secret value.

#### Scenario: User opens the secrets panel

- **WHEN** the user opens the secrets panel from trusted application chrome
- **THEN** the application lists each required secret name with its requiring dashboards and set/unset status, with value inputs empty and no stored value rendered or pre-filled

#### Scenario: A dashboard requires an unset secret

- **WHEN** an opened dashboard declares a required secret that has no stored value
- **THEN** the application surfaces a host-owned prompt that can open the secrets panel, and the dashboard cannot open, overlay, or intercept that flow

#### Scenario: User updates or deletes a secret

- **WHEN** the user saves a new value for a secret name or deletes it
- **THEN** subsequent host-mediated uses observe the new state immediately and no dashboard approval, restart, or manifest change is required

### Requirement: Secret values are encrypted at rest and never stored in a vault

The application SHALL store secret values only in an application-private store outside every vault repository, encrypted with OS-keychain-backed encryption, and SHALL refuse to store a secret in plaintext: when OS encryption is unavailable the application SHALL report secrets as unavailable instead of persisting an unencrypted value.

#### Scenario: Secret is saved on a machine with OS encryption

- **WHEN** the user saves a secret value
- **THEN** the value is encrypted before being written to the application-private store with owner-only permissions, and no vault repository, vault file, or dashboard bundle contains the value in any form

#### Scenario: OS encryption is unavailable

- **WHEN** OS-keychain-backed encryption is not available
- **THEN** the application refuses to save secret values, reports the secrets feature as unavailable in trusted UI, and treats all secrets as unset

### Requirement: Dashboards declare required secrets in their manifest

A dashboard manifest MAY declare required secrets, each with a bounded validated name and a fixed list of exact HTTPS origins the secret may be sent to; the declaration SHALL participate in the canonical capability-request digest so that changing declared names or origins invalidates existing grants and requires new trusted approval.

#### Scenario: Manifest declares a secret

- **WHEN** a dashboard manifest declares a secret name matching the fixed name pattern with at least one exact HTTPS origin
- **THEN** the dashboard is discovered with that requirement and the secret name appears in the trusted secrets panel

#### Scenario: Manifest secret declaration is invalid

- **WHEN** a manifest declares a secret with a malformed name, a non-HTTPS or wildcard origin, unsupported fields, or more entries than the fixed bound
- **THEN** the application rejects the bundle safely without executing content

#### Scenario: Declared secrets change after approval

- **WHEN** a dashboard's declared secret names or origins change after the user granted the secrets capability
- **THEN** the capability-request digest no longer matches, the secrets capability is restricted, and new trusted approval is required

### Requirement: Dashboards and agents can observe secret metadata but never values

The application SHALL expose to dashboard code, behind the privileged secrets capability, only the names and set/unset status of that dashboard's declared secrets, and SHALL provide no operation — to dashboards, agents, or the application renderer — that returns a stored secret value.

#### Scenario: Dashboard lists its secrets

- **WHEN** a dashboard with the secrets capability granted requests its secret list
- **THEN** the application returns only the declared names with set/unset status, excluding values, other dashboards' declarations, and undeclared stored names

#### Scenario: Dashboard lacks the secrets capability

- **WHEN** dashboard code calls a secrets operation without the granted capability
- **THEN** the application returns a bounded denial without revealing which secrets exist or are set

#### Scenario: Agent authors a dashboard needing a secret

- **WHEN** an agent uses the authoring handoff for a dashboard that needs an external credential
- **THEN** the handoff documents declaring the secret in the manifest and using host-mediated operations, and no agent-accessible API, file, or channel exposes a stored secret value

### Requirement: Secrets are used only through host-mediated requests

The application SHALL let a dashboard with the granted secrets capability request a bounded outbound HTTPS call in which the main process resolves a declared secret and injects it at a fixed injection point, including host-composed HTTP Basic authorization from a validated non-secret username and the resolved secret, and SHALL send the secret only to an exact origin declared for that secret name, without following redirects, without letting caller-supplied fields override the injection, and without including the secret value or any host-derived credential representation in any result, error, or log.

#### Scenario: Dashboard performs an authenticated request

- **WHEN** a dashboard with the secrets capability requests a host-mediated call to a declared origin using a declared, set secret with a fixed injection point
- **THEN** the main process injects the value, performs the request subject to fixed size, time, and rate bounds, and returns only the bounded status, header subset, and body

#### Scenario: Dashboard performs HTTP Basic authentication

- **WHEN** a dashboard requests `authorization-basic` injection with a valid username and a declared, set secret
- **THEN** the main process sets `authorization` to `Basic ` followed by the Base64 encoding of the UTF-8 bytes of `username:secretValue`, without exposing the resolved secret or composed authorization value to dashboard code

#### Scenario: Basic-auth username is invalid

- **WHEN** an `authorization-basic` username is empty, exceeds the fixed length bound, or contains colon, CR, LF, or NUL
- **THEN** the application rejects the request without resolving the secret or contacting the target

#### Scenario: Remote response echoes a derived credential

- **WHEN** a remote response or failure includes the Base64 credential payload or the complete host-composed Basic authorization value
- **THEN** the application redacts the derived value before returning or logging any response or error field

#### Scenario: Request targets an undeclared origin

- **WHEN** the request URL is not HTTPS or its origin does not exactly match an origin declared for that secret name
- **THEN** the application rejects the request without resolving the secret or contacting the target

#### Scenario: Remote responds with a redirect

- **WHEN** the remote origin responds with a redirect
- **THEN** the application does not follow it and returns the bounded redirect response without sending the secret to any further origin

#### Scenario: Required secret is unset

- **WHEN** the request references a declared secret that has no stored value
- **THEN** the application rejects the request with a bounded unset-secret result so the dashboard can prompt the user, and no network request is made
