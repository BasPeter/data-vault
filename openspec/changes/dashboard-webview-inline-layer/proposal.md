## Why

The dashboard sandbox is rendered as a main-owned Electron `WebContentsView` that Chromium composites **above** the entire renderer DOM. Because a native view is outside every CSS stacking context, no trusted overlay — the quick-notes panel, the git-status panel, header popovers, centered dialogs, or the permission flow — can appear over the dashboard region. The current code compensates by capturing a JPEG still, detaching the native view, and swapping the frozen image in whenever any overlay opens, with every overlay component required to opt in individually. This is fragile (a new overlay that forgets to opt in renders behind the dashboard), visibly flickers a stale screenshot, and spreads dashboard-lifecycle concerns across unrelated UI. The root cause is the layering, not the workaround.

## What Changes

- Render the dashboard sandbox as an in-DOM Electron `<webview>` tag inside the renderer, so it participates in normal DOM stacking and trusted overlays layer over it by z-index. **BREAKING** (internal mechanism): reverses the documented `WebContentsView`-vs-`<webview>` decision recorded in the original custom-dashboards design.
- Enable `webviewTag: true` on the host `BrowserWindow` and lock down every guest at attach time (`will-attach-webview` / `did-attach-webview`): pin `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, the isolated non-persistent session partition, the dashboard preload, and deny any guest whose preferences or `src` were not set by trusted host code.
- Move dashboard runtime lifecycle ownership so the trusted host renderer owns the element while the main process retains authority over the guest `webContents` (session policy, CSP/asset protocol, navigation denial, IPC authentication, teardown) via the attach hooks.
- Replace the visual-isolation mechanism for permission/consent flows: instead of _detaching a native view_, the host _hides or destroys the in-DOM webview and/or covers it with a real trusted overlay that disables its input and takes focus_, preserving the same "dashboard cannot overlay, intercept, or capture focus" guarantee.
- **Remove** the detach-and-screenshot workaround: `captureDashboard`/snapshot rendering, `setDashboardContentBounds`/`setDashboardBounds` bounds reporting, the `useDashboardOverlay` per-overlay opt-ins (in `vault-changes-indicator`, `vault-switcher`, `update-button`), and the `suspend`/`resume`/`capture` runtime surface, once the in-DOM element makes them unnecessary.
- Keep unchanged: isolated session partition, the `vault-dashboard://` privileged asset protocol and its snapshot/digest model, the strict CSP, the fixed authenticated `dashboardApi` IPC surface, the permission/grant store, and the external-link confirmation flow.

## Capabilities

### New Capabilities

- _None._ This is a mechanism change to the existing dashboard runtime; no new capability is introduced.

### Modified Capabilities

- `security`: **Renderer Sandboxing** — the host window now sets `webviewTag: true`; add the constraint that every guest `<webview>`'s `webPreferences` are host-controlled and locked to the sandboxed profile, and that guest creation from untrusted attributes is denied.
- `security`: **Executable dashboards remain untrusted and isolated** — restate the isolation guarantee for an in-DOM guest `webContents` (an out-of-process child frame of the host renderer) rather than a main-owned detached view, keeping "no Node, context isolation, sandbox, isolated non-persistent session, no application preload / `window.vaultApi`, cannot reach the host renderer DOM."
- `security`: **Permission consent is host-initiated and visually isolated** — the guarantee that the dashboard is "hidden or detached, input-disabled, and unable to overlay or capture focus" during consent must be re-expressed for an in-DOM element (hide/destroy and/or cover with a trusted input-blocking overlay), not native detachment.
- `security`: **Dashboard navigation and ambient browser authority are denied** — restate navigation/popup/download/permission denial as enforced on the guest `webContents` obtained through the attach hooks.
- `custom-dashboards`: **Dashboard permissions are understandable and revocable** — the "User manages dashboard access" behavior currently says the app "hides or detaches the dashboard view"; update to the in-DOM isolation mechanism while preserving input-disable and focus-move guarantees.

## Impact

- **Renderer**: `src/components/dashboard-host.tsx` (renders the `<webview>` instead of a placeholder + snapshot), `src/hooks/use-dashboard-overlay.ts` (removed or reduced to nothing), `src/App.tsx` (trusted-flow suspend/resume removed), and the overlay opt-in call sites in `vault-changes-indicator.tsx`, `vault-switcher.tsx`, `update-button.tsx`.
- **Main**: `electron/dashboard-runtime.ts` (construct/attach lifecycle changes from `contentView.addChildView` to guest acquisition via `will-attach-webview`/`did-attach-webview`; `setBounds`/`setHostContentBounds`/`capture`/`suspend`/`resume`/`detach` reworked or removed), `electron/main.ts` (`webviewTag: true`, attach hardening).
- **Preload / IPC**: `electron/preload.ts` and the `vaultApi` surface lose the bounds/capture/suspend/resume dashboard methods; `src/types.ts` updated accordingly.
- **Tests**: `tests/e2e/dashboard-runtime.spec.ts` and unit tests that assert `WebContentsView` attachment, bounds, and trusted-chrome non-intersection must be rewritten for the DOM element; add coverage proving overlays layer over the dashboard and that consent flows still block dashboard input/focus.
- **Security review**: reverses a previously security-reviewed decision and rewrites hard-constraint requirements in `openspec/specs/security/spec.md`; requires Reviewer sign-off. `dashboard-secrets` and `dashboard-external-links` invariants are mechanism-agnostic and are expected to hold unchanged, but must be re-verified against the new layering.
- **Dependencies**: none added; uses built-in Electron `<webview>`.
