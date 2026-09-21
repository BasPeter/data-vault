## ADDED Requirements

### Requirement: OpenCode IPC is exact-frame authenticated, bounded, and ownership-scoped

The preload SHALL expose only setup, remove-setup, status, list-owned-sessions, create-session, list-messages, send-prompt, and abort-prompt methods. Every corresponding main-process handler SHALL accept only `event.sender === mainWindow.webContents` and `event.senderFrame === mainWindow.webContents.mainFrame`; validate fixed DTO arguments and result bounds; enforce main-owned, current-configuration session grants; and reject unknown channels, other frames, stale/cross-window senders, invented sessions, and concurrent-operation excess without persistence or network activity.

#### Scenario: Forged or unowned session request is received

- **WHEN** a request originates from a non-main frame, stale renderer, other window, or supplies a session not created by the current main frame under the current configuration
- **THEN** main rejects it without contacting OpenCode or revealing session data

#### Scenario: Ownership context is invalidated

- **WHEN** OpenCode configuration changes or is removed, the trusted main frame navigates, or the main window is destroyed
- **THEN** main removes the relevant in-memory grants and metadata before another status, message, prompt, or abort request can use them

### Requirement: OpenCode DTOs, results, and concurrency are concretely bounded

The application SHALL accept only port integers 1-65535; usernames of 1-256 UTF-16 code units; passwords of 1-1,024 code units; optional session titles of 0-120 code units; opaque ASCII session IDs of 1-128 characters; and prompt text of 1-8,000 code units. It SHALL return at most 20 owned-session DTOs and 100 message DTOs. Session DTOs SHALL contain only `{ id, title, createdAt }`; message DTOs only `{ id, role, text, createdAt }`; and status DTOs only `{ state }`, where `role` is `user` or `assistant`, `state` is `busy` or `idle`, title is at most 120 code units, text is at most 8,000 code units, and ISO-8601 timestamps are at most 40 code units. It SHALL allow at most one in-flight request per owned session and four per trusted main frame.

#### Scenario: Remote result contains unsafe or excessive content

- **WHEN** OpenCode returns non-text parts, tool output, paths, provider diagnostics, headers, unknown fields, an unallowlisted role/state, invalid timestamp, excess count, or over-bound field
- **THEN** main drops it or rejects the response according to the fixed DTO contract and does not expose it to the renderer

#### Scenario: Input or concurrency exceeds a fixed bound

- **WHEN** setup, title, session ID, prompt, result count, or concurrent request exceeds its stated bound
- **THEN** main rejects it before persistence or network activity

### Requirement: OpenCode network access is fixed, loopback-only, and health-gated

Main SHALL derive the sole OpenCode origin as `http://127.0.0.1:<port>` from a validated TCP port and SHALL use built-in `fetch` only for authenticated `GET /global/health`, `POST /session`, `GET /session/status`, `GET /session/:id/message`, `POST /session/:id/prompt_async`, and `POST /session/:id/abort`. Before calling global `GET /session/status`, it SHALL validate the requested ID is owned and project solely that ID's state, never exposing another status-map entry; documented remote retry projects to `busy` without diagnostics. It SHALL construct session routes only from owned validated opaque IDs; set `redirect: 'error'`; enforce a 10,000 ms timeout; stream-read no more than 262,144 raw response bytes and cancel overflow before JSON parsing; reject decoded JSON nesting deeper than 8 containers; and project only the fixed DTOs. JSON endpoints SHALL accept only expected successful 2xx statuses with `application/json`; `prompt_async` SHALL accept only 204 No Content; every other status/content type SHALL become a fixed redacted error. It SHALL require health `healthy: true` and a strictly parsed semantic version >= 1.1.10 before normal operations.

#### Scenario: Renderer attempts endpoint substitution

- **WHEN** renderer input represents a URL, host, scheme, path, query, fragment, userinfo, non-loopback address, malformed port, unhealthy response, or older/unproven version
- **THEN** main rejects it without persisting setup or making a request to that input

#### Scenario: Remote service redirects or exceeds a bound

- **WHEN** an OpenCode request redirects, exceeds 10,000 ms or 262,144 bytes, has nesting deeper than 8, or returns an unexpected status, content type, or data
- **THEN** main stops or rejects the request and returns a fixed redacted failure result

### Requirement: Complete OpenCode credentials remain verified-encrypted and main-only

The application SHALL accept bounded username and password setup values only after affirmative authority-disclosure acceptance and SHALL serialize and encrypt both values together as one credential record with Electron `safeStorage`. Before every save or load, Linux SHALL query `getSelectedStorageBackend()` and accept only a proven OS-keychain backend, rejecting `basic`, plaintext, unknown, or unproven values. macOS and Windows SHALL use Electron's documented platform encryption semantics and `isEncryptionAvailable()` and fail closed when unavailable; they SHALL NOT require a universal selected-backend query. The application SHALL persist no endpoint metadata or credential record on a rejected save and delete or ignore an unverifiable stored record on load. CI persistence tests SHALL provision an ephemeral OS-backed keychain and assert Linux's selected runtime backend; macOS/Windows tests SHALL assert documented platform encryption availability and fail-closed behavior. The application SHALL not return or place raw credentials, ciphertext, Authorization headers, complete Basic credential representations, or derived tracked representations in IPC, URLs, renderer state, errors, or logs.

#### Scenario: Secure storage backend is unavailable or insecure

- **WHEN** the user saves OpenCode credentials and Linux's actual selected `safeStorage` backend is unavailable, plaintext, `basic`, unknown, or otherwise unproven as OS-keychain-backed, or macOS/Windows encryption is unavailable
- **THEN** the application refuses setup and persists neither endpoint metadata nor a credential record

#### Scenario: CI persistence verification runs

- **WHEN** CI exercises persisted OpenCode credentials
- **THEN** Linux uses an ephemeral OS-backed keychain and asserts the backend actually selected by the running process so a fallback to `basic` or plaintext fails the run, while macOS/Windows assert documented encryption availability and fail-closed behavior

#### Scenario: OpenCode request fails

- **WHEN** validation, authentication, network, health, or API processing fails
- **THEN** IPC results and diagnostic logging contain only fixed bounded redacted error information and no credential representation or remote diagnostic content
