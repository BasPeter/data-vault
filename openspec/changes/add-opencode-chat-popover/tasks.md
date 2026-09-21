## 1. Main-Process OpenCode Boundary

- [x] 1.1 Add failing focused tests for canonical port validation; `GET /global/health` requiring `healthy: true` and strict semver >= 1.1.10; fixed routes; documented successful JSON status/content-type acceptance; `prompt_async` 204 No Content acceptance; redirect refusal; 10,000 ms timeout; and 262,144-byte streaming response cancellation before JSON parsing.
- [x] 1.2 Add failing focused tests for decoded JSON nesting >8, unknown-field removal, DTO projection, and every title/text/count/timestamp/role/ID bound.
- [x] 1.3 Implement the built-in-fetch client with only `GET /global/health`, `POST /session`, `GET /session/status`, `GET /session/:id/message`, `POST /session/:id/prompt_async`, and `POST /session/:id/abort`; validate owned ID before global status fetch, project only that ID, map retry to busy, and implement fixed redacted error results and DTO projection.
- [x] 1.4 Add failing focused tests for encryption of one username/password record; Linux unavailable/basic/plaintext/unknown selected safeStorage backends; macOS/Windows unavailable encryption; platform-specific load/save checks; CI runtime-backend verification; and credential/ciphertext/Authorization non-disclosure.
- [x] 1.5 Implement health-gated setup and safeStorage-only credential persistence; on Linux verify the actual selected backend is OS-keychain-backed, and on macOS/Windows verify documented encryption availability; refuse insecure or unproven storage and persist nothing on failure.

## 2. Typed IPC and Current-Lifetime Session Ownership

- [x] 2.1 Add failing preload/main tests for the sole typed methods: setup, remove setup, status, list owned sessions, create session, list messages, send prompt, and abort prompt.
- [x] 2.2 Implement narrow preload methods and matching main handlers that accept only `event.sender === mainWindow.webContents` and `event.senderFrame === mainWindow.webContents.mainFrame`, rejecting all other channels and frames.
- [x] 2.3 Add failing tests that only successful current-configuration `POST /session` grants an ID; unowned, external, stale, cross-frame, cross-window, and prior-configuration IDs cannot be status-checked, read, prompted, or aborted.
- [x] 2.4 Implement in-memory, per-main-frame, configuration-generation session metadata and grants; invalidate them on configuration replacement/removal, main-frame navigation, and window destruction; never call `GET /session` or persist grants.
- [x] 2.5 Add failing tests for malformed/oversized arguments, max 20 sessions, max 100 messages, 8,000-code-unit prompts/text, one in-flight request per session, four per frame, and fixed redacted errors.
- [x] 2.6 Implement argument/result bounds, owned-session status checks, and concurrency limits for every session-scoped operation, including externally busy sessions and abort.

## 3. Native Chat Popover

- [x] 3.1 Add focused component tests for the loaded-shell chat action, accessible popover open/close behavior, focus restoration, setup disclosure, and unavailable/incompatible/authentication failure states.
- [x] 3.2 Implement the round bottom-right trigger and host-owned setup/status UI with the explicit OpenCode ambient-authority disclosure.
- [x] 3.3 Add focused component tests proving the UI offers only sessions created in the current app lifetime, supports creation, renders bounded transcripts, disables busy-session duplicate work, and has no existing-session adoption or server-wide list.
- [x] 3.4 Implement the host-owned current-lifetime session metadata list, transcript, composer, loading, and recovery UI using only typed preload DTOs and no vault context.
- [x] 3.5 Add focused tests for one-second polling, two-minute duration, three consecutive failures, busy/idle transitions, abort, external activity, popover close, and configuration-change cleanup.
- [x] 3.6 Implement bounded status/message polling after `prompt_async`; stop it under every terminal condition without introducing streaming transports.

## 4. Verification and Review

- [x] 4.1 Run the narrow OpenCode client, persistence, DTO, ownership, IPC/preload, component, and App Vitest targets and fix all failures.
- [x] 4.2 Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`.
- [x] 4.3 Run relevant `npm run test:e2e` coverage for setup disclosure, secure-storage backend verification, native owned-session workflow, failure recovery, and no-vault-context behavior.
- [x] 4.4 Have a Verifier compare implementation and tests with every proposal task and delta-spec scenario and confirm no webview, guest-dispatch, renderer-sandbox, or unrelated changes were introduced.
- [x] 4.5 Obtain independent Reviewer approval for backend verification, credential redaction, fixed-route fetch behavior, strict health checks, DTO bounds/projection, IPC/session ownership checks, disclosure, and test strength before syncing or archiving.
