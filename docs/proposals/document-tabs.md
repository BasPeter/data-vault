# Proposal: document tabs

Status: proposed
Author: Data Vault maintainers
Date: 2026-06-26

## Summary

Add document tabs to the main reading workspace. When a user opens a document
from the sidebar, Data Vault should open it in a tab. Opening another document
from the sidebar should add a new tab next to the current one and make it
active. Tabs are shown side by side above the document body, can be selected by
clicking them, and include close icons.

The feature should keep the current vault contract unchanged. Tabs are a
renderer navigation model over existing document IDs; the main process still
loads documents through the existing `vault:document` IPC path.

## Motivation

Data Vault currently has a single active document selection. Moving between
documents replaces that selection, which makes comparison and back-and-forth
reading slower. Tabs give users a lightweight working set:

- Keep several related documents open while exploring a vault.
- Switch between documents without losing context in the sidebar tree.
- Close documents that are no longer relevant.
- Make graph/sidebar/internal-link navigation feel predictable: navigation
  opens or focuses a document tab instead of replacing the whole workspace.

## Current behavior

The renderer centers document navigation on one `activeId` in `src/App.tsx`.
That ID is passed to:

- `AppSidebar` for active tree highlighting.
- `DocumentView` for document loading.
- `GraphView` for active-node highlighting and graph navigation.
- Header actions such as PDF export and line history.
- `location.hash` for deep-linking the selected document.

`openDocument(id)` currently sets `activeId`, updates `location.hash`, and
switches the view to `doc`.

## Goals

- Opening a document from the sidebar opens a new tab if it is not already
  open.
- Opening an already-open document focuses its existing tab instead of creating
  a duplicate.
- New tabs are inserted next to the active tab.
- The active tab controls the displayed `DocumentView`, sidebar highlight,
  graph highlight, PDF export, and line-history button.
- Tabs have close icons with accessible labels.
- Closing the active tab activates a neighboring tab.
- Closing the final tab leaves the document workspace empty.
- Switching vaults clears the open tabs for the old vault.

## Non-goals

- No multi-window support in v1.
- No split panes in v1.
- No document editing changes.
- No main-process storage or IPC changes unless persistence is added later.
- No cross-vault tab set in v1; tabs belong to the current vault only.

## UX

Place a horizontal tab strip directly below the app header and above the
document body when `view === "doc"`.

Each tab should include:

- Document title from the manifest tree.
- A close icon button.
- Active state styling.
- Tooltip/title with the full document title and document ID.

Recommended interaction:

- Sidebar document click:
  - If no tab exists for the document, create one next to the current tab and
    activate it.
  - If a tab already exists, activate it.
- Markdown internal-link click:
  - Use the same open-or-focus behavior as the sidebar.
- Graph node click:
  - Use the same open-or-focus behavior and return to the document view, unless
    we decide graph navigation should keep the graph visible. Recommendation:
    keep current behavior and switch to `doc`.
- Tab click:
  - Activate that document.
- Close icon:
  - Close only that tab.
  - If the closed tab was active, activate the tab to its right; if none exists,
    activate the tab to its left.
  - Stop propagation so clicking close does not also activate the tab.
- Middle-click on a tab:
  - Optional for v1. If included, close the tab.

The tab strip should scroll horizontally when there are many tabs. It should not
wrap, and long labels should truncate so the header and document body remain
stable.

## State model

Replace the single `activeId` source of truth with a small tab model in
`src/App.tsx`:

```ts
type DocumentTab = {
  id: string;
};

const [tabs, setTabs] = useState<DocumentTab[]>([]);
const [activeId, setActiveId] = useState<string | null>(null);
```

Keep `activeId` as the derived active document ID used by existing child
components and actions. This keeps the change smaller than passing a new tab
object through the app.

Add helpers:

```ts
function openDocumentTab(id: string): void;
function closeDocumentTab(id: string): void;
function pruneTabs(nextTree: TreeNode[]): void;
```

Behavior:

- `openDocumentTab(id)` inserts a tab immediately after the active tab when the
  document is not already open.
- If no tab is active, append the tab.
- `closeDocumentTab(id)` removes the tab and selects a neighbor if needed.
- `pruneTabs(nextTree)` removes tabs whose document IDs no longer exist after a
  vault refresh, sync, or format change.
- When all tabs are pruned, select no document. Do not automatically open the
  first document once a user has started managing tabs.

## Initial document behavior

Today the app auto-selects the first document when a vault opens. With tabs,
there are two reasonable options:

- Open the first document as the first tab on vault open.
- Start with no tabs and show the existing empty-document placeholder.

Recommendation: open the first document as the first tab for continuity with
the current app. After the user closes all tabs, keep the workspace empty until
they choose another document.

## Hash navigation

Keep the current hash behavior for deep links:

- Activating a tab updates `location.hash` to the active document ID.
- Loading a URL with a document hash should open and activate that document tab
  if the ID exists in the manifest.
- A `hashchange` should open or focus the hashed document.
- Closing the last tab should clear the hash.

Hash handling should wait until the manifest is loaded so the app can validate
the document ID against known documents.

## Components

Add a new renderer component:

```text
src/components/document-tabs.tsx
```

Suggested props:

```ts
type DocumentTabsProps = {
  tabs: Array<{ id: string; title: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};
```

`App.tsx` should build display titles from the manifest with the existing
`documentLabel()` helper. If a tab's label cannot be found during a transient
refresh, use the document ID as a fallback until pruning runs.

Use existing UI primitives and lucide icons:

- `Button` or native `button` styled consistently with the header.
- `X` for close icons.
- No card container; the tab strip is a full-width toolbar band.

## Header actions

Header actions continue to operate on the active tab:

- Save PDF exports the active tab's document.
- Line history toggles for the active tab.
- Graph button keeps using `activeId`.

When no tab is active:

- Save PDF is disabled.
- Line history is disabled.
- The document title area is empty or shows no title.

## Graph view

The graph view can keep one active document ID. Clicking a node should call the
same `openDocumentTab(id)` helper used by the sidebar. That preserves existing
navigation while ensuring graph exploration adds to the tab working set.

Open question: should clicking a graph node switch back to the document view?
Recommendation: yes for v1, matching current behavior. A later graph-specific
"focus only" interaction could keep users in the graph.

## Refresh and sync behavior

On vault manifest refresh:

- Remove tabs whose IDs no longer exist.
- Keep existing tabs in their current order when their IDs still exist.
- If the active tab was removed, activate the nearest remaining tab.
- If a document title changed, update the tab label automatically from the new
  manifest.

On vault switch:

- Clear tabs and active ID.
- Load the new manifest.
- Open the hash target if valid, otherwise open the first document as the first
  tab.

## Persistence

Recommendation for v1: keep tabs in memory only. This avoids introducing app
settings storage and keeps the feature focused.

A later iteration can persist per-vault tabs in app-local state, not in
`vault.json`, because tab state is user interface state rather than shared vault
metadata.

## Accessibility

- The tab strip should use a tablist pattern:
  - Container: `role="tablist"`.
  - Each tab select button: `role="tab"` and `aria-selected`.
  - Active tab controls the document panel.
- Close buttons should have labels like `Close <title>`.
- Keyboard support:
  - `ArrowLeft` / `ArrowRight` moves focus between tabs.
  - `Enter` or `Space` activates the focused tab.
  - `Delete` or `Backspace` closes the focused tab.
- Focus should move predictably after closing a tab.

Keyboard support can be minimal but should not trap focus or make the close
buttons unreachable.

## Security considerations

This feature should not change the security boundary:

- The renderer still handles only document IDs from the manifest.
- The main process remains the only place that reads files.
- `DocumentView` keeps sanitizing rendered HTML/Markdown.
- Tab titles come from manifest metadata and must be rendered as text, never as
  HTML.
- Do not persist tab state into vault repositories.
- Do not add new filesystem, shell, or IPC capabilities.

## Test plan

Add focused renderer tests or e2e coverage:

- Opening a sidebar document creates a tab and displays the document.
- Opening a second sidebar document creates a second tab next to the first and
  activates it.
- Clicking an existing tab switches the displayed document.
- Clicking an already-open document in the sidebar focuses its tab and does not
  duplicate it.
- Closing the active tab activates the right neighbor, then the left neighbor
  when no right neighbor exists.
- Closing the final tab shows the empty document placeholder and disables PDF
  and line-history actions.
- Markdown internal links open or focus tabs.
- Graph node navigation opens or focuses tabs.
- Switching vaults clears the prior vault's tabs.
- Manifest refresh prunes tabs for deleted documents.
- Long tab labels truncate and the tab strip scrolls without overlapping header
  controls.

Run:

```bash
npm run typecheck
npm test
npm run test:e2e
```

## Implementation plan

1. Add `DocumentTab` state and open/focus/close helpers in `src/App.tsx`.
2. Replace direct `setActiveId` document navigation with `openDocumentTab`.
3. Add `DocumentTabs` component and render it above `DocumentView` in document
   mode.
4. Wire sidebar, Markdown navigation, and graph navigation through the same tab
   opening helper.
5. Add manifest-refresh pruning and vault-switch reset behavior.
6. Preserve hash navigation by opening/focusing the hashed document after the
   manifest is available.
7. Add tests for tab creation, switching, closing, duplicate prevention, and
   refresh behavior.

## Open questions

- Should the app start a new vault with the first document already open as a
  tab, or with no tabs? Recommendation: open the first document for continuity.
- Should tab state persist across app restarts? Recommendation: no for v1.
- Should graph clicks switch back to document view? Recommendation: yes for v1.
- Should middle-click close tabs? Recommendation: optional polish after the
  core tab behavior is working.
- Should users be able to reorder tabs by drag-and-drop? Recommendation: defer.
