## 1. Main-process guest hardening

- [x] 1.1 Enable `webviewTag: true` on the dashboard-hosting `BrowserWindow` in `electron/main.ts`, scoped to that single window.
- [x] 1.2 Add a `will-attach-webview` handler on the host `webContents` that overwrites each guest's `webPreferences` to the sandboxed dashboard profile (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, dashboard preload, isolated non-persistent session) and rejects guests whose `preload`, `partition`, or `src` were not set by trusted host code.
- [x] 1.3 Add a `did-attach-webview` handler that hands the guest `webContents` to the runtime controller so it can install policies against the DOM-created guest instead of a controller-constructed view.

## 2. Runtime controller rework

- [x] 2.1 Change `DashboardRuntimeController.open` to prepare runtime identity, generation, authority mapping, session, and asset snapshot, but obtain the guest `webContents` from the attach hook rather than constructing a `WebContentsView`. (Now `prepare()` returning a descriptor; guest bound in `bindGuest`.)
- [x] 2.2 Move `installSessionPolicy` and `installWebContentsPolicy` to run against the attached guest `webContents`, preserving `onBeforeRequest`, the `vault-dashboard://` protocol handler, permission/download denial, `setWindowOpenHandler(deny)`, navigation prevention, and the `did-fail-load`/`render-process-gone`/`unresponsive`/`responsive`/`destroyed` lifecycle handling.
- [x] 2.3 Remove `setBounds`, `setHostContentBounds`, `detach`, `capture`, `suspend`, `resume`, the bounds/zoom-lock fields, and `removeChildView`/`addChildView` usage; keep `teardown`, authority map, generation, and IPC authentication intact.
- [x] 2.4 Preserve teardown authority: `render-process-gone`/`destroyed` still drive `teardown`; verify no code path depends on the removed native-view attach/detach.

## 3. Renderer host element

- [x] 3.1 Replace the placeholder + snapshot markup in `src/components/dashboard-host.tsx` with a `<webview>` element carrying only trusted host-derived attributes (`src` = `vault-dashboard://<runtime-id>/<entrypoint>`, isolated `partition`; `preload` forced by main, not the markup).
- [x] 3.2 Drive open/reload/stop and status polling from the element lifecycle; remove `reportBounds`, the `ResizeObserver`, the snapshot `<img>`, and the suspend/resume event wiring.
- [x] 3.3 Keep the trusted header, Manage access, reload, and stop controls, and the unavailable/stopped/failed states, working against the new element.

## 4. Remove the overlay workaround

- [x] 4.1 Delete `src/hooks/use-dashboard-overlay.ts` and remove `useDashboardOverlay` calls in `vault-changes-indicator.tsx`, `vault-switcher.tsx`, and `update-button.tsx`.
- [x] 4.2 Remove `suspendDashboardForOverlay`/`resumeDashboardForOverlay` usage from `src/App.tsx` (`beginTrustedFlow`/`endTrustedFlow`).
- [x] 4.3 Remove the `setDashboardBounds`, `setDashboardContentBounds`, `captureDashboard`, `suspendDashboard`, and `resumeDashboard` methods from `electron/preload.ts`, the `vaultApi` surface, and `src/types.ts`, plus their IPC handlers in `electron/main.ts`.

## 5. Consent and overlay isolation

- [x] 5.1 Spike: confirmed a `<webview>` mounts from the descriptor, attaches through the hardened hooks, loads `vault-dashboard://` via the isolated session with the forced sandbox profile, and reaches `ready`/`attached` (smoke e2e). `display:none` reshow to be exercised by the overlay-layering test (6.2).
- [x] 5.2 Implement the privileged permission flow so the `<webview>` is hidden via `display:none` (keep-alive, per Decision 5) — not merely covered — while the trusted consent surface is shown and focused, satisfying "cannot overlay, intercept, or capture focus." (Host `hidden` prop, driven by `trustedFlowActive` in App.tsx.)
- [x] 5.3 Confirm lightweight overlays (quick notes, git status panel, header popovers, dialogs) render above the dashboard purely via DOM z-index with no suspend logic. (e2e: header overlays layer without hiding/tearing down.)
- [x] 5.4 On overlay open, explicitly focus the trusted surface and blur the guest; on close, return focus to the host document rather than auto-refocusing the guest (Decision 7). (Host blurs the guest on hide; Radix overlays focus themselves.)

## 6. Tests

- [x] 6.1 Rewrite `tests/e2e/dashboard-runtime.spec.ts` to locate the guest via the runtime mapping/attach hook instead of `WebContentsView` instances, and assert attachment, load, lifecycle, and teardown.
- [x] 6.2 Add an e2e test proving trusted overlays (git status panel, quick notes, a dialog) visibly layer over a running dashboard.
- [x] 6.3 Add an e2e/integration test proving the permission flow leaves the dashboard unable to receive input or focus during consent.
- [x] 6.4 Add a test that a guest `<webview>` cannot attach with escalated `webPreferences` and that guest script cannot read the host renderer DOM, `window.vaultApi`, cookies, or storage.
- [x] 6.5 Update or remove unit tests tied to bounds/zoom/snapshot/detach (`dashboard-runtime-policy`, bounds validation) that no longer apply.

## 7. Verification

- [x] 7.1 Run `npm run typecheck`, `npm run lint`, and `npm run format:check`. (All green; also `npm run build` succeeds.)
- [x] 7.2 Run the narrow dashboard unit tests, then `npm run test`. (314 unit tests pass.)
- [x] 7.3 Run `npm run test:e2e`. (17 Playwright tests pass.)
- [x] 7.4 Re-verify `dashboard-secrets` and `dashboard-external-links` invariants hold under the new layering. (111 focused invariant tests pass.)
- [ ] 7.5 Reviewer sign-off on the security-requirement changes before archiving.
