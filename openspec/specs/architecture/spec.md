# Architecture Spec

## Purpose

Defines the process and module boundaries for the Data Vault Electron
application so agents keep privileged and sandboxed code correctly
separated.

## Requirements

### Requirement: Main Process Owns Privileged Access

The main process SHALL be the only code that touches the filesystem, Git,
child processes, dialogs, or IPC handlers directly.

#### Scenario: Renderer needs vault data

- **WHEN** the renderer needs filesystem, Git, or repository data
- **THEN** it SHALL request it through `window.vaultApi` instead of
  importing Node or Electron modules directly

### Requirement: Module Responsibilities Are Fixed

Each top-level module SHALL keep to its documented responsibility:

- `electron/main.ts` — privileged application lifecycle and IPC handlers
- `electron/preload.ts` — narrow typed context bridge
- `electron/vault.ts` — repository, filesystem, manifest, graph, and Git
  logic
- `electron/github.ts` — GitHub OAuth device-flow sign-in, token storage,
  and REST (clone/create repos)
- `electron/skills.ts` — renders and installs the versioned vault-guide and
  document-reviewer agent skills
- `src/` — sandboxed React renderer
- `skills/` — repository-local agent workflows

#### Scenario: New privileged logic is added

- **WHEN** new filesystem, Git, process, or OS-level logic is needed
- **THEN** it SHALL live in `electron/`, not in `src/`

#### Scenario: New renderer-only logic is added

- **WHEN** new UI, presentation, or client-side state logic is needed
- **THEN** it SHALL live in `src/` and read data only through
  `window.vaultApi`

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

- **WHEN** standalone Claude, Codex, or OpenCode skill installation runs
- **THEN** it SHALL use the fixed-root, selected-provider installation behavior
