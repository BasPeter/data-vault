## MODIFIED Requirements

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
