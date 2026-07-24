## MODIFIED Requirements

### Requirement: Dashboard execution has a separate ownership boundary

The application renderer MAY own only the `<webview>` DOM element lifecycle and SHALL mount it only from a current main-issued runtime descriptor. Main SHALL retain dashboard discovery, file access, permissions, protocol handling, runtime identity and generation, guest admission and policy, authority mappings, invalidation, teardown, dashboard data operations, and authoritative cross-`WebContents` focus transfer for privileged trusted flows.

#### Scenario: Application opens a dashboard

- **WHEN** trusted host UI requests a registered dashboard
- **THEN** main validates the bundle and issues a runtime descriptor, and the renderer mounts a separate sandboxed guest using only that descriptor's exact `src` and `partition`

#### Scenario: Dashboard requests a host operation

- **WHEN** dashboard code calls its fixed dashboard API
- **THEN** a dashboard-specific preload sends a fixed message that main authenticates against the active sender, frame, runtime identity, and generation before performing the bounded operation

#### Scenario: Renderer manages the dashboard element lifecycle

- **WHEN** the renderer mounts, hides, shows, or unmounts the dashboard `<webview>`
- **THEN** main retains runtime and teardown authority and rejects any stale, unexpected, or mismatched guest rather than admitting it to the active runtime

#### Scenario: Trusted flow transfers focus

- **WHEN** the renderer requests trusted-flow preparation through the narrow authenticated host API while the guest remains mounted and no privileged UI is open
- **THEN** main first attempts mounted guest blur and exact trusted-host focused-contents confirmation; only if that fails may main invalidate authority, initiate teardown, and destroy the exact focused guest proven to belong to the current runtime and generation, never a null, arbitrary, stale, or other-owner guest, then confirm exact trusted-host focus and return `retained` or `destroyed` with the runtime identity; the renderer synchronously hides before privileged UI or hides and aborts on failure

#### Scenario: Trusted flow replaces a destroyed guest before UI

- **WHEN** trusted-flow preparation returns `destroyed`
- **THEN** without invoking trusted-flow preparation again, App hides the slot/input, remounts exactly once with `display:none` and input disabled from creation, and opens privileged UI with DOM focus only after a different runtime ID is attached and ready in the unchanged context and remains hidden/input-inert; otherwise it aborts closed
