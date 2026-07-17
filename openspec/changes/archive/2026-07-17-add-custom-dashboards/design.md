## Context

The application currently treats vault HTML and Markdown as untrusted document content. `DocumentView` sanitizes rendered HTML and does not execute document scripts. The main application renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`, but its trusted preload exposes a broad typed `window.vaultApi`. Executing dashboard JavaScript in that renderer, or weakening document sanitization, would therefore cross the existing trust boundary.

Dashboards need a different product and runtime model. Users should see a small set of friendly launchers and a simple create flow, while agents should be able to author ordinary HTML, CSS, JavaScript, and local assets. Dashboard source remains untrusted because it is stored in an external vault, can be synced from Git, and can be modified outside the application.

This is a risky, cross-cutting change affecting the application renderer, Electron main process, preload boundaries, vault format, agent guidance, and security policy. No production dependency is assumed.

## Goals / Non-Goals

**Goals:**

- Make dashboards a first-class application view with accessible squircle launchers above Documents.
- Support personal-progress dashboards with portable dashboard-owned state.
- Support vault-intelligence dashboards using least-privilege structured data and explicitly selected document content.
- Let agents author dashboard bundles without granting runtime code filesystem, Node.js, Electron, Git, credential, dialog, or application-renderer authority.
- Isolate dashboard failures, navigation, storage, permissions, and resource use from the main application.
- Keep dashboard bundles versionable and portable with the vault.
- Preserve current document sanitization and all existing main/renderer boundaries.

**Non-Goals:**

- A visual dashboard builder or general-purpose low-code editor.
- Package installation, build pipelines, npm execution, or arbitrary child processes for dashboards.
- Third-party network access in version 1.
- Dashboard self-modification of HTML, CSS, JavaScript, manifests, or other source assets at runtime.
- General filesystem queries, arbitrary SQL/query languages, raw IPC, Git operations, credentials, or application automation.
- Multiple simultaneously running dashboard surfaces.
- Treating dashboards as documents or including dashboard files in the document tree, manifest, search, or graph as documents.

## Decisions

### 1. Dashboards are a first-class view, not document tabs

`App.tsx` will model the active content as a discriminated application view that includes document, graph, and dashboard variants. The selected dashboard occupies the main content area. Existing document tabs remain open and are restored when the user returns to Documents. Only one dashboard runtime is active at a time; it is destroyed on dashboard switch, vault switch, reload, or close.

The sidebar gains a Dashboards section immediately above Documents. It shows ordered, accessible squircle buttons with icon, colour, title, active state, keyboard focus, overflow handling, and a clear create action. The app stores the last selected application view as trusted UI preference; if the referenced dashboard no longer exists or fails validation, startup falls back to the document view.

Alternative considered: represent dashboards as document tabs. Rejected because dashboard lifecycle, permissions, and execution are materially different from sanitized documents and would make the trust boundary harder to understand.

### 2. Dashboard bundles have a separate managed vault layout

Each vault may opt into an application-owned namespace recorded in `vault.json` and containing:

```text
.data-vault/
  dashboards/
    registry.json
    <dashboard-id>/
      dashboard.json
      index.html
      assets/
      state.json
    .trash/
```

The optional `vault.json` dashboard configuration declares the schema version and fixed `.data-vault/dashboards` location, establishing namespace ownership. Enabling dashboards fails closed if that exact directory already contains unrecognized content, if the configured documents directory is exactly the dashboard root or one of its descendants, or if a registry/trash path has the wrong type or is a symlink. When the documents directory is `.` or another ancestor, the reserved dashboard subtree is explicitly excluded from every document operation regardless of normal dot-directory filtering. The application never adopts, moves, overwrites, or reinterprets a pre-existing unowned directory.

`registry.json` is canonical only for deterministic order and stable IDs; the per-dashboard `dashboard.json` is canonical for title, icon, colour, kind, entrypoint, and requested capabilities. Each manifest is versioned and validated. Display metadata is data, never executable configuration. Entrypoints and assets must resolve within the dashboard's own real path after symlink resolution. Dashboard source and state are Git-trackable vault data but are never indexed as documents.

The application creates registry records and bundle skeletons atomically or rolls back the incomplete operation. Agents may edit source, manifest, and local assets within an already selected bundle. The runtime may only update `state.json` through the trusted state API. Rename updates the manifest's title; reorder updates only the registry; removal first stops the runtime and then atomically moves the bundle to a collision-resistant name under `.data-vault/dashboards/.trash/`. Any wrong-type, symlink, or unexpected destination collision fails without changing the registry. Restoration and permanent trash cleanup are not required in the first implementation beyond preserving the moved bundle and presenting its location.

Alternative considered: store dashboards inside the documents directory. Rejected because executable assets could be mistaken for documents and enter document indexing, graph, sanitization, and change-reporting paths.

Alternative considered: store dashboard state only in Electron user data or `localStorage`. Rejected because personal state would not travel or version with the vault. Trusted permission grants and UI preferences do remain in Electron user data because repository-controlled content must never grant itself authority.

### 3. Dashboard JavaScript runs in a dedicated sandboxed WebContentsView

The runtime spike accepts Electron 42.4.1's main-owned `WebContentsView` as the isolated surface for the currently selected dashboard. Main constructs one view with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, a non-persistent isolated session partition, and a dashboard-specific trusted preload, then attaches it with `mainWindow.contentView.addChildView(dashboardView)`. The dashboard preload is a separate electron-vite preload entry and output file passed through `webPreferences.preload`; it does not import, reuse, or load the application preload and therefore never exposes `window.vaultApi`.

The application renderer reserves a placeholder in the main content layout and reports its content-area `DOMRect` whenever layout, scrolling, or window size changes. Because CSS pixels map to Electron device-independent pixels only at the expected host zoom, main locks the trusted application page to zoom factor `1` and zoom level `0`, sets visual zoom limits to `1, 1`, prevents renderer zoom shortcuts and gestures, and resets any observed zoom change before accepting new dashboard bounds. A fixed application-preload method sends only numeric `x`, `y`, `width`, and `height` values. Main accepts updates only from the current main-window webContents and its main frame while the host zoom invariant holds, rejects non-finite, negative-size, out-of-range, or oversized values, rounds the validated CSS-pixel rectangle to enclosing integer device-independent bounds, and intersects it with both the BrowserWindow content bounds and a main-owned allowed dashboard-content rectangle that excludes all trusted application chrome. It calls `dashboardView.setBounds` only with the resulting safe rectangle. An empty intersection or any overlap with trusted chrome detaches the view rather than leaving an off-screen or overlaying input surface. Regression tests vary submitted bounds, layout, resize, and attempted host zoom and assert that the attached `WebContentsView` never intersects trusted chrome. When the dashboard is activated, main attaches it and explicitly calls `dashboardView.webContents.focus()` after bounds are valid; when returning to trusted host UI, main detaches it and focuses the main renderer.

An attached child `WebContentsView` is composited above the BrowserWindow renderer and cannot be safely covered by React/CSS chrome. Consequently, every trusted modal, permission flow, document picker, host error, or other interaction that must appear over the dashboard first invalidates dashboard input authority and removes the view with `mainWindow.contentView.removeChildView(dashboardView)`. Trusted UI is shown and focused only after detachment. Reattachment is allowed only after the trusted flow finishes, the runtime is still current, and fresh validated placeholder bounds have been received.

Main owns the complete event and failure lifecycle. It associates listeners with an opaque runtime generation and ignores stale events; successful load makes the bounded view eligible for attachment, `did-fail-load` produces a host-owned recoverable load error, `render-process-gone` invalidates and destroys the runtime, `unresponsive` exposes a host-owned stop/reload state without prompting from dashboard pixels, `responsive` may clear only the matching transient status, and `destroyed` completes cleanup without attempting reuse. BrowserWindow close, dashboard/vault switch, reload, explicit stop, and application shutdown all call the same teardown operation.

Teardown is idempotent and authority-first: it marks the runtime inactive, removes its authenticated sender/capability mapping and protocol snapshot mapping, and rejects further dashboard API work before detaching the view. It then removes runtime listeners and session hooks, removes the child view if attached, and destroys its webContents if it is not already destroyed. Repeated teardown calls, late events, partial construction failures, and an already-destroyed webContents are harmless and cannot restore authority.

The mechanism is testable with the repository's existing Playwright Electron harness. Tests use the normal application `Page` for trusted launcher, placeholder, detachment, focus-return, and recovery UI; `ElectronApplication.evaluate` identifies the single runtime webContents by its main-owned runtime mapping and can assert attachment, bounds, focus, URL, lifecycle, and destruction or evaluate hostile probes inside that exact webContents. Tests do not assume the native child view is a DOM descendant of the application page or use application-page locators as evidence about dashboard isolation. Synthetic crash/load-failure seams exercise the same main-owned event handlers and teardown path.

Dashboard assets are served through a privileged, read-only custom scheme at `vault-dashboard://<opaque-runtime-id>/...`; no localhost server is introduced. Before `app` becomes ready, main calls `protocol.registerSchemesAsPrivileged([{ scheme: "vault-dashboard", privileges: { standard: true, secure: true } }])` exactly once. Every omitted privilege remains false: `bypassCSP`, `allowServiceWorkers`, `supportFetchAPI`, `corsEnabled`, `stream`, and `codeCache`. The session-scoped protocol handler is registered only after readiness for the isolated dashboard session and does not broaden those scheme privileges. At runtime creation, main validates and reads at most 256 supported regular files, 5 MiB per file and 25 MiB total, into an immutable asset snapshot, computes the security digest from those exact bytes, and maps the opaque runtime identity to that snapshot. The protocol never re-reads mutable source files for an active runtime. Dashboard source edits therefore appear only after reload, when a new snapshot and digest are evaluated and privileged grants are invalidated if bytes changed. Dashboard code cannot address a path, vault, or dashboard other than the runtime mapping established by main.

The protocol response baseline is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; child-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, with no `unsafe-inline` or `unsafe-eval`, plus `X-Content-Type-Options: nosniff`. The MIME allowlist is exactly `text/html`, `text/css`, `text/javascript`, `application/json`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `font/woff`, and `font/woff2`; unsupported types are rejected. Protocol paths are percent-decoded exactly once and reject invalid encodings, NULs, backslashes, absolute forms, and dot segments before real-path containment checks. A session-level interceptor denies all requests except the active opaque custom origin, independently of CSP. The runtime also blocks navigation, popups, downloads, permission requests, external protocols, service workers, and cross-dashboard access. Workers are disabled in version 1.

Alternative considered: an iframe or `srcdoc` in the main renderer. Rejected because origin, preload exposure, storage, and failure isolation are easier to reason about and test with a distinct web contents.

Alternative considered: Electron `<webview>`. Rejected in favour of a main-owned view with a smaller renderer-facing control surface and explicit lifecycle ownership.

### 4. Dashboard capabilities are fixed and least-privilege

The dashboard preload exposes only a frozen `window.dashboardApi` with fixed methods backed by structured-cloneable values:

- `getInfo()` returns the dashboard's own ID, kind, display metadata, and effective capabilities.
- `readState()` and `writeState(value)` access only validated JSON in the dashboard's own `state.json`.
- `readVaultIndex()` returns a bounded read-only snapshot of document IDs, titles, metadata, tags, and links when granted.
- `readDocuments(documentIds)` returns content only for document IDs present in the trusted approval scope.

Dashboard input cannot provide filesystem paths, IPC channel names, method names, vault IDs, permission decisions, or arbitrary query expressions. Main maps the authenticated sender webContents to one runtime context, validates the sender frame and every argument, applies size/rate limits, and returns new data values rather than privileged objects.

`state:read` and `state:write` are dashboard-local capabilities granted by default to valid dashboards. `vault:index:read` and `vault:documents:read` require an explicit per-dashboard user grant. Selected-document grants store stable document IDs chosen in trusted app UI; manifest paths or glob patterns cannot grant access. Version 1 has no network capability.

Alternative considered: expose the existing `vaultApi`. Rejected because it includes unrelated filesystem, Git, sync, GitHub, update, skill, and dialog authority.

Alternative considered: allow a dashboard to run arbitrary read-only filesystem queries. Rejected because paths and query languages expand both data exposure and validation complexity; structured snapshots are sufficient for the two initial dashboard classes.

### 5. Permission approval is trusted app state

The repository manifest declares requested capabilities but never grants them. Grants are stored in trusted application data, keyed by a per-install salted hash of the vault's canonical real root, dashboard ID, canonical capability request, and a digest of every protocol-served bundle file except `state.json`. A vault move or clone therefore requires new approval, repository replacement cannot retain grants for changed code, and any executable source or asset change invalidates privileged grants while ordinary state updates do not. Users can inspect and revoke grants at any time.

The host displays what a dashboard can access in plain language and with recognizable application-owned chrome. Permission management is opened only by a user action in trusted host UI; a manifest change or denied API call may show a passive host-owned status but cannot interrupt the user with a prompt. Before any permission dialog or selected-document picker appears, the dashboard view is hidden or detached, its input is disabled, and focus is moved to the trusted host surface. It remains unable to overlay or capture input until the host flow completes or is cancelled. Dashboard pixels can imitate application visuals, so permission decisions are never accepted inside dashboard content.

### 6. Personal state is portable but tightly bounded

`state.json` is a JSON value owned by one dashboard. Main performs containment and symlink checks, validates serialization, enforces a 1 MiB encoded limit, rate-limits writes to 30 per minute per runtime, and writes atomically through a temporary sibling and rename. A missing file reads as `null`; malformed or oversized state produces a recoverable dashboard error and never prevents vault opening. Runtime writes cannot target source files.

Concurrent Git edits may still conflict like other vault files; the application will surface repository changes through its existing mechanisms rather than inventing state merging in version 1.

### 7. Vault intelligence uses bounded snapshots

Index access returns only fields already derived by the trusted vault indexer and excludes absolute paths, repository URLs, credentials, Git configuration, hidden files, dashboard files, and application settings. The implementation will define and version the response schema and impose count and encoded-size limits. If a vault exceeds the limit, the API returns a deterministic truncated response with an explicit continuation/limit indicator rather than streaming arbitrary filesystem data. Document bodies returned by `readDocuments` remain untrusted strings; host and agent guidance require them to be rendered as text or sanitized by dashboard code rather than inserted as trusted markup.

Document bodies are never included in the index snapshot. `readDocuments` accepts only bounded arrays of approved stable IDs, re-resolves them through the trusted document index, applies current containment and file-size rules, and returns content plus minimal metadata. Revocation takes effect on the next call without requiring dashboard restart.

### 8. Friendly creation and agent handoff are host-owned

The create flow asks only for title, icon/colour, and an optional starting purpose/template choice covering Personal progress, Vault intelligence, or Blank. The app chooses the stable ID and paths, creates a valid skeleton, registers it, and opens it. The UI then offers a copyable agent handoff that identifies the selected bundle and references generated dashboard authoring guidance. Agents are instructed to use only bundle-relative assets and the stable dashboard API, and to request capabilities declaratively rather than bypassing the host.

An invalid or broken bundle appears as a recoverable host error with retry and reveal/edit guidance. It cannot block startup, document browsing, other dashboards, or vault switching.

## Risks / Trade-offs

- **Executable synced content may be malicious** → Treat all bundle source as untrusted, use a separate sandboxed web contents with no app preload, deny network, and require main-validated capabilities.
- **A Chromium or Electron escape would have high impact** → Preserve sandboxing, use no Node/Electron exposure, keep Electron current through existing maintenance, and obtain independent security review.
- **`WebContentsView` integration may conflict with React layout, focus, or automated tests** → Complete the bounded runtime spike first and record the pinned Electron-compatible mechanism before building the remaining tasks.
- **Portable state can create Git conflicts or reveal private progress data when synced** → Make storage location visible, keep state dashboard-local, document Git behaviour, and avoid hidden network transmission.
- **Vault metadata can itself be sensitive** → Require explicit grants for index/document access, exclude paths and repository details, limit results, and support immediate revocation.
- **A dashboard can consume CPU or memory without privileged access** → Run one dashboard at a time, tear it down when hidden, detect crashes/unresponsive state, bound messages/data, and provide a host stop/reload action. Hard per-renderer memory limits are platform-dependent and remain an implementation-spike question.
- **Source changes can race permission checks or asset serving** → Build one immutable, count/size-bounded asset snapshot per runtime, compute grants from its exact digest, and require reload plus reapproval before changed bytes can execute with privileged capabilities.
- **Strict CSP restricts common dashboard libraries** → Agents may vendor static browser assets inside the bundle; remote CDNs and package execution remain unavailable in version 1.
- **Repository-controlled manifests may imitate trusted metadata** → Render all titles/icons/colours as validated data in trusted components and never interpret manifest content as host HTML, IPC, or permission grants.
- **Dashboard pixels may spoof application prompts** → Never initiate approval from dashboard content, detach or hide the view during trusted permission UI, disable its input, and test z-order, focus, cancellation, and repeated-request behavior.

## Migration Plan

1. Add the dashboard format as optional; vaults without `.data-vault/dashboards/` continue unchanged.
2. Add parsing and trusted registry operations behind the new feature path, failing closed on malformed entries while allowing the rest of the vault to open.
3. Obtain independent review of the accepted Electron 42.4.1 `WebContentsView` mechanism, then implement and verify the isolated runtime before exposing dashboard creation.
4. Add the sidebar/view lifecycle, creation flow, permissions, state, and vault data APIs incrementally with synthetic fixtures.
5. Update agent guidance only after the on-disk and API contracts are stable.

Rollback removes the dashboard UI and runtime while leaving the optional `.data-vault/dashboards/` directory untouched as user data. No existing document migration or destructive rewrite is required.

## Open Questions

- What practical CPU/unresponsive timeout and index snapshot limits provide useful dashboards without making large vaults unreliable? These values must be measured with synthetic large-vault fixtures before finalizing implementation defaults.
- Should a later version add explicit allowlisted network origins, or should integrations always be mediated through separately designed host capabilities? Network remains out of scope for version 1.
