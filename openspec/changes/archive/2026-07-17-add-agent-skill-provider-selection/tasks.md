# Tasks: add-agent-skill-provider-selection

## 1. Provider model and trusted preferences

- [x] 1.1 Add the fixed Claude, Codex, and OpenCode provider registry and
      provider-aware skill status types without accepting filesystem paths.
- [x] 1.2 Add a versioned, validated, atomic main-process provider-preference
      store under `userData`; invalid/legacy absent state defaults to no
      providers selected.
- [x] 1.3 Add focused tests for root mapping, OpenCode's exact global root,
      preference validation, atomicity, and no-selection behavior.

## 2. Provider-aware installation and IPC

- [x] 2.1 Refactor `SkillService` status/install/refresh to operate only on
      enabled registry providers while reusing canonical rendering and markers.
- [x] 2.2 Install immediately after a successful saved selection and refresh
      only enabled providers on startup and vault-list changes.
- [x] 2.3 Add validated typed IPC for reading/updating provider selection and
      provider-aware status; update preload and renderer types.
- [x] 2.4 Test selected-only writes, OpenCode output paths, opt-out
      non-writes, provider-specific partial errors, tampering, and IPC
      validation.
- [x] 2.5 Decouple Claude plugin freshness from the installed standalone Claude
      files and test that deselecting Claude does not make a matching exported
      snapshot stale.

## 3. User experience and documentation

- [x] 3.1 Add an accessible Claude/Codex/OpenCode checkbox group and explicit
      Save action to the Agent Skills panel, with setup/current/error states.
- [x] 3.2 Present status grouped by enabled provider and explain that opt-out
      prevents future writes without deleting earlier files.
- [x] 3.3 Keep Claude Cowork plugin controls independent of provider selection.
- [x] 3.4 Update panel tests, README, guided-tour copy, and E2E setup/assertions.

## 4. Specs, verification, and review

- [x] 4.1 Apply approved architecture and security spec deltas, including the
      three-root fixed allowlist, provider-ID validation, and provider-selection
      capability requirements.
- [x] 4.2 Run relevant narrow tests and fix failures.
- [x] 4.3 Run `npm run test`, `npm run typecheck`, `npm run lint`,
      `npm run format:check`, and `npm run build`.
- [x] 4.4 Run OpenSpec verification and resolve mismatches.
- [x] 4.5 Obtain independent Reviewer approval for filesystem boundaries,
      preference persistence, IPC validation, and test intent.
