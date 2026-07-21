## MODIFIED Requirements

### Requirement: Dashboard creation supports agent authoring

The application SHALL offer a minimal creation flow using title, icon, colour, and optional starting purpose, and SHALL provide an agent handoff that identifies the managed bundle and the `vault-dashboard-guide` authoring contract.

#### Scenario: User hands a new dashboard to an agent

- **WHEN** the user completes dashboard creation and chooses the agent handoff
- **THEN** the application provides instructions for editing that bundle with local HTML, CSS, JavaScript, and assets while using only declared host capabilities and refers the agent to `vault-dashboard-guide` for the complete workflow and API contract

#### Scenario: Agent changes requested capabilities

- **WHEN** an agent edits a dashboard manifest to request additional vault access
- **THEN** the application keeps the new access disabled until the user grants it through trusted application UI
