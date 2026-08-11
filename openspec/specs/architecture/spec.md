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
- `electron/skills.ts` — renders and installs the versioned `vault-guide`,
  `document-reviewer`, and `vault-dashboard-guide` agent skills
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

### Requirement: Dashboard execution has a separate ownership boundary

The application renderer MAY own only the `<webview>` DOM element lifecycle and SHALL mount it only from a current main-issued runtime descriptor. Main SHALL retain dashboard discovery, file access, permissions, protocol handling, runtime identity and generation, guest admission and policy, authority mappings, invalidation, teardown, dashboard data operations, and authoritative cross-`WebContents` focus transfer for privileged trusted flows.

#### Scenario: Application opens a dashboard

- **WHEN** trusted host UI requests a registered dashboard
- **THEN** main validates the bundle and issues a runtime descriptor, and the renderer mounts a separate sandboxed guest using only that descriptor's exact `src` and `partition`

#### Scenario: Dashboard requests a host operation

- **WHEN** dashboard code calls its fixed dashboard API
- **THEN** a dashboard-specific preload sends a fixed message that main authenticates against the active sender, frame, runtime identity, and generation before performing the bounded operation

#### Scenario: Renderer manages the dashboard element lifecycle

- **WHEN** the renderer mounts, hides, shows, or unmounts the dashboard `<webview>`
- **THEN** main retains runtime and teardown authority and rejects any stale, unexpected, or mismatched guest rather than admitting it to the active runtime

#### Scenario: Trusted flow transfers focus

- **WHEN** the renderer requests trusted-flow preparation through the narrow authenticated host API while the guest remains mounted and no privileged UI is open
- **THEN** main first attempts mounted guest blur and exact trusted-host focused-contents confirmation; only if that fails may main invalidate authority, initiate teardown, and destroy the exact focused guest proven to belong to the current runtime and generation, never a null, arbitrary, stale, or other-owner guest, then confirm exact trusted-host focus and return `retained` or `destroyed` with the runtime identity; the renderer synchronously hides before privileged UI or hides and aborts on failure

#### Scenario: Trusted flow replaces a destroyed guest before UI

- **WHEN** trusted-flow preparation returns `destroyed`
- **THEN** without invoking trusted-flow preparation again, App hides the slot/input, remounts exactly once with `display:none` and input disabled from creation, and opens privileged UI with DOM focus only after a different runtime ID is attached and ready in the unchanged context and remains hidden/input-inert; otherwise it aborts closed

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
