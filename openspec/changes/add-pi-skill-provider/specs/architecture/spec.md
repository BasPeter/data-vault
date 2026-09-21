## MODIFIED Requirements

### Requirement: Agent-skill provider settings remain trusted

The main process SHALL own the fixed agent-skill provider registry and the
persisted selected-provider list. The registry SHALL include only the fixed
Claude, Codex, OpenCode, and Pi roots. The renderer MAY request selection
updates by provider ID only and SHALL NOT supply installation paths, skill
names, or skill content.

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

### Requirement: Main process owns agent extension generation and writes

The Electron main process SHALL exclusively render, validate, install, and
export generated agent extensions. The renderer SHALL access these operations
only through narrow typed preload APIs and SHALL NOT supply generated content,
manifest data, archive entries, or internal archive paths.

#### Scenario: Renderer requests Claude plugin export

- **WHEN** the renderer invokes the plugin-export API
- **THEN** the main process selects the output through a native save dialog
- **AND** renders and validates the fixed plugin contents
- **AND** writes the archive without exposing general filesystem access

#### Scenario: Existing standalone installation

- **WHEN** standalone Claude, Codex, OpenCode, or Pi skill installation runs
- **THEN** it SHALL use the fixed-root, selected-provider installation behavior
