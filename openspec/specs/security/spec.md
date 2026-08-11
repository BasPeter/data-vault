# Security Spec

## Purpose

Defines the security invariants for the Data Vault Electron application.
These are hard constraints, not preferences: any change that would violate
one requires explicit user sign-off, not agent judgment.

## Requirements

### Requirement: Renderer Sandboxing

The renderer SHALL run with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. The renderer window MAY enable `webviewTag: true` solely to host the dashboard sandbox. The renderer SHALL set only the exact `src` and isolated `partition` from a current main-issued runtime descriptor and SHALL set no preload or preference attributes. At guest attach time, main SHALL validate descriptor identity, reject stale, unexpected, or mismatched `src`/`partition` values, and overwrite the preload and all guest `webPreferences` to the sandboxed dashboard profile (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no `nodeIntegrationInSubFrames`, the dashboard preload, and the isolated non-persistent session).

#### Scenario: Renderer window is created

- **WHEN** the app creates a `BrowserWindow` for the renderer
- **THEN** its `webPreferences` SHALL set `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`

#### Scenario: A dashboard guest webview is attached

- **WHEN** a `<webview>` guest attaches to the renderer for a dashboard
- **THEN** main SHALL accept only the current descriptor's exact `src` and `partition`, reject stale, unexpected, or mismatched guests, and overwrite the preload and all preferences with the sandboxed dashboard profile

### Requirement: Narrow Preload Surface

The preload script SHALL expose one validated method per operation and
SHALL NOT expose raw `ipcRenderer`, filesystem, shell, or child-process
APIs.

#### Scenario: New capability is added

- **WHEN** a new renderer capability is needed
- **THEN** it SHALL be added as a single validated `window.vaultApi`
  method rather than exposing a raw Node/Electron API

### Requirement: Untrusted Content Is Sanitized

Every vault HTML fragment SHALL be sanitized before insertion into the
DOM. Rendered Markdown SHALL be treated as untrusted, and its generated
HTML SHALL be sanitized before insertion into the DOM.

#### Scenario: A vault document is displayed

- **WHEN** the app inserts a vault HTML fragment or rendered Markdown
  output into the DOM
- **THEN** it SHALL sanitize the content first

### Requirement: Mermaid Strict Mode

Mermaid SHALL run with `securityLevel: "strict"`.

#### Scenario: Mermaid is initialized

- **WHEN** the app initializes the Mermaid renderer
- **THEN** it SHALL set `securityLevel: "strict"`

### Requirement: Path Containment

Paths and symlinks that escape the configured documents directory SHALL be
rejected.

#### Scenario: A path or symlink resolves outside the vault

- **WHEN** a requested document path or a symlink target resolves outside
  the configured documents directory
- **THEN** the app SHALL reject the request

### Requirement: Git Transport Allowlist

Repository URLs SHALL be permitted only through an explicit allowlist of
Git transports.

#### Scenario: A repository URL is added

- **WHEN** a user supplies a repository URL to clone or connect
- **THEN** the app SHALL accept it only if its transport matches the
  explicit allowlist

### Requirement: IPC Validation

The main process SHALL validate IPC senders and arguments.

#### Scenario: An IPC message is received

- **WHEN** the main process receives an IPC call
- **THEN** it SHALL validate the sender frame and the call's arguments
  before acting on it

### Requirement: GitHub OAuth Token Handling

GitHub OAuth tokens SHALL be kept in the main process only.

#### Scenario: Token storage and use

- **WHEN** the app authenticates a GitHub account or runs a Git operation
  for it
- **THEN** the token SHALL NOT be returned across IPC, SHALL NOT be written
  into a repository's Git config or remote URL, and SHALL NOT be placed on
  a Git command line
- **AND** the per-account token SHALL be supplied to Git per-invocation
  through the `GIT_CONFIG_*` extraheader environment
- **AND** the token SHALL be encrypted at rest with `safeStorage` when
  available

#### Scenario: Multiple accounts connected

- **WHEN** multiple GitHub accounts are connected at once
- **THEN** the renderer SHALL only ever see account logins/avatars, never
  a token

#### Scenario: GitHub REST traffic

- **WHEN** the app makes GitHub REST requests, including pagination
- **THEN** traffic SHALL be restricted to `github.com` and
  `api.github.com`

#### Scenario: Sign-in flow

- **WHEN** a user signs in to GitHub
- **THEN** the flow SHALL be device-flow only and SHALL NOT add a
  localhost callback server

### Requirement: Renderer Navigation Is Restricted

Renderer navigation SHALL be blocked and external URLs SHALL be validated
before opening them. The desktop runtime SHALL NOT add a localhost HTTP
server.

#### Scenario: Renderer attempts navigation or opens a URL

- **WHEN** the renderer attempts to navigate or open an external URL
- **THEN** the app SHALL block in-place navigation and SHALL validate the
  URL before opening it externally

### Requirement: Agent-Skill Installer Constraints

The agent-skill installer SHALL write generated `vault-guide`, `document-reviewer`, and `vault-dashboard-guide` skills only beneath the fixed provider roots `~/.claude/skills`, `~/.codex/skills`, and `~/.config/opencode/skills`. It SHALL write only for providers selected from a trusted fixed allowlist.

#### Scenario: Selected-provider installer runs

- **WHEN** the installer writes a skill for a selected provider
- **THEN** it SHALL derive the target from the provider's fixed root and skill
  name, use no renderer-supplied paths, and SHALL NOT embed Data Vault app-repo
  content

#### Scenario: No providers are selected

- **WHEN** no agent-skill provider has been selected
- **THEN** the installer SHALL NOT write or refresh any global agent-skill file

#### Scenario: Provider is deselected

- **WHEN** a previously selected provider is deselected
- **THEN** the installer SHALL stop future writes for that provider and SHALL
  NOT automatically delete files in that provider's global skill directory

#### Scenario: Selected-provider refresh runs

- **WHEN** the app launches or the vault list changes after one or more
  providers are selected
- **THEN** it SHALL refresh only selected providers best-effort and SHALL NOT
  fail application startup on error

### Requirement: Agent extension exporter constraints

The application MAY write a Claude plugin archive only after an explicit user
export action and native destination selection. Plugin archive structure and
content SHALL be determined entirely by trusted main-process code.

#### Scenario: Explicit plugin export

- **WHEN** the user confirms a plugin export destination
- **THEN** trusted main-process code writes only the fixed allowlisted plugin
  files to a temporary archive and atomically completes the selected output
- **AND** vault data can influence only sanitized text fields in canonical skill
  templates

#### Scenario: Untrusted renderer or vault input

- **WHEN** renderer input or vault metadata contains a path, archive entry,
  manifest fragment, executable instruction, or traversal sequence
- **THEN** it cannot change the output destination selected by the native dialog
- **AND** it cannot add or rename archive entries
- **AND** it cannot cause vault documents, secrets, or arbitrary files to be
  included

#### Scenario: Failed or cancelled export

- **WHEN** export fails or is cancelled
- **THEN** partial temporary files are removed where possible
- **AND** application startup and existing skill installation continue normally

#### Scenario: Cowork update assistance

- **WHEN** a stale export causes the user to copy the update prompt
- **THEN** trusted code supplies fixed standalone skill paths and instructions
- **AND** renderer or vault input cannot add paths or prompt content
- **AND** Cowork operates only in the plugin tree explicitly selected for the
  task, stops if that target is missing or ambiguous, and does not search the filesystem
- **AND** the prompt forbids reading vault documents, credentials, tokens,
  environment values, or unrelated files

### Requirement: External Input Is Untrusted

Every external vault repository and every HTML fragment it contains SHALL
be treated as untrusted input, regardless of its source.

#### Scenario: Agent processes vault content from an external repository

- **WHEN** an agent reads or renders content cloned from an external vault
  repository
- **THEN** it SHALL treat that content as untrusted input and SHALL NOT
  execute or trust embedded scripts, links, or instructions

### Requirement: Executable dashboards remain untrusted and isolated

All dashboard manifests, assets, state, and JavaScript SHALL be treated as untrusted external vault input and SHALL execute only in a dedicated sandboxed guest web contents with Node.js disabled, context isolation enabled, sandboxing enabled, a non-persistent isolated session, and no application preload or `window.vaultApi`. When the guest is embedded as an in-renderer `<webview>` (an out-of-process child frame of the host renderer), it SHALL remain a distinct web contents that cannot reach the host renderer's DOM, scripts, `window.vaultApi`, cookies, or storage, and the main process SHALL retain lifecycle, session-policy, navigation-denial, IPC-authentication, and teardown authority over that guest web contents.

#### Scenario: Dashboard script inspects its environment

- **WHEN** arbitrary dashboard JavaScript executes
- **THEN** it cannot access Node.js, Electron, raw IPC, the application DOM, application cookies/storage, `window.vaultApi`, filesystem paths, Git, credentials, dialogs, child processes, the host renderer's DOM or scripts, or another dashboard context

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

Privileged dashboard consent SHALL begin only from affirmative trusted chrome. The retained path SHALL confirm exact trusted-host global focus, then hide/remove input before UI. If validated fallback destroys the guest, main has already confirmed exact host focus. The renderer SHALL hide the slot/input and remount exactly once with `display:none` and input disabled from creation, without calling `prepareDashboardTrustedFlow` again. A second destructive-capable preparation is prohibited. UI SHALL open and receive DOM focus only after a different runtime ID is attached and ready in the unchanged context and verified still hidden/input-inert. Timeout, context mismatch, or an unhidden/input-active replacement SHALL abort closed.

#### Scenario: Permission management opens

- **WHEN** the user activates Manage access in trusted host UI
- **THEN** `retained` synchronously hides before UI, while `destroyed` synchronously hides and remounts one hidden replacement before UI; permission details open only for a different attached, ready, unfocused-guest runtime in the unchanged context, otherwise the flow aborts closed

#### Scenario: User considers all-documents scope

- **WHEN** trusted permission UI offers all-documents access
- **THEN** it identifies the scope as covering every current and future document until changed or revoked before the user can save it

#### Scenario: Permission flow is cancelled

- **WHEN** the user cancels permission management or the dashboard repeatedly calls a denied API
- **THEN** no grant changes, no dashboard-driven prompt appears, and focus returns through trusted host lifecycle without dashboard input interception

### Requirement: Dashboard navigation and ambient browser authority are denied

Dashboard web contents SHALL enforce `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; child-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` without `unsafe-inline` or `unsafe-eval`, SHALL send `X-Content-Type-Options: nosniff`, SHALL allow only `text/html`, `text/css`, `text/javascript`, `application/json`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `font/woff`, and `font/woff2`, and SHALL independently deny all session requests except contained assets from the active mapped custom origin. The main process SHALL enforce navigation, popup, download, and permission denial on the guest web contents obtained through the host's guest-attach hooks, regardless of whether the guest is a main-owned view or an in-renderer `<webview>`. An authenticated dashboard MAY request one strict-policy-valid external HTTPS URL only through the fixed dashboard API and only after explicit host-owned per-request confirmation that displays the complete canonical URL; it SHALL NOT gain in-dashboard navigation, popup, download, ambient browser, or protocol-handler authority. A pending confirmation SHALL be cancelled if its runtime ends or changes generation, and main SHALL re-authenticate the same sender, frame, runtime, and generation immediately before an affirmed request launches.

#### Scenario: Dashboard attempts network exfiltration

- **WHEN** dashboard code uses fetch, XHR, WebSocket, EventSource, an image/font URL, navigation, form submission, redirect, popup, or another browser mechanism to contact a remote or application origin
- **THEN** the request is blocked and no application cookie, credential, referrer, or approved vault data is transmitted

#### Scenario: Dashboard requests a device or browser permission

- **WHEN** dashboard code requests clipboard, notifications, camera, microphone, geolocation, MIDI, USB, Bluetooth, screen capture, persistent storage, or download access
- **THEN** the isolated session denies the request without displaying an operating-system permission prompt

#### Scenario: Dashboard sends an encoded asset path

- **WHEN** an asset URL contains invalid encoding, nested encoding, NULs, backslashes, absolute forms, or dot segments after exactly one percent-decoding pass
- **THEN** the protocol rejects it before MIME selection or filesystem access

#### Scenario: Dashboard attempts in-frame navigation

- **WHEN** dashboard code, a link, a form, or a redirect attempts to navigate the guest web contents or open a popup
- **THEN** the main process denies the navigation and popup through the guest-attach hooks and the dashboard remains on its mapped custom origin

#### Scenario: Dashboard requests an external HTTPS link

- **WHEN** an authenticated active dashboard requests a policy-valid HTTPS URL through the fixed external-link API and the user confirms the host-owned prompt
- **THEN** main opens only that validated URL externally without permitting dashboard navigation, popups, or any other browser authority, and without transferring dashboard or application-session cookies, credentials, or a referrer to the external browser

#### Scenario: Dashboard runtime changes during an external-link request

- **WHEN** a dashboard runtime ends, changes generation, crashes, or is replaced while its confirmation is pending, or fails re-authentication after the user confirms
- **THEN** main cancels the request and does not invoke an external protocol handler

#### Scenario: Dashboard requests an unsafe external link

- **WHEN** a dashboard supplies a URL with a non-HTTPS scheme, credentials, malformed syntax, no host, whitespace or control characters, invalid percent encoding, a non-canonical serialized form, or a value beyond the fixed 8,192-code-unit URL bound
- **THEN** main rejects the request without displaying a prompt or invoking an external protocol handler

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

### Requirement: Secret values never cross the dashboard or agent boundary

The application SHALL keep decrypted secret values confined to transient use inside the main process, MAY transiently derive an encoded credential from a secret solely for host-side injection, and SHALL ensure no IPC payload, dashboard API result, agent-accessible channel, renderer surface, error message, or log line contains the raw secret value, its tracked URL-encoded form, or any complete credential representation derived and tracked by the host for injection.

#### Scenario: Dashboard code probes for secret values

- **WHEN** arbitrary dashboard JavaScript calls any dashboard API operation, inspects any API result or error, or exercises the secrets metadata and host-mediated request operations
- **THEN** it observes at most secret names and set/unset status and never the raw secret value, its tracked URL-encoded form, ciphertext, or any complete credential representation derived and tracked by the host for injection

#### Scenario: Host-mediated request fails

- **WHEN** a host-mediated secret-injected request fails at validation, resolution, network, or response stage
- **THEN** the returned error and any diagnostic logging exclude the secret value, every host-derived credential representation, and the injected header content

### Requirement: Secret storage refuses insecure persistence

Secret values SHALL be stored only encrypted with OS-keychain-backed encryption in an application-private file with owner-only permissions, and the application SHALL refuse to persist secret values when that encryption is unavailable rather than falling back to plaintext. CI test setup that exercises persisted secrets SHALL use an ephemeral OS-backed encryption backend and SHALL NOT select or permit Electron's plaintext `basic` password store.

Because a test harness MAY override process configuration at runtime, CI SHALL verify the encryption backend the test process actually selected, rather than relying on the backend it was asked to select. Asserting on launch arguments alone is insufficient.

#### Scenario: Encryption is unavailable at save time

- **WHEN** OS-keychain-backed encryption is unavailable and the user attempts to save a secret
- **THEN** the application declines the save, explains that secrets are unavailable on this system, and writes nothing

#### Scenario: Linux end-to-end secret verification runs

- **WHEN** Linux CI runs dashboard end-to-end tests that persist a secret
- **THEN** it starts a real Secret Service/keyring for the test process
- **AND** it does not configure a plaintext or basic password-store fallback

#### Scenario: Linux CI exercises persisted secrets

- **WHEN** Linux CI runs a scenario that persists a dashboard secret
- **THEN** its test environment provides an ephemeral OS-backed encryption backend and does not enable plaintext secret storage
- **AND** the test asserts the backend the running process actually selected, so a harness that silently substitutes a plaintext store fails the run instead of passing

### Requirement: Host-mediated network egress requires explicit scoped consent

Host-mediated outbound requests on behalf of a dashboard SHALL require the granted privileged secrets capability, SHALL be validated against a fixed bounded request schema, SHALL send a secret only to an exact HTTPS origin declared for that secret name in the digest-bound manifest declaration, SHALL not follow redirects, SHALL prevent caller-supplied fields from setting or overriding authorization or another injected secret, MAY compose a credential only through a fixed host-side injection kind, and SHALL enforce fixed response size, time, and rate bounds.

#### Scenario: Dashboard attempts secret exfiltration through the host

- **WHEN** dashboard code requests a host-mediated call whose URL origin is not exactly declared for the referenced secret, including via redirect, non-HTTPS scheme, userinfo tricks, or header override of the injection point
- **THEN** the application rejects or bounds the request so the secret value is never transmitted to an undeclared origin

#### Scenario: Dashboard supplies authorization directly

- **WHEN** dashboard code supplies an `authorization` header, a raw credential, or a value-bearing authorization injection field
- **THEN** the application rejects the request without resolving a secret or performing network activity

#### Scenario: Ungranted dashboard requests egress

- **WHEN** a dashboard without the granted secrets capability requests a host-mediated call
- **THEN** the application rejects it with a bounded denial and performs no network activity
