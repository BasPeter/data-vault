## Context

The application already receives a recursive `TreeNode[]` manifest in the sandboxed React renderer. Each `DocNode` contains `tags: string[]`, and the existing graph is selected through the top bar and represented as an `AppView` kind. The new view can therefore use already-indexed metadata without adding filesystem access, IPC, preload APIs, or another data model.

Vault metadata is untrusted input. Tags must remain plain text rendered by React, and the implementation must not parse markup or use raw HTML. The feature is intentionally visual but must communicate exact frequency without relying on font size alone.

## Goals / Non-Goals

**Goals:**

- Add a top-bar toggle for a vault-wide tag word-cloud view.
- Count distinct documents per case-insensitively normalized tag.
- Use deterministic, bounded sizing that preserves visible differences and readability.
- Keep the feature renderer-local and covered by focused unit/component tests.
- Preserve strict parsing of persisted application view state.

**Non-Goals:**

- Changing tag parsing, normalization at ingestion, or the manifest schema.
- Searching, filtering, editing, or navigating documents by clicking a tag.
- Introducing a visualization dependency, physics layout, randomness, rotation, color weighting, or user-configurable sizing.
- Adding a filesystem scan, main-process aggregation, IPC endpoint, or persisted cloud preferences.

## Decisions

### Add a dedicated persisted view kind

Extend `AppView` with `{ kind: "tag-cloud" }`, update exact stored-view parsing, and render the new view through the same mutually exclusive main-content branch as documents, graph, and dashboards. The top-bar button follows the graph toggle pattern: selecting it from another view opens the cloud; selecting it while active returns to documents.

This keeps view behavior consistent and ensures dashboard runtime cleanup remains governed by the existing view transition effects. A local modal or overlay was rejected because the user asked for a peer of the graph view and overlays would obscure rather than replace the workspace.

### Aggregate from the renderer manifest

Create a small pure helper that recursively walks the manifest, trims tag text, ignores empty values, deduplicates tags within each document case-insensitively, and increments a document count per normalized tag. Preserve the first encountered trimmed spelling as the display label and sort results by descending count, then by display label using a deterministic case-insensitive comparison.

Using `manifest.tree` matches the existing sidebar tag-search trust boundary and automatically respects document-corpus exclusions. Reusing graph data was rejected because it would add asynchronous IPC coupling and graph nodes are shaped for link visualization rather than tag aggregation.

### Use bounded linear size interpolation

Map counts to a fixed minimum and maximum font size with linear interpolation across the observed minimum and maximum counts. If all counts are equal, use one middle size for every tag. Keep sizing in a pure helper so boundary, equal-frequency, and ordering behavior can be tested without layout measurements.

Linear interpolation is predictable and dependency-free. Logarithmic scaling is unnecessary for the first version and would make exact visual expectations less obvious; an external word-cloud layout library would add production dependency and nondeterministic placement without being needed for a wrapping cloud.

### Render a semantic wrapping collection

Render tags as plain React text in a centered, wrapping collection. Each item includes an accessible label or accompanying text containing the exact document count, with correct singular/plural wording. Use CSS font size only for relative emphasis and include an explicit empty state when aggregation yields no tags.

A canvas was rejected because it would make text semantics, responsiveness, selection, and accessible counts harder. Random positions, rotation, and collision layout are excluded to keep the view readable and deterministic.

## Risks / Trade-offs

- [A single very common tag can compress differences among the rest] -> Bound the range and keep exact counts available; revisit logarithmic scaling only with evidence from real vaults.
- [Case variants have no uniquely correct display spelling] -> Preserve the first manifest spelling while merging and counting case-insensitively.
- [Very large tag vocabularies can create a long view] -> Use normal wrapping and scrolling, and compute aggregation with `useMemo` only when the manifest changes.
- [Untrusted tags could resemble markup] -> Render tag values only as React text and accessible attribute values; never inject HTML.
- [Adding a persisted view kind can invalidate old assumptions] -> Extend strict parser and safe-view tests while retaining fallback to documents for malformed or unknown data.

## Migration Plan

No vault-data migration is required. Existing stored view values remain valid; `tag-cloud` becomes one additional exact accepted value. Rollback removes the new view kind, button, and component, after which stored `tag-cloud` values safely fall back to the document view under the existing parser behavior.

## Open Questions

None for the initial proposal. Interactive filtering or navigation from a tag can be proposed separately if users need it after the overview is available.
