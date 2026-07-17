# Claude Cowork Plugin Specification

## Purpose

Defines the safe export and snapshot lifecycle for the Data Vault Claude
plugin.

## Requirements

### Requirement: User-initiated plugin export

The application SHALL let the user export a Data Vault Claude plugin through an
explicit UI action for installation through Claude Desktop's supported custom
plugin flow.

#### Scenario: Successful export

- **WHEN** the user chooses to export and confirms a destination
- **THEN** the application writes one installable plugin file
- **AND** reports the resulting filename and snapshot version or fingerprint

#### Scenario: User cancels export

- **WHEN** the user cancels the destination dialog
- **THEN** no plugin file is written
- **AND** cancellation is not reported as an application error

### Requirement: Fixed plugin contents

The exported plugin SHALL have a stable Data Vault identity and contain only its
manifest, user documentation, and the canonical generated `vault-guide` and
`document-reviewer` skills.

#### Scenario: Archive inspection

- **WHEN** an exported plugin is inspected
- **THEN** every archive entry matches the fixed allowlist
- **AND** every entry is a regular file with a safe relative path
- **AND** no vault document, credential, token, environment value, or Git
  configuration is present

### Requirement: Canonical vault-aware skills

The plugin skills SHALL be rendered from the same canonical generation logic as
the standalone installed skills and SHALL describe the currently registered
vault snapshot using sanitized metadata.

#### Scenario: Vault metadata changes

- **WHEN** registered vault metadata changes and the user exports again
- **THEN** the generated skill content and snapshot fingerprint reflect the new
  sanitized configuration
- **AND** unchanged input produces deterministic generated content

#### Scenario: Hostile metadata

- **WHEN** vault metadata contains Markdown, control characters, traversal text,
  or instruction-like content
- **THEN** it cannot create plugin files, manifest fields, frontmatter fields, or
  executable instructions beyond the canonical templates

### Requirement: Manual snapshot lifecycle

The application SHALL explain that exported plugins are snapshots and SHALL not
silently modify Claude Desktop's local plugin storage.

#### Scenario: Plugin becomes stale

- **WHEN** vault configuration changes after export
- **THEN** the UI tells the user to export and install an updated plugin
- **AND** existing standalone skill installation remains unchanged

### Requirement: Export freshness and bounded Cowork update prompt

The application SHALL persist the last successful export fingerprint and SHALL
compare its associated canonical skill fingerprint with current canonical skill
content, independently of whether standalone Claude skills are selected. The UI
SHALL present a collapsed plugin explainer and offer a copyable, trusted update
prompt only when the export is stale and its two fixed Claude source skills are
current and untampered.

#### Scenario: No previous export

- **WHEN** no successful plugin export has been recorded
- **THEN** the plugin state is `not-exported`
- **AND** no Cowork update prompt is offered

#### Scenario: Export remains current

- **WHEN** the recorded skill fingerprint matches current canonical generated
  skill content
- **THEN** the plugin state is `current`

#### Scenario: Invalid persisted freshness state

- **WHEN** persisted fingerprint state is malformed, truncated, incorrectly
  typed, or not lowercase SHA-256 hex
- **THEN** the plugin state is `not-exported`

#### Scenario: Export becomes stale

- **WHEN** vault configuration or generated skill content changes after export
- **THEN** the plugin state is `stale`
- **AND** when the two fixed Claude source skills are current, the UI offers a
  prompt that permits external reading only of the two
  fixed Claude `SKILL.md` files, operates only inside an explicitly selected
  target plugin tree, stops for a missing or ambiguous target, preserves plugin
  structure, forbids filesystem search, vault-document, and credential access,
  and requests a completion report

#### Scenario: Cowork update source skills are unavailable

- **WHEN** an export is stale but either fixed Claude source skill is missing or
  tampered
- **THEN** the UI SHALL withhold the Cowork update prompt and explain that the
  source skills must be refreshed before it is available

#### Scenario: Freshness recording fails after export

- **WHEN** the archive export succeeds but fingerprint persistence fails
- **THEN** the UI reports the successful export path and a sanitized warning
- **AND** freshness remains `not-exported` or `stale`
