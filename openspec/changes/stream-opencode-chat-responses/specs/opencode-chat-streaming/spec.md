## ADDED Requirements

### Requirement: Streaming is correlated to one accepted prompt and assistant reply

The application SHALL generate one trusted bounded user message ID in main, include it only in the documented optional `messageID` field of a fixed `prompt_async` request, and atomically record streaming only after accepted 204 response. It SHALL bind one assistant message only when an internally inspected `message.updated` has the exact owned active session, assistant role, and `info.parentID` equal to that trusted user message ID. It SHALL accept projected text only from `message.part.delta` for that bound assistant message and exact `text` field. It SHALL ignore unrelated same-session activity and never forward raw `message.updated` or `info`.

#### Scenario: Same session has unrelated activity

- **WHEN** an event for the active owned session has another parent ID or another assistant message ID
- **THEN** no provisional text or stream state is projected from that event

#### Scenario: Correlation is absent

- **WHEN** caller-provided message IDs are not accepted or assistant parent correlation is absent or mismatched
- **THEN** streaming is disabled and the prompt uses only bounded polling

### Requirement: Renderer receives only closed batches and controls

The renderer SHALL receive only `delta` batches with safe-integer generation and sequence from 1 through 2^53-1, owned opaque session/message IDs, and 1–8,000-code-unit append-only text, or `control` values with safe-integer generation and sequence from 1 through 2^53-1 and exactly `connected`, `reconnecting`, `terminal`, `polling-fallback`, or `ready` state. It SHALL ACK every delta and every control except explicitly non-acknowledged `polling-fallback` by exact generation and sequence, immediately ACK reconnect control before reconciliation, and invoke readiness only after current-generation serialized status-then-messages reconciliation. It SHALL ignore stale or duplicate generation/sequence data.

#### Scenario: Reconnect waits for reconciliation

- **WHEN** a reconnect control is accepted and reconciliation takes ten seconds
- **THEN** the renderer completes its serialized refresh, invokes current-generation readiness within fifteen seconds, and receives no provisional delta before `ready`

#### Scenario: Stale control arrives

- **WHEN** a control has a stale or duplicate generation and sequence
- **THEN** the renderer ignores it and does not acknowledge, reconcile, or change stream state

### Requirement: Provisional text and fallback are accessible and authoritative

The popover SHALL render bounded accepted deltas as escaped provisional content, shall not truncate a provisional buffer beyond 8,000 code units, and SHALL clear it on reconnect, terminal, or fallback before authoritative reconciliation. It SHALL use one always-mounted polite live region and change its text only on distinct semantic controls, never per delta. It SHALL retain existing busy, abort, and polling fallback behavior.

#### Scenario: Provisional text exceeds its bound

- **WHEN** appending a valid delta would exceed 8,000 code units
- **THEN** the popover receives fallback rather than truncated text and reconciles through the authoritative transcript

### Requirement: Assistant Markdown is sanitized, formatted, and non-active

The popover SHALL treat every provisional and final assistant message as untrusted Markdown source. For every complete bounded provisional snapshot and final authoritative message it SHALL parse the full source with existing `marked` GFM using `async: false`, convert Markdown images to bounded escaped alt text, immediately run generated HTML through centrally owned `sanitizeChatMarkdown` in `src/lib/sanitize.ts` or an adjacent central sanitizer module, and insert only that complete sanitized result through the established pattern. It SHALL never insert unsanitized HTML or concatenate rendered HTML/deltas, execute Mermaid, or make the message body an aria-live region. Incomplete Markdown SHALL receive a best-effort full-source render and SHALL be reparsed when a later snapshot or final transcript changes it.

The message body SHALL use `.doc-content` typography with chat-scoped spacing and preserve sanitized headings, lists, tables, blockquotes, links, inline code, and fenced code. `sanitizeChatMarkdown` SHALL allow only `p`, `br`, `strong`, `em`, `del`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, and `hr`; only `href`/`title` on `a` and bounded `class` on `code`/`pre` if required. It SHALL allow no style, id, src, srcset, poster, data, or event attributes and SHALL forbid images/resources and every other tag, including `img`, `picture`, `audio`, `video`, `source`, `track`, `iframe`, `object`, `embed`, `svg`, `math`, and `form`. DOMPurify safe URL handling SHALL govern `href`; chat links SHALL receive no `target` and remain subject to renderer navigation policy.

#### Scenario: Incomplete code fence becomes final Markdown

- **WHEN** a provisional snapshot contains an incomplete fenced-code construct and a later delta completes it
- **THEN** the popover reparses the complete source, replaces the prior sanitized rendering, and displays stable formatted code without concatenating HTML

#### Scenario: Hostile Markdown is received

- **WHEN** assistant text contains raw HTML, inline CSS, script/style/event markup, a `javascript:` link, an iframe, a form, an image/resource tag, SVG external reference, or Mermaid markup
- **THEN** no active content, resource request, Mermaid execution, or target-bearing link is inserted and Markdown image syntax is represented only by its alt text

### Requirement: Renderer is the sole reconciliation coordinator

The renderer SHALL perform at most one serialized current-generation status-then-messages refresh for terminal, reconnect, or fallback controls, cancel or replace polling timers coherently, and discard stale close/session/generation results. Main SHALL not perform reconciliation REST calls.

#### Scenario: Terminal and close race

- **WHEN** terminal and popover close occur in the same event-loop turn
- **THEN** no stale reconciliation result changes the closed or later-generation transcript

### Requirement: Host-owned thinking state precedes first assistant delta

After accepted `prompt_async` establishes the current active prompt, the popover SHALL show a host-owned three-dot thinking indicator in the assistant area until it accepts the first validated current-generation provisional text delta. The indicator SHALL be transient UI state only and SHALL NOT create, alter, or persist a message DTO or transcript entry. It SHALL stop immediately on first text, terminal/idle, abort, error, polling fallback, close, unmount, navigation, configuration change, or bounded prompt timeout; it SHALL NOT restart after terminal or for stale generation. Reconnect SHALL retain it only while the same active prompt remains current and no text has yet been accepted.

#### Scenario: Accepted prompt has not produced text

- **WHEN** the current active prompt is accepted and no validated provisional text has arrived
- **THEN** the popover shows one host-owned thinking indicator without adding a transcript message

#### Scenario: Stale generation attempts to show thinking

- **WHEN** a closed, invalidated, terminal, or stale generation receives a delayed stream event
- **THEN** the thinking indicator remains absent and no assistant placeholder is created

### Requirement: Thinking indication is accessible without token verbosity

The thinking dots SHALL be `aria-hidden`. The popover SHALL use one stable `role="status"` and `aria-live="polite"` container to announce “OpenCode is thinking” once for an active thinking transition, without repeated announcements; on first text it SHALL change to concise “OpenCode is responding” or hide under existing state behavior. The assistant message body SHALL remain non-live. The indicator SHALL use existing styling and SHALL honor `prefers-reduced-motion` by using static dots rather than animation.

#### Scenario: Reduced-motion preference is active

- **WHEN** the user prefers reduced motion while the current prompt is thinking
- **THEN** the indicator shows static dots and the status announcement remains singular and polite
