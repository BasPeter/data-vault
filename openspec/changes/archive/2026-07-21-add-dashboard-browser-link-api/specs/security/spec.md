## MODIFIED Requirements

### Requirement: Dashboard navigation and ambient browser authority are denied

Dashboard web contents SHALL enforce `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; child-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` without `unsafe-inline` or `unsafe-eval`, SHALL send `X-Content-Type-Options: nosniff`, SHALL allow only `text/html`, `text/css`, `text/javascript`, `application/json`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `font/woff`, and `font/woff2`, and SHALL independently deny all session requests except contained assets from the active mapped custom origin. An authenticated dashboard MAY request one strict-policy-valid external HTTPS URL only through the fixed dashboard API and only after explicit host-owned per-request confirmation that displays the complete canonical URL; it SHALL NOT gain in-dashboard navigation, popup, download, ambient browser, or protocol-handler authority. A pending confirmation SHALL be cancelled if its runtime ends or changes generation, and main SHALL re-authenticate the same sender, frame, runtime, and generation immediately before an affirmed request launches.

#### Scenario: Dashboard attempts network exfiltration

- **WHEN** dashboard code uses fetch, XHR, WebSocket, EventSource, an image/font URL, navigation, form submission, redirect, popup, or another browser mechanism to contact a remote or application origin
- **THEN** the request is blocked and no application cookie, credential, referrer, or approved vault data is transmitted

#### Scenario: Dashboard requests a device or browser permission

- **WHEN** dashboard code requests clipboard, notifications, camera, microphone, geolocation, MIDI, USB, Bluetooth, screen capture, persistent storage, or download access
- **THEN** the isolated session denies the request without displaying an operating-system permission prompt

#### Scenario: Dashboard sends an encoded asset path

- **WHEN** an asset URL contains invalid encoding, nested encoding, NULs, backslashes, absolute forms, or dot segments after exactly one percent-decoding pass
- **THEN** the protocol rejects it before MIME selection or filesystem access

#### Scenario: Dashboard requests an external HTTPS link

- **WHEN** an authenticated active dashboard requests a policy-valid HTTPS URL through the fixed external-link API and the user confirms the host-owned prompt
- **THEN** main opens only that validated URL externally without permitting dashboard navigation, popups, or any other browser authority, and without transferring dashboard or application-session cookies, credentials, or a referrer to the external browser

#### Scenario: Dashboard runtime changes during an external-link request

- **WHEN** a dashboard runtime ends, changes generation, crashes, or is replaced while its confirmation is pending, or fails re-authentication after the user confirms
- **THEN** main cancels the request and does not invoke an external protocol handler

#### Scenario: Dashboard requests an unsafe external link

- **WHEN** a dashboard supplies a URL with a non-HTTPS scheme, credentials, malformed syntax, no host, whitespace or control characters, invalid percent encoding, a non-canonical serialized form, or a value beyond the fixed 8,192-code-unit URL bound
- **THEN** main rejects the request without displaying a prompt or invoking an external protocol handler
