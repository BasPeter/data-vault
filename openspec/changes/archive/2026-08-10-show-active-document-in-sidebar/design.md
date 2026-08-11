## Context

`App` already owns the active document ID and passes it to `AppSidebar`. Recursive document entries compare their node ID with that value and forward the result to `SidebarMenuButton`, whose shared active style currently uses the same accent family as hover and focus states. The state flow is therefore sufficient, but the active document is not visually prominent enough and its current-item meaning is not exposed through an accessibility attribute.

This is a renderer-only presentation change. It must remain within `src/`, preserve the existing `openDocument` navigation flow, and avoid changing the separate dashboard-selection model.

## Goals / Non-Goals

**Goals:**

- Make the active document immediately recognizable whenever the collapsible sidebar is expanded.
- Keep the indication synchronized with the existing `activeId` source of truth regardless of how a document becomes active.
- Represent the same state semantically for assistive technology.
- Verify both initial selection and selection changes with focused automated tests.

**Non-Goals:**

- Changing document navigation, tab behavior, URL handling, or dashboard selection.
- Automatically expanding document folders or changing their collapsible state.
- Showing document identity while the off-canvas sidebar itself is collapsed and hidden.
- Adding persistence, IPC, preload APIs, dependencies, or new theme tokens.

## Decisions

### Apply a document-specific selected treatment at the tree entry

The document button in `TreeItems` will continue to use `isActive={activeId === node.id}` and will add a local active-state treatment using existing sidebar theme tokens. The treatment will combine more than color alone, such as a persistent accent edge or ring plus the existing background and font emphasis, so it remains distinct from transient hover and focus states.

Keeping the enhancement local avoids strengthening every `SidebarMenuButton` active state, which could unintentionally alter folders or other sidebar consumers. Reworking the shared component was considered but rejected because this request concerns document selection only.

### Use the existing active document state

No new selection state will be introduced. All supported document navigation already converges on `App.openDocument`, which updates `activeId`; rendering directly from that value prevents state drift and keeps switching behavior deterministic.

Deriving a second sidebar-specific active ID was considered but rejected because it would duplicate state without adding behavior.

### Expose the current document with `aria-current`

The active document button will set `aria-current="page"`, while inactive entries will omit the attribute. This describes the entry as the current document-like view and is preferable to `aria-pressed`, which would imply a toggle control.

### Test the behavior at the component boundary

Focused renderer coverage will assert that exactly one matching document entry has both the active styling hook and current-item semantic state, then rerender or select another document and assert that the state moves. Existing end-to-end workspace coverage may be extended only if needed to prove integration across an existing non-sidebar navigation path.

## Risks / Trade-offs

- [The selected treatment may have insufficient contrast in one theme] → Use existing sidebar semantic tokens and verify both light and dark theme behavior during implementation.
- [A shared sidebar style change could affect unrelated controls] → Keep the visual enhancement on document tree buttons unless implementation evidence proves a shared change is required.
- [Tests could overfit Tailwind class strings] → Assert stable active-state and accessibility attributes, with only a focused assertion for the document-specific styling hook.

## Migration Plan

No data or configuration migration is required. The renderer change can be reverted independently without affecting stored vault state.

## Open Questions

None.
