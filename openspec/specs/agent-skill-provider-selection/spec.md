# Agent Skill Provider Selection Specification

## Purpose

Defines explicit, provider-specific installation of Data Vault's generated
agent skills.

## Requirements

### Requirement: Users explicitly select agent-skill providers

The application SHALL present a checkbox-based Agent Skills setup for the
supported Claude, Codex, and OpenCode providers. The user SHALL explicitly
save a selection before the application installs or refreshes generated skills
for any provider.

#### Scenario: First-time setup

- **WHEN** no valid provider selection is persisted
- **THEN** the Agent Skills panel SHALL show all supported providers as
  selectable and report that setup is required
- **AND** the application SHALL NOT automatically write global agent-skill
  files before the user saves a selection

#### Scenario: User selects OpenCode only

- **WHEN** a user selects only OpenCode and saves
- **THEN** the application SHALL install `vault-guide`, `document-reviewer`, and `vault-dashboard-guide` at `~/.config/opencode/skills/<skill>/SKILL.md`
- **AND** it SHALL NOT install or refresh the Claude or Codex copies

#### Scenario: User changes a saved selection

- **WHEN** a user changes selected providers and saves the new selection
- **THEN** the application SHALL immediately install or refresh only the newly
  selected providers
- **AND** subsequent startup and vault-list refreshes SHALL target only the
  saved selection

### Requirement: Provider status is actionable

The Agent Skills panel SHALL display status by provider and generated skill for
every selected provider. It SHALL distinguish setup required, current,
needs-install, and provider-specific installation failure states.

#### Scenario: One selected provider fails to install

- **WHEN** installation for one selected provider fails while another selected
  provider is current
- **THEN** the panel SHALL show the failed provider as retryable without
  reporting the current provider as failed

### Requirement: Opt-out is non-destructive

Deselecting a provider SHALL prevent future generated-skill writes for that
provider but SHALL NOT automatically delete files in that provider's global
skill directory.

#### Scenario: User deselects Codex

- **WHEN** a user deselects Codex and saves
- **THEN** later startup and vault-list refreshes SHALL NOT write beneath
  `~/.codex/skills`
- **AND** the application SHALL retain any existing files there and explain
  that they can be removed manually

### Requirement: Claude plugin freshness is selection-independent

The Claude plugin's exported-snapshot freshness SHALL be calculated from the
current canonical generated content, independently of whether Claude standalone
skills are selected or installed.

#### Scenario: Claude standalone skills are deselected

- **WHEN** Claude is not selected and a previously exported Claude plugin
  matches the current canonical generated skill content
- **THEN** the application SHALL report the plugin snapshot as current
