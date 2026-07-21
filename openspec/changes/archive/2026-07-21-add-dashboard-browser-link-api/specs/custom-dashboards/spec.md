## ADDED Requirements

### Requirement: Dashboard authoring includes confirmed external links

The application SHALL include the fixed external-link operation and its HTTPS-only, per-request confirmation behavior in the dashboard authoring contract, and SHALL not describe it as a capability grant, popup, navigation, or unrestricted browser API.

#### Scenario: Agent receives dashboard authoring handoff

- **WHEN** the application provides dashboard authoring instructions
- **THEN** the instructions identify `dashboardApi.openExternalLink` as the only supported way to request an external link and state that each request requires user confirmation
