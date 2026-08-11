## Why

Tags are available for search but users cannot see the vocabulary and distribution of tags across a vault at a glance. A word-cloud view makes heavily used tags prominent and infrequently used tags smaller, helping users understand and navigate the vault's themes.

## What Changes

- Add a top-bar button alongside the existing graph button that toggles a vault-wide tag word-cloud view.
- Aggregate tags from the current manifest by document, treating matching tag text case-insensitively and counting a tag at most once per document.
- Scale each displayed tag between accessible minimum and maximum text sizes according to its document count, so frequently used tags appear larger without making rare tags unreadable.
- Show each tag's exact document count through visible or assistive text rather than relying on size alone.
- Define deterministic empty and tie behavior for vaults with no tags or equally frequent tags.

## Capabilities

### New Capabilities

- `tag-word-cloud`: Defines the top-bar word-cloud view, manifest-derived tag aggregation and sizing, accessible frequency communication, and empty state.

### Modified Capabilities

None.

## Impact

- Renderer view state and top-bar controls in `src/App.tsx` and `src/app-view.ts`.
- A new renderer component and focused tests for tag aggregation, sizing, accessibility, and interaction.
- Existing persisted view-state validation and tests will need to recognize the new view kind.
- No expected parser, filesystem, IPC, preload, manifest-shape, production-dependency, or persisted-vault-format changes; the renderer will derive counts from existing `DocNode.tags` in the manifest.
