# Architecture Delta

## ADDED Requirements

### Requirement: Main process owns agent extension generation and writes

The Electron main process SHALL exclusively render, validate, install, and
export generated agent extensions. The renderer SHALL access these operations
only through narrow typed preload APIs and SHALL NOT supply generated content,
manifest data, archive entries, or internal archive paths.

#### Scenario: Renderer requests Claude plugin export

- **WHEN** the renderer invokes the plugin-export API
- **THEN** the main process selects the output through a native save dialog
- **AND** renders and validates the fixed plugin contents
- **AND** writes the archive without exposing general filesystem access

#### Scenario: Existing standalone installation

- **WHEN** standalone Claude or Codex skill installation runs
- **THEN** the existing fixed-root installation behavior remains unchanged
