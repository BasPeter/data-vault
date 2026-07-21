## ADDED Requirements

### Requirement: A dedicated generated dashboard authoring guide is available

The application SHALL generate and install a versioned `vault-dashboard-guide` skill through every selected supported agent-skill provider and SHALL include the same canonical guide in the exported Claude plugin. The guide SHALL be self-contained and SHALL describe safe dashboard read, create, and update workflows only for the trusted bundle identified by application handoff.

#### Scenario: Selected provider receives generated skills

- **WHEN** a user selects a supported agent-skill provider and installation or refresh succeeds
- **THEN** that provider receives `vault-dashboard-guide` alongside the other generated Data Vault skills at its fixed skill root

#### Scenario: Agent follows a dashboard handoff

- **WHEN** an agent receives a dashboard bundle path from trusted application handoff
- **THEN** the guide instructs it to edit only the permitted local dashboard bundle files and not registry, grants, trash, app-private permission stores, or arbitrary vault documents

### Requirement: The guide documents the fixed dashboard contract

The `vault-dashboard-guide` SHALL document the current fixed dashboard API: `getInfo`, `readState`, `writeState`, `readVaultIndex`, `readDocuments`, `listSecrets`, `secureFetch`, and `openExternalLink`. It SHALL distinguish capability-free operations from permission-scoped operations, state that manifest requests do not grant authority, and describe bounded error handling and safe rendering of untrusted returned content.

#### Scenario: Agent needs a privileged dashboard operation

- **WHEN** an agent consults the guide before adding a vault-read, secret-mediated request, or external-link feature
- **THEN** it learns the exact fixed method, required trusted grant or confirmation, and the restriction that it cannot create or bypass that authority

#### Scenario: Agent adds an external link

- **WHEN** an agent consults the guide for `openExternalLink`
- **THEN** it learns that only canonical HTTPS URLs are accepted, each launch requires host-owned user confirmation, and the method does not enable popups, navigation, or general browser access

#### Scenario: Agent uses a secret-mediated request

- **WHEN** an agent consults the guide for `secureFetch`
- **THEN** it learns that the operation requires `secrets:use`, a declared secret and exact approved HTTPS origin, and never exposes a secret value to dashboard or agent code
