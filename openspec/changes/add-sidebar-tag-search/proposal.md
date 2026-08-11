## Why

Documents can already declare frontmatter tags, but those tags are not usable for navigation. A tag search in the sidebar lets users quickly narrow the document tree without leaving their current workspace context.

## What Changes

- Add a tokenized search field at the top of the expanded sidebar for filtering documents by multiple indexed frontmatter tags.
- Let users separate tags with a comma or Enter, paste comma-delimited tags, remove tag chips, and discover existing manifest tags through keyboard-accessible suggestions.
- Keep the `Search` input at full sidebar width and render committed tag chips on a separate row below it with compact spacing.
- Match every distinct committed or provisional query token case-insensitively against tag text, using substring matching and excluding document titles and body content.
- Display one uninterrupted flat ranked result list while searching, without visible full/partial match headings: documents matching every query tag appear first, followed by partial matches ordered by the number of matched query tags and then their original manifest order.
- Show each result's folder path, match score, and matched tags so the ranking is understandable.
- Restore the complete hierarchical document tree when all query tags are removed, and show an accessible empty state when no documents match.
- Keep existing document selection and active-document semantics for filtered results.

## Capabilities

### New Capabilities

- `sidebar-document-search`: Defines tokenized multi-tag filtering and ranked sidebar results, including query entry, suggestions, scoring, grouping, result context, reset behavior, empty results, and document selection.

### Modified Capabilities

None.

## Impact

- Renderer UI and tests in `src/components/app-sidebar.tsx` and `src/components/app-sidebar.test.tsx`.
- Existing consumers and sidebar-related tests may require fixture or assertion updates if they depend on the header structure.
- No expected changes to the vault parser, manifest shape, IPC APIs, production dependencies, or persisted data because document tags are already present in `DocNode.tags`.
