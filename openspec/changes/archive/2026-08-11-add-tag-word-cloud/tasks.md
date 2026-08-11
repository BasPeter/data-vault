## 1. View State and Top-Bar Entry

- [x] 1.1 Extend `AppView`, strict stored-view parsing, and focused app-view tests with the exact `tag-cloud` view kind and document fallback behavior.
- [x] 1.2 Add an accessible pressed-state top-bar tag-cloud toggle beside the graph toggle, update the active-view title, and render the new view in the main content switch.

## 2. Tag Aggregation and Sizing

- [x] 2.1 Add pure renderer helpers that recursively aggregate non-empty manifest tags by distinct document, merge case variants while retaining a stable display label, and deterministically order the results.
- [x] 2.2 Add pure bounded font-size scaling with explicit equal-frequency behavior and unit tests covering counts, per-document deduplication, case merging, empty tags, ordering, lower/upper bounds, and equal counts.

## 3. Word-Cloud Presentation

- [x] 3.1 Implement the responsive wrapping tag-cloud component using React text rendering, bounded computed sizes, and exact accessible document-count labels with singular/plural wording.
- [x] 3.2 Add component tests for populated, equal-frequency, and no-tags states, including readable count semantics and stable rendering.

## 4. Integration Verification

- [x] 4.1 Verify graph, dashboard, document, and tag-cloud view transitions, including toggling the active tag cloud back to documents and preserving malformed stored-view fallback.
- [x] 4.2 Run the narrow relevant Vitest files, then `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`; record any skipped or failing checks before acceptance.
