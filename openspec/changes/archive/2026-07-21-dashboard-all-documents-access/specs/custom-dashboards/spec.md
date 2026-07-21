## MODIFIED Requirements

### Requirement: Vault intelligence is permission-scoped

The application SHALL expose vault intelligence only through fixed structured read APIs, SHALL require explicit per-dashboard grants for vault index and document content access, SHALL support either a trusted explicit document selection or a trusted all-documents scope covering every current and future valid vault document until changed or revoked, and SHALL never expose general filesystem or path APIs.

#### Scenario: Dashboard reads approved vault index data

- **WHEN** a dashboard with `vault:index:read` granted requests the vault index
- **THEN** the application returns a bounded versioned snapshot of permitted document IDs, titles, metadata, tags, and links without absolute paths, repository details, credentials, hidden files, or dashboard files

#### Scenario: Dashboard reads selected documents

- **WHEN** a dashboard with `vault:documents:read` granted under selected scope requests document IDs all present in its trusted selection
- **THEN** the application returns only those documents subject to the existing document containment and size rules

#### Scenario: Dashboard reads a future document under all scope

- **WHEN** a dashboard with `vault:documents:read` granted under all-documents scope requests a valid document added after the grant
- **THEN** the application treats the current document as in scope and returns it subject to the existing document containment and size rules

#### Scenario: Dashboard requests an unapproved document

- **WHEN** dashboard code under selected scope requests a document ID outside its trusted selection, or any scope requests an ID that is not a current valid document
- **THEN** the application rejects the request without revealing whether an unapproved path or document exists

#### Scenario: Vault permission is revoked

- **WHEN** the user revokes a dashboard's selected or all-documents vault permission
- **THEN** subsequent API calls lose that capability immediately and the dashboard source or repository manifest cannot restore it

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
- **THEN** the application hides or detaches the dashboard view, disables its input, moves focus to recognizable host-owned UI, and keeps the dashboard unable to overlay or intercept the flow through approval, cancellation, scope choice, or document selection

#### Scenario: Dashboard repeatedly requests denied access

- **WHEN** dashboard code repeatedly calls an ungranted privileged API
- **THEN** the API returns a bounded denial without opening, focusing, or visually interrupting trusted permission UI
