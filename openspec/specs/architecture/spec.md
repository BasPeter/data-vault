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
