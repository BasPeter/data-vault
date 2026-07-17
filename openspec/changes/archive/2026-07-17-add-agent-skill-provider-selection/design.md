# Design: add-agent-skill-provider-selection

## Goals and Non-Goals

### Goals

- Install the two generated skills for any explicit subset of Claude, Codex,
  and OpenCode.
- Give users a clear, accessible checkbox-based setup rather than hidden
  automatic writes.
- Keep all provider roots and writes in trusted main-process code.
- Make selection changes effective immediately and preserve best-effort refresh
  after vault changes for selected providers.

### Non-Goals

- Supporting arbitrary provider names or user-supplied installation paths.
- Deleting files outside the app when a provider is deselected.
- Adding an OpenCode plugin, MCP server, agent, or provider-specific skill
  content.
- Changing Claude Cowork plugin export semantics.

## Decisions

### 1. Use a fixed trusted provider registry

`SkillService` (or a narrowly adjacent main-process module) owns a typed,
constant registry:

| ID         | Display name | Skill root                  |
| ---------- | ------------ | --------------------------- |
| `claude`   | Claude       | `~/.claude/skills`          |
| `codex`    | Codex        | `~/.codex/skills`           |
| `opencode` | OpenCode     | `~/.config/opencode/skills` |

The registry derives paths from the trusted current home directory. Renderer
input may contain only provider IDs; main-process validation rejects unknown,
duplicate, or malformed IDs. No renderer-supplied path, skill name, or content
can influence a write.

### 2. Persist explicit provider selection in application data

Store a versioned `enabledProviders` list in an atomically written file under
Electron `userData`. Treat it as untrusted on read: accept only unique IDs in
the fixed registry and fall back to no enabled providers on invalid data.

For a fresh install and an upgrade from the old aggregate installer, default to
an empty selection and show the setup state. This honors explicit opt-in and
stops further automatic writes until the user saves a choice. Existing generated
files are left untouched. This is intentionally non-destructive; the UI should
state that deselection does not remove a prior installation.

### 3. Make status and installation provider-aware

The status response contains each provider's enabled state and the state of
both generated skills. Each enabled provider reports `current`, `needs-install`,
or `error`, plus individual skill states so the UI can explain partial results
and offer retry. Aggregate state is derived from enabled providers only:

- no enabled providers: `not-configured`;
- selected providers all current: `current`;
- a selected provider is missing/tampered/stale: `needs-install` or an existing
  equivalent recoverable status.

Install accepts no paths. It installs/refreshes only the persisted selected
providers. Saving a selection invokes the same trusted workflow immediately;
startup and vault-list changes run it only when selection is non-empty. Failure
remains best-effort and cannot fail startup.

### 4. Provide a checkbox setup in the Agent Skills panel

The existing Agent Skills panel begins with an "Install for" checkbox group
for Claude, Codex, and OpenCode and a Save button. It loads the persisted
selection through typed IPC, disables Save while the update is in progress,
and reports accessible success/error feedback. After setup, it shows status
grouped by selected provider, including the actual global root in explanatory
copy where helpful. A user can reopen the panel to change selections.

The panel differentiates `not-configured` from a failed or stale installation.
Product copy must no longer claim that skills are always installed for Claude
and Codex. The Claude plugin explainer remains separate and must not infer that
Claude is selected.

### 5. Keep Claude plugin freshness independent of standalone selection

Claude plugin export freshness represents whether the exported snapshot matches
the current canonical generated skill content; it must not depend on the
installed state of `~/.claude/skills`. The existing standalone-Claude freshness
check therefore needs to compare the persisted export fingerprint with the
current trusted canonical rendering (or an equivalent canonical fingerprint),
not with a selected provider's on-disk files. This prevents deselecting Claude
from falsely marking a still-current plugin snapshot stale.

### 6. Never delete on opt-out

Deselecting a provider only updates the trusted preference and prevents future
writes. It does not remove `SKILL.md`, markers, or parent directories, because
those paths are user-managed external state and could contain changes the app
did not create. The UI tells users they may remove prior Data Vault skill files
manually if desired.

## Security Model

- Generated skills retain existing canonical rendering, sanitization,
  fingerprints, markers, and atomic writes.
- The only permitted roots are the three literal, provider-registry-derived
  roots. OpenCode's root is specifically `~/.config/opencode/skills`.
- Provider preference is an allowlisted identifier list, never a path or
  general write capability.
- Preferences and IPC arguments are validated in main before writes.
- Tests isolate the home and user-data directories; no test writes real global
  agent directories.

## Failure Handling

- An invalid/missing preference file produces `not-configured`, not an
  implicit selection.
- A failed preference save reports a recoverable error and leaves the previous
  saved selection active.
- A provider write failure reports provider-specific status; it neither writes
  disabled providers nor prevents application startup.
- A selection change that succeeds but has one failed installation preserves
  the selection and exposes retryable status.

## Verification Strategy

1. Unit-test the fixed registry, OpenCode root mapping, preference validation,
   migration/default behavior, and atomic preference updates.
2. Unit-test enabled-only install/refresh/status, no-selection behavior,
   disabled-provider non-writes, tampering, and existing canonical content.
3. Test that Claude plugin freshness uses canonical content when Claude is
   deselected, plus IPC validation and UI checkbox/save/accessibility/status
   transitions.
4. Update E2E isolation to assert OpenCode installation and that deselection
   prevents subsequent refresh writes.
5. Run narrow tests, then `npm run test`, `npm run typecheck`, `npm run lint`,
   `npm run format:check`, and `npm run build`.
6. Run OpenSpec verification and obtain independent security/architecture
   Reviewer approval.
