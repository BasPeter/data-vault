## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Dashboard permissions are understandable and revocable

The application SHALL present capability requests and effective grants in plain language outside the dashboard execution surface, including declared secret names and the exact origins each secret may be sent to, and SHALL let the user inspect and revoke grants per dashboard.

#### Scenario: A manifest requests privileged data access

- **WHEN** a dashboard first requests vault index, selected-document, or secrets access
- **THEN** trusted host UI explains the requested data scope — for secrets, the declared secret names and their allowed origins — and requires an affirmative user decision before access is enabled

#### Scenario: Security-relevant manifest request changes

- **WHEN** the canonical capability request or the digest of any protocol-served bundle file other than `state.json` no longer matches an existing grant
- **THEN** the application restricts the affected capabilities and requires new approval

#### Scenario: User manages dashboard access

- **WHEN** the user initiates permission management from trusted application chrome
- **THEN** the application hides or detaches the dashboard view, disables its input, moves focus to recognizable host-owned UI, and keeps the dashboard unable to overlay or intercept the flow through approval, cancellation, or document selection

#### Scenario: Dashboard repeatedly requests denied access

- **WHEN** dashboard code repeatedly calls an ungranted privileged API
- **THEN** the API returns a bounded denial without opening, focusing, or visually interrupting trusted permission UI
