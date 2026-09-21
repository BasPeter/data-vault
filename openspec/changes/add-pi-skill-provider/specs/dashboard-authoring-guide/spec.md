## MODIFIED Requirements

### Requirement: A dedicated generated dashboard authoring guide is available

The application SHALL generate and install a versioned `vault-dashboard-guide` skill through every selected supported agent-skill provider, including Pi, and SHALL include the same canonical guide in the exported Claude plugin. The guide SHALL be self-contained and SHALL describe safe dashboard read, create, and update workflows only for the trusted bundle identified by application handoff.

#### Scenario: Selected provider receives generated skills

- **WHEN** a user selects a supported agent-skill provider and installation or refresh succeeds
- **THEN** that provider receives `vault-dashboard-guide` alongside the other generated Data Vault skills at its fixed skill root

#### Scenario: Agent follows a dashboard handoff

- **WHEN** an agent receives a dashboard bundle path from trusted application handoff
- **THEN** the guide instructs it to edit only the permitted local dashboard bundle files and not registry, grants, trash, app-private permission stores, or arbitrary vault documents
