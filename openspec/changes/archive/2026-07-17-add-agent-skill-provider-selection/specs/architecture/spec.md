## ADDED Requirements

### Requirement: Agent-skill provider settings remain trusted

The main process SHALL own the fixed agent-skill provider registry and the
persisted selected-provider list. The renderer MAY request selection updates by
provider ID only and SHALL NOT supply installation paths, skill names, or skill
content.

#### Scenario: User saves selected providers

- **WHEN** a user saves an Agent Skills provider selection
- **THEN** the main process SHALL validate every provider ID against its fixed
  registry, persist the validated list in application data, and perform any
  ensuing installation through main-process code

#### Scenario: Renderer supplies an unknown provider

- **WHEN** an IPC selection request contains an unknown, duplicate, or malformed
  provider ID
- **THEN** the main process SHALL reject the request and SHALL NOT change
  persisted selection or write skill files
