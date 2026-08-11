## ADDED Requirements

### Requirement: Active document is visibly selected

The application SHALL render the currently open document with a persistent selected treatment in the expanded document sidebar that is clearly distinguishable from inactive, hovered, and focused document entries.

#### Scenario: Document is opened from the sidebar

- **WHEN** a user opens a document from the expanded document sidebar
- **THEN** that document entry SHALL display the selected treatment
- **AND** the previously selected document entry SHALL no longer display it

#### Scenario: Document is opened through another navigation path

- **WHEN** the active document changes through a tab, document link, graph, URL hash, or document picker
- **THEN** the matching document entry in the expanded sidebar SHALL display the selected treatment

### Requirement: Active document is identified semantically

The application SHALL expose the selected document entry as the current document to accessibility tooling without marking inactive document entries as current.

#### Scenario: Accessibility tooling inspects the document tree

- **WHEN** a document is currently open
- **THEN** its sidebar entry SHALL be identified semantically as the current item
- **AND** all other document entries SHALL NOT be identified as current
