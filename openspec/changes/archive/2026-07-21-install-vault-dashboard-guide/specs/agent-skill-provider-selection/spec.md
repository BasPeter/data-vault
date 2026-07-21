## MODIFIED Requirements

### Requirement: Users explicitly select agent-skill providers

The application SHALL present a checkbox-based Agent Skills setup for the supported Claude, Codex, and OpenCode providers. The user SHALL explicitly save a selection before the application installs or refreshes generated skills for any provider.

#### Scenario: First-time setup

- **WHEN** no valid provider selection is persisted
- **THEN** the Agent Skills panel SHALL show all supported providers as selectable and report that setup is required
- **AND** the application SHALL NOT automatically write global agent-skill files before the user saves a selection

#### Scenario: User selects OpenCode only

- **WHEN** a user selects only OpenCode and saves
- **THEN** the application SHALL install `vault-guide`, `document-reviewer`, and `vault-dashboard-guide` at `~/.config/opencode/skills/<skill>/SKILL.md`
- **AND** it SHALL NOT install or refresh the Claude or Codex copies

#### Scenario: User changes a saved selection

- **WHEN** a user changes selected providers and saves the new selection
- **THEN** the application SHALL immediately install or refresh only the newly selected providers
- **AND** subsequent startup and vault-list refreshes SHALL target only the saved selection
