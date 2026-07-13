## Why

Large Mermaid diagrams are difficult to inspect because they are rendered at a fixed scale inside the document. Readers need local navigation controls so they can examine dense diagrams without changing the zoom level or scroll position of the whole application.

## What Changes

- Add zoom-in, zoom-out, and reset controls to every rendered Mermaid diagram.
- Allow users to pan a zoomed diagram by dragging it within its own viewport.
- Support cursor-centered zooming while preserving normal document scrolling.
- Expose accessible control labels and clear grab/grabbing cursor feedback.
- Reset diagram navigation when Mermaid rerenders, and keep printed diagrams free of controls and interactive transforms.

## Capabilities

### New Capabilities

- `mermaid-navigation`: Interactive zoom, pan, reset, accessibility, lifecycle, and print behavior for rendered Mermaid diagrams.

### Modified Capabilities

None.

## Impact

- Renderer document presentation in `src/components/document-view.tsx` and Mermaid styling in `src/index.css`.
- Renderer-side automated coverage for Mermaid controls and interactions, using synthetic vault fixtures.
- No storage-format, preload, IPC, main-process, or external API changes.
- No new production dependency is expected; existing React/UI primitives and local graph interaction patterns are sufficient.
- Existing sanitize-before-render ordering and Mermaid `securityLevel: "strict"` remain hard constraints.
