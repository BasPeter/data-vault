## Why

Mermaid diagrams become pixelated and their text unreadable when users zoom in because navigation currently enlarges a browser-composited rendering of the generated SVG. Zoom must preserve the vector clarity users expect from an SVG diagram.

## What Changes

- Preserve crisp Mermaid paths and text throughout the supported zoom range.
- Replace root-SVG CSS scaling with a renderer-owned SVG content transform while retaining existing zoom, pan, reset, independent-state, accessibility, lifecycle, security, and print behavior.
- Add focused regression coverage that distinguishes native SVG content transformation from raster-prone CSS scaling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mermaid-navigation`: Require zoomed diagrams to retain vector rendering quality and readable text throughout the supported zoom range.

## Impact

- Mermaid navigation behavior in `src/lib/mermaid-navigation.ts`.
- Mermaid navigation styling in `src/index.css`.
- Unit tests in `src/lib/mermaid-navigation.test.ts` and focused browser coverage where useful.
- No public API, dependency, persisted-data, or Mermaid security-mode changes.
