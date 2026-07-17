## MODIFIED Requirements

### Requirement: Agent-Skill Installer Constraints

The agent-skill installer SHALL write generated `vault-guide` and
`document-reviewer` skills only beneath the fixed provider roots
`~/.claude/skills`, `~/.codex/skills`, and
`~/.config/opencode/skills`. It SHALL write only for providers selected from a
trusted fixed allowlist.

#### Scenario: Selected-provider installer runs

- **WHEN** the installer writes a skill for a selected provider
- **THEN** it SHALL derive the target from the provider's fixed root and skill
  name, use no renderer-supplied paths, and SHALL NOT embed Data Vault app-repo
  content

#### Scenario: No providers are selected

- **WHEN** no agent-skill provider has been selected
- **THEN** the installer SHALL NOT write or refresh any global agent-skill file

#### Scenario: Provider is deselected

- **WHEN** a previously selected provider is deselected
- **THEN** the installer SHALL stop future writes for that provider and SHALL
  NOT automatically delete files in that provider's global skill directory

#### Scenario: Selected-provider refresh runs

- **WHEN** the app launches or the vault list changes after one or more
  providers are selected
- **THEN** it SHALL refresh only selected providers best-effort and SHALL NOT
  fail application startup on error
