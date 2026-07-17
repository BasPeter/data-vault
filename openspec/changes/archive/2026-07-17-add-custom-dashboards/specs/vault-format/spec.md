## ADDED Requirements

### Requirement: Vaults may contain managed dashboard bundles

A vault MAY opt into an application-owned `.data-vault/dashboards/` namespace through versioned `vault.json` configuration, containing a versioned `registry.json`, one directory per stable dashboard ID, and an app-managed `.trash/` directory; dashboard content SHALL remain excluded from the configured document corpus and manifest.

#### Scenario: Vault has no dashboard directory

- **WHEN** the application opens an existing vault without `.data-vault/dashboards/`
- **THEN** the vault opens unchanged with an empty dashboard collection and no migration is required

#### Scenario: Dashboard files are indexed

- **WHEN** the application builds the document tree, document manifest, search data, or document graph
- **THEN** it excludes dashboard registry, source, assets, state, and trash from document indexing

#### Scenario: Documents directory is the vault root or an ancestor

- **WHEN** `documentsDirectory` is `.` or otherwise contains `.data-vault/dashboards/`
- **THEN** the application explicitly reserves and excludes the complete dashboard subtree from all document operations regardless of ordinary dot-directory filtering

#### Scenario: Documents directory is the dashboard namespace

- **WHEN** `documentsDirectory` is `.data-vault/dashboards`, one of its descendants, or otherwise makes exclusive dashboard ownership impossible
- **THEN** the application refuses to enable or create dashboards without modifying existing content

#### Scenario: Dashboard namespace contains unowned content

- **WHEN** the exact dashboard directory, registry, or trash path already exists without a matching valid ownership/configuration contract or has an unexpected type, symlink, or name collision
- **THEN** the application fails closed and does not adopt, move, overwrite, delete, or reinterpret the existing content

### Requirement: Dashboard registry and manifests are validated data

The application SHALL treat the registry as canonical only for deterministic order and stable IDs, SHALL treat each dashboard manifest as canonical for display metadata, kind, entrypoint, and requested capabilities, and SHALL validate both against fixed versioned schemas without evaluating their fields as code, paths, markup, or permission grants.

#### Scenario: Valid dashboard bundle is discovered

- **WHEN** a registry entry references a contained directory whose manifest ID, schema version, entrypoint, and metadata are valid
- **THEN** the application includes it in deterministic registry order as an available dashboard

#### Scenario: Registry contains hostile metadata

- **WHEN** an entry contains markup, unsupported fields, malformed IDs, duplicate IDs, invalid colours/icons, absolute paths, traversal, or unsupported schema versions
- **THEN** the application rejects or safely reports the affected entry without executing content or preventing the rest of the vault from opening

### Requirement: Dashboard paths are contained after symlink resolution

Every dashboard registry, bundle, entrypoint, asset, state, temporary-state, and trash operation SHALL resolve inside the expected dashboard root or selected bundle after real-path and symlink validation.

#### Scenario: Dashboard asset uses traversal or symlink escape

- **WHEN** a registry entry, manifest entrypoint, asset request, state file, or bundle symlink resolves outside its allowed real root
- **THEN** the application rejects the operation and does not disclose or modify the outside target

### Requirement: Dashboard source and state are portable vault data

Dashboard manifests, HTML, CSS, JavaScript, local assets, registry order, and state SHALL be stored in the vault so repository tooling can version and sync them, while trusted permission grants and UI preferences SHALL NOT be stored in repository-controlled dashboard files.

#### Scenario: Dashboard bundle is cloned on another device

- **WHEN** a vault containing valid dashboard files is opened on another device
- **THEN** the dashboard is discovered with its source, display order, and personal state but privileged vault grants require approval in that trusted application installation

### Requirement: Dashboard lifecycle mutations are atomic and collision-safe

Create, rename, reorder, and recoverable removal SHALL either complete their canonical manifest, registry, and filesystem changes or preserve the previous valid state, and SHALL fail on wrong-type paths, symlinks, or destination collisions.

#### Scenario: Create operation cannot complete

- **WHEN** bundle creation, manifest writing, or registry replacement fails
- **THEN** the application rolls back incomplete owned artifacts and does not register a partial dashboard

#### Scenario: Trash destination collides

- **WHEN** the collision-resistant removal destination already exists or resolves unexpectedly
- **THEN** the application leaves the source bundle and registry unchanged and reports a recoverable error

### Requirement: Runtime state cannot modify dashboard source

The dashboard state operation SHALL write only a JSON value to the selected dashboard's fixed `state.json` through an atomic sibling-file replacement and SHALL NOT accept a path or modify manifest, registry, entrypoint, script, style, or asset files.

#### Scenario: Dashboard writes valid state

- **WHEN** runtime code submits a permitted JSON state value
- **THEN** main writes only the fixed contained state file atomically and leaves all dashboard source files unchanged
