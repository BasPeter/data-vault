## Why

Dashboards can present useful links, but their isolated runtime deliberately blocks navigation and popups. They need a narrow, supported way to open a user-selected external HTTPS link without exposing Electron's general browser or shell capabilities.

## What Changes

- Add a fixed dashboard API operation for requesting that an external HTTPS URL be opened in the user's default browser.
- Authenticate and validate every request in the main process, including the dashboard sender, a single URL argument, and a strict HTTPS-only URL policy.
- Keep in-dashboard navigation, popups, non-HTTPS schemes, shell access, and unrestricted Electron APIs unavailable to dashboards.
- Update dashboard authoring guidance and automated coverage for the new operation and its security boundary.

## Capabilities

### New Capabilities

- `dashboard-external-links`: Allows an authenticated dashboard to request opening a validated HTTPS URL outside the dashboard runtime.

### Modified Capabilities

- `custom-dashboards`: Extend the fixed dashboard API contract and authoring guidance with the external-link operation.
- `security`: Define the validation and process-boundary constraints for dashboard-initiated external links.

## Impact

The dashboard API contracts, isolated preload, runtime operation policy and dispatch, Electron main-process integration, and dashboard authoring handoff will change. Unit and end-to-end dashboard security/API tests will be extended. No new dependency is expected; the Electron main process will use its existing external-browser facility.
