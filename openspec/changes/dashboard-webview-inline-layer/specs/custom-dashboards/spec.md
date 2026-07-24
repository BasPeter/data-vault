## MODIFIED Requirements

### Requirement: Dashboard permissions are understandable and revocable

The application SHALL present capability requests and effective grants in plain language outside the dashboard execution surface, including whether document access covers selected documents or all current and future documents and including declared secret names and the exact origins each secret may be sent to, and SHALL let the user inspect, change, and revoke grants per dashboard.

#### Scenario: A manifest requests privileged data access

- **WHEN** a dashboard first requests vault index, document, or secrets access
- **THEN** trusted host UI explains the requested data scope — including that all-documents access automatically covers future documents and, for secrets, the declared secret names and their allowed origins — and requires an affirmative user decision before access is enabled

#### Scenario: User grants all-documents access

- **WHEN** the user affirmatively selects All documents in trusted permission UI and saves the grant
- **THEN** the application persists a host-owned dynamic scope covering every current and future valid document until the scope is changed or revoked

#### Scenario: Security-relevant manifest request changes

- **WHEN** the canonical capability request or the digest of any protocol-served bundle file other than `state.json` no longer matches an existing grant
- **THEN** the application restricts the affected capabilities and requires new approval

#### Scenario: User manages dashboard access

- **WHEN** the user initiates permission management from trusted application chrome
- **THEN** the application removes or fully occludes the dashboard view — hiding, destroying, or covering it with a trusted host-owned surface — disables its input, moves focus to recognizable host-owned UI, and keeps the dashboard unable to overlay or intercept the flow through approval, cancellation, scope choice, or document selection

#### Scenario: Dashboard repeatedly requests denied access

- **WHEN** dashboard code repeatedly calls an ungranted privileged API
- **THEN** the API returns a bounded denial without opening, focusing, or visually interrupting trusted permission UI
