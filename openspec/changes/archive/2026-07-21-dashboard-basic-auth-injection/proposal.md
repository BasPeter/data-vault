## Why

Dashboard secure fetch can inject bearer, custom-header, or query-parameter credentials, but it cannot authenticate to HTTP Basic APIs because dashboards cannot read secrets or set the forbidden `authorization` header. This leaves Jira Cloud, Confluence, and similar enterprise APIs dependent on stale out-of-band snapshots instead of live dashboard data.

## What Changes

- Add an `authorization-basic` injection kind with a non-secret username; the main process composes `Basic base64(username:secretValue)` and sets `authorization`.
- Validate Basic-auth usernames as non-empty and length-bounded, rejecting colon, CR, LF, and NUL characters.
- Track values derived during injection and redact them from secure-fetch responses alongside raw and URL-encoded secret forms.
- Preserve the boundary that dashboard JavaScript cannot set `authorization` or receive secret values; credential composition remains host-side only.
- Keep `DASHBOARD_SCHEMA_VERSION` unchanged for backward compatibility and update generated dashboard-skill guidance for the additive injection contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard-secrets`: Add host-side HTTP Basic injection and require redaction of every credential form derived from a secret.
- `security`: Permit the host to derive encoded credentials while keeping authorization host-controlled and applying the existing non-disclosure guarantee to derived forms.

## Impact

- Main process: `electron/dashboard-secure-fetch.ts` injection and response-redaction flow.
- Validation: `electron/dashboard-preload-validation.ts` injection validation.
- Shared contracts: `src/dashboard-contracts.ts` injection union, limits, and schema version.
- Generated guidance: `electron/dashboard-storage.ts` injection-kind documentation.
- Tests for validation, Basic-header composition, and redaction of the composed Base64 credential.
- No dependency changes.
