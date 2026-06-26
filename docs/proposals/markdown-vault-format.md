# Proposal: configurable vault document format

Status: proposed
Author: Data Vault maintainers
Date: 2026-06-26

## Summary

Add a `format` property to `vault.json` so each vault can declare whether its
documents are HTML fragments or Markdown files:

```json
{
  "schemaVersion": 1,
  "name": "Team knowledge",
  "documentsDirectory": "documents",
  "format": "markdown"
}
```

Supported values are:

- `html` - the current behavior and the default when `format` is absent.
- `markdown` - documents use `.md` files, Markdown syntax, Markdown metadata,
  and Markdown-style links.

The application should render, index, graph, blame, and export Markdown vaults
with the same safety boundaries as HTML vaults. The vault setup flow and vault
settings should expose a format dropdown. The generated `vault-guide` and
`document-reviewer` skills should list the format for every registered vault
and teach agents which document conventions to use for each one.

## Motivation

Data Vault currently assumes every regular document is a content-only `.html`
fragment. Several existing documentation repositories are Markdown-first, so
opening them today produces an empty document tree unless the repository
contains converted `.html` files. Supporting Markdown removes that conversion
step and lets the app work with common repository documentation directly.

## Current HTML-specific assumptions

The main changes are concentrated in these areas:

- `electron/vault.ts`
  - `VaultConfig` has no `format` field.
  - `WELCOME_DOCUMENT`, `QUICK_NOTES_FILE`, and `QUICK_NOTES_HEADER` are
    hard-coded as HTML.
  - `parseMeta`, `titleFor`, and `document()` parse `<!--vault ... -->` blocks
    and `<h1>` tags.
  - `walk()`, `contentSignature()`, and `documentFile()` only accept `.html`.
  - `graph()` only scans rendered HTML anchors with `href="#..."`.
- `src/components/document-view.tsx`
  - The renderer treats `LoadedDoc.html` as already-renderable HTML and
    sanitizes it before injecting it.
  - Blame line annotation is HTML-tag based, so it will not work for Markdown
    source without a different strategy.
- `src/types.ts`, `electron/main.ts`, and `electron/preload.ts`
  - IPC types and validation do not carry a vault or document format.
- `src/components/vault-init-dialog.tsx`
  - The initial metadata setup has name, language, and structure controls, but
    no format dropdown.
- `src/components/vault-switcher.tsx`
  - Settings can update name, remote, language, and structure, but not format.
- `electron/skills.ts`
  - Generated guidance describes only content-only HTML fragments and `.html`
    naming/linking.
- Documentation and tests
  - `README.md`, `vault.example.json`, `AGENTS.md`, unit tests, and e2e tests
    describe HTML-only vaults.

## Vault contract

`vault.json` gains:

```ts
type VaultFormat = "html" | "markdown";

type VaultConfig = {
  schemaVersion?: number;
  name?: string;
  documentsDirectory?: string;
  format?: VaultFormat;
  defaultLanguage?: string;
  structure?: VaultStructure;
};
```

Rules:

- Missing or invalid `format` is treated as `html` for backwards
  compatibility.
- The app writes only valid values: `html` or `markdown`.
- A vault has one configured format. Mixed `.html` and `.md` vaults are out of
  scope for v1 because they complicate graphing, agent instructions, and
  document creation rules.
- HTML vaults keep the existing contract unchanged.
- Markdown vaults index regular `.md` files and ignore `.html` files in the
  document tree.
- `quick-notes.html` remains an app-local scratchpad in v1, even for Markdown
  vaults. It is already excluded from the manifest and graph, and keeping it
  HTML avoids changing the quick-notes editor in the first iteration.

## Markdown document shape

Use Markdown conventions rather than embedding the HTML metadata block in
Markdown documents:

````markdown
---
title: Example title
date: 2026-06-26
tags:
  - example
  - knowledge
---

# Example title

Body with an [internal link](folder/other.md).

```mermaid
graph TD
  A --> B
```
````

Recommended parser behavior:

- Parse an optional leading YAML-frontmatter-like block delimited by `---`.
- Support `title`, `date`, and `tags`.
- `tags` may be either a comma-separated string or a simple YAML list. Avoid a
  full YAML dependency unless needed; a bounded parser for these three fields is
  enough.
- Title fallback order is frontmatter `title`, first Markdown H1, then the
  humanized filename.
- Markdown Mermaid diagrams use fenced code blocks with language `mermaid`.
  Rendering converts them to `<pre class="mermaid">...</pre>` before Mermaid
  runs.

## Rendering

Add a Markdown renderer dependency such as `markdown-it`.

Recommended configuration:

- `html: false` for v1. Raw HTML embedded in Markdown should be escaped rather
  than rendered. This keeps the security model simple and avoids relying on
  sanitizer behavior for arbitrary HTML inside Markdown.
- Enable tables and standard Markdown features through the parser's normal
  preset.
- Add a fence renderer for `mermaid` that emits
  `<pre class="mermaid">...</pre>`.
- After Markdown is converted to HTML, run the existing DOMPurify sanitize step
  before insertion.

Implementation shape:

- Change `LoadedDoc` from HTML-only to format-aware:

  ```ts
  export type VaultFormat = "html" | "markdown";

  export type LoadedDoc = {
    id: string;
    title: string;
    meta: { title?: string; date?: string; tags?: string[] };
    format: VaultFormat;
    source: string;
    html?: string;
    sourceStartLine: number;
  };
  ```

- For HTML documents, `source` can be the existing content fragment and `html`
  may remain populated for compatibility during the refactor.
- For Markdown documents, `source` is the Markdown body after frontmatter. The
  renderer converts it to HTML client-side and then sanitizes.
- Alternatively, render Markdown in the main process and return sanitized-ready
  HTML. Client-side rendering is simpler with the current lazy renderer model,
  but either choice must keep DOMPurify as the final DOM insertion gate.

## Links and graph

HTML vaults keep the existing link convention:

- Internal links are hashes whose value is another document ID, for example
  `<a href="#10-knowledge/overview.html">Overview</a>`.

Markdown vaults should support natural Markdown links:

- Same-directory relative: `[Overview](overview.md)`.
- Nested relative: `[Overview](../10-knowledge/overview.md)`.
- Root-style hash IDs: `[Overview](#10-knowledge/overview.md)`.
- Optional heading fragments after the file path should be ignored when
  resolving document-to-document graph links, for example
  `overview.md#details` resolves to `overview.md`.

Required changes:

- Add a format-aware link extractor in `electron/vault.ts`.
- Normalize Markdown relative links against the source document's directory.
- Reject links that escape the documents root.
- Keep external `http(s)` links visible in rendered Markdown but exclude them
  from the document graph.
- Add click handling in `DocumentView` so Markdown relative links navigate
  within Data Vault instead of attempting browser navigation. The handler should
  resolve the clicked link to a known document ID, call the same open-document
  path used by the sidebar, and prevent the default navigation.

This requires passing a document navigation callback or document ID resolver
from `App` into `DocumentView`.

## Backend changes

`electron/vault.ts` should introduce small format helpers rather than branching
inline everywhere:

```ts
const DEFAULT_FORMAT: VaultFormat = "html";

function formatFromConfig(config: VaultConfig): VaultFormat {
  return config.format === "markdown" ? "markdown" : "html";
}

function extensionFor(format: VaultFormat): ".html" | ".md" {
  return format === "markdown" ? ".md" : ".html";
}
```

Update these operations:

1. `describe()`
   - Read and expose `format` in `VaultSummary`.
   - Default to `html` when missing.
2. `updateVault()`
   - Accept `format` and persist it through `writeConfig()`.
   - Changing format should not rename files automatically. The UI should warn
     that the document tree will show files matching the selected format.
3. `createEmpty()`
   - Either keep the existing API and create HTML vaults, or add
     `createEmpty(name, format)` and update onboarding/create dialogs. The
     second option is preferable so new Markdown vaults can be created directly.
   - For Markdown vaults, write `format: "markdown"` and create
     `documents/welcome.md`.
4. `walk()`
   - Include only files whose extension matches the configured format.
   - Use format-aware title and metadata parsing.
5. `documentFile()`
   - Validate the extension matching the configured format.
6. `document()`
   - Strip the appropriate metadata block and return `format` plus source.
7. `contentSignature()`
   - Watch files matching the configured format and `vault.json`.
8. `graph()`
   - Use the format-aware link extractor.
9. `saveDocumentPdf()`
   - PDF naming should strip `.html` or `.md`.

## IPC and types

Update shared types in `src/types.ts`:

- Add `VaultFormat`.
- Add `format: VaultFormat` to `VaultSummary`.
- Add `format?: VaultFormat` to `VaultUpdate`.
- Add `format` and `source` to `LoadedDoc`.
- Consider updating `createEmpty` to accept `{ name, format }` instead of just
  `name` to avoid argument-order churn later.

Update `electron/main.ts`:

- Add `formatArgument(value): VaultFormat`.
- Validate `VaultUpdate.format`.
- If `createEmpty` accepts format, validate that argument too.

Update `electron/preload.ts` only if the `createEmpty` signature changes.

## UI changes

### Vault setup flow

In `src/components/vault-init-dialog.tsx`, add a format dropdown beside name and
default language:

- Label: `Document format`.
- Options:
  - `HTML fragments (.html)`
  - `Markdown (.md)`
- Default:
  - Existing vault with no `format`: `html`.
  - Existing vault with `format: "markdown"`: `markdown`.

The submit payload should include `format`.

### Vault settings

In `src/components/vault-switcher.tsx`, add the same dropdown to
`VaultSettingsDialog`.

Changing format is potentially surprising because it changes which files appear
in the sidebar. Recommended UX:

- Keep it editable.
- Show helper text: `Only .html files are shown for HTML vaults; only .md files
are shown for Markdown vaults. Existing files are not converted.`
- Include `format` in `VaultUpdate` only when it differs from the current vault.

### Create empty vault

`CreateEmptyDialog` and the onboarding create form should include the same
format dropdown if `VaultService.createEmpty` is extended. Otherwise newly
created vaults remain HTML-only until changed in settings, which is less useful
for the requested workflow.

## Generated agent skills

`electron/skills.ts` should include format in each rendered vault entry and in
the skill fingerprint payload:

```md
- Document format: `markdown`
```

The `vault-guide` guidance should become format-aware:

- Resolve the target vault first.
- Use the target vault's configured format.
- For `html`, keep existing guidance: `.html` files, content-only HTML
  fragments, `<!--vault ... -->` metadata, hash document links, and
  `<pre class="mermaid">` blocks.
- For `markdown`, instruct agents to create `.md` files, use frontmatter,
  Markdown headings and links, and fenced `mermaid` blocks.
- Preserve language, structure, linking, privacy, and commit rules.

The `document-reviewer` guidance should also become format-aware:

- For `html`, keep the existing structural checks.
- For `markdown`, check frontmatter, heading/title fallback, Markdown link
  integrity, `.md` lowercase kebab-case filenames, structure placement,
  default language, and fenced Mermaid blocks.

Bump both skill versions so installed Claude/Codex skills are marked outdated.
Because `format` is included in `vaultPayload()`, changing `vault.json.format`
will also mark installed skills outdated and trigger the existing automatic
install path.

## Documentation updates

Update:

- `AGENTS.md`
  - Vault contract now includes `format`.
  - HTML and Markdown document rules.
  - Markdown rendering security notes.
- `README.md`
  - Repository examples for both formats.
  - Markdown frontmatter and links.
- `vault.example.json`
  - Include `"format": "html"` to document the default explicitly.
- Any onboarding or release notes that still describe Data Vault as HTML-only.

## Security considerations

- Keep the renderer sandboxed and keep all file access in the main process.
- Markdown source is untrusted input just like HTML fragments.
- Disable raw HTML in Markdown rendering for v1, then sanitize the rendered
  output with DOMPurify before inserting into the DOM.
- Mermaid stays at `securityLevel: "strict"`.
- Markdown relative links must be resolved against the source document and must
  not escape the configured documents directory.
- Do not allow `format` to affect path validation except for selecting the
  expected extension.
- Do not add a localhost server or any renderer filesystem access.

## Test plan

Add unit tests in `electron/vault.test.ts`:

- Missing `format` defaults to HTML and existing HTML tests still pass.
- `format: "markdown"` appears in `VaultSummary`.
- Markdown manifest includes `.md` files and ignores `.html`.
- Markdown title fallback uses frontmatter title, then H1, then filename.
- Markdown metadata parses `title`, `date`, and tags.
- `document()` rejects `.html` IDs in Markdown vaults and `.md` IDs in HTML
  vaults.
- `contentSignature()` changes for `.md` edits in Markdown vaults.
- `graph()` resolves Markdown relative links and rejects escaping links.
- `updateVault()` round-trips `format`.
- `createEmpty(..., "markdown")` creates `welcome.md` and writes
  `format: "markdown"`.

Add renderer tests or e2e coverage:

- Vault init/settings format dropdown persists to `vault.json`.
- Markdown document renders headings, paragraphs, lists, tables, links, and
  Mermaid fences.
- Clicking a Markdown relative link opens the linked document.
- PDF export still works for Markdown documents.

Add `electron/skills.test.ts` coverage:

- Vault entries include `Document format`.
- Skill fingerprints change when format changes.
- `vault-guide` contains both HTML and Markdown writing rules.
- `document-reviewer` contains both HTML and Markdown review rules.

## Implementation plan

1. Add `VaultFormat` types, config parsing, IPC validation, and persistence.
2. Make manifest, document loading, content signatures, and PDF naming
   format-aware while keeping HTML behavior unchanged.
3. Add Markdown metadata parsing, title extraction, link extraction, and graph
   support.
4. Add Markdown rendering in `DocumentView`, including Mermaid fence handling
   and sanitized insertion.
5. Add internal navigation for Markdown relative links.
6. Add format dropdowns to setup, settings, onboarding create, and create-empty
   flows.
7. Update generated skill templates and fingerprints.
8. Update documentation and examples.
9. Add unit/e2e tests and run `npm run typecheck`, `npm test`, and targeted e2e
   coverage.

## Open questions

- Should Markdown support raw embedded HTML? Recommendation: no for v1; escaped
  raw HTML is safer and simpler.
- Should `createEmpty` change from `(name: string)` to an object argument
  `{ name, format }`? Recommendation: yes, because the API is easier to extend
  later without another breaking signature change.
- Should a vault be allowed to index both `.html` and `.md`? Recommendation: no
  for v1; keep one format per vault and revisit mixed-mode later if users need
  it.
- Should changing `format` offer to convert existing files? Recommendation: no
  for v1; make the setting explicit and non-converting.
