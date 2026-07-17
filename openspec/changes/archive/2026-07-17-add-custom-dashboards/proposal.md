## Why

Vault users need a welcoming place to turn their documents, plans, goals, and ideas into useful visual workspaces without having to understand web development. Agents can build highly tailored HTML/JavaScript dashboards, but executable vault content requires a strict isolation and permission model so that flexibility does not weaken the application's existing trust boundaries.

## What Changes

- Add a first-class dashboard area above the document tree, with large squircle launchers for opening, creating, renaming, reordering, and removing dashboards.
- Support both personal-progress dashboards, which maintain bounded dashboard-owned state, and vault-intelligence dashboards, which visualize explicitly permitted vault data.
- Store each dashboard as a portable, versionable HTML/CSS/JavaScript bundle in an explicitly owned `.data-vault/dashboards/` namespace within its vault, and refuse creation on namespace conflicts.
- Provide a simple user flow for creating a dashboard and handing its managed bundle to an agent for authoring, without requiring the user to edit manifests or source files.
- Render dashboard code in an execution surface isolated from the application renderer, Node.js, the application preload API, credentials, and unrestricted filesystem access.
- Introduce a capability-based dashboard API for bounded state persistence and approved read-only vault data, with privileged capabilities denied unless granted through user-initiated trusted application UI.
- Keep dashboard network access disabled by default and require explicit user approval for narrowly scoped remote origins if network capabilities are introduced.
- Validate dashboard metadata, paths, assets, messages, permissions, data sizes, and persisted state at the trusted boundary.
- Update generated agent guidance so agents can create dashboard bundles while respecting the dashboard directory, manifest, and permission contract.

## Capabilities

### New Capabilities

- `custom-dashboards`: Defines dashboard discovery, sidebar presentation, lifecycle, isolated execution, personal state, vault-intelligence data access, permissions, and agent authoring behavior.

### Modified Capabilities

- `architecture`: Adds dashboards as a first-class application view backed by a separate untrusted execution surface and a narrow trusted host boundary.
- `vault-format`: Adds the managed on-disk dashboard registry and bundle layout, including portable state and validation rules.
- `security`: Adds executable dashboard content to the untrusted-input model and defines isolation, capability, navigation, network, path, and message-validation requirements.

## Impact

- Renderer navigation and state in `src/App.tsx`, plus dashboard launchers in `src/components/app-sidebar.tsx`.
- New dashboard host UI and an isolated Electron execution surface that does not inherit `window.vaultApi`.
- Main-process dashboard discovery, loading, state, permission, and data-query handlers with corresponding narrow preload/host messaging.
- Vault parsing and validation for the dashboard registry, bundle paths, asset requests, symlink containment, quotas, and state files.
- Content Security Policy, protocol/navigation handling, permission prompts, and network controls.
- Agent skill generation and guidance for authoring dashboards separately from sanitized documents.
- Unit tests for metadata, path security, message validation, permissions, data scoping, and persistence; integration/end-to-end tests for dashboard lifecycle, isolation, and denial behavior.
- No new production dependency is assumed; any later dependency proposal requires separate user confirmation.
