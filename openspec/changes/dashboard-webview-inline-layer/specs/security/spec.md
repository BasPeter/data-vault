## MODIFIED Requirements

### Requirement: Renderer Sandboxing

The renderer SHALL run with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. The renderer window MAY enable `webviewTag: true` solely to host the dashboard sandbox. The renderer SHALL set only the exact `src` and isolated `partition` from a current main-issued runtime descriptor and SHALL set no preload or preference attributes. At guest attach time, main SHALL validate descriptor identity, reject stale, unexpected, or mismatched `src`/`partition` values, and overwrite the preload and all guest `webPreferences` to the sandboxed dashboard profile (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no `nodeIntegrationInSubFrames`, the dashboard preload, and the isolated non-persistent session).

#### Scenario: Renderer window is created

- **WHEN** the app creates a `BrowserWindow` for the renderer
- **THEN** its `webPreferences` SHALL set `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`

#### Scenario: A dashboard guest webview is attached

- **WHEN** a `<webview>` guest attaches to the renderer for a dashboard
- **THEN** main SHALL accept only the current descriptor's exact `src` and `partition`, reject stale, unexpected, or mismatched guests, and overwrite the preload and all preferences with the sandboxed dashboard profile

### Requirement: Executable dashboards remain untrusted and isolated

All dashboard manifests, assets, state, and JavaScript SHALL be treated as untrusted external vault input and SHALL execute only in a dedicated sandboxed guest web contents with Node.js disabled, context isolation enabled, sandboxing enabled, a non-persistent isolated session, and no application preload or `window.vaultApi`. When the guest is embedded as an in-renderer `<webview>` (an out-of-process child frame of the host renderer), it SHALL remain a distinct web contents that cannot reach the host renderer's DOM, scripts, `window.vaultApi`, cookies, or storage, and the main process SHALL retain lifecycle, session-policy, navigation-denial, IPC-authentication, and teardown authority over that guest web contents.

#### Scenario: Dashboard script inspects its environment

- **WHEN** arbitrary dashboard JavaScript executes
- **THEN** it cannot access Node.js, Electron, raw IPC, the application DOM, application cookies/storage, `window.vaultApi`, filesystem paths, Git, credentials, dialogs, child processes, the host renderer's DOM or scripts, or another dashboard context

#### Scenario: Normal document contains dashboard-like code

- **WHEN** an HTML or Markdown document contains scripts, styles, frames, or dashboard API lookalikes
- **THEN** the existing document sanitization policy remains in force and the document is not promoted to or executed as a dashboard

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
