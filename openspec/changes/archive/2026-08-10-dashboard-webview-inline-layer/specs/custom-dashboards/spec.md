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
- **THEN** `retained` hides before UI; after validated `destroyed`, without preparing again, the renderer remounts once with `display:none` and input disabled, and opens permission UI with DOM focus only after the different attached, ready same-context replacement remains hidden/input-inert

#### Scenario: Replacement runtime is not ready

- **WHEN** hidden replacement readiness times out, the context changes, or the replacement is not hidden/input-inert
- **THEN** permission UI does not open and the flow aborts closed without calling preparation again or creating a stale or duplicate remount

#### Scenario: Dashboard repeatedly requests denied access

- **WHEN** dashboard code repeatedly calls an ungranted privileged API
- **THEN** the API returns a bounded denial without opening, focusing, or visually interrupting trusted permission UI
