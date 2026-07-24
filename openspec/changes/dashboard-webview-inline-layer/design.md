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

### Decision 2: Main keeps authority via guest-attach hooks; renderer owns only the element

The renderer creates the `<webview>` element and sets only trusted, host-derived attributes (`src` = the `vault-dashboard://<runtime-id>/<entrypoint>`, the isolated `partition`, the dashboard `preload`). The main process retains all security authority by hooking guest creation:

- On the host `webContents`, handle `will-attach-webview` to **overwrite** the guest `webPreferences` to the sandboxed profile (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, dashboard preload, isolated session) and reject any guest whose attributes were not set by trusted host code.
- On `did-attach-webview`, capture the guest `webContents` and install the exact same policies the controller installs today: session policy (`onBeforeRequest`, protocol handler, permission handlers, download denial), `setWindowOpenHandler(deny)`, `will-navigate` / `will-frame-navigate` / `will-attach-webview` prevention, and the `did-fail-load` / `render-process-gone` / `unresponsive` / `responsive` / `destroyed` lifecycle handling.
- Runtime identity, generation, authority map, and IPC authentication (`authenticate(event)` by `event.sender.id` + frame) are unchanged — they key off the guest `webContents`, which we now obtain from the attach hook instead of constructing directly.

This keeps the renderer-facing control surface narrow: the renderer chooses _when_ and _where_ to mount, main decides _what the guest is allowed to be_.

### Decision 3: Consent isolation by hide/occlude instead of native detach

The security requirement that the dashboard is "hidden or detached, input-disabled, and unable to overlay or capture focus" during consent no longer has a native detach. In-DOM, we satisfy it by _removing the webview from the layout_ — `display:none` or unmount (see Decision 5) — never by merely covering a still-live guest, because a covered guest keeps an input surface and its own focus context underneath the overlay. A hidden element is not hit-tested and not focusable, so no guest input surface exists, which is what the requirement actually demands. Because the consent surface is genuine DOM and the guest is removed from layout, the "cannot overlay/intercept/capture focus" guarantee is met by the DOM itself rather than by removing a floating native layer. Lightweight overlays that do **not** gate privileged consent (quick notes, git status, header popovers, dialogs) may leave the visible webview in place and rely on z-index layering plus explicit focus handling (see Decision 7).

### Decision 4: Remove the bounds/snapshot/suspend surface

With the element in the DOM, the following become dead and are removed rather than left in place: `setDashboardContentBounds`/`setDashboardBounds` IPC and their preload/`vaultApi`/`types.ts` entries; `capture`/`suspend`/`resume`/`detach` on the controller and their IPC; `captureDashboard` and the snapshot `<img>`; the `useDashboardOverlay` hook and its call sites; and the zoom-lock/bounds-validation machinery whose sole purpose was keeping a floating native view off trusted chrome (see Decision 6). Removing dead security-shaped code is part of the change, not a follow-up, so no stale authority path lingers.

### Decision 5: Consent hides the guest keep-alive (`display:none`), unmount as fallback

For the privileged permission flow, default to `display:none` on the `<webview>` rather than unmounting it. This mirrors today's `suspend()` semantics: the runtime stays alive with no reload and no lost in-memory dashboard state, and the user does not see a jarring reload every time they open Manage access. A hidden element already provides the full input/focus/pixel removal Decision 3 requires, so keep-alive is not weaker than unmount for the security guarantee — unmount is "stronger" only in that the guest ceases to exist, which is not what the requirement needs.

Unmount (guest destroyed, reloaded on return; `state.json` persists on disk, only in-memory JS state is lost) is the tested fallback if the Electron `<webview>` + `display:none` reshow behaviour proves unreliable (see Open Questions). "Cover a live guest" remains off the table for privileged consent.

- **Why not unmount by default:** full reload on every consent open is slower and drops in-memory dashboard state for no security gain.
- **Why not cover:** a live covered guest keeps an input surface and focus context — weaker, and it reintroduces the "can it intercept?" question the DOM model otherwise closes.

### Decision 6: Drop host-zoom locking entirely; guest zoom is not a security control

The zoom machinery (`lockHostZoom`, visual-zoom limits, zoom-change detach) existed solely because the native view was positioned by numeric CSS-pixel bounds, and CSS-px → device-independent-px mapping only holds at host zoom `1`; a mis-scaled bounds value could drift the floating view over trusted chrome. The DOM model has no bounds arithmetic — the element occupies its CSS box and trusted chrome is stacked above it by z-index — so guest zoom only scales content _inside_ the element's box and cannot escape it to cover trusted UI. The old "never intersects trusted chrome" invariant becomes "trusted overlays paint over the webview," a DOM-stacking guarantee that is tested directly (task 6.2) and does not depend on zoom.

The host-zoom lock is therefore removed, not ported. Optionally set `setVisualZoomLevelLimits(1, 1)` on the guest to stop pinch-zoom desync, but that is UX consistency only, not a security control.

### Decision 7: Move focus explicitly on overlay open/close; do not trust the DOM focus-trap over the guest

A `<webview>` guest is a separate (OOPIF) focus context, so a Radix dialog/panel focus-trap may not reliably reclaim keyboard focus from the guest. On overlay open, explicitly focus the trusted overlay's initial element and blur the guest — this is the DOM equivalent of the explicit `window.webContents.focus()` that `detach()` performs today. On close, return focus to the host document rather than auto-refocusing the guest (auto-refocus would steal focus; the user clicks into the dashboard to focus it, as with any embedded content). For the consent flow this is largely automatic because the guest is hidden (Decision 5) and thus already out of the focus order; it matters most for lightweight overlays that leave the guest visible.

## Risks / Trade-offs

- **`webviewTag: true` enlarges the host renderer's attack surface** → Enable it only on the single dashboard-hosting window, force guest `webPreferences` in `will-attach-webview`, and destroy any guest not originating from trusted host attributes. Add a test that a guest cannot attach with escalated preferences.
- **Renderer now owns element lifecycle, risking races (mount/unmount, vault switch, reload) that main used to fully control** → Keep runtime identity/generation and teardown in main; treat the element as a view onto a main-owned runtime. `did-attach-webview` binds generation; `destroyed`/`render-process-gone` still drive teardown. Cover rapid mount/unmount and vault-switch-while-open in tests.
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
