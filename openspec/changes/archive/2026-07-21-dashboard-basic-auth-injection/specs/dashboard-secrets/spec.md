## MODIFIED Requirements

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
