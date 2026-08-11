## ADDED Requirements

### Requirement: Tokenized sidebar tag search

The system SHALL provide an accessibly named multi-tag search control at the top of the expanded sidebar and SHALL omit the complete control from the collapsed icon-only sidebar.

#### Scenario: Expanded sidebar displays tag search

- **WHEN** the sidebar is expanded
- **THEN** the multi-tag search control is displayed above the sidebar navigation content

#### Scenario: Collapsed sidebar omits tag search

- **WHEN** the sidebar is collapsed into its icon-only state
- **THEN** the tag-search control and search results are not displayed

#### Scenario: Input and chips use separate rows

- **WHEN** one or more query tags are committed
- **THEN** the full-width input with placeholder `Search` remains above the chips and a small vertical space separates the two rows

### Requirement: Query token entry and removal

The system SHALL represent committed query tags as removable chips, SHALL accept comma and Enter as tag separators, SHALL split pasted comma-delimited text, and MUST NOT treat spaces as separators. The system SHALL ignore empty fragments and deduplicate tokens case-insensitively.

#### Scenario: User enters comma-delimited tags

- **WHEN** the user enters `azure, security` and commits the input
- **THEN** the search contains distinct `azure` and `security` tag chips

#### Scenario: User pastes tags with a trailing comma

- **WHEN** the user pastes `azure, security,`
- **THEN** the search commits `azure` and `security` and leaves no provisional fragment

#### Scenario: User pastes into existing provisional text

- **WHEN** the input contains `proj` and the user pastes `ect, security` at the end
- **THEN** the search commits `project` and keeps `security` as the remaining provisional token without discarding existing text

#### Scenario: Tag contains spaces

- **WHEN** the user enters `automation platform` without a comma or Enter
- **THEN** the text remains one provisional query token

#### Scenario: Duplicate tag is entered

- **WHEN** the user commits a token that case-insensitively duplicates an existing chip
- **THEN** the system retains only one copy of that query token

#### Scenario: User removes a tag

- **WHEN** the user activates a chip's remove control or presses Backspace while the input is empty
- **THEN** that committed query token is removed and results are recalculated

### Requirement: Canonical tag suggestions

The system SHALL suggest unique indexed document tags that case-insensitively contain the provisional input, SHALL exclude tags already committed as exact tokens, and SHALL allow pointer and keyboard selection without adding a new search-data source.

#### Scenario: Matching suggestions are displayed

- **WHEN** the user types a non-empty provisional fragment
- **THEN** matching manifest tags are presented in an accessible suggestion list

#### Scenario: User accepts a suggestion

- **WHEN** the user highlights a suggestion and presses Enter or Tab, or activates it with a pointer
- **THEN** the suggested tag becomes a committed chip and the provisional input is cleared

#### Scenario: Tab has no highlighted suggestion

- **WHEN** no suggestion is highlighted and the user presses Tab
- **THEN** normal keyboard focus navigation moves past the combobox rather than into a suggestion option

#### Scenario: User dismisses suggestions

- **WHEN** the user presses Escape while suggestions are open
- **THEN** the suggestion list closes without clearing committed or provisional query tokens

#### Scenario: Available suggestions change

- **WHEN** the manifest or provisional input changes and the highlighted suggestion no longer exists
- **THEN** the system resets or clamps the highlight to a valid suggestion and exposes no stale active-descendant reference

### Requirement: Multi-tag matching and scoring

The system SHALL match every distinct committed or provisional query token case-insensitively as a substring of indexed document tags. The system SHALL score a document by the number of distinct query tokens matched by one or more of its tags and MUST NOT match document labels, paths, dates, or body content.

#### Scenario: Document matches every query tag

- **WHEN** three distinct query tokens are active and a document's tags match all three
- **THEN** the document receives a score of three out of three

#### Scenario: Document matches some query tags

- **WHEN** three distinct query tokens are active and a document's tags match two
- **THEN** the document receives a score of two out of three and remains in the results

#### Scenario: Duplicate values do not inflate score

- **WHEN** duplicate query tokens or duplicate document tags would match the same normalized query token
- **THEN** that query token contributes at most one point to the document score

#### Scenario: Text outside tags does not match

- **WHEN** a query token occurs in a document label, path, or body but not in any document tag
- **THEN** that token does not contribute to the document score

### Requirement: Ranked search result presentation

While at least one query token is active, the system SHALL display documents with a positive score in a flat result list. Documents matching every query token SHALL appear before partial matches; partial matches SHALL be ordered by descending score, with original manifest order as the tie-breaker.

#### Scenario: Full and partial matches are ordered without headers

- **WHEN** a multi-tag query produces documents matching all tags and documents matching only some tags
- **THEN** the full matches appear above partial matches in one uninterrupted list without visible full-match or partial-match headings

#### Scenario: Partial matches have different scores

- **WHEN** one partial result matches more distinct query tokens than another
- **THEN** the higher-scoring document appears first

#### Scenario: Results have equal scores

- **WHEN** two results in the same group have equal scores
- **THEN** they retain their relative order from the document manifest

#### Scenario: Single tag query

- **WHEN** exactly one distinct query token is active
- **THEN** matching documents are presented in one general results group without an empty partial-match group

### Requirement: Search result context and selection

Each search result SHALL display the document label, folder path when present, match score, and matched document tags. Search results SHALL preserve existing document navigation and active-document semantics.

#### Scenario: Result text remains readable within the sidebar

- **WHEN** a ranked result displays its title and secondary location or score information
- **THEN** both text lines are fully visible vertically and remain contained within the result control without overflowing the sidebar

#### Scenario: Ranked nested document is displayed

- **WHEN** a matching document is nested below one or more folders
- **THEN** its result row displays those folder labels as location context

#### Scenario: User selects a ranked result

- **WHEN** the user activates a document in the ranked result list
- **THEN** the system selects that document through the existing sidebar navigation behavior

#### Scenario: Active document is present in results

- **WHEN** the active document appears in ranked results
- **THEN** its result retains the existing active visual treatment and `aria-current="page"` semantics

### Requirement: Search reset and empty results

The system SHALL display the complete hierarchical document tree when no committed or provisional query token is active and SHALL display an accessible no-results status when active tokens match no documents.

#### Scenario: All query tokens are cleared

- **WHEN** the user removes every chip and clears the provisional input
- **THEN** the complete document tree is displayed using its normal presentation

#### Scenario: No tags match

- **WHEN** active query tokens produce no positive document score
- **THEN** the document area displays an accessible message stating that no documents match

### Requirement: Search uses the indexed document boundary

The system MUST evaluate matching, suggestions, paths, and result details only from the existing document manifest and MUST treat every displayed value as untrusted text.

#### Scenario: Non-document content is outside search data

- **WHEN** content is excluded from the document manifest by vault indexing rules
- **THEN** that content cannot appear in suggestions or ranked results

#### Scenario: Search data contains markup-like text

- **WHEN** an indexed tag, label, or folder name resembles HTML or executable content
- **THEN** the search treats the value only as text and does not interpret or execute it
