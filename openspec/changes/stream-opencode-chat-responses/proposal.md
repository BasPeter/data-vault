## Why

Native OpenCode chat currently refreshes only after a prompt completes. It needs responsive intermediate text without granting stream authority to unrelated session activity or exposing untrusted OpenCode event data.

## What Changes

- Add `opencode-chat-streaming` for one exact accepted prompt, correlated by a main-generated trusted user message ID and its assistant reply parent ID.
- Use main-owned bounded `/event` parsing to project only append-only text deltas for that correlated assistant message.
- Add a closed batch/control IPC protocol with safe-integer sequences on every control, exact generation/sequence acknowledgements where required, and a reconciliation-ready gate before a new generation can show provisional text.
- Gate streaming on proven stable OpenCode 1.18.16+ schema support; all other compatible versions continue polling only.
- Keep renderer-owned serialized reconciliation, stable accessible status, and safe fallback on any bound, correlation, delivery, or readiness failure.
- Render intermediate and final assistant text as formatted Markdown through a dedicated closed sanitizer profile, without widening renderer network or script authority.
- Show a host-owned accessible three-dot thinking indicator while an accepted active prompt awaits its first validated text delta.

## Capabilities

### New Capabilities

- `opencode-chat-streaming`: Defines correlated, bounded intermediate text for one active OpenCode prompt and acknowledged renderer reconciliation.

### Modified Capabilities

- `architecture`: Defines main-owned correlated SSE lifecycle and closed acknowledged IPC delivery.
- `security`: Defines version-gated schema proof, input bounds, correlation, redaction, and generation invalidation constraints.

## Impact

This affects the native chat popover under `src/` and Electron's OpenCode client, controller, IPC, and preload. It adds no dependency or persisted stream data and does not change credentials, general session ownership, or process management. Main remains the only OpenCode network client; raw SSE, tools, reasoning, paths, diagnostics, credentials, and vault context never cross to the renderer.
