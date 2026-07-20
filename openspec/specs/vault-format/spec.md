# Vault Format Spec

## Purpose

Defines the on-disk contract for a vault repository that Data Vault reads,
indexes, and renders.

## Requirements

### Requirement: Vault Root Contract

A vault SHALL be a local Git repository, or a repository cloned by the
app. Content SHALL default to the `documents/` directory unless
overridden.

#### Scenario: vault.json overrides the content directory

- **WHEN** `vault.json` sets `documentsDirectory`
- **THEN** the app SHALL index documents from that directory instead of
  `documents/`

### Requirement: vault.json Optional Configuration

`vault.json` SHALL support optional `name`, `documentsDirectory`,
`format`, `defaultLanguage`, and `structure` fields. `defaultLanguage`
SHALL be a language tag suggested to the agents when writing documents.
`structure` SHALL be a nested map keyed by directory segment, each entry
optionally naming a title, description, and children, describing each
directory's purpose.

#### Scenario: Structure and language are edited from the app

- **WHEN** a user edits `defaultLanguage` or `structure` from the vault
  switcher's settings dialog
- **THEN** the values SHALL be surfaced in the sidebar and injected into
  the generated agent skills
- **AND** the change SHALL mark installed skills outdated

### Requirement: Document Format Selection

The vault format SHALL be `html` unless `vault.json` sets `format` to
`markdown`; a missing value SHALL default to `html` for backwards
compatibility.

#### Scenario: HTML vault

- **WHEN** `format` is `html` or unset
- **THEN** the app SHALL index `.html` documents

#### Scenario: Markdown vault

- **WHEN** `format` is `markdown`
- **THEN** the app SHALL index `.md` documents

### Requirement: HTML Document Structure

HTML documents SHALL be content-only `.html` fragments with an optional
`<!--vault ...-->` metadata block containing `title`, `date`, and
comma-separated `tags`.

#### Scenario: Metadata block is present

- **WHEN** an HTML document includes a `<!--vault ...-->` block
- **THEN** the app SHALL read `title`, `date`, and comma-separated `tags`
  from it

### Requirement: Markdown Document Structure

Markdown documents SHALL be `.md` files with optional leading `---`
frontmatter containing `title`, `date`, and `tags`.

#### Scenario: Frontmatter is present

- **WHEN** a Markdown document includes leading `---` frontmatter
- **THEN** the app SHALL read `title`, `date`, and `tags` from it

### Requirement: quick-notes.html Reserved Scratchpad

`quick-notes.html` at the documents root SHALL be excluded from the
manifest and graph and MAY remain uncommitted.

#### Scenario: Manifest and graph are built

- **WHEN** the app builds the document manifest or link graph
- **THEN** it SHALL exclude `quick-notes.html` from both

### Requirement: Internal Links

HTML internal links SHALL be hashes whose value is another document ID.
Markdown internal links SHALL be relative `.md` links resolved from the
source document.

#### Scenario: Link resolution differs by format

- **WHEN** the app resolves an internal link
- **THEN** it SHALL treat an HTML link's hash value as a document ID and a
  Markdown link as a relative `.md` path from the source document

### Requirement: Mermaid Diagram Storage

HTML Mermaid source SHALL be stored in `<pre class="mermaid">` blocks.
Markdown Mermaid source SHALL be stored in fenced `mermaid` code blocks.

#### Scenario: Rendering a diagram

- **WHEN** the app renders a document containing a Mermaid diagram
- **THEN** it SHALL read the diagram source from the format-appropriate
  location

### Requirement: No Personal Vault Data In This Repository

This repository (the Data Vault application) SHALL NOT contain real vault
documents, credentials, repository URLs, or generated clones. Every
external vault repository and every HTML fragment it contains MUST be
treated as untrusted input.

#### Scenario: A contributor considers adding sample vault content

- **WHEN** a change would add example documents, cloned vault data, or a
  real repository URL to this repository
- **THEN** the change SHALL be rejected or replaced with synthetic,
  non-identifying fixtures

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

Dashboard manifests, HTML, CSS, JavaScript, local assets, registry order, and state of vault-stored dashboards SHALL be stored in the vault so repository tooling can version and sync them, while trusted permission grants, UI preferences, and secret values SHALL NOT be stored in repository-controlled dashboard files; app-local dashboards SHALL live entirely outside every vault repository in an application-owned per-vault namespace and SHALL never be written into vault content.

#### Scenario: Dashboard bundle is cloned on another device

- **WHEN** a vault containing valid dashboard files is opened on another device
- **THEN** the dashboard is discovered with its source, display order, and personal state but privileged vault grants require approval in that trusted application installation and secret values must be entered there

#### Scenario: App-local dashboards stay out of the vault

- **WHEN** a vault with app-local dashboards is committed, synced, or inspected with repository tooling
- **THEN** no app-local dashboard file, registry entry, state, or secret value appears anywhere in the vault repository

#### Scenario: Manifest declares required secrets

- **WHEN** a vault-stored dashboard manifest declares required secret names and origins
- **THEN** the declaration syncs with the vault as validated data while the corresponding secret values exist only in each installation's application-private encrypted store

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
