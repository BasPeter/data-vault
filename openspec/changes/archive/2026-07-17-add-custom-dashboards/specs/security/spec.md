## ADDED Requirements

### Requirement: Executable dashboards remain untrusted and isolated

All dashboard manifests, assets, state, and JavaScript SHALL be treated as untrusted external vault input and SHALL execute only in a dedicated sandboxed web contents with Node.js disabled, context isolation enabled, sandboxing enabled, a non-persistent isolated session, and no application preload or `window.vaultApi`.

#### Scenario: Dashboard script inspects its environment

- **WHEN** arbitrary dashboard JavaScript executes
- **THEN** it cannot access Node.js, Electron, raw IPC, the application DOM, application cookies/storage, `window.vaultApi`, filesystem paths, Git, credentials, dialogs, child processes, or another dashboard context

#### Scenario: Normal document contains dashboard-like code

- **WHEN** an HTML or Markdown document contains scripts, styles, frames, or dashboard API lookalikes
- **THEN** the existing document sanitization policy remains in force and the document is not promoted to or executed as a dashboard

### Requirement: Dashboard IPC is fixed, authenticated, and validated

The dashboard preload SHALL expose only fixed dashboard API methods, and every main-process operation SHALL authenticate the exact sender webContents and frame, map it to one active dashboard context, validate all arguments and result bounds, and reject unknown channels, methods, capabilities, paths, and runtime identities.

#### Scenario: Main receives a valid dashboard request

- **WHEN** the authenticated active dashboard sender calls a fixed method with schema-valid bounded arguments
- **THEN** main applies that dashboard's current effective capability and returns only the specified structured result

#### Scenario: Main receives a forged or stale request

- **WHEN** a request originates from the application renderer, another frame, another dashboard, a destroyed runtime, or contains an invented method or identifier
- **THEN** main rejects it without performing the operation or revealing privileged context

### Requirement: Repository content cannot grant dashboard authority

Dashboard manifests MAY request fixed capability identifiers, but only trusted application state and trusted host UI SHALL grant or scope privileged capabilities; repository-controlled approval flags, paths, globs, document IDs, hashes, scripts, or messages SHALL NOT grant authority.

#### Scenario: Synced dashboard declares itself approved

- **WHEN** a dashboard manifest or state file contains fields claiming a grant or selected-document scope
- **THEN** the application ignores those claims and uses only its trusted grant store

#### Scenario: Requested privileges increase

- **WHEN** a dashboard's canonical capability request changes to include additional privileged access
- **THEN** existing grants do not cover the new access and trusted host approval is required

#### Scenario: Dashboard source changes after approval

- **WHEN** any manifest, HTML, CSS, JavaScript, or protocol-served asset other than `state.json` changes after privileged approval
- **THEN** the bundle security digest changes and the application disables privileged capabilities until the user approves the new digest

### Requirement: Permission consent is host-initiated and visually isolated

Privileged dashboard consent SHALL begin only from an affirmative user action in recognizable trusted application chrome, and the dashboard view SHALL be hidden or detached, input-disabled, and unable to overlay or capture focus for the complete permission and document-selection flow.

#### Scenario: Permission management opens

- **WHEN** the user activates Manage access in trusted host UI
- **THEN** the application removes dashboard pixels and input from the consent surface before presenting capability details or document selection

#### Scenario: Permission flow is cancelled

- **WHEN** the user cancels permission management or the dashboard repeatedly calls a denied API
- **THEN** no grant changes, no dashboard-driven prompt appears, and focus returns through trusted host lifecycle without dashboard input interception

### Requirement: Dashboard navigation and ambient browser authority are denied

Dashboard web contents SHALL enforce `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; child-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` without `unsafe-inline` or `unsafe-eval`, SHALL send `X-Content-Type-Options: nosniff`, SHALL allow only `text/html`, `text/css`, `text/javascript`, `application/json`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `font/woff`, and `font/woff2`, and SHALL independently deny all session requests except contained assets from the active mapped custom origin.

#### Scenario: Dashboard attempts network exfiltration

- **WHEN** dashboard code uses fetch, XHR, WebSocket, EventSource, an image/font URL, navigation, form submission, redirect, popup, or another browser mechanism to contact a remote or application origin
- **THEN** the request is blocked and no application cookie, credential, referrer, or approved vault data is transmitted

#### Scenario: Dashboard requests a device or browser permission

- **WHEN** dashboard code requests clipboard, notifications, camera, microphone, geolocation, MIDI, USB, Bluetooth, screen capture, persistent storage, or download access
- **THEN** the isolated session denies the request without displaying an operating-system permission prompt

#### Scenario: Dashboard sends an encoded asset path

- **WHEN** an asset URL contains invalid encoding, nested encoding, NULs, backslashes, absolute forms, or dot segments after exactly one percent-decoding pass
- **THEN** the protocol rejects it before MIME selection or filesystem access

### Requirement: Dashboard file and data access is least-privilege

Dashboard runtime operations SHALL use fixed dashboard-local state and structured vault snapshot APIs, SHALL enforce real-path containment and current document validation, and SHALL never accept arbitrary filesystem paths, repository locations, credentials, or general query expressions.

#### Scenario: Dashboard attempts path injection

- **WHEN** dashboard code includes an absolute path, traversal segment, symlink escape, path-like document identifier, or unsupported query field in an API request
- **THEN** the operation is rejected before filesystem access

#### Scenario: Index response is produced

- **WHEN** a permitted dashboard requests vault intelligence
- **THEN** the result excludes absolute paths, repository remotes, Git configuration, credentials, hidden files, application settings, and unapproved document bodies and is bounded by the versioned response schema

### Requirement: Dashboard resource and failure boundaries are enforced

The application SHALL run at most one dashboard runtime at a time, SHALL bound message size, state size, request arrays, response size, state-write rate, and runtime assets to 256 supported regular files, 5 MiB per file, and 25 MiB total, and SHALL destroy runtime authority on switch, close, vault change, crash, or unresponsive termination.

#### Scenario: Dashboard floods a bounded API

- **WHEN** dashboard code exceeds a message, array, response, state, or write-rate limit
- **THEN** the application rejects or truncates according to the fixed API contract without blocking the main renderer or modifying prior valid state

#### Scenario: Dashboard crashes or hangs

- **WHEN** the dashboard web contents crashes or the user stops an unresponsive dashboard
- **THEN** the application destroys its runtime and capability context, shows a host-owned recovery state, and keeps other application functions usable

#### Scenario: Bundle changes during an approved runtime

- **WHEN** source bytes change on disk after main created the immutable runtime snapshot and its grant digest
- **THEN** the changed bytes are neither served nor executed by that runtime and cannot use the old digest's grant
