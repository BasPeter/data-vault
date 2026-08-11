## 1. Focused Test Coverage

- [x] 1.1 Add renderer coverage for `AppSidebar` proving that exactly the entry matching `activeId` has the active-state hook and `aria-current="page"`, while inactive entries do not.
- [x] 1.2 Add renderer coverage proving that changing `activeId` moves both the visual and semantic current state to the newly active document.
- [x] 1.3 Extend the existing workspace end-to-end coverage to assert that activating a document through an existing non-sidebar navigation path updates the matching sidebar entry.

## 2. Active Document Indication

- [x] 2.1 Add a document-specific selected treatment in `TreeItems` using existing sidebar theme tokens and at least one persistent non-color cue, without changing unrelated `SidebarMenuButton` consumers.
- [x] 2.2 Set `aria-current="page"` only on the document entry whose ID matches `activeId`, preserving the existing `isActive` and `onSelect` behavior.

## 3. Verification

- [x] 3.1 Run the narrow Vitest target for the sidebar renderer coverage and the relevant Playwright workspace test.
- [x] 3.2 Verify the expanded sidebar selected treatment is distinct from inactive, hover, and focus states in both light and dark themes.
- [x] 3.3 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build`.
