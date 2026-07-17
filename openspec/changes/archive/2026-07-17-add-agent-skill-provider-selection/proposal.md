# Proposal: add-agent-skill-provider-selection

## Why

Data Vault automatically installs generated agent skills for Claude and Codex,
but users cannot choose which agent products receive those files. OpenCode
uses a different global skill root, `~/.config/opencode/skills/<name>/SKILL.md`,
and must be supported without expanding the installer into arbitrary
renderer-controlled paths.

## What Changes

1. Add OpenCode as a supported generated-skill provider at the fixed global
   root `~/.config/opencode/skills`.
2. Add an Agent Skills setup/settings control with independently selectable
   Claude, Codex, and OpenCode checkboxes and an explicit Save action.
3. Persist the selected provider IDs in trusted application data. Only selected
   providers are installed or refreshed automatically; no selection means no
   automatic external skill writes.
4. Change installer status and UI from one Claude/Codex aggregate to
   provider-aware setup and per-provider status.
5. Preserve skills already written for a provider that is later deselected;
   deselection prevents future writes but does not delete external files.
6. Update security and architecture specifications, product documentation,
   guided-tour copy, and focused unit/UI/E2E coverage.

## Capabilities

### New Capabilities

- `agent-skill-provider-selection`: Lets a user explicitly select which
  supported agent products receive generated Data Vault skills.

### Modified Capabilities

- `architecture`: Defines trusted ownership of provider preferences and
  provider-aware agent-skill status/install IPC.
- `security`: Extends the fixed installer allowlist to OpenCode and constrains
  provider selection to a trusted fixed registry.

## Impact

- Expected code: `electron/skills.ts`, a small main-process preference store,
  `electron/main.ts`, `electron/preload.ts`, `src/types.ts`, the Agent Skills
  panel, tests, README, and guided-tour copy.
- The Claude Cowork plugin remains independent: its export/freshness behavior
  continues to use its fixed Claude paths and is not an OpenCode feature.
- Classification: **risky**. This modifies the security-controlled
  filesystem-write allowlist and installation behavior. OpenSpec verification
  and independent Reviewer approval are required before acceptance.
