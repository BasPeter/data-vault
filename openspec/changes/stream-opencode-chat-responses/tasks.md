## 1. Fixture proof and compatibility gate

- [x] 1.1 Capture and commit an authenticated real OpenCode 1.18.16 LF-only structural fixture proving documented caller `messageID` acceptance, assistant `message.updated.info.parentID` correlation, text delta, `session.status` idle, and `session.idle`; CRLF, multiline data, and comment keepalives require synthetic parser coverage rather than this live proof. Disable streaming if proof is absent.
- [x] 1.2 Add failing fixture/semver tests for stable 1.18.16+ enablement, 1.1.10 through 1.18.15 polling-only behavior, prerelease polling-only behavior, and schema mismatch fail-closed behavior.

## 2. SSE client and bounded parser

- [x] 2.1 Add failing client tests for fixed authenticated `/event`, redirect/status/type validation, cleared initial-header timer, and relevant-event-only inactivity timer.
- [x] 2.2 Add failing parser tests for chunk byte accounting, UTF-8, CRLF/LF, multiline data, all-input rolling budgets, ignored well-formed unrelated/correlation-mismatched events, fail-closed malformed or supported-type-invalid shapes, hard bounds, terminal close, and unsupported/raw event rejection.
- [x] 2.3 Implement the smallest built-in-fetch parser/client that passes those tests and returns internal correlation candidates only.

## 3. Correlated controller and acknowledged lifecycle

- [x] 3.1 Add failing controller tests that main generates validated user message IDs, puts them in accepted prompt bodies, records only after 204, binds assistant IDs only through exact parent correlation, and ignores unrelated same-session activity.
- [x] 3.2 Add failing controller tests for active prompt teardown, append-only delta bounds, no truncation over 8,000 code units, reconnect provisional clearing, and no main reconciliation REST calls.
- [x] 3.3 Add failing flow-control tests for closed DTO fields, safe generation/sequence bounds on every delta and control, exact generation/sequence ACK identity for every acknowledged control, sequenced non-ACK fallback control, stale/duplicate control rejection, one unacked plus one pending delta, two-second timeout invalidation, and delayed old-batch/new-fallback maximum-two-message behavior.
- [x] 3.4 Add failing reconnect tests for acknowledged reconnect control, 15-second reconciliation-ready gate, slow ten-second reconciliation followed by delta, premature/stale readiness rejection, and terminal closure.
- [x] 3.5 Implement the smallest main lifecycle, delivery, invalidation, and fallback behavior that passes focused tests.

## 4. Typed IPC and renderer coordinator

- [ ] 4.1 Add failing preload/IPC tests for exact-frame start/stop/ACK/readiness/listener operations, closed payload validation, listener cleanup, and forged/cross-generation control rejection.
- [ ] 4.2 Extend typed API, preload, and IPC registration only with the tested protocol.
- [ ] 4.3 Add failing popover tests for generation filtering, immediate reconnect ACK, serialized status-then-messages readiness, same-tick terminal/fallback/close races, timer coordination, and stale result discard.
- [ ] 4.4 Add failing accessibility tests for escaped provisional deltas, bound overflow fallback, one stable polite live region, distinct control announcements, and unchanged busy/abort/poll fallback behavior.
- [ ] 4.5 Add failing Markdown helper/component tests for intended GFM retention, incomplete-fence-to-final transitions, centrally owned `sanitizeChatMarkdown` profile use, raw HTML/XSS/`javascript:` stripping, inline style URLs, raw img src/srcset, picture/audio/video/source/track, SVG external references, CSS, alt-text-only Markdown images, no Mermaid execution, non-live message bodies, and no duplicate final/provisional message.
- [ ] 4.6 Add failing thinking-indicator tests for accepted-prompt-to-first-delta lifecycle, terminal/idle/abort/error/fallback/close/unmount/navigation/config/timeout removal, stale-generation non-restart, reconnect-before-text retention, no transcript placeholder or duplicate provisional/final message, stable single status announcement, and reduced-motion static state.
- [ ] 4.7 Implement renderer subscription, ACK/readiness, reconciliation, sanitized full-source Markdown rendering, host-only thinking state, and UI state using existing styling until component tests pass.

## 5. End-to-end and review

- [ ] 5.1 Add E2E mocked-SSE coverage for fixture correlation, unrelated same-session ignore, versions, paused renderer timeout, delayed old batch, slow reconciliation gate, terminal, overflow, fallback, and accessible status.
- [ ] 5.2 Run narrow suites, then `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and relevant `npm run test:e2e`.
- [ ] 5.3 Request Verifier evidence for artifacts, fixture, bounds, races, and no unrelated changes.
- [ ] 5.4 Request Reviewer approval for correlation, parser, generation, ACK/readiness, and redaction boundaries before sync/archive.
