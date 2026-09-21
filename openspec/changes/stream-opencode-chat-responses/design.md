## Context

The existing native chat owns current-lifetime sessions and uses accepted `prompt_async` plus polling. `/event` is untrusted long-lived SSE and can contain unrelated activity even for an owned session. Streaming must therefore correlate one trusted user prompt to exactly one assistant message, bound delivery to a responsive renderer, and preserve polling as authority and fallback.

## Goals / Non-Goals

**Goals:**

- Show only append-only intermediate text for one proven assistant reply to one accepted prompt.
- Keep all transport, parsing, correlation, flow control, and generation authority in main.
- Require renderer reconciliation before a reconnected generation shows provisional text.

**Non-Goals:**

- Infer correlation from session busy state, stream unrelated same-session work, forward `message.updated` or any raw event, or repair remote ordering locally.
- Expose renderer networking/raw IPC, persist stream state, or require streaming for compatible older OpenCode versions.

## Decisions

### Correlate a trusted prompt to one assistant message

Before `prompt_async`, main generates a bounded validated opaque trusted user `messageID` (ASCII token, 1–128 characters) and supplies it only in the documented optional `messageID` field of that fixed request body. Main atomically records the active prompt only after the 204 response is accepted. The active record contains exact frame/configuration generation, owned session ID, trusted user message ID, and later the bound assistant message ID.

The parser may internally inspect `message.updated` only to bind an assistant message ID when its exact owned session matches and `info.parentID` exactly equals the trusted user message ID. It forwards none of that event or `info`. It accepts `message.part.delta` only after that binding, only for the bound assistant message ID, and only where the field is `text`. Unrelated same-session activity, a different parent ID, user message, unknown assistant, or any schema mismatch is ignored. If caller message IDs are not accepted or assistant `parentID` correlation is absent in the real-server proof, streaming is disabled and chat polls.

### Gate production streaming on a committed schema proof

Health remains compatible for stable versions at least 1.1.10. Streaming requires a strictly parsed stable release (no prerelease) at least 1.18.16 and a committed fixture from authenticated 1.18.16 proving caller-provided `messageID` acceptance, correlated assistant `message.updated.info.parentID`, and the text-delta form. Prereleases do not stream unless a separately proven fixture and artifact update explicitly allow them. Older compatible stable releases and all unproven schemas use polling only.

### Bound fixed SSE parsing and active lifecycle

Main uses built-in authenticated fetch only for canonical loopback `GET /event`, redirect denial, 200 `text/event-stream`, and a 10-second initial-header timeout cleared on accepted headers. A 45-second inactivity timer resets only after a validated relevant correlation/binding/delta/terminal event. The parser supports UTF-8 chunks, CRLF/LF, and multiline `data`, counts raw bytes before decoding, and limits a line to 16,384 bytes, event to 32,768 bytes, buffer to 65,536 bytes, JSON depth to eight, and all input (including well-formed irrelevant/correlation-mismatched events and comments) to 512 KiB or 200 events in each rolling 10-second window. Well-formed unrelated events are ignored after accounting; malformed, oversized, or unsupported shapes claiming supported event types close the stream into fallback. Any terminal closes the stream. There is only one active stream per exact frame/config generation and it ends on terminal, abort, close, selection change, stop, navigation, configuration change/removal, or destruction.

### Use closed acknowledged batches and reconciliation-ready generations

The only renderer payloads are:

- `DeltaBatch { kind: "delta"; generation: safe integer 1..2^53-1; sequence: safe integer 1..2^53-1; sessionId: opaque ID; messageId: opaque ID; text: string 1..8,000 }`. It requires an exact ACK.
- `Control { kind: "control"; generation: safe integer 1..2^53-1; sequence: safe integer 1..2^53-1; state: "connected" | "reconnecting" | "terminal" | "polling-fallback" | "ready" }`. `connected`, `reconnecting`, `terminal`, and `ready` require an exact ACK by generation and sequence; `polling-fallback` also carries a sequence for closed DTO consistency but is deliberately non-acknowledged.

Main allows one sent-unacknowledged message and one coalesced pending latest delta per subscription. It sends no further delta before ACK of the exact generation/sequence. ACK must arrive within two seconds. For a reconnect, main clears provisional state, advances generation, sends acknowledged reconnecting control, then holds one pending snapshot while the renderer immediately acknowledges that exact control and runs serialized status-then-messages. Renderer invokes `reconciliationReady(generation)` only after that refresh; main accepts it only within 15 seconds of reconnect control and only after its ACK, sends acknowledged `ready(generation, sequence)`, then releases the pending snapshot. A slow but valid ten-second reconciliation is therefore supported.

If a delta would exceed the 8,000-code-unit provisional buffer, main does not truncate: it falls back and requires reconciliation. On ACK timeout, main atomically invalidates/advances generation, closes the reader, clears the active subscription and queues, then emits exactly one sequenced non-acknowledged `polling-fallback` control in the new generation. The only permitted cross-invalidation queued messages are a delayed old message and that fallback control (at most two); renderer rejects the delayed old message by generation. No subscription, pending queue, or active stream remains after fallback.

### Renderer alone reconciles and announces stable state

Main never makes reconciliation REST calls. The renderer owns one serialized status-then-messages operation per current generation, coalesces same-tick terminal/reconnect/fallback signals, clears/replaces timers, and drops stale results. Polling resumes only as the existing bounded fallback. One always-mounted polite live region changes text only for distinct semantic controls; deltas are visible escaped content but never individually announced.

### Render assistant Markdown through the existing sanitization boundary

All OpenCode assistant text, including model-generated final transcript text, is untrusted. The renderer reparses each complete bounded provisional text snapshot and each final message from source using the existing `marked` GFM configuration with `async: false`, converts Markdown images to bounded escaped alt text before sanitization, and immediately passes generated HTML through a centrally owned `sanitizeChatMarkdown` profile in `src/lib/sanitize.ts` (or an adjacent central sanitizer module). Full-source HTML produced by that established parse-and-sanitize pattern may be inserted; unsanitized HTML and concatenated rendered fragments may not. Incomplete Markdown fences or constructs are best-effort temporary source and are reparsed into a stable final render after reconciliation.

The chat message body reuses `.doc-content` typography with chat-scoped spacing. The dedicated profile allows only intended GFM tags: `p`, `br`, `strong`, `em`, `del`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, and `hr`; only `href`/`title` on `a`, plus bounded `class` on `code`/`pre` if required. It permits no style, id, src, srcset, poster, data, or event attributes. It forbids all resource/active tags, including `img`, `picture`, `audio`, `video`, `source`, `track`, `iframe`, `object`, `embed`, `svg`, `math`, `form`, and every other tag. DOMPurify remains responsible for safe `href` handling; links receive no `target` and remain under renderer navigation policy. Mermaid is never initialized. The message body is not aria-live; only the stable separate status container is polite.

### Show a host-only thinking indicator before the first delta

After `prompt_async` is accepted and the active-prompt scope exists, the renderer shows a host-owned three-dot indicator in the assistant area until the first validated current-generation provisional text delta. It is transient UI state, never a placeholder message DTO, transcript entry, or persisted value. It stops immediately on first text, terminal/idle, abort, error, polling fallback, close/unmount, navigation, configuration change, or the existing bounded prompt timeout, and never restarts after terminal or for stale generations. A reconnect may retain it only while the same active prompt remains current and no text has yet been accepted.

The indicator uses existing styles with no dependency. Its dots are `aria-hidden`; one always-mounted `role="status"`/`aria-live="polite"` container changes once to “OpenCode is thinking” while active, without repeated announcements. It changes to concise “OpenCode is responding” on first text or hides according to the existing stream-state contract. The indicator honors `prefers-reduced-motion` by rendering static dots rather than animation; the assistant message body remains non-live.

## Risks / Trade-offs

- [Correlation schema differs] → Fixture proof disables streaming rather than guessing.
- [Paused renderer] → one unacked plus one pending message and timeout bound all retention.
- [Reconnect races] → ACK then readiness gate blocks provisional text until authoritative refresh.
- [Unrelated event flood] → raw-byte/event rolling budgets apply before filtering.
- [Model Markdown attempts active content or network egress] → source is parsed then centrally sanitized, images become alt text, Mermaid is disabled, and renderer navigation stays restricted.

## Migration Plan

1. Commit the real-server fixture and tests before stream code.
2. Add parser/client, controller, IPC, UI, race, and E2E tests before implementation.
3. Implement main lifecycle first, then typed bridge and renderer coordinator, retaining polling-only compatibility.
4. Run checks and security review before syncing or archiving.

Rollback removes transient stream behavior; no data migration is required.

## Open Questions

- None: an absent or divergent fixture is a fail-closed polling-only outcome.
