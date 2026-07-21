# Custom Dashboards Spec

## Purpose

Defines the user-facing custom dashboard capability: sidebar launchers,
dashboard lifecycle management, agent authoring handoff, dashboard-local
state, permission-scoped vault intelligence, and contained failure
recovery.

## Requirements

### Requirement: Dashboard launchers are first-class navigation

The application SHALL present a Dashboards section above Documents containing large squircle launchers in deterministic registry order, and each launcher SHALL expose its title, icon, colour, active state, and accessible name through trusted application UI.

#### Scenario: Open a dashboard from the sidebar

- **WHEN** the user activates a dashboard launcher by pointer or keyboard
- **THEN** the application opens that dashboard in the main content area, marks its launcher active, and preserves existing document tabs for later return

#### Scenario: Sidebar has many dashboards

- **WHEN** dashboard launchers exceed the available sidebar width or configured visible count
- **THEN** the application provides a keyboard-accessible overflow mechanism without obscuring the Documents section or create action

#### Scenario: No dashboards exist

- **WHEN** a valid vault has no registered dashboards
- **THEN** the application shows a compact empty state and an accessible create action above Documents

### Requirement: Users can manage dashboard lifecycle without editing files

The application SHALL provide trusted UI to create, rename, reorder, remove, and change the storage location of dashboards while choosing stable IDs and managed paths itself, and creation SHALL include an explicit choice between vault storage (shared through the vault repository) and app-local storage (private to this installation).

#### Scenario: Create a personal-progress dashboard

- **WHEN** the user creates a dashboard with the Personal progress starting purpose
- **THEN** the application creates a valid registered bundle with dashboard-local state capabilities in the chosen storage location and opens it

#### Scenario: Create a vault-intelligence dashboard

- **WHEN** the user creates a dashboard with the Vault intelligence starting purpose
- **THEN** the application creates a valid registered bundle whose vault data requests remain ungranted until approved by the user

#### Scenario: Reorder dashboards

- **WHEN** the user reorders dashboard launchers
- **THEN** the application persists the new deterministic order without changing dashboard IDs, storage locations, or bundle paths

#### Scenario: Remove a dashboard

- **WHEN** the user confirms dashboard removal
- **THEN** the application unregisters the dashboard, stops its runtime, and moves its complete bundle to the managed dashboard trash location of its own storage location instead of permanently deleting it

### Requirement: Dashboard creation supports agent authoring

The application SHALL offer a minimal creation flow using title, icon, colour, and optional starting purpose, and SHALL provide an agent handoff that identifies the managed bundle and the dashboard authoring contract.

#### Scenario: User hands a new dashboard to an agent

- **WHEN** the user completes dashboard creation and chooses the agent handoff
- **THEN** the application provides instructions for editing that bundle with local HTML, CSS, JavaScript, and assets while using only declared host capabilities

#### Scenario: Agent changes requested capabilities

- **WHEN** an agent edits a dashboard manifest to request additional vault access
- **THEN** the application keeps the new access disabled until the user grants it through trusted application UI

### Requirement: Personal dashboard state is portable and bounded

The application SHALL allow a valid dashboard to read and atomically write its own JSON state, SHALL store that state in its own bundle, and SHALL enforce schema, containment, size, and rate limits at the trusted boundary.

#### Scenario: Personal progress is saved

- **WHEN** a dashboard with state access writes a JSON value within the 1 MiB encoded limit and write-rate limit
- **THEN** the application atomically persists the value to that dashboard's state file and makes it available after the dashboard or application is reopened

#### Scenario: State write exceeds a boundary

- **WHEN** dashboard code submits malformed, oversized, too-frequent, or non-serializable state
- **THEN** the application rejects the write without modifying the previous valid state or affecting other dashboards

#### Scenario: State is corrupt on disk

- **WHEN** a dashboard state file is malformed or oversized when read
- **THEN** the application reports a recoverable dashboard-local error and continues to open the vault and other application views

### Requirement: Vault intelligence is permission-scoped

The application SHALL expose vault intelligence only through fixed structured read APIs, SHALL require explicit per-dashboard grants for vault index and document content access, SHALL support either a trusted explicit document selection or a trusted all-documents scope covering every current and future valid vault document until changed or revoked, and SHALL never expose general filesystem or path APIs.

#### Scenario: Dashboard reads approved vault index data

- **WHEN** a dashboard with `vault:index:read` granted requests the vault index
- **THEN** the application returns a bounded versioned snapshot of permitted document IDs, titles, metadata, tags, and links without absolute paths, repository details, credentials, hidden files, or dashboard files

#### Scenario: Dashboard reads selected documents

- **WHEN** a dashboard with `vault:documents:read` granted requests document IDs all present in its trusted selection
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

### Requirement: Dashboard failures are contained and recoverable

The application SHALL contain dashboard load, script, crash, hang, state, and permission failures to the active dashboard surface and SHALL provide trusted stop, reload, and retry controls where applicable.

#### Scenario: A dashboard bundle is broken

- **WHEN** its manifest, entrypoint, or runtime fails
- **THEN** the application shows a recoverable host-owned error while Documents, other dashboards, vault switching, and startup remain usable

#### Scenario: User leaves a dashboard

- **WHEN** the user opens another dashboard, switches vaults, reloads, or closes the application
- **THEN** the application tears down the previous dashboard runtime and its sender-to-capability context

#### Scenario: Last view references a missing dashboard

- **WHEN** the stored last application view identifies a dashboard that is no longer valid or registered
- **THEN** the application falls back to a safe non-dashboard view without recreating or executing the missing bundle

### Requirement: Dashboards can be stored in the vault or app-locally

The application SHALL support two dashboard storage locations — the vault namespace shared through the vault repository, and an app-local per-vault namespace private to the installation — SHALL let the user choose the location at creation, SHALL let the user move a dashboard between locations afterwards, and SHALL treat dashboards from both locations uniformly for runtime, permissions, and lifecycle.

#### Scenario: User creates an app-local dashboard

- **WHEN** the user creates a dashboard and chooses local storage
- **THEN** the application creates the bundle in the app-local namespace for the current vault, the dashboard behaves like any other dashboard, and no dashboard file is written into the vault repository

#### Scenario: User moves a dashboard between locations

- **WHEN** the user moves a dashboard from one storage location to the other
- **THEN** the application relocates the complete bundle atomically, preserving its ID, source, state, registry membership, and existing permission grants, and any failure leaves the source location valid and unregistered destination artifacts removed

#### Scenario: Dashboard IDs collide across locations

- **WHEN** discovery finds the same dashboard ID in both the vault and app-local namespaces
- **THEN** the application keeps the vault dashboard available, reports the app-local duplicate as a recoverable per-dashboard error, and does not adopt, modify, or delete either bundle

#### Scenario: Sidebar lists dashboards from both locations

- **WHEN** a vault with both vault and app-local dashboards is opened
- **THEN** the application lists vault dashboards followed by app-local dashboards, each set in its own deterministic registry order, with the storage location inspectable in trusted UI
