## 1. Single-Tag Baseline Tests (Completed)

- [x] 1.1 Add focused `AppSidebar` tests that prove tag-only, trimmed, case-insensitive substring matching and exclusion of non-matching documents.
- [x] 1.2 Add recursive-tree tests that prove matching ancestor folders remain visible and expanded while empty branches are hidden.
- [x] 1.3 Add interaction and accessibility tests for the expanded/collapsed search control, empty query restoration, no-results status, filtered selection, and active-document semantics.

## 2. Single-Tag Baseline Implementation (Completed)

- [x] 2.1 Add a pure recursive tree-filter helper that evaluates only `DocNode.tags` from the supplied manifest and preserves matching ancestor folders.
- [x] 2.2 Add local query state and an accessibly named search field at the top of the expanded `AppSidebar`, keeping the full input hidden in collapsed mode.
- [x] 2.3 Render the filtered hierarchy with matching ancestors expanded, restore the normal tree for an empty query, and display the accessible no-results state for an unmatched query.
- [x] 2.4 Reuse the existing `onSelect`, active styling, and `aria-current` behavior for filtered document items without changing IPC or manifest APIs.

## 3. Verification

- [x] 3.1 Run `npx vitest run src/components/app-sidebar.test.tsx` and address failures related to the tag-search behavior.
- [x] 3.2 Run `npm run test`, `npm run lint`, `npm run format:check`, and `npm run typecheck`.
- [x] 3.3 Run `npm run build` and confirm the implementation changes only the intended renderer and test files.

## 4. Multi-Tag Ranked Search Tests

- [x] 4.1 Add focused tests for comma, Enter, and pasted token entry; spaces within tags; case-insensitive deduplication; chip removal; and empty-input Backspace behavior.
- [x] 4.2 Add accessible suggestion tests for manifest-derived options, committed-tag exclusion, pointer selection, keyboard navigation, Enter/Tab acceptance, Escape dismissal, and ordinary Tab focus behavior.
- [x] 4.3 Add ranking tests for distinct-token scoring, full-match and partial-match grouping, descending partial scores, stable manifest-order ties, provisional input, and the single-token presentation.
- [x] 4.4 Add result tests for folder paths, score and matched-tag details, no-results/reset behavior, filtered selection, active-document semantics, and markup-like values treated as text.

## 5. Multi-Tag Ranked Search Implementation

- [x] 5.1 Replace recursive search filtering with a memoized manifest-order document index containing folder paths, normalized tags, and a unique suggestion vocabulary.
- [x] 5.2 Add committed token state, provisional live input, comma/Enter/paste handling, case-insensitive deduplication, removable chips, and empty-input Backspace removal.
- [x] 5.3 Add the manifest-tag suggestion listbox with pointer selection and accessible Arrow, Enter, Tab, and Escape keyboard behavior without adding dependencies.
- [x] 5.4 Implement distinct-token scoring, full/partial grouping, descending score order, and stable manifest-order tie-breaking.
- [x] 5.5 Render flat ranked result rows with folder context, scores, matched tags, existing selection/active semantics, accessible empty state, and restoration of the normal tree when all tokens are cleared.

## 6. Ranked Search Verification

- [x] 6.1 Run `npx vitest run src/components/app-sidebar.test.tsx` and address failures related to tokenization, suggestions, ranking, and presentation.
- [x] 6.2 Run `npm run test`, `npm run lint`, `npm run format:check`, and `npm run typecheck`.
- [x] 6.3 Run `npm run build`, validate the OpenSpec change strictly, and confirm only intended feature files changed.

## 7. Search Control Layout

- [x] 7.1 Add a focused test that the placeholder is exactly `search` and committed chips render below, rather than beside, the full-width input.
- [x] 7.2 Move committed chips to a separate wrapping row below the input with compact vertical spacing while preserving token removal and suggestion behavior.

## 8. Interaction Corrections

- [x] 8.1 Add regression tests for unhighlighted Tab moving past non-tabbable suggestions, paste tokenization preserving the current value and selection range, and suggestion highlights remaining valid when options change.
- [x] 8.2 Keep suggestion options out of sequential focus, tokenize the prospective post-paste input value, and reset or clamp stale suggestion highlights.

## 9. Ranked Result Visual Corrections

- [x] 9.1 Add focused tests for the exact `Search` placeholder, absence of visible full/partial match headings, preserved ranking order, and result rows with content-driven height and constrained readable text lines.
- [x] 9.2 Update the placeholder and remove visible match-group headings without changing scoring order or accessibility.
- [x] 9.3 Fix ranked result row sizing, overflow, line-height, and text-container constraints so title and secondary information remain fully visible in the sidebar.
