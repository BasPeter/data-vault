## Context

The renderer receives a recursive `TreeNode[]` manifest whose document nodes already contain normalized `tags: string[]` metadata. `AppSidebar` currently provides one scalar tag query, recursively filters the tree, and delegates document navigation through its existing `onSelect` callback.

Users need to combine several tag ideas without choosing between strict AND filtering and broad OR filtering. A ranked hybrid can keep partial matches discoverable while prioritizing documents that match every requested tag. Because global ranking conflicts with a nested folder tree, search mode needs a distinct flat result presentation with folder paths retained as context.

Vault content remains untrusted. Search must use the existing manifest rather than reading files or interpreting metadata markup in the UI.

## Goals / Non-Goals

**Goals:**

- Provide an accessible tokenized tag-search control at the top of the expanded sidebar.
- Make comma and Enter the explicit tag separators while allowing spaces inside tags.
- Suggest canonical tags already present in the manifest.
- Rank documents by the number of distinct query tokens matched and make the ranking understandable in the UI.
- Reuse the existing document selection and active-document behavior.
- Keep scoring linear over a memoized renderer-local document index.

**Non-Goals:**

- Searching document titles, paths, dates, or body content.
- Adding a global search index, filesystem scan, IPC endpoint, or persisted search state.
- Changing frontmatter parsing, tag normalization at ingestion, or the manifest data model.
- Supporting explicit boolean syntax, quoted expressions, fuzzy ranking, weighting, recent searches, or configurable ranking.

## Decisions

### Build a renderer-local searchable document index

Flatten the supplied tree in manifest order into entries containing the `DocNode`, its folder-label path, its original index, and normalized tag values. Derive the unique suggestion vocabulary from the same data. Recompute this index only when the `tree` prop changes.

This preserves the existing vault indexing and trust boundary. Main-process search and renderer-side file parsing remain unnecessary and could accidentally include content excluded by the manifest.

### Represent the query as committed chips plus provisional input

`AppSidebar` will own committed tag tokens and the current input fragment. Comma commits completed fragments, Enter commits the current fragment, and pasted comma-delimited text creates multiple chips. Paste tokenization must apply the clipboard text at the input's current selection range before splitting so existing provisional text is never discarded. Spaces never delimit tags. Empty fragments are ignored and tokens are deduplicated case-insensitively. Backspace on an empty input removes the last chip; every chip also has an accessible remove button.

The trimmed provisional fragment participates in live matching before it is committed. This preserves immediate feedback while chips make the multi-tag boundaries visible.

Keep the input on its own full-width row with the exact placeholder `Search`. Render committed chips in a separate wrapping row below the input with a small vertical gap so adding tags never reduces the input width.

### Suggest existing tags without a new dependency

While the input fragment is non-empty, show a small listbox of unique manifest tags containing that fragment and exclude already committed exact tags. Arrow keys move through suggestions; Enter, Tab, or pointer activation accepts the highlighted suggestion; Escape closes suggestions without clearing the query. The input exposes the appropriate combobox/listbox accessibility relationships. Options stay out of the sequential Tab order because focus remains on the combobox under the `aria-activedescendant` model. Clamp or reset the highlighted index whenever the available suggestions change.

A new command-palette dependency is unnecessary because the suggestion behavior is local and bounded.

### Score distinct query tokens and use stable ranking

Normalize and deduplicate committed tokens plus the provisional fragment. A query token is matched when any document tag contains that complete token case-insensitively. A document's score is the number of distinct query tokens it matches; duplicate tokens and duplicate document tags cannot inflate the score.

Include documents with a score of at least one. Put documents whose score equals the query-token count in the full-match group. Put remaining documents in the partial-match group ordered by descending score, using original manifest order as the tie-breaker. With one query token, render one general results group because every included document is a full match.

Exact-match boosting and weighted tags are excluded to keep ordering predictable.

### Use a flat result list during search

Global ranking is incompatible with preserving the folder tree as the primary ordering. While at least one committed or provisional query token exists, replace the document tree with one uninterrupted flat result list. Each row shows the document label, its folder path when present, a compact `matched/queried` score, and the matched document tags. Do not render visible headings between full and partial matches; ordering and scores communicate rank without consuming sidebar space.

Result rows must use content-driven height and constrain their inner text container to the sidebar width. The title and secondary folder/score line must have complete, readable line boxes without vertical clipping; long content may truncate horizontally but must not overflow the result control.

Clearing all tokens restores the normal recursive document tree. Search result rows keep the existing `onSelect(id)`, active styling, `data-document-active`, and `aria-current="page"` semantics.

### Keep collapsed-sidebar behavior compact

The complete token control and results remain hidden in the collapsed icon-only rail. Expanding the sidebar restores the in-memory tokens, provisional input, suggestions, and results.

## Risks / Trade-offs

- [Many documents and tags are rescored on each keystroke] -> Memoize the flattened index and keep scoring linear in documents, query tokens, and document tags.
- [Partial substring tokens can create broad matches] -> Show scores and matched tags, keep full matches first, and offer canonical tag suggestions.
- [Tab acceptance can interfere with focus navigation] -> Accept Tab only when a suggestion is actively highlighted; otherwise preserve normal focus movement.
- [Flat results remove the familiar tree during search] -> Show the folder path on each row and restore the untouched tree immediately when the query is cleared.
- [An active document can disappear when it has no matching tag] -> Preserve editor and selected-document state; search affects navigation visibility only.
- [Untrusted tag or path text could resemble markup] -> Render all values through React text nodes and accessible attributes only; never inject HTML or evaluate values.
