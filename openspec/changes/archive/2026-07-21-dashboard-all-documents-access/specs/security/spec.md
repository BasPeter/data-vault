## MODIFIED Requirements

### Requirement: Repository content cannot grant dashboard authority

Dashboard manifests MAY request fixed capability identifiers, but only trusted application state and trusted host UI SHALL grant or scope privileged capabilities, including selected-document and all-current-and-future-document scope; repository-controlled approval flags, scope modes, paths, globs, document IDs, hashes, scripts, or messages SHALL NOT grant authority.

#### Scenario: Synced dashboard declares itself approved

- **WHEN** a dashboard manifest or state file contains fields claiming a grant, selected-document scope, or all-documents scope
- **THEN** the application ignores those claims and uses only its trusted grant store

#### Scenario: Requested privileges increase

- **WHEN** a dashboard's canonical capability request changes to include additional privileged access
- **THEN** existing grants do not cover the new access and trusted host approval is required

#### Scenario: Dashboard source changes after approval

- **WHEN** any manifest, HTML, CSS, JavaScript, or protocol-served asset other than `state.json` changes after privileged approval
- **THEN** the bundle security digest changes and the application disables privileged capabilities until the user approves the new digest

### Requirement: Permission consent is host-initiated and visually isolated

Privileged dashboard consent SHALL begin only from an affirmative user action in recognizable trusted application chrome, and the dashboard view SHALL be hidden or detached, input-disabled, and unable to overlay or capture focus for the complete permission, document-scope, and document-selection flow; consent for all-documents scope SHALL explicitly state that future documents are included until the grant is changed or revoked.

#### Scenario: Permission management opens

- **WHEN** the user activates Manage access in trusted host UI
- **THEN** the application removes dashboard pixels and input from the consent surface before presenting capability details, document scope, or document selection

#### Scenario: User considers all-documents scope

- **WHEN** trusted permission UI offers all-documents access
- **THEN** it identifies the scope as covering every current and future document until changed or revoked before the user can save it

#### Scenario: Permission flow is cancelled

- **WHEN** the user cancels permission management or the dashboard repeatedly calls a denied API
- **THEN** no grant changes, no dashboard-driven prompt appears, and focus returns through trusted host lifecycle without dashboard input interception

### Requirement: Dashboard file and data access is least-privilege

Dashboard runtime operations SHALL use fixed dashboard-local state, structured vault snapshot, secret metadata, and host-mediated request APIs, SHALL enforce real-path containment and current document validation, SHALL authorize document bodies only through a trusted selected-document or explicit all-current-and-future-document scope, and SHALL never accept arbitrary filesystem paths, repository locations, raw credential values, general query expressions, or repository-supplied scope; secrets SHALL be referenced only by declared name.

#### Scenario: Dashboard attempts path injection

- **WHEN** dashboard code includes an absolute path, traversal segment, symlink escape, path-like document identifier, or unsupported query field in an API request
- **THEN** the operation is rejected before filesystem access

#### Scenario: Index response is produced

- **WHEN** a permitted dashboard requests vault intelligence
- **THEN** the result excludes absolute paths, repository remotes, Git configuration, credentials, hidden files, application settings, and unapproved document bodies and is bounded by the versioned response schema

#### Scenario: All scope reads a current document

- **WHEN** a dashboard with trusted all-documents scope requests a current valid document ID
- **THEN** the host authorizes only that bounded ID-based request and still applies containment, file validation, and response limits

#### Scenario: Dashboard supplies document scope

- **WHEN** dashboard code or repository content supplies an all-scope flag, path, glob, query, or document authorization claim
- **THEN** the application rejects or ignores it and derives effective scope only from trusted application-private grant state

#### Scenario: Dashboard supplies a raw credential

- **WHEN** dashboard code passes a literal credential value, an undeclared secret name, or a value-bearing injection field in any API request
- **THEN** the operation is rejected without network or filesystem activity
