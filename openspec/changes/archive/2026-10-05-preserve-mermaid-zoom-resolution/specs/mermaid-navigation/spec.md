## ADDED Requirements

### Requirement: Resolution-independent Mermaid zoom

The system SHALL render Mermaid diagram paths and text as vector content throughout the supported zoom range and MUST NOT implement zoom by enlarging a rasterized or raster-prone root-diagram layer.

#### Scenario: User zooms into a Mermaid diagram

- **WHEN** the user increases a rendered Mermaid diagram's zoom level up to the configured maximum
- **THEN** the diagram's paths and text are rendered from vector geometry at the displayed scale
- **AND** labels remain as sharp and readable as the display and source diagram permit

#### Scenario: User pans or resets a zoomed diagram

- **WHEN** the user pans or resets a zoomed Mermaid diagram
- **THEN** the native vector content transform reflects the current navigation state
- **AND** the root diagram is not enlarged using a CSS transform
