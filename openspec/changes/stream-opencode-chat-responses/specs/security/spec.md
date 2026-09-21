## ADDED Requirements

### Requirement: Streaming is stable-version and fixture proven

Main SHALL enable streaming only when authenticated health proves a strict stable semantic version at least 1.18.16 and a committed authenticated 1.18.16 fixture proves caller-provided `messageID` acceptance, correlated assistant `message.updated.info.parentID`, and supported text delta shape. Prereleases SHALL not stream without separately proven fixture and specification change. Compatible stable versions 1.1.10 through 1.18.15 and any unproven or mismatched schema SHALL use polling only.

#### Scenario: Prerelease is healthy

- **WHEN** health returns a prerelease version at or above 1.18.16 without separately proven fixture support
- **THEN** main does not open `/event` and chat remains polling-only

### Requirement: SSE transport and parsing remain fixed, bounded, and fail closed

Main SHALL use built-in authenticated fetch only for fixed canonical loopback `GET /event`, redirect denial, successful 200 `text/event-stream`, 10-second initial-header timeout cleared after headers, and 45-second inactivity reset only by validated relevant correlated input. It SHALL support incremental UTF-8 CRLF/LF multiline-data parsing, count raw bytes before decode, and enforce 16,384-byte lines, 32,768-byte events, 65,536-byte buffer, depth eight, and rolling ten-second totals of 512 KiB and 200 events including well-formed irrelevant or correlation-mismatched input. Such well-formed input SHALL be ignored after accounting; malformed, invalid UTF-8, oversized, over-budget, or unsupported shapes claiming supported event types, and terminal input, SHALL close/fallback without raw exposure.

#### Scenario: Irrelevant input floods the stream

- **WHEN** comments, irrelevant events, or rejected input exceed either rolling budget
- **THEN** main closes the stream and exposes only fixed fallback control

### Requirement: Projection, correlation, and IPC cannot leak authority

Main SHALL inspect `message.updated` only to validate assistant parent correlation and SHALL project only bound-assistant `message.part.delta` text. It SHALL reject full snapshots, non-text fields, unbound IDs, or provisional growth over 8,000 code units without truncation. It SHALL never expose raw frames, event metadata, info fields, tools, reasoning, paths, diagnostics, errors, headers, credentials, or authorization representations. Every control SHALL carry safe bounded generation and sequence; ACK and readiness SHALL be accepted only from exact trusted frame/current generation and exact sequence where ACK is required.

#### Scenario: Forged control acknowledgement is received

- **WHEN** another frame, stale generation, invalid sequence, or premature readiness invokes stream control
- **THEN** main rejects it without releasing a pending delta or changing subscription authority

### Requirement: Untrusted OpenCode Markdown cannot execute or egress in chat

Every assistant Markdown string from OpenCode SHALL be treated as untrusted before DOM insertion. The renderer SHALL parse complete source snapshots with existing `marked` GFM `async: false`, convert Markdown images to bounded escaped alt text before sanitization, run HTML immediately through central `sanitizeChatMarkdown` in `src/lib/sanitize.ts` or adjacent central sanitizer module, and insert only the complete sanitized result. It SHALL not insert unsanitized HTML, concatenate rendered HTML/deltas, or execute Mermaid. The closed profile SHALL allow only intended GFM tags `p`, `br`, `strong`, `em`, `del`, `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, and `hr`; only `href`/`title` on `a` and bounded `class` on `code`/`pre` if required. It SHALL permit no style, id, src, srcset, poster, data, or event attributes; no `img`, `picture`, `audio`, `video`, `source`, `track`, `iframe`, `object`, `embed`, `svg`, `math`, `form`, or other resource/active tag. DOMPurify safe URL handling SHALL govern href and chat links SHALL not add `target`; renderer navigation restrictions remain authoritative.

#### Scenario: Model output attempts to exfiltrate through Markdown

- **WHEN** model output contains inline style URLs, raw `img` src/srcset, picture/audio/video/source/track, SVG external reference, CSS, executable URL, embedded frame/form, Mermaid, or another resource tag
- **THEN** the rendered chat message creates no script execution, stylesheet, frame, form, resource request, Mermaid execution, or navigation authority beyond existing sanitized-link policy

### Requirement: Thinking state cannot be supplied by OpenCode

The thinking indicator SHALL be derived only from trusted host prompt and stream lifecycle state. Main and renderer SHALL NOT accept an OpenCode event, message, Markdown value, or renderer payload as a command to create or retain thinking UI, and it SHALL not cross IPC as a message DTO or persist in transcript data.

#### Scenario: Remote output imitates a thinking indicator

- **WHEN** OpenCode output contains placeholder-like text, status-like fields, or Markdown intended to imitate a loading state
- **THEN** it is treated only as untrusted message source under the existing projection and sanitization rules and cannot control host thinking state
