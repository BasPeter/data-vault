# Tasks: fix-code-review-findings

## 1. Main process (electron/)

- [ ] 1.1 Harden `cleanText` in `electron/vault.ts`: strip/collapse ASCII
      control characters and newlines; route `config.name` in `describe()`
      through it (with a length cap).
- [ ] 1.2 Neutralize Markdown structure at interpolation sites in
      `electron/skills.ts` (`structureOutline`, `vaultEntry`): escape
      backticks, strip leading heading/list/quote markers.
- [ ] 1.3 Apply control-character stripping in the IPC-side `optionalText`
      validator in `electron/main.ts`.
- [ ] 1.4 `writeConfig` in `electron/vault.ts`: throw on existing-but-
      unparsable `vault.json` instead of merging into `{}`.
- [ ] 1.5 Switch `changes()` to `git status --porcelain=v1 -z`; rewrite
      `parseStatusLine` for NUL-terminated entries incl. renames.
- [ ] 1.6 `listRepos` in `electron/github.ts`: per-account failure
      tolerance; keep other accounts' results (TokenRevokedError behavior
      unchanged).
- [ ] 1.7 `electron/main.ts`: remove watchers for unregistered vaults;
      pin `assertTrusted` to the app window's main frame.
- [ ] 1.8 Tests: hardened cleanText/name (`vault.test.ts` or
      `skills.test.ts`), writeConfig-throws test, non-ASCII + rename
      status parsing tests.
- [ ] 1.9 Run `npx vitest run electron/vault.test.ts electron/skills.test.ts`
      and fix failures.

## 2. Renderer (src/) and e2e

- [ ] 2.1 `quick-notes-panel.tsx`: preserve `draft`/`editing` across
      `version` bumps; only reset on open/vault change.
- [ ] 2.2 `App.tsx`: cancelled-guard the manifest effect; validate
      `vaultId` from open-document requests; replace `vaults.find(...)!`
      with guarded lookup; try/catch hash decoding.
- [ ] 2.3 `vault-structure-editor.tsx`: JSON-mode Save applies/validates
      textarea content or blocks with inline error; visual mode surfaces
      duplicate/unsafe segment names.
- [ ] 2.4 `graph-view.tsx`: remove hardcoded personal folder color map;
      derive colors/legend from graph data.
- [ ] 2.5 Centralize `sanitize()` config with `FORBID_ATTR: ["target"]`;
      use it from document-view, quick-notes, update-button.
- [ ] 2.6 `document-view.tsx`: gate mermaid step on `!cancelled`; skip
      blame fetch/spinner for markdown format.
- [ ] 2.7 `vault-switcher.tsx`: allow clearing a configured remote URL.
- [ ] 2.8 `vault-changes-indicator.tsx`: try/catch around clipboard write.
- [ ] 2.9 `theme-toggle.tsx`: `aria-label="Toggle theme"`; update
      `tests/e2e/workspace.spec.ts` assertion.
- [ ] 2.10 New `src/lib/sanitize.test.ts` (jsdom): scripts, event
      handlers, `javascript:` hrefs, and `target` removed.
- [ ] 2.11 `workspace.spec.ts`: derive skill version assertions from
      `electron/skills.ts` exports instead of hardcoding.
- [ ] 2.12 Run new/changed unit tests and fix failures.

## 3. Verification

- [ ] 3.1 `npm run typecheck`, `npm run lint`, `npm run format:check`,
      `npm run test` all pass.
- [ ] 3.2 `npm run test:e2e` if runnable in this environment; otherwise
      record the skip and reason.
- [ ] 3.3 Verifier pass (diff vs tasks, unrelated-change check).
- [ ] 3.4 Reviewer pass (risky classification) → APPROVE required.
