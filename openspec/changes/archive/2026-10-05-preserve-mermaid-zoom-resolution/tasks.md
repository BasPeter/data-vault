## 1. Native SVG transform layer

- [x] 1.1 Add failing Mermaid navigation tests that require an app-owned SVG content group, native transform updates for zoom/pan/reset, and no CSS transform on the root SVG.
- [x] 1.2 Update `enhanceMermaidDiagram()` to wrap Mermaid-rendered content in a trusted SVG group and apply the existing navigation state through an equivalent native SVG transform.
- [x] 1.3 Remove raster-promoting root-SVG transform styling while preserving viewport clipping, interaction cursors, accessibility, and cleanup behavior.

## 2. Print and regression behavior

- [x] 2.1 Preserve the untransformed print representation for interacted-with diagrams and add focused regression coverage for it.
- [x] 2.2 Run the narrow Mermaid navigation unit tests and the relevant Mermaid workspace end-to-end scenario.

## 3. Quality gates

- [x] 3.1 Run formatting check, lint, typecheck, and build; resolve only issues caused by this change.
- [x] 3.2 Perform a manual Chromium visual check at minimum and maximum zoom and record any platform-specific rendering caveats.
