## ADDED Requirements

### Requirement: Per-diagram navigation controls

The system SHALL add accessible zoom-in, zoom-out, and reset controls to every successfully rendered Mermaid diagram, and each diagram SHALL maintain interaction state independently.

#### Scenario: Multiple diagrams are rendered

- **WHEN** a document contains more than one valid Mermaid diagram
- **THEN** each rendered diagram has its own labeled zoom-in, zoom-out, and reset controls
- **AND** changing one diagram's transform does not change another diagram

#### Scenario: A zoom control is activated

- **WHEN** the user activates zoom in or zoom out for a rendered diagram
- **THEN** the diagram scales around the center of its viewport within the configured minimum and maximum scale

#### Scenario: Reset is activated

- **WHEN** the user activates reset after zooming or panning a diagram
- **THEN** the diagram returns to its initial fitted scale and position

### Requirement: Spatial navigation

The system SHALL allow a user to pan a Mermaid diagram with a primary-pointer drag or keyboard arrow keys and SHALL support modifier-wheel zoom centered on the pointer without trapping ordinary document scrolling.

#### Scenario: User drags a diagram

- **WHEN** the user starts a primary-pointer drag inside a rendered Mermaid viewport and moves the pointer
- **THEN** that diagram pans with grab and grabbing cursor feedback
- **AND** the drag remains active until release or cancellation

#### Scenario: User uses modifier-wheel zoom

- **WHEN** the user holds Control or Command and uses the wheel over a rendered Mermaid diagram
- **THEN** that diagram zooms around the pointer location within the configured scale limits
- **AND** the handled wheel event does not scroll the document

#### Scenario: User pans with the keyboard

- **WHEN** a rendered Mermaid viewport has keyboard focus and the user presses an arrow key
- **THEN** that diagram pans by a fixed increment in the corresponding direction
- **AND** other diagrams remain unchanged

#### Scenario: User scrolls without a modifier

- **WHEN** the user uses the wheel over a rendered Mermaid diagram without Control or Command
- **THEN** the diagram transform remains unchanged
- **AND** normal document scrolling remains available

### Requirement: Safe render lifecycle

The system MUST preserve sanitize-before-render ordering and Mermaid strict security mode, SHALL create interaction UI only from trusted application code after rendering, and SHALL discard interaction state and handlers when the rendered content is replaced.

#### Scenario: Untrusted Mermaid content is rendered

- **WHEN** Mermaid source from an HTML or Markdown vault document is displayed
- **THEN** the document is sanitized before Mermaid rendering
- **AND** Mermaid renders with `securityLevel: "strict"`
- **AND** navigation controls and handlers originate from application code rather than vault markup

#### Scenario: Document or theme rerenders Mermaid

- **WHEN** the active document changes or a theme change replaces rendered Mermaid output
- **THEN** obsolete interaction handlers and state no longer affect the document
- **AND** each newly rendered diagram starts at its initial fitted transform

#### Scenario: Mermaid renders overlap

- **WHEN** a document or theme rerender starts before an earlier Mermaid render has completed
- **THEN** Mermaid initialization and rendering are serialized
- **AND** only the current render generation may enhance or clean up the connected diagram nodes
- **AND** the current theme configuration is applied to the current generation

#### Scenario: A queued Mermaid render fails

- **WHEN** malformed Mermaid source causes one queued render generation to fail
- **THEN** that failure is isolated and handled for its generation
- **AND** the render queue remains usable for a subsequent valid generation

### Requirement: Accessible and printable presentation

The system SHALL expose Mermaid navigation controls to assistive technology and keyboard users, and SHALL print diagrams without interactive controls or temporary user transforms.

#### Scenario: User navigates controls by keyboard

- **WHEN** keyboard focus reaches a diagram's navigation controls
- **THEN** each control has an accessible name and can be activated using standard button keyboard behavior

#### Scenario: User reaches zoomed diagram content by keyboard

- **WHEN** keyboard focus reaches a zoomed Mermaid viewport
- **THEN** the viewport has an accessible name or instruction describing arrow-key panning
- **AND** arrow-key panning makes content beyond the clipped viewport reachable

#### Scenario: Document is printed

- **WHEN** a document containing an interacted-with Mermaid diagram is printed
- **THEN** navigation controls are not printed
- **AND** the diagram prints without the temporary screen zoom or pan transform
- **AND** the existing Mermaid print background and page-break behavior are preserved
