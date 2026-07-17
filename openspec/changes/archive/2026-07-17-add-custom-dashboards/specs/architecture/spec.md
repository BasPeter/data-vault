## ADDED Requirements

### Requirement: Dashboard execution has a separate ownership boundary

The main process SHALL own dashboard discovery, file access, permissions, protocol handling, runtime creation, runtime teardown, and dashboard data operations, while the application renderer SHALL own only trusted launcher, host, creation, error, and permission UI.

#### Scenario: Application opens a dashboard

- **WHEN** trusted host UI requests a registered dashboard
- **THEN** the main process creates a separate sandboxed dashboard web contents mapped to one validated bundle and the application renderer does not load or execute the bundle in its DOM

#### Scenario: Dashboard requests a host operation

- **WHEN** dashboard code calls its fixed dashboard API
- **THEN** a dashboard-specific preload sends a fixed message that main authenticates against the active runtime context before performing the bounded operation

### Requirement: Dashboard view state is distinct from document state

The application SHALL represent dashboards as a distinct view kind and SHALL keep dashboard selection and runtime lifecycle separate from document tabs and sanitized document rendering.

#### Scenario: Switch between dashboard and document

- **WHEN** a user opens a dashboard and later activates an existing document tab
- **THEN** the application stops the dashboard runtime as required, shows the document through the existing sanitized document path, and preserves the document tab model

### Requirement: Dashboard assets use a main-owned local protocol

The main process SHALL serve dashboard assets through a read-only local custom protocol mapped from an opaque active runtime identity to one immutable validated asset snapshot, and SHALL NOT start a localhost server or re-read mutable source files for an active runtime.

#### Scenario: Dashboard requests a local asset

- **WHEN** the active dashboard requests a contained regular file from its own bundle origin
- **THEN** the protocol handler returns that asset with fixed MIME and security headers

#### Scenario: Dashboard requests another bundle

- **WHEN** a dashboard asset request resolves outside its mapped real bundle root or targets another runtime identity
- **THEN** the protocol handler rejects the request without returning filesystem metadata

#### Scenario: Dashboard source changes while running

- **WHEN** a bundle file changes after the runtime snapshot and permission digest were created
- **THEN** the active runtime continues to receive only its original snapshot bytes and changed bytes require reload, a new digest, and any required reapproval before execution
