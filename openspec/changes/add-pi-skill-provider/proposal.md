# Add Pi Skill Provider

## Why

Pi users cannot choose the application’s generated skills as a global Pi skill source even though Pi supports skills at a fixed global discovery root. Review also identified that the shared installer can follow symlinks out of its fixed roots; Pi support must include consistent containment hardening for every provider.

## What Changes

- Add Pi as a selectable generated agent-skill provider.
- Install every generated Data Vault skill at Pi’s fixed global root: `~/.pi/agent/skills/<skill>/SKILL.md`.
- Extend provider status, user-facing provider lists, and focused unit, UI, and end-to-end coverage for Pi.
- Preserve the selected-provider model: no selection writes nothing; deselection stops future writes without deleting existing skills.
- Reject existing symlinks or canonical paths that would cause generated-skill writes to escape any fixed provider root.
- Update the trusted provider allowlist and architecture specifications for the Pi root and symlink-safe installation.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-skill-provider-selection`: Adds Pi to the selectable providers and its fixed global installation location.
- `architecture`: Extends the trusted fixed provider registry and standalone installer behavior to Pi.
- `dashboard-authoring-guide`: Requires delivery of the canonical dashboard guide to Pi when selected.
- `security`: Extends the fixed agent-skill installer root allowlist to Pi.

## Impact

- Affected code: `electron/skills.ts`, `src/types.ts`, Agent Skills UI/copy, and installer/UI/E2E tests.
- Pi uses one fixed global root only; project-local Pi locations and the alternate `~/.agents/skills` discovery root are out of scope.
- Classification: **risky**, because the change expands the security-constrained filesystem-write allowlist and hardens its path-containment enforcement. Independent review is required before acceptance.
