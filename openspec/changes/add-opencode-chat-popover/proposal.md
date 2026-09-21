## Why

Users need a compact, in-app OpenCode conversation without granting an external page access to the Data Vault renderer. A host-owned chat popover can provide that workflow while keeping endpoint access, credentials, and all network traffic in trusted main-process code.

## What Changes

- Add a round, bottom-right chat action and accessible host-owned React popover to the loaded application shell.
- Connect only to a separately user-managed, authenticated `opencode serve` instance at canonical `http://127.0.0.1:<port>`.
- Use main-process built-in `fetch` and the documented OpenCode HTTP API; do not add an SDK dependency, launch or supervise OpenCode, or embed its web UI.
- Encrypt username and password together with platform-appropriate verified `safeStorage`; on Linux reject selected `basic`/plaintext backends, and on macOS/Windows fail closed when documented platform encryption is unavailable.
- Expose narrow typed IPC only for setup, status, current-lifetime owned-session metadata, session creation, messages, prompts, and aborting a prompt.
- Allow a renderer/window to operate only sessions it created after the current configuration; main invalidates those grants on configuration change, navigation, and window destruction.
- Validate exact trusted sender/frame identity, fixed DTOs, session ownership, and concrete request/response bounds; redact credentials and remote diagnostics from all results, errors, and logs.
- Poll boundedly for messages and session busy/idle status instead of introducing streaming or event transport in this first version.
- Display explicit setup disclosure that the separately run OpenCode process retains the user's ambient OS authority. Data Vault sends no vault context.

## Capabilities

### New Capabilities

- `opencode-chat-popover`: Defines native OpenCode chat setup, owned-session and message behavior, host-owned popover UI, and recovery behavior.

### Modified Capabilities

- `architecture`: Adds the main-owned OpenCode API-client, session-ownership, and IPC boundary.
- `security`: Adds constrained loopback network access, verified credential persistence, DTO bounds, and OpenCode IPC validation requirements.

## Impact

- React shell and settings/popover components under `src/`.
- Electron main and preload IPC boundary for the OpenCode client, current-lifetime session grants, and verified encrypted credential storage.
- Architecture and security specifications; no renderer sandbox, guest-dispatch, webview, or dashboard-policy changes.
- A user-managed OpenCode `serve` instance version 1.1.10 or newer is an optional external prerequisite. Data Vault remains usable when it is not configured or unavailable.
- No production npm dependency is added.
