## 1. Runtime Spike and Contracts

- [x] 1.1 Verify the pinned Electron version's supported main-owned isolated web-contents primitive, including embedding, bounds, focus, crash handling, teardown, and Playwright testability, and record the accepted mechanism in `design.md` before continuing
- [x] 1.2 Obtain independent Reviewer approval of the recorded runtime primitive, z-order/focus isolation, protocol/CSP baseline, and denial strategy before continuing with runtime implementation
- [x] 1.3 Define shared versioned TypeScript schemas for dashboard namespace configuration, registry records, manifests, fixed capability IDs, effective permissions, dashboard API requests/responses, state, and bounded vault-intelligence snapshots
- [x] 1.4 Add hostile and valid synthetic dashboard fixtures that contain no personal vault data, credentials, repository URLs, or external network dependency

## 2. Vault Dashboard Storage

- [x] 2.1 Implement optional `.data-vault/dashboards/registry.json` discovery, explicit namespace ownership in `vault.json`, fail-closed conflict detection, and strict schema validation without changing vaults that lack dashboard configuration
- [x] 2.2 Implement dashboard bundle and entrypoint validation with real-path containment, symlink escape rejection, supported-file handling, duplicate-ID rejection, and focused adversarial tests
- [x] 2.3 Implement atomic main-owned create, rename, reorder, and recoverable remove-to-`.trash` operations with rollback, collision handling, sender and argument validation, plus focused tests
- [x] 2.4 Exclude the reserved dashboard subtree from document indexing, manifest generation, graph/search inputs, and document rendering even when `documentsDirectory` is `.`, and reject exact/descendant document-root overlap, with regression tests proving document behavior is unchanged
- [x] 2.5 Integrate dashboard files into existing repository change reporting and vault refresh/watch behavior as ordinary vault files without treating them as documents

## 3. Isolated Dashboard Runtime

- [x] 3.1 Implement the main-owned single-dashboard runtime with Node.js disabled, context isolation and sandboxing enabled, a non-persistent isolated session, locked/reset trusted-host zoom, main-validated bounds that exclude trusted chrome, and deterministic teardown on switch, vault change, reload, close, crash, and stop
- [x] 3.2 Register the exact `vault-dashboard` standard-and-secure-only privileged scheme before app readiness, then implement a 256-file, 5-MiB-per-file, 25-MiB-total immutable runtime asset snapshot and the opaque custom protocol with single-pass encoded-path normalization, the specified MIME allowlist, `nosniff`, digest binding, and no localhost server or active-runtime filesystem rereads
- [x] 3.3 Enforce the exact dashboard Content Security Policy baseline and a session-level deny-by-default request interceptor plus navigation, popup, frame, form, download, external protocol, service worker, worker, redirect, and browser-permission denial
- [x] 3.4 Implement a dashboard-specific trusted preload exposing only a frozen fixed `window.dashboardApi`, without `window.vaultApi`, Node.js, Electron, raw IPC, paths, or method/channel selection
- [x] 3.5 Authenticate every dashboard API call by exact active webContents and frame, validate every argument and result bound, and invalidate sender authority during runtime teardown
- [x] 3.6 Add runtime tests proving malicious dashboards cannot access or overlap trusted chrome, bypass host zoom/bounds validation, access the application DOM/origin/storage, application preload, Node/Electron, another dashboard, arbitrary files, network, navigation, popups, downloads, or device permissions, and that scheme privileges remain minimal while file-count/size limits plus mid-runtime source mutation cannot bypass digest invalidation

## 4. Dashboard State and Permissions

- [x] 4.1 Implement fixed dashboard-local `readState` and `writeState` operations with JSON validation, 1 MiB encoded limit, 30-writes-per-minute runtime limit, real-path containment, and atomic sibling-file replacement
- [x] 4.2 Add tests for missing, malformed, oversized, non-serializable, traversal, symlink, rate-limited, interrupted, and successful persistent state behavior
- [x] 4.3 Implement trusted per-install permission storage keyed by salted canonical vault real root, dashboard ID, canonical capability request, and a digest of all protocol-served bundle files except state, with fail-closed reads, atomic writes, and no repository-controlled grant fields
- [x] 4.4 Implement effective-capability calculation, bundle/request digest invalidation, selected-document scoping, immediate revocation, and tests for moves, clones, replacement, forged, stale, cross-vault, and cross-dashboard grants
- [x] 4.5 Implement user-initiated trusted host permission UI that explains vault index and selected-document access, detaches or hides and input-disables the dashboard view, captures approval/cancellation, shows current scope, supports revocation, and tests spoofing, z-order, focus, repeated denials, and input capture

## 5. Personal Progress and Vault Intelligence APIs

- [x] 5.1 Implement `getInfo`, `readState`, and `writeState` dashboard APIs and a personal-progress synthetic dashboard proving state survives runtime and application restart
- [x] 5.2 Implement a versioned bounded `readVaultIndex` snapshot containing only permitted document IDs, titles, metadata, tags, and links while excluding absolute paths, repository details, credentials, hidden files, dashboard files, settings, and document bodies
- [x] 5.3 Implement `readDocuments` using bounded arrays of trusted stable document IDs, current index lookup, trusted selected-document scope, containment and size checks, non-enumerating denial errors, and explicit untrusted-string results
- [x] 5.4 Add tests for index truncation/bounds, revoked access, malformed IDs, unapproved documents, path-like identifiers, hidden data, oversized documents, and valid permission-scoped intelligence results
- [x] 5.5 Add a vault-intelligence synthetic dashboard proving index visualization and explicitly selected document reads work while unapproved data stays unavailable

## 6. Application UI and Lifecycle

- [x] 6.1 Extend application view state with a first-class dashboard variant while preserving document tabs and providing a safe fallback when the last dashboard is missing or invalid
- [x] 6.2 Add the Dashboards section above Documents with large responsive squircle launchers, trusted title/icon/colour rendering, active state, deterministic order, keyboard/focus support, accessible names, overflow handling, and empty state
- [x] 6.3 Add the minimal create flow for Personal progress, Vault intelligence, and Blank starting purposes, with app-chosen IDs/paths and a valid opened bundle on completion
- [x] 6.4 Add trusted rename, reorder, removal confirmation, recoverable removal feedback, reload, stop, retry, and broken-dashboard states without letting dashboard failures block other views
- [x] 6.5 Add renderer tests for sidebar placement/order, accessibility, overflow, active state, create/manage flows, permission prompts, revocation, switching, last-view fallback, and recoverable errors

## 7. Agent Guidance

- [x] 7.1 Update generated vault agent guidance to distinguish sanitized documents from executable dashboard bundles, treat returned document bodies as untrusted strings, and describe the exact dashboard directory, manifest, local-assets, state, API, permission, and no-network contracts
- [x] 7.2 Add a trusted copyable agent handoff for the selected bundle and tests proving it never instructs agents to edit outside the bundle or bypass capability approval
- [x] 7.3 Add an example personal dashboard and an example vault-intelligence dashboard to synthetic documentation/fixtures without adding production dependencies or remote assets

## 8. Verification and Review

- [x] 8.1 Run the narrow Vitest files for each changed parsing, path-security, repository-state, IPC, permission, state, API, and renderer module and resolve all failures
- [x] 8.2 Run `npm run test`, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build` and record any explicitly justified skipped check
- [x] 8.3 Run `npm run test:e2e` with synthetic personal, intelligence, broken, and malicious dashboards, including isolation and denial assertions
- [x] 8.4 Run OpenSpec verification, inspect the final diff for unrelated changes, and reconcile every requirement scenario with implementation evidence
- [x] 8.5 Obtain independent Reviewer approval for the architecture, executable-content boundary, path and symlink handling, IPC authentication, permissions, data exposure, CSP/navigation/network policy, failure containment, and whether tests prove intent

## 9. Dashboard UI Refinements

- [x] 9.1 Make the launcher tile overflow (dots) button open the dashboard actions menu on left click, sharing the same actions as the existing right-click context menu
- [x] 9.2 Render each launcher as a coloured squircle icon with the trusted title below it, preserving active state, accessible names, keyboard focus, and overflow behaviour
- [x] 9.3 Propagate the trusted application colour scheme to dashboard runtime view backgrounds via `nativeTheme`, and give newly created bundle templates colour-scheme-aware default styles
- [x] 9.4 Update renderer, storage, and runtime tests covering the overflow menu button, launcher layout, and colour-scheme propagation, then re-run the narrow checks
