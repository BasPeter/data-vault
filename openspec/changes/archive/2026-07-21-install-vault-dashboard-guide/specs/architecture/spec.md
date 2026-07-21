## MODIFIED Requirements

### Requirement: Module Responsibilities Are Fixed

Each top-level module SHALL keep to its documented responsibility:

- `electron/main.ts` â€” privileged application lifecycle and IPC handlers
- `electron/preload.ts` â€” narrow typed context bridge
- `electron/vault.ts` â€” repository, filesystem, manifest, graph, and Git
  logic
- `electron/github.ts` â€” GitHub OAuth device-flow sign-in, token storage,
  and REST (clone/create repos)
- `electron/skills.ts` â€” renders and installs the versioned `vault-guide`,
  `document-reviewer`, and `vault-dashboard-guide` agent skills
- `src/` â€” sandboxed React renderer
- `skills/` â€” repository-local agent workflows

#### Scenario: New privileged logic is added

- **WHEN** new filesystem, Git, process, or OS-level logic is needed
- **THEN** it SHALL live in `electron/`, not in `src/`

#### Scenario: New renderer-only logic is added

- **WHEN** new UI, presentation, or client-side state logic is needed
- **THEN** it SHALL live in `src/` and read data only through
  `window.vaultApi`
