## Context

The custom-dashboards feature runs untrusted, Git-synced dashboard code in an isolated web contents. Today that web contents is a main-owned Electron `WebContentsView` created in `electron/dashboard-runtime.ts` and attached with `window.contentView.addChildView`. A `WebContentsView` is a _native_ surface: Chromium composites it above the whole BrowserWindow renderer, outside every CSS stacking context. The renderer only reserves an empty placeholder div and streams its `DOMRect` to main so the native view lines up with it (`setDashboardBounds` / `setDashboardContentBounds`).

The consequence is that no trusted DOM overlay can appear over the dashboard rectangle. To fake it, `use-dashboard-overlay.ts` captures a JPEG still of the live view, detaches the native view, and renders the frozen image in the placeholder while any overlay is open; every overlay component (`vault-changes-indicator`, `vault-switcher`, `update-button`, plus the permission flow in `App.tsx`) must individually call `useDashboardOverlay`. This is the "workaround" the change targets: fragile opt-in, visible screenshot flicker, and dashboard-lifecycle concerns leaking into unrelated UI.

The original design (`openspec/changes/archive/2026-07-17-add-custom-dashboards/design.md`) chose `WebContentsView` deliberately and rejected both `<iframe>`/`srcdoc` (weaker origin/preload/storage/failure isolation) and `<webview>` (larger renderer-facing surface, less explicit lifecycle ownership). Much of the current security machinery — bounds validation that keeps the view off trusted chrome, zoom-locking, "never intersects trusted chrome" regression tests, and the detach-during-consent guarantee — exists precisely _because_ the view floats above the DOM. This change reverses that decision for the layering benefit while preserving the isolation properties through the `<webview>` guest-attach hooks.

## Goals / Non-Goals

**Goals:**

- Render the dashboard sandbox as a real in-DOM element so trusted overlays layer over it by normal z-index, with no screenshot/detach dance and no per-overlay opt-in.
- Preserve every isolation and authority guarantee: separate web contents, no Node, context isolation, sandbox, isolated non-persistent session, dashboard-only preload, `vault-dashboard://` asset protocol + digest model, strict CSP, navigation/popup/download denial, fixed authenticated `dashboardApi`, and main-owned teardown.
- Preserve the consent guarantee that the dashboard cannot overlay, intercept, or capture focus during permission/document-scope/document-selection flows.
- Delete the now-unnecessary surface: bounds reporting, `capture`/`suspend`/`resume`/`detach`, snapshot rendering, and `useDashboardOverlay`.

**Non-Goals:**

- Changing the dashboard bundle format, the `vault-dashboard://` protocol, the CSP, the permission/grant store, secrets, or the external-link flow.
- Adding any new runtime dependency; `<webview>` is built into Electron.
- Introducing multiple concurrent dashboards; still exactly one active runtime.
- Re-opening the `<iframe>`/`srcdoc` option (rejected again below).

## Decisions

### Decision 1: In-renderer `<webview>` tag over `WebContentsView` or `<iframe>`

Render the dashboard as an Electron `<webview>` element inside `dashboard-host.tsx`. A modern `<webview>` is an out-of-process iframe composited _within_ the page's DOM layer, so a trusted React overlay with a higher z-index genuinely paints over it — the root cause of the layering bug disappears.

- **Why not keep `WebContentsView`:** native compositing above the DOM is the defect; any fix there is still a screenshot/detach workaround.
- **Why not `<iframe>`/`srcdoc`:** collapses process/origin/storage/failure isolation into the host renderer. The original design rejected this for the isolation reasons the security spec depends on; running untrusted synced code this way is a downgrade we will not take.
- **Trade-off accepted:** `<webview>` requires `webviewTag: true` on the host window (larger host surface) and moves element ownership into the renderer. We contain this in Decision 2.

### Decision 2: Main keeps authority via guest-attach hooks; renderer owns only the element lifecycle

The renderer may mount, hide, show, and unmount the `<webview>` only from a current main-issued runtime descriptor. It sets exactly that descriptor's `src` (`vault-dashboard://<runtime-id>/<entrypoint>`) and isolated `partition`; it sets no preload or preference attributes. The main process retains all runtime and security authority by hooking guest creation:

- On the host `webContents`, handle `will-attach-webview` to validate the descriptor identity, reject stale, unexpected, or mismatched `src`/`partition` values, and **overwrite** the preload and all guest `webPreferences` to the sandboxed profile (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, dashboard preload, isolated session).
- On `did-attach-webview`, capture the guest `webContents` and install the exact same policies the controller installs today: session policy (`onBeforeRequest`, protocol handler, permission handlers, download denial), `setWindowOpenHandler(deny)`, `will-navigate` / `will-frame-navigate` / `will-attach-webview` prevention, and the `did-fail-load` / `render-process-gone` / `unresponsive` / `responsive` / `destroyed` lifecycle handling.
- Runtime identity, generation, authority map, and IPC authentication (`authenticate(event)` by `event.sender.id` + frame) are unchanged — they key off the guest `webContents`, which we now obtain from the attach hook instead of constructing directly.

This keeps the renderer-facing control surface narrow: the renderer chooses _when_ and _where_ to mount, main decides _what the guest is allowed to be_.

### Decision 3: Consent isolation by hide or destroy instead of native detach

On an affirmative trusted-flow action, while the guest remains mounted and visible and no privileged UI is open, the renderer first awaits the narrow authenticated `prepareDashboardTrustedFlow` host API. Main first calls `blurWebView()`, focuses host `webContents`, and confirms `webContents.getFocusedWebContents()` is the owning trusted host. If that bounded attempt fails, main may destroy only the exact focused guest that the runtime controller proves belongs to the current runtime, generation, and authority; it invalidates authority and initiates teardown before closing that guest, then confirms exact trusted-host focus. Null, arbitrary, stale, or other-owner guests are never destroyed. The API returns `{ disposition: "retained" | "destroyed", runtimeId }`. After acknowledgment, the renderer uses `flushSync` to commit hide/input removal before opening privileged UI. Any validation or confirmation failure hides the guest and aborts the UI. Renderer DOM blur remains defense-in-depth.

### Decision 4: Remove the bounds/snapshot/suspend surface

With the element in the DOM, the following become dead and are removed rather than left in place: `setDashboardContentBounds`/`setDashboardBounds` IPC and their preload/`vaultApi`/`types.ts` entries; `capture`/`suspend`/`resume`/`detach` on the controller and their IPC; `captureDashboard` and the snapshot `<img>`; the `useDashboardOverlay` hook and its call sites; and the zoom-lock/bounds-validation machinery whose sole purpose was keeping a floating native view off trusted chrome (see Decision 6). Removing dead security-shaped code is part of the change, not a follow-up, so no stale authority path lingers.

### Decision 5: Consent hides the guest keep-alive (`display:none`), unmount as fallback

For the normal `retained` disposition, the renderer synchronously hides the existing guest and opens privileged UI. For `destroyed`, main has already confirmed exact trusted-host global focus after destroying the old guest. The renderer synchronously hides the slot/input, remounts exactly once with `display:none` and input disabled from creation, and tracks bounded readiness for a different attached, ready runtime in the same context that remains hidden and input-inert. It does not call `prepareDashboardTrustedFlow` again: a second destructive-capable preparation could wrongly destroy the hidden replacement and is prohibited. After readiness, trusted UI opens and receives DOM focus. Timeout, context mismatch, or an unhidden/input-active replacement aborts closed. Persisted state survives; in-memory JavaScript state resets.

Unmount (guest destroyed, reloaded on return; `state.json` persists on disk, only in-memory JS state is lost) is the tested fallback if the Electron `<webview>` + `display:none` reshow behaviour proves unreliable (see Open Questions). "Cover a live guest" remains off the table for privileged consent.

- **Why not unmount by default:** full reload on every consent open is slower and drops in-memory dashboard state for no security gain.
- **Why not cover:** a live covered guest keeps an input surface and focus context — weaker, and it reintroduces the "can it intercept?" question the DOM model otherwise closes.

### Decision 6: Drop host-zoom locking entirely; guest zoom is not a security control

The zoom machinery (`lockHostZoom`, visual-zoom limits, zoom-change detach) existed solely because the native view was positioned by numeric CSS-pixel bounds, and CSS-px → device-independent-px mapping only holds at host zoom `1`; a mis-scaled bounds value could drift the floating view over trusted chrome. The DOM model has no bounds arithmetic — the element occupies its CSS box and trusted chrome is stacked above it by z-index — so guest zoom only scales content _inside_ the element's box and cannot escape it to cover trusted UI. The old "never intersects trusted chrome" invariant becomes "trusted overlays paint over the webview," a DOM-stacking guarantee that is tested directly (task 6.2) and does not depend on zoom.

The host-zoom lock is therefore removed, not ported. Optionally set `setVisualZoomLevelLimits(1, 1)` on the guest to stop pinch-zoom desync, but that is UX consistency only, not a security control.

### Decision 7: Move focus explicitly on overlay open/close; do not trust the DOM focus-trap over the guest

A `<webview>` guest is a separate focus context, so renderer focus traps and DOM blur are not authoritative. The retained path uses exact global host identity before hide and UI. After destructive fallback, that confirmation remains authoritative for the flow; replacement readiness verifies the guest stayed hidden/input-inert rather than invoking preparation again. Privileged UI receives DOM focus only after readiness.

## Risks / Trade-offs

- **`webviewTag: true` enlarges the host renderer's attack surface** → Enable it only on the single dashboard-hosting window, force guest `webPreferences` in `will-attach-webview`, and destroy any guest not originating from trusted host attributes. Add a test that a guest cannot attach with escalated preferences.
- **Renderer now owns element lifecycle, risking races (mount/unmount, vault switch, reload) that main used to fully control** → Keep runtime identity/generation and teardown in main; after fallback destruction allow exactly one hidden same-context remount and require a different attached, ready runtime with trusted-host focus before UI. Context change or readiness failure aborts without stale or duplicate remount.
- **`<webview>` is officially discouraged by Electron and its API may change** → Accept as a scoped dependency on a stable-enough element; the guest-attach hooks are the supported main-side control points. Revisit if Electron deprecates it.
- **Consent isolation could regress if an overlay only _visually_ covers the webview while the guest still receives input/focus** → For privileged consent, hide/unmount the webview (no input surface) rather than merely cover it; assert in e2e that dashboard input/focus is unreachable during the flow.
- **OOPIF isolation assumption** → Verify by test that guest script cannot read the host renderer DOM, `window.vaultApi`, cookies, or storage; this is the load-bearing property replacing "native view is not a DOM descendant."
- **Reverses a security-reviewed decision and edits hard-constraint security requirements** → Requires Reviewer sign-off before implementation; re-verify `dashboard-secrets` and `dashboard-external-links` invariants against the new layering even though their wording is mechanism-agnostic.

## Migration Plan

1. Land the spec deltas and this design; obtain Reviewer approval (hard-constraint security requirements).
2. Add `webviewTag: true` and the `will-attach-webview` / `did-attach-webview` hardening in `electron/main.ts` + `electron/dashboard-runtime.ts`, moving policy installation onto the guest obtained from the attach hook while keeping runtime identity/authority intact.
3. Switch `dashboard-host.tsx` to render the `<webview>`; remove the placeholder/snapshot path.
4. Remove bounds/capture/suspend/resume IPC and `useDashboardOverlay`, updating `preload.ts`, `vaultApi`, `types.ts`, `App.tsx`, and the overlay call sites.
5. Rewrite `tests/e2e/dashboard-runtime.spec.ts` and affected unit tests for the DOM element; add overlay-layering and consent-isolation coverage.
6. Run typecheck, lint, unit, and e2e; Reviewer verifies isolation invariants hold.

Rollback: revert the change set; the dashboard returns to the `WebContentsView` mechanism. No on-disk format, protocol, or grant-store change is involved, so no data migration is required.

## Open Questions

- Does Electron `<webview>` + `display:none` reliably repaint on reshow, or does the historical blank/frozen-on-reshow quirk still bite? If it does, Decision 5 falls back from keep-alive hide to conditional unmount. Verify with a spike before building the consent flow.
