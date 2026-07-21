## Why

Agents can already receive a dashboard bundle handoff, but they lack one authoritative, installable guide for safely reading, creating, and updating dashboards. The existing general vault guide contains incomplete dashboard API information, which can lead to incorrect authoring and unsafe assumptions.

## What Changes

- Add a generated and provider-installable `vault-dashboard-guide` agent skill.
- Document the supported dashboard lifecycle, bundle boundaries, manifest capabilities, local source constraints, and safe read/create/update workflow.
- Document the complete fixed dashboard API, including state, permission-scoped vault reads, secret-mediated requests, and confirmed external HTTPS links.
- Include the new skill in the exported Claude plugin and generated-skill status/freshness handling.
- Replace the dashboard-specific material in the general vault guide with a referral to the dedicated skill, preventing duplicate API contracts.

## Capabilities

### New Capabilities

- `dashboard-authoring-guide`: Provides an authoritative generated agent skill for working safely with Data Vault dashboard bundles and their fixed API.

### Modified Capabilities

- `agent-skill-provider-selection`: Install and report the `vault-dashboard-guide` alongside the existing generated skills for selected providers.
- `architecture`: Update the generated-skill module responsibility to include `vault-dashboard-guide`.
- `custom-dashboards`: Route agent dashboard authoring handoff to the dedicated guide and its safe bundle-editing workflow.
- `security`: Extend the fixed generated-skill allowlist while preserving trusted target derivation and untrusted-input boundaries.

## Impact

Changes will affect generated skill definitions and installation/status tests, the Claude plugin's fixed archive entries and stale-update prompt, dashboard authoring handoff text, and their specifications. No new production dependency or dashboard runtime API is introduced.
