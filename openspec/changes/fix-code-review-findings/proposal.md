# Proposal: fix-code-review-findings

## Why

A full-application code review (main process + renderer, reviewed against
`openspec/specs/security/spec.md`, `vault-format/spec.md`, and
`architecture/spec.md`) found one high-severity security defect, one
high-severity data-loss defect, five medium defects, a set of smaller
correctness/UX defects, and missing regression tests for hard security
constraints. This change applies all fixes. No spec requirements change;
every fix brings the implementation into compliance with the existing
specs.

## What Changes

### Blocking defects

1. **Skill prompt injection (high, security)** — `vault.json`-derived text
   (`name`, structure `title`/`description`) is interpolated verbatim into
   generated `SKILL.md` files. Harden `cleanText` (`electron/vault.ts`),
   the `name` path in `describe()`, and the IPC-side `optionalText`
   validator (`electron/main.ts`) to strip control characters/newlines and
   neutralize Markdown structure, and cap `name` length. Enforces the
   security spec's "External Input Is Untrusted".
2. **Quick-notes draft wipe (high, data loss)** — the load effect in
   `src/components/quick-notes-panel.tsx` resets `draft`/`editing` on every
   `version` bump. Preserve the draft while editing; reconcile refreshed
   `html` separately.
3. **`writeConfig` config destruction (medium, data loss)** —
   `electron/vault.ts` merges the patch into `{}` when `vault.json` exists
   but is unparsable, destroying all other fields. Distinguish missing from
   unparsable and throw on the latter.
4. **Quoted-path status parsing (medium)** — `git status --porcelain`
   output is not C-unquoted, so non-ASCII paths escape change detection.
   Use NUL-terminated output (`-z`) and parse accordingly.
5. **App.tsx races/crash (medium)** — (a) manifest fetch lacks a
   stale-response guard (vault-switch race corrupts sidebar/tabs);
   (b) `vaults.find(...)!` trusts an unvalidated `vaultId` from the
   open-document bridge event and white-screens when it is stale. Add the
   `cancelled` guard and validate/fallback the vault id.
6. **JSON-mode structure save discards pasted JSON (medium)** — footer
   Save in `src/components/vault-structure-editor.tsx` persists the last
   visual-row structure, silently dropping unapplied JSON textarea edits.
   Apply/validate the JSON on Save or block Save with the inline error.
7. **Personal vault data in graph view (medium, spec violation)** —
   `src/components/graph-view.tsx` hardcodes Dutch personal folder names in
   the color map/legend. Derive the legend from folders present in the
   graph data. Enforces vault-format spec "No Personal Vault Data".

### Non-blocking defects

8. `decodeURIComponent(location.hash)` throws on malformed escapes
   (`src/App.tsx`) — treat malformed hashes as absent.
9. Mermaid render step not gated on the effect's `cancelled` flag
   (`src/components/document-view.tsx`).
10. `copyInstruction` lacks clipboard error handling
    (`src/components/vault-changes-indicator.tsx`).
11. Clearing a configured remote URL is a silent no-op
    (`src/components/vault-switcher.tsx`). Decision: true clearing needs a
    new main-process IPC capability (out of scope for this change), so the
    renderer now blocks Save with an inline note when the field is emptied
    instead of silently ignoring it. Real clearing is deferred to a
    follow-up change that adds a clear-remote IPC.
12. Duplicate sibling segments silently dropped in the visual structure
    editor — surface inline feedback.
13. Blame spinner shown for Markdown documents that never get a gutter
    (`src/components/document-view.tsx`) — skip blame for markdown.
14. Dutch user-facing copy `aria-label="Thema wisselen"`
    (`src/components/theme-toggle.tsx`) and the e2e assertion on it —
    change to English.
15. Transient per-account failure in `listRepos` pagination blanks the
    whole repo list (`electron/github.ts`) — tolerate per-account network
    failure, keep other accounts' results.
16. Vault file watchers are never removed (`electron/main.ts`) — stop
    watching vaults that are no longer registered.
17. Strip `target` from sanitized untrusted HTML (DOMPurify
    `FORBID_ATTR: ["target"]`) so one-click window.open from hostile docs
    is removed; plain navigation is already blocked.
18. Pin `assertTrusted` to the app window's main frame
    (`electron/main.ts`) instead of accepting any `file://` frame.

### Missing tests

19. Sanitization regression test: hostile HTML fragment
    (script/`onerror`) must not survive `sanitize()`.
20. `parseStatusLine`/`changes` test with non-ASCII (quoted) paths and
    renames.
21. Tests for hardened `cleanText`/`describe` name sanitization.
22. Test for `writeConfig` throwing on unparsable `vault.json`.
23. Unbrittle `workspace.spec.ts` hardcoded skill version assertions
    (derive from `electron/skills.ts` versions).

## Impact

- Affected code: `electron/vault.ts`, `electron/skills.ts`,
  `electron/main.ts`, `electron/github.ts`, `src/App.tsx`,
  `src/components/quick-notes-panel.tsx`, `document-view.tsx`,
  `vault-structure-editor.tsx`, `vault-switcher.tsx`, `graph-view.tsx`,
  `vault-changes-indicator.tsx`, `theme-toggle.tsx`, `src/lib` sanitize
  helper, `electron/vault.test.ts`, `tests/e2e/workspace.spec.ts`.
- Affected specs: none change. Fixes 1, 7, 17, 18, 19 enforce existing
  security/vault-format requirements.
- Classification: **risky** (touches security-spec requirement areas) →
  Reviewer required before acceptance.
- No new production dependencies.
