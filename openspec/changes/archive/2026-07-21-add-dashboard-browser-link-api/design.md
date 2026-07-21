## Context

Dashboard bundles are untrusted executable vault content. Their dedicated sandbox blocks navigation, popups, session egress, and browser permissions, while their fixed preload and authenticated main-process dispatch expose only bounded operations. A dashboard currently cannot make a normal link useful even when the user wants to follow it.

## Goals / Non-Goals

**Goals:**

- Provide one small typed dashboard API for requesting an external HTTPS link.
- Keep the trusted main process responsible for authentication, URL validation, confirmation, and browser launch.
- Prevent the API from becoming a general navigation, protocol-handler, shell, or network-egress capability.

**Non-Goals:**

- In-dashboard navigation, popups, downloads, or network access.
- Support for HTTP, custom schemes, local files, userinfo-bearing URLs, or arbitrary shell commands.
- A repository-controlled permission grant, origin allowlist, or a general-purpose browser API.

## Decisions

### Expose one fixed `dashboardApi.openExternalLink({ url })` operation

The dashboard preload will expose exactly one additive method. It accepts a single bounded URL field and resolves only to a small success result after the trusted flow completes. It does not expose Electron, `shell`, IPC, a window handle, or a way to specify browser options.

The existing fixed operation union, request/result maps, preload freeze, and main-process dispatcher will be extended together so the public contract cannot drift.

**Alternative considered:** permit `window.open` or a link target. Rejected because it bypasses the existing dashboard navigation and popup policy and gives dashboard code ambient browser authority.

### Validate a canonical HTTPS URL at every privilege boundary

The preload will reject malformed input early; the main process will repeat authoritative validation after authenticating the exact active dashboard sender and frame. The policy accepts a string of at most 8,192 UTF-16 code units only when it contains no whitespace or control characters, every percent sign begins a two-hex-digit escape, URL parsing yields an absolute `https:` URL with a non-empty host and empty username and password, and the input exactly equals the parser's serialized canonical URL. The canonical serialized URL must also be at most 8,192 UTF-16 code units. Main will pass only that canonical value to Electron's external-browser facility.

**Alternative considered:** accept arbitrary URLs and rely on the operating system to handle them. Rejected because file, application, and registered custom protocols can have privileged side effects.

### Use host-owned per-request confirmation before launch

Before opening the external browser, main will present trusted host-owned confirmation that displays the complete canonical URL, without dashboard-controlled rendering or truncation. It will launch the browser only after the user affirms; cancellation returns a bounded non-success result. The dialog is rate-limited and tied to the active runtime so a stale or forged dashboard cannot create a prompt or launch a link. Dashboard teardown, vault/dashboard switch, crash, or runtime-generation change cancels a pending confirmation; after affirmation, main re-authenticates the same sender, frame, runtime, and generation before launching.

This makes the action intentional even though a dashboard bundle is untrusted and could otherwise encode approved vault data into a destination URL.

**Alternative considered:** open every valid HTTPS URL immediately. Rejected because an untrusted dashboard with access to structured vault data could silently exfiltrate that data through a URL query string.

### Preserve the dashboard runtime's containment controls

`setWindowOpenHandler`, in-place navigation blocking, the isolated-session request filter, CSP, and permission denial remain unchanged. The external-link operation is a narrowly audited main-process action, not an exception in the dashboard web contents policy.

## Risks / Trade-offs

- [Confirmation adds friction to following links] → Display a clear canonical destination and return a bounded cancellation result so dashboards can keep their own link UI responsive.
- [Prompt spam from malicious dashboard code] → Authenticate the active runtime, allow only one pending confirmation, and apply a fixed rate limit.
- [URL parser edge cases] → Use one shared strict parser policy with an 8,192-code-unit bound and exact canonical serialized form, validate independently in preload and main, and cover malformed, oversized, credential-bearing, and non-HTTPS inputs with tests.
- [External pages can still receive user-provided URL data] → Require explicit confirmation for every launch and never add referrers, cookies, or dashboard runtime data to the request.

## Migration Plan

The change is additive: existing dashboards retain their current isolation and do not need a manifest change. Dashboard authoring guidance documents the new API and its confirmation behavior. Rollback consists of removing the operation from the fixed contract; dashboards that adopted it receive the existing bounded unknown-operation failure without weakening runtime containment.

## Open Questions

None. Per-request trusted confirmation is selected as the security-preserving initial behavior; any future remembered-origin or manifest-declared link policy requires a separate proposal.
