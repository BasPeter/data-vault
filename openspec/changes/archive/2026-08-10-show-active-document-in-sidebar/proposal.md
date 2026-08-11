## Why

The collapsible document sidebar does not make the currently open document sufficiently obvious, so users can lose their place while navigating a vault. A clear, persistent active-document indication will keep the sidebar and document workspace visually synchronized.

## What Changes

- Give the currently open document a clear selected state in the expanded document sidebar.
- Keep the selected state synchronized when the active document changes through any supported navigation path.
- Expose the active state semantically so it is identifiable through accessibility tooling as well as visual styling.
- Add focused automated coverage for active-document indication and document switching.

## Capabilities

### New Capabilities

- `sidebar-document-selection`: Defines how the collapsible sidebar identifies the currently open document visually and semantically.

### Modified Capabilities

None.

## Impact

- Affects renderer-only sidebar presentation in `src/components/app-sidebar.tsx` and, if needed, shared sidebar button styling in `src/components/ui/sidebar.tsx`.
- Uses the existing active-document state supplied by `src/App.tsx`; no new persistence, preload, IPC, filesystem, or dependency changes are expected.
- Adds focused component and/or end-to-end assertions near the existing sidebar and workspace tests.
