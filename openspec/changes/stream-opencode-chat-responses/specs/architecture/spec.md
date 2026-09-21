## ADDED Requirements

### Requirement: Main owns correlated active-prompt stream lifecycle

Main SHALL own one active SSE stream only for the exact trusted main frame and current configuration generation after accepted prompt response, and SHALL retain trusted user message, owned session, and bound assistant message correlation only in main. It SHALL clear and abort that record on terminal, abort, stop, close, selection change, navigation, configuration change/removal, or window destruction. It SHALL never open a stream for external busy work or other owned sessions.

#### Scenario: Prompt is not accepted

- **WHEN** prompt submission fails or does not return accepted 204
- **THEN** main records no active stream and opens no event connection

### Requirement: Main delivery uses acknowledged generation gates

Preload SHALL expose only typed start/stop, ACK, reconciliation-ready invokes, and a typed listener. Every delta batch and control SHALL carry safe-integer generation and sequence values; every delta and every control except non-acknowledged polling-fallback SHALL require ACK by exact generation and sequence. Main SHALL allow one sent-unacknowledged message and one coalesced pending latest delta, require ACK within two seconds, and require current-generation readiness within fifteen seconds after acknowledged reconnect control before it emits acknowledged `ready` or a pending delta. Main SHALL validate exact frame, generation, sequence, and state before accepting ACK or readiness.

#### Scenario: Renderer pauses after delivery

- **WHEN** the renderer fails to ACK within two seconds
- **THEN** main atomically invalidates and advances generation, closes the stream, clears active subscription and queues, and emits exactly one non-acknowledged polling-fallback control in the new generation

### Requirement: Invalidation permits no stale delivery authority

After ACK timeout or terminal invalidation, main SHALL retain no active subscription or pending queue. Across invalidation it SHALL permit at most two queued IPC messages: an already delayed old-generation message and one new-generation sequenced but non-acknowledged polling-fallback control. Renderer SHALL reject the old message by generation mismatch. Main SHALL not issue reconciliation REST calls.

#### Scenario: Delayed old batch arrives after fallback

- **WHEN** an old batch is delivered after new-generation polling fallback
- **THEN** it is ignored by renderer generation checks and no more than that old batch plus fallback control were queued across invalidation

### Requirement: Chat Markdown rendering remains renderer-only and sanitized

The renderer SHALL own presentation of OpenCode message Markdown but SHALL use existing synchronous GFM `marked` plus central `sanitizeChatMarkdown` in `src/lib/sanitize.ts` or an adjacent central sanitizer module before inserting a complete generated HTML result. Main SHALL continue to send source text only, never HTML. Chat rendering SHALL not initialize Mermaid or expose a renderer network capability.

#### Scenario: Main projects assistant text

- **WHEN** a bounded assistant delta or final message reaches the renderer
- **THEN** main provides only source text and the renderer creates displayed HTML only through the existing sanitizer

### Requirement: Thinking indication is renderer-only transient state

The renderer SHALL own the three-dot thinking indication derived from the current active prompt and current stream generation. Main SHALL not synthesize a message, transcript record, or persisted state for thinking. The renderer SHALL clear that UI state when its active prompt or generation ends and SHALL not restore it from session history.

#### Scenario: Application reloads or returns to a session

- **WHEN** the renderer reloads or later selects an owned session
- **THEN** it reconstructs only authoritative transcript state and does not display a persisted thinking message
