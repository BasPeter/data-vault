# Tag Word Cloud Spec

## Purpose

Defines the vault-wide tag word-cloud view, including tag frequency aggregation, deterministic sizing, accessibility, and empty-state behavior.

## Requirements

### Requirement: Tag cloud is available from the top bar

The application SHALL provide a top-bar button alongside the graph button that toggles between the tag word-cloud view and the document view, and SHALL expose the button's purpose and pressed state to assistive technology.

#### Scenario: User opens the tag cloud

- **WHEN** the user activates the tag-cloud button from a document, graph, or dashboard view
- **THEN** the application shows the tag word-cloud view for the current vault
- **AND** the button communicates that the view is active

#### Scenario: User closes the tag cloud

- **WHEN** the user activates the active tag-cloud button
- **THEN** the application returns to the document view

### Requirement: Cloud frequencies represent document usage

The tag word cloud SHALL derive its data from the current vault manifest and SHALL count the number of distinct documents that use each tag. Tag identity SHALL be compared case-insensitively, and duplicate occurrences of the same tag within one document SHALL count once.

#### Scenario: Tags have different document frequencies

- **WHEN** one normalized tag occurs in more documents than another normalized tag
- **THEN** the more frequent tag is rendered larger than the less frequent tag
- **AND** each tag exposes its exact document count

#### Scenario: Tags differ only by letter case

- **WHEN** documents contain tag values that differ only by letter case
- **THEN** the cloud represents them as one tag with one combined document count

#### Scenario: A document repeats a tag

- **WHEN** one document contains the same normalized tag more than once
- **THEN** that document contributes exactly one use to the tag's count

### Requirement: Tag sizing is deterministic and readable

The tag word cloud SHALL map frequencies deterministically to a bounded font-size range, SHALL keep the least frequent tag readable, and SHALL render equally frequent tags at the same size. The cloud SHALL order tags deterministically when their counts are equal.

#### Scenario: All tags have equal frequency

- **WHEN** every tag in the current vault has the same document count
- **THEN** every tag is rendered at the same readable size
- **AND** the ordering is stable across renders

#### Scenario: Frequency range is wide

- **WHEN** the most-used and least-used tags have substantially different document counts
- **THEN** every tag remains within the defined minimum and maximum font sizes

### Requirement: Frequency is not communicated by size alone

The tag word cloud SHALL make each tag's exact document count available in text or an accessible name, so users do not need to infer frequency only from visual size.

#### Scenario: Assistive technology reads a tag

- **WHEN** assistive technology encounters a tag in the cloud
- **THEN** it can determine the tag text and the number of documents using it

### Requirement: Empty vaults have an explicit tag-cloud state

The tag word-cloud view SHALL show an accessible empty state when the current manifest contains no non-empty tags.

#### Scenario: No documents have tags

- **WHEN** the tag word-cloud view opens and the current manifest contains no non-empty tags
- **THEN** the application explains that the vault has no tags to display
