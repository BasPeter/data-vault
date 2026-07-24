## Why

The dashboard sandbox is rendered as a main-owned Electron `WebContentsView` that Chromium composites **above** the entire renderer DOM. Because a native view is outside every CSS stacking context, no trusted overlay — the quick-notes panel, the git-status panel, header popovers, centered dialogs, or the permission flow — can appear over the dashboard region. The current code compensates by capturing a JPEG still, detaching the native view, and swapping the frozen image in whenever any overlay opens, with every overlay component required to opt in individually. This is fragile (a new overlay that forgets to opt in renders behind the dashboard), visibly flickers a stale screenshot, and spreads dashboard-lifecycle concerns across unrelated UI. The root cause is the layering, not the workaround.

## What Changes

- Render the dashboard sandbox as an in-DOM Electron `<webview>` tag inside the renderer, so it participates in normal DOM stacking and trusted overlays layer over it by z-index. **BREAKING** (internal mechanism): reverses the documented `WebContentsView`-vs-`<webview>` decision recorded in the original custom-dashboards design.
- Enable `webviewTag: true` on the host `BrowserWindow` and lock down every guest at attach time (`will-attach-webview` / `did-attach-webview`): validate the current main-issued runtime descriptor, reject stale, unexpected, or mismatched `src`/`partition` values, and overwrite the preload and sandbox preferences in main.
- Move dashboard runtime lifecycle ownership so the trusted host renderer owns the element while the main process retains authority over the guest `webContents` (session policy, CSP/asset protocol, navigation denial, IPC authentication, teardown) via the attach hooks.
- Replace consent isolation with an ordered handoff: the normal retained path confirms exact host focus, then synchronously hides before privileged UI. If the validated fallback destroys the guest, main has already confirmed exact host focus; the renderer hides the slot/input, remounts exactly once with `display:none` and input disabled from creation, and waits for a different attached, ready same-context runtime that remains hidden/input-inert. It MUST NOT call `prepareDashboardTrustedFlow` again for the replacement. Only then does trusted UI open and receive DOM focus; failure aborts closed.
- **Remove** the detach-and-screenshot workaround: `captureDashboard`/snapshot rendering, `setDashboardContentBounds`/`setDashboardBounds` bounds reporting, the `useDashboardOverlay` per-overlay opt-ins (in `vault-changes-indicator`, `vault-switcher`, `update-button`), and the `suspend`/`resume`/`capture` runtime surface, once the in-DOM element makes them unnecessary.
- Keep unchanged: isolated session partition, the `vault-dashboard://` privileged asset protocol and its snapshot/digest model, the strict CSP, the fixed authenticated dashboard API apart from the narrow trusted-flow preparation call, the permission/grant store, and the external-link confirmation flow.

## Capabilities

### Modified Capabilities

- `architecture`: **Dashboard execution has a separate ownership boundary** — the renderer may own only the `<webview>` DOM element lifecycle from a current main-issued descriptor; main retains runtime and security authority.
- `security`: **Renderer Sandboxing** — the host window now sets `webviewTag: true`; add the constraint that every guest `<webview>`'s `webPreferences` are host-controlled and locked to the sandboxed profile, and that guest creation from untrusted attributes is denied.
- `security`: **Executable dashboards remain untrusted and isolated** — restate the isolation guarantee for an in-DOM guest `webContents` (an out-of-process child frame of the host renderer) rather than a main-owned detached view, keeping "no Node, context isolation, sandbox, isolated non-persistent session, no application preload / `window.vaultApi`, cannot reach the host renderer DOM."
- `security`: **Permission consent is host-initiated and visually isolated** — before privileged UI appears, the in-DOM guest must be hidden or destroyed, input-disabled, and blurred; merely covering it is insufficient.
- `security`: **Dashboard navigation and ambient browser authority are denied** — restate navigation/popup/download/permission denial as enforced on the guest `webContents` obtained through the attach hooks.
- `custom-dashboards`: **Dashboard permissions are understandable and revocable** — the "User manages dashboard access" behavior currently says the app "hides or detaches the dashboard view"; update to the in-DOM isolation mechanism while preserving input-disable and focus-move guarantees.

## Impact

- **Renderer**: `src/components/dashboard-host.tsx` renders and hides the `<webview>`; `src/App.tsx` serializes one hidden replacement-runtime remount before privileged UI after destructive fallback; the snapshot hook and overlay opt-ins are removed.
- **Main**: `electron/dashboard-runtime.ts` (guest acquisition via attach hooks plus current-runtime/generation/authority validation, invalidation, and teardown for the bounded trusted-flow destruction fallback), `electron/main.ts` (`webviewTag: true`, attach hardening, focus transfer and exact focused-host confirmation).
- **Preload / IPC**: `electron/preload.ts` and the `vaultApi` surface lose the bounds/capture/suspend/resume dashboard methods and add the narrow authenticated `prepareDashboardTrustedFlow` call returning `{ disposition: "retained" | "destroyed", runtimeId }`; `src/types.ts` updated accordingly.
- **Tests**: `tests/e2e/dashboard-runtime.spec.ts` and unit tests that assert `WebContentsView` attachment, bounds, and trusted-chrome non-intersection must be rewritten for the DOM element; add coverage proving overlays layer over the dashboard and that consent flows still block dashboard input/focus.
- **Specifications**: modifies `architecture`, `security`, and `custom-dashboards`.
- **Security review**: reverses a previously security-reviewed decision and rewrites hard-constraint requirements in `openspec/specs/security/spec.md`; requires Reviewer sign-off. `dashboard-secrets` and `dashboard-external-links` invariants are mechanism-agnostic and are expected to hold unchanged, but must be re-verified against the new layering.
- **Dependencies**: none added; uses built-in Electron `<webview>`.
