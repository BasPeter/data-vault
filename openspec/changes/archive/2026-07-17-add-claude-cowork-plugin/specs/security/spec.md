# Security Delta

## ADDED Requirements

### Requirement: Agent extension installer and exporter constraints

The application SHALL restrict automatic agent-skill writes to the existing
fixed standalone skill directories. It MAY additionally write a Claude plugin
archive only after an explicit user export action and native destination
selection. Plugin archive structure and content SHALL be determined entirely by
trusted main-process code.

#### Scenario: Explicit plugin export

- **WHEN** the user confirms a plugin export destination
- **THEN** trusted main-process code writes only the fixed allowlisted plugin
  files to a temporary archive and atomically completes the selected output
- **AND** vault data can influence only sanitized text fields in canonical skill
  templates

#### Scenario: Untrusted renderer or vault input

- **WHEN** renderer input or vault metadata contains a path, archive entry,
  manifest fragment, executable instruction, or traversal sequence
- **THEN** it cannot change the output destination selected by the native dialog
- **AND** it cannot add or rename archive entries
- **AND** it cannot cause vault documents, secrets, or arbitrary files to be
  included

#### Scenario: Failed or cancelled export

- **WHEN** export fails or is cancelled
- **THEN** partial temporary files are removed where possible
- **AND** application startup and existing skill installation continue normally

#### Scenario: Cowork update assistance

- **WHEN** a stale export causes the user to copy the update prompt
- **THEN** trusted code supplies fixed standalone skill paths and instructions
- **AND** renderer or vault input cannot add paths or prompt content
- **AND** Cowork operates only in the plugin tree explicitly selected for the
  task, stops if that target is missing or ambiguous, and does not search the filesystem
- **AND** the prompt forbids reading vault documents, credentials, tokens,
  environment values, or unrelated files
