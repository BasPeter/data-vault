# Design: fix-code-review-findings

## Approach

All fixes are surgical and local; no module boundaries move. The change
set is grouped into two bounded implementation tasks (main process,
renderer) so diffs stay reviewable and tests live alongside the logic
they prove, per AGENTS.md.

## Key decisions

### 1. Skill text sanitization (fix 1, 21)

Sanitize at the source of truth, `electron/vault.ts`:

- `cleanText` additionally: strip ASCII control characters (including
  `\n`, `\r`, `\t` → collapse to single spaces), then trim. This keeps
  the existing length cap and makes every structure `title`/`description`
  single-line plain text.
- `describe()` routes `config.name` through the same `cleanText` (with
  the existing cap) instead of bare `trim()`.
- In `electron/skills.ts`, `structureOutline`/`vaultEntry` additionally
  neutralize Markdown structure in interpolated values: escape backticks
  and strip leading `#`/`-`/`>` markers. Belt-and-braces: even if a new
  field is added later without cleaning, the interpolation site defends
  itself.
- `electron/main.ts` `optionalText` (IPC-side validator) applies the same
  control-character stripping so renderer-supplied structure edits are
  clean before they reach disk.

Rationale: sanitizing only at interpolation would leave dirty data on
disk; sanitizing only at parse would leave the template fragile. Both
layers are cheap.

### 2. Quick-notes draft preservation (fix 2)

Split the effect: fetching `html` stays keyed on
`[open, vaultId, version]`, but the destructive resets (`setDraft("")`,
`setEditing(false)`) run only when `open`/`vaultId` change, not on
`version` bumps. While `editing` is true, a version bump refreshes
`html` (the read-only preview state) but leaves `draft` and `editing`
untouched.

### 3. writeConfig corruption guard (fix 3)

Add a `readJsonStrict`-style path used by `writeConfig` only: if the
file exists but fails to parse, throw a descriptive error (surfaced to
the renderer as a normal IPC error) instead of merging into `{}`. The
lenient `readJson` behavior stays everywhere else (manifest building
must tolerate a broken config).

### 4. Quoted-path status parsing (fix 4, 20)

Run `git status --porcelain=v1 -z` and split on NUL. In `-z` mode paths
are never quoted and renames are `XY new\0old\0`. `parseStatusLine`
becomes `parseStatusEntries(output)` handling the NUL format; rename
entries consume two fields. Tests add a non-ASCII filename and a rename.

### 5. App.tsx races (fix 5, 8)

- Manifest effect gets the same `cancelled` cleanup guard already used in
  `document-view.tsx`.
- `requestOpenDocument` validates the incoming `vaultId` against the
  current vault list before adopting it; unknown ids are ignored (logged
  via the existing error state). The `vaults.find(...)!` assertion is
  replaced with a guarded lookup that falls back to the first vault.
- Hash decoding wrapped in try/catch; malformed hash treated as absent.

### 6. Structure editor JSON-mode save (fix 6, 12)

On Save while `mode === "json"` with unapplied text, parse/validate the
textarea content first; on success save that structure, on failure block
the save and show the existing inline error. Visual mode surfaces
duplicate/unsafe segment names via the same inline error mechanism
instead of silently dropping rows.

### 7. Graph legend (fix 7)

Delete `FOLDER_COLORS`. Assign colors by folder order from a single
palette (stable within a session); build the legend from the folders
actually present in `GraphData`.

### 8. Sanitize hardening + regression tests (fix 17, 19)

`sanitize()` central helper gains `FORBID_ATTR: ["target"]`. Both
`document-view.tsx` and `quick-notes-panel.tsx` already share the
helper in `src/lib` (verify; if inline, extract to `src/lib/sanitize.ts`
so one config exists). Add a vitest unit test (jsdom) asserting script
tags, event handlers, `javascript:` hrefs, and `target` are removed.

### 9. assertTrusted pinning (fix 18)

Track the app's `BrowserWindow`; `assertTrusted` additionally requires
`senderFrame === win.webContents.mainFrame` (fall back to current
URL-based check during window creation). Dev-mode localhost check stays.

### 10. Remaining small fixes

- Mermaid step gated on `!cancelled` (fix 9).
- `copyInstruction` gets try/catch parity with sibling copy paths
  (fix 10).
- Remote URL field: empty input clears the remote when one was
  configured, instead of being ignored (fix 11).
- Blame fetch skipped when `format !== "html"` (fix 13).
- `aria-label="Toggle theme"`; e2e updated (fix 14).
- `listRepos`: per-account try/catch keeps other accounts' results on
  transient failure; `TokenRevokedError` handling unchanged (fix 15).
- `main.ts` watcher map: remove and close watchers for vaults no longer
  in the registry on registry refresh (fix 16).
- `workspace.spec.ts` imports skill versions from `electron/skills.ts`
  instead of hardcoding (fix 23).

## Testing strategy

- Narrow first: `npx vitest run electron/vault.test.ts`, new
  `src/lib/sanitize.test.ts`, `electron/skills.test.ts`.
- Then broad: `npm run test`, `npm run typecheck`, `npm run lint`,
  `npm run format:check`.
- E2e (`npm run test:e2e`) if the environment can run Electron +
  Playwright; otherwise surface the skip explicitly (Rule 12).

## Risks

- `-z` status parsing must handle the rename two-field form correctly or
  change detection regresses — covered by new tests.
- Watcher cleanup must not close the watcher of the active vault —
  cleanup keys off the registered-vault list, not the active id.
- `assertTrusted` pinning must not break the dev-server flow — keep the
  existing URL checks as the base and add frame pinning only when the
  main window exists.
