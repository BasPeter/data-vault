## Context

Data Vault currently has no OpenCode integration. The prior embedded-webview approach would have extended the renderer's guest-admission and sandbox policy, while exposing a browser surface that Data Vault does not need to own. OpenCode already exposes a documented HTTP API from `opencode serve`; this change uses that API from trusted main-process code and renders a native React chat experience.

OpenCode is separately started and administered by the user. It can execute commands, access local files and provider credentials, and use the network with that user's ambient OS authority. Data Vault cannot reduce that authority and supplies no vault content, paths, selected-document state, application secrets, or privileged API to OpenCode.

## Goals / Non-Goals

**Goals:**

- Provide a persistent bottom-right action and accessible, host-owned chat popover in the loaded shell.
- Connect only to one configured, authenticated loopback OpenCode endpoint through main-process built-in `fetch`.
- Verify authenticated `GET /global/health` reports `healthy: true` and strict semantic version 1.1.10 or newer before treating configuration as ready.
- Support creation and use only of current-lifetime, main-frame-owned sessions, bounded messages, prompts, abort, busy/idle status, and polling-based refresh.
- Keep username and password together in one `safeStorage`-encrypted record, with platform-specific proof that its encryption is available and OS-backed.

**Non-Goals:**

- Install, update, launch, stop, supervise, sandbox, or otherwise own the OpenCode process.
- Embed the OpenCode web UI, add a `<webview>`, alter guest dispatch, or change renderer-sandbox policy.
- Add an OpenCode SDK or production dependency.
- List, adopt, read, prompt, abort, or otherwise operate a remote session not created by the current main frame after the current configuration.
- Persist session grants or session-list metadata beyond the current main-window lifetime.
- Implement streaming, SSE, WebSocket, or event subscriptions; bounded polling is sufficient initially.
- Send vault paths, document bodies, document selection, application secrets, or any Data Vault context to OpenCode.
- Connect to URLs, hosts, schemes, paths, ports, or remote endpoints selected by the renderer.

## Decisions

### Use a main-process native API client with fixed transport bounds

Main owns a small client backed by Electron/Node built-in `fetch`; no SDK is introduced. It canonicalizes saved setup to `http://127.0.0.1:<port>` and constructs each documented endpoint itself. Basic authentication exists solely inside main. Each request uses `redirect: 'error'`, a 10,000 ms timeout, and a 262,144-byte raw response cap: main reads the response body as a stream, cancels it before JSON parsing when the cap would be exceeded, and never calls `response.json()`. JSON endpoints accept only their documented successful 2xx status with `application/json` content type; every other status or content type becomes a fixed redacted error. `POST /session/:id/prompt_async` accepts only documented `204 No Content` and rejects any body or other status with a fixed redacted error.

The fixed routes are:

- `GET /global/health` for authenticated availability and compatibility.
- `POST /session` to create a session.
- `GET /session/status` to obtain status data only after main validates the requested owned session ID, then project solely that ID's state.
- `GET /session/:id/message` to project only the owned session's bounded text transcript.
- `POST /session/:id/prompt_async` to submit a prompt without a streaming transport.
- `POST /session/:id/abort` to cancel an owned session's active work.

There is intentionally no `GET /session` use: Data Vault does not enumerate or adopt server-side sessions. `listSessions` returns only in-memory metadata for sessions created by the current trusted main frame since its current configuration generation.

After a successful `prompt_async`, the renderer refreshes through typed `status` and message calls every 1,000 ms. Polling lasts at most 120,000 ms and stops after three consecutive failures, a terminal idle state following the submitted prompt, abort, close, configuration change, navigation, or window destruction. A documented OpenCode retry status projects to `busy` without diagnostics. Main permits one in-flight request per owned session and at most four in-flight OpenCode requests for the frame. `prompt_async` is selected over the synchronous message endpoint because it makes this bounded deterministic polling model explicit and avoids event transport complexity.

### Define and project a small renderer DTO contract

Main accepts `port` (integer 1-65535), `username` (1-256 UTF-16 code units), `password` (1-1,024 code units), `session title` (0-120 code units), `session ID` (1-128 ASCII opaque-token characters), and `prompt text` (1-8,000 code units). It returns no more than 20 owned-session metadata entries and 100 messages per transcript. A returned session DTO is `{ id, title, createdAt }`; a message DTO is `{ id, role, text, createdAt }`; and a status DTO is `{ state }`, where `state` is exactly `busy` or `idle`. IDs are bounded opaque tokens, `title` is at most 120 code units, `role` is the allowlisted `user` or `assistant`, `text` is at most 8,000 code units, and timestamps are validated ISO-8601 strings at most 40 code units.

After bounded raw-body collection, main parses JSON and recursively rejects input nesting deeper than 8 containers. It then projects only these DTO fields. Non-text message parts, tool output, paths, provider diagnostics, headers, unknown fields, and all other remote values are discarded. IPC errors use a fixed allowlist of redacted codes/messages and contain no remote body or header content.

### Persist the complete credential record safely

Setup accepts a port, username, password, and affirmative authority-disclosure acceptance. Main validates fields, derives the sole endpoint form, and first checks authenticated health and strict semver compatibility. It serializes username and password together as one credential record and encrypts that single value with `safeStorage.encryptString`.

Before every credential save or load, main applies platform-specific `safeStorage` proof. On Linux it queries `getSelectedStorageBackend()` and rejects `basic`, plaintext, unknown, or unproven backends. On macOS and Windows it relies on Electron's documented platform encryption semantics and `isEncryptionAvailable()`, failing closed when encryption is unavailable; it does not require a universal selected-backend query. Main persists no endpoint metadata or credential record until the relevant platform proof and health checks pass, and deletes/ignores records that cannot be proven secure on load. CI persistence tests provision an ephemeral OS-backed keychain and assert Linux's actual selected runtime backend; macOS and Windows tests assert documented platform encryption availability and fail-closed behavior. IPC never returns the username, password, ciphertext, Authorization header, or a complete Basic credential representation.

### Expose a narrow typed IPC contract and bind session grants to the main frame

The preload exposes only setup, remove setup, status, list owned sessions, create session, list messages, send prompt, and abort prompt. Every handler first applies the sole trusted-sender predicate: `event.sender === mainWindow.webContents` and `event.senderFrame === mainWindow.webContents.mainFrame`. It then validates the finite bounded DTO input and uses a registry keyed to that exact main frame and current configuration generation.

Only successful `POST /session` results create a grant and current-lifetime metadata entry. A session-scoped operation must match that exact frame, the current configuration generation, and a registered ID. Main invalidates all grants and metadata before replacing or removing configuration, on main-frame navigation, and on window destruction. It neither persists grants nor infers ownership from a supplied ID. A session created or used outside Data Vault, or under another configuration/window/frame, is unowned and cannot be read, prompted, status-checked, or aborted.

### Keep chat UI fully host-owned

The React popover owns creation and selection from only the current-lifetime owned-session list, transcript rendering, composer, loading states, errors, retry actions, and focus behavior. It has no direct network access and receives only safe DTOs. It never offers a server-wide session browser or existing-session adoption. The UI disables duplicate prompt/abort work for a busy session, determines busy/idle only from the typed status DTO, and displays bounded, escaped message text. Closing the popover stops polling and clears transient UI state; it does not change the external OpenCode process.

### Disclose OpenCode's external authority

Before setup can be saved, host UI clearly states that OpenCode runs separately with the user's OS authority and may execute commands, read local files, use provider credentials, and access the network independently of Data Vault. It also states that Data Vault provides no vault context or application privilege. Main requires recorded affirmative acceptance, rather than trusting renderer display state alone.

## Risks / Trade-offs

- [OpenCode has ambient OS authority] -> Data Vault does not launch it, does not pass vault context, and requires explicit disclosure before saving configuration.
- [A malicious renderer could request arbitrary endpoints or sessions] -> main derives routes, authenticates the exact main frame, validates fixed DTOs, and grants only sessions it created for that frame/configuration.
- [Credentials could leak through errors, backend fallback, or telemetry] -> both values are encrypted together only after actual backend verification; errors/logs use fixed redacted messages.
- [External activity can make an owned session busy] -> main validates ownership before reading the fixed global status route and projects only the requested ID; retry projects to bounded `busy` and ownership is never inferred from status.
- [Polling is less immediate than streaming] -> polling is bounded, deterministic, and avoids unneeded event/transport complexity; streaming can be designed later if user experience evidence warrants it.
- [The external runtime can stop or change] -> status checks and polling errors produce host-owned recovery states without affecting the rest of Data Vault.

## Migration Plan

1. Add client, secure-storage-backend, DTO projection, ownership, and IPC validation tests before implementation.
2. Implement the main/preload boundary and its focused tests.
3. Implement host-owned setup and chat UI with component/App tests.
4. Run narrow tests, then typecheck, lint, formatting, build, and relevant end-to-end coverage.
5. Require independent security review before syncing or archiving because this adds credential storage and network authority.

Rollback removes the popover and OpenCode IPC/client code. Unconfiguration and rollback delete the encrypted OpenCode credential and endpoint metadata; no vault data migration is needed.
