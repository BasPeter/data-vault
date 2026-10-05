## Context

Mermaid produces an SVG, but `enhanceMermaidDiagram()` currently pans and zooms by applying a CSS `translate(...) scale(...)` transform to the root SVG. The root also uses `will-change: transform`, which encourages Chromium to promote and cache it as a composited raster layer. Zooming can therefore enlarge cached pixels instead of repainting vector paths and text at the displayed resolution.

The existing interaction state (`x`, `y`, and `scale`), input behavior, cleanup, strict Mermaid security mode, and print rules are established and should remain unchanged. An archived navigation design already identified a renderer-owned SVG content group as an acceptable transform layer.

## Goals / Non-Goals

**Goals:**

- Keep Mermaid paths and text crisp throughout the supported zoom range.
- Preserve the existing pan, center-based zoom, pointer-based zoom, reset, independent-state, accessibility, cleanup, and print contracts.
- Make the rendering mechanism testable without relying on subjective screenshot comparison.

**Non-Goals:**

- Changing Mermaid syntax, configuration, security mode, or diagram layout.
- Increasing the maximum zoom level or redesigning the navigation controls.
- Refactoring the separate Graph View SVG implementation.
- Adding a dependency or canvas-based renderer.

## Decisions

### Transform an app-owned SVG content group

After Mermaid has rendered, the enhancer will create a trusted SVG `<g>` element, move the generated root SVG's renderable child nodes into it, and apply the navigation translation and scale with the group's native SVG `transform` attribute. The root SVG remains the viewport/layout boundary and receives no CSS transform.

This keeps geometry and text in SVG coordinate space so Chromium repaints vector content at the requested display scale. It also preserves the current state and event-coordinate calculations, limiting the behavioral change to the transform target.

Alternatives considered:

- Remove only `will-change`: this may reduce layer caching but leaves rendering quality dependent on Chromium's CSS-transform compositing heuristics.
- Increase an SVG or canvas backing resolution on every zoom: this adds rerendering cost and complexity even though Mermaid already supplies vector output.
- Rerun Mermaid after every zoom: this is expensive, can change layout, and would complicate interaction state and render serialization.

### Keep navigation state on the root SVG

Existing diagnostic data attributes for scale and position remain on the root SVG. Controls, pointer and keyboard handlers, cleanup ownership, and reset calculations continue to use the same state model. Tests will additionally assert that the native content-group transform changes and the root has no CSS transform.

### Preserve print behavior explicitly

Screen transforms will be applied only to the content group. Existing print rules or cleanup must ensure the group prints at its untransformed state while controls remain hidden, preserving the current printable-presentation requirement.

## Risks / Trade-offs

- [Moving Mermaid-generated children could accidentally move non-renderable metadata or alter references] → Define the wrapper operation narrowly, preserve child order and namespace, and cover representative text/path/marker output in tests.
- [Existing transform math may use CSS transform ordering semantics] → Match the current translation/scale order with an equivalent SVG transform and retain center/pointer zoom regression tests.
- [Print CSS cannot override an SVG presentation attribute as conveniently as a CSS transform] → Add an explicit print-safe mechanism and browser coverage for the untransformed print representation where practical.
- [JSDOM cannot assess actual visual sharpness] → Test the structural invariant that prevents raster enlargement, then use focused Playwright coverage for zoom behavior; manual visual verification remains a supplementary check.
