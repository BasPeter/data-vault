## Context

`DocumentView` sanitizes vault HTML, normalizes Markdown Mermaid fences, and then asks Mermaid to replace each `.mermaid` source block with an SVG. The surrounding document is vertically scrollable, while diagrams currently have no local viewport or navigation state. `GraphView` already demonstrates dependency-free SVG transforms, cursor-centered zooming, and pointer panning in the renderer.

The change must treat vault markup as untrusted, preserve sanitize-before-render ordering and Mermaid `securityLevel: "strict"`, work for both HTML and Markdown sources, reset safely when the document or theme causes a rerender, and leave printed diagrams unchanged.

## Goals / Non-Goals

**Goals:**

- Give each rendered Mermaid diagram independent zoom and pan state.
- Provide visible, accessible zoom-in, zoom-out, and reset controls.
- Support precise pointer interaction without hijacking ordinary document scrolling.
- Keep interaction setup renderer-local, dependency-free, and safe across rerenders.
- Preserve clean, untransformed print output.

**Non-Goals:**

- Persisting a diagram's transform across document navigation, reloads, or theme changes.
- Changing Mermaid syntax, stored vault documents, rendering configuration, or security policy.
- Adding touch gestures, minimaps, fullscreen presentation, or diagram editing.
- Refactoring `GraphView` into a shared abstraction as part of this change.

## Decisions

### Enhance Mermaid output after rendering

After `mermaid.run` completes, renderer-owned code will enhance each generated SVG with an app-created viewport and controls. No controls or event attributes will be accepted from vault content. This keeps the existing sanitization boundary intact and applies equally to HTML and normalized Markdown diagrams.

Alternative considered: rewrite Mermaid source or use Mermaid callbacks. Rejected because interaction belongs to presentation and must not alter untrusted source or Mermaid's strict configuration.

### Use local SVG transforms and pointer events

Each diagram will maintain `{ x, y, scale }` interaction state and apply it to an SVG content group or equivalent renderer-owned transform layer. Zoom buttons use a fixed step around the viewport center, modifier-wheel zoom uses the pointer location, and scale is clamped to a documented minimum and maximum. Reset restores the initial fitted transform. Panning uses pointer capture so drag tracking and cleanup stay local to the diagram rather than relying on window-level listeners. The viewport is keyboard-focusable and arrow keys pan by a fixed increment, giving keyboard users access to content moved beyond the clipped viewport.

Alternative considered: add a pan/zoom package. Rejected because the required behavior is small, a local precedent exists, and a new production dependency would add unnecessary surface area.

### Preserve document scrolling by requiring a zoom modifier

Unmodified wheel input continues to scroll the document. `Ctrl`+wheel or `Cmd`+wheel over a diagram zooms that diagram and prevents the corresponding page scroll. Visible buttons provide a discoverable non-wheel path.

Alternative considered: consume every wheel event over a diagram. Rejected because large diagrams embedded in documents would create scroll traps.

### Treat every render as a fresh interaction session

Interaction state is initialized independently for every Mermaid block after a successful render. Replacing document content or rerendering for a theme change removes the generated controls and listeners, and the new SVG starts at its fitted state.

Mermaid initialization and rendering will run through one module-level serialized queue because Mermaid configuration is a global singleton. Every queued operation isolates and reports its own rendering failure, then settles the queue so malformed untrusted Mermaid input cannot prevent later valid generations from rendering. Every document effect receives a monotonically increasing generation identifier. Queued work checks that its generation still owns the connected content before initialization and again before enhancement; obsolete generations may finish already-started Mermaid work but cannot enhance or clean up a successor's nodes. Cleanup is registered and applied only to nodes owned by the matching generation. This prevents interleaved document or theme renders from applying stale transforms, controls, or Mermaid theme configuration to the current document.

### Separate screen interaction from print presentation

Interactive controls and clipping are screen-only. Print styles hide the controls and print the Mermaid SVG without the user's temporary transform, preserving the existing white background and page-break behavior.

## Risks / Trade-offs

- [Pointer or wheel handling interferes with document navigation] → Leave unmodified wheel events untouched, use pointer capture only after a primary-button drag starts inside a diagram, and test surrounding document scroll behavior.
- [Enhancement weakens the untrusted-content boundary] → Create all controls after sanitization, never execute markup-provided handlers, and keep `securityLevel: "strict"` unchanged.
- [Theme/document rerenders leak listeners or apply stale state] → Keep listeners diagram-local, provide explicit lifecycle cleanup where needed, and guard asynchronous completion against obsolete effects.
- [Concurrent Mermaid initialization crosses theme configuration] → Serialize global Mermaid initialize/run operations and require generation ownership checks before rendering, enhancement, and cleanup.
- [Malformed Mermaid input rejects the shared queue] → Catch failures per queued operation, preserve existing render error handling, and settle the queue before accepting the next generation.
- [Transforms clip labels or make content unreachable] → Use a dedicated overflow-hidden viewport, cursor-centered zoom math, explicit scale limits, and a reset-to-fit control.
- [Interactive transforms degrade printing] → Hide controls and restore an untransformed printable diagram in print CSS.
- [Small synthetic fixture does not exercise meaningful pan distance] → Extend or add a synthetic dense Mermaid fixture for interaction coverage without using personal vault content.

## Migration Plan

No data migration is required. Ship the renderer and CSS changes together. Rollback consists of removing the post-render enhancement and related styles; stored vault content remains compatible.

## Open Questions

None. Exact scale bounds and zoom increment can follow the established `GraphView` behavior unless usability testing shows the document viewport needs tighter limits.
