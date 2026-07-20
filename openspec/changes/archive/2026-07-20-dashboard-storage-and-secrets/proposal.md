## Why

Dashboards can currently live in exactly one place — `.data-vault/dashboards/` inside the vault repository — so every dashboard is synced and shared with the vault whether the user wants that or not; there is no private, per-installation option. Separately, dashboards have no safe way to work with credentials: the security spec forbids exposing credentials through dashboard APIs, so any dashboard that needs an authenticated external service (Notion, Jira, weather APIs, …) is impossible today.

## What Changes

- Add a second dashboard storage location: **app-local** (per-installation, under the app's user-data directory), alongside the existing **vault** location (`.data-vault/dashboards/`, unchanged). The user picks the location when creating a dashboard and can move a dashboard between locations later. Vault dashboards remain shareable via the vault repository; app-local dashboards never enter any vault.
- Add a **secrets store**: named secrets, entered and updated by the user in a trusted host UI panel, encrypted at rest via OS-keychain-backed `safeStorage`. Secret values are never written to any vault repository.
- Add a **required-secrets declaration** to the dashboard manifest (`dashboard.json`): a dashboard lists the secret names it needs.
- Add a secrets panel in the trusted host UI showing every secret required by installed dashboards with its set/unset status, where the user can set, update, or delete values. Opening the panel is prompted when a dashboard requires a secret that is not yet set.
- Add two new dashboard API operations, gated by a new privileged capability:
  - `listSecrets` — returns only the names and set/unset status of the secrets the dashboard declared. Never returns values.
  - `secureFetch` — the dashboard asks the host to perform an outbound HTTP request with a named secret injected (e.g. as an `Authorization` header) by the main process. The host resolves the value, sends the request, and returns the response. The raw secret value never enters dashboard JavaScript or agent context.
- Agents authoring dashboards (e.g. via agent handoff) can declare required secrets and call the same metadata API, but have no operation that returns a secret value.

## Capabilities

### New Capabilities

- `dashboard-secrets`: user-managed named secrets for dashboards — trusted-UI entry and lifecycle, encrypted-at-rest storage outside any vault, manifest-declared secret requirements, metadata-only visibility for dashboards/agents, and host-mediated secret use via proxied outbound requests.

### Modified Capabilities

- `custom-dashboards`: dashboards gain a storage location (vault or app-local) chosen at creation and changeable afterwards; discovery, runtime, and permissions must treat both locations uniformly. Manifest gains a required-secrets field. New privileged capability and API operations for secrets metadata and host-mediated fetch.
- `vault-format`: the vault dashboard namespace remains `.data-vault/dashboards/`, but the spec must state that app-local dashboards exist outside the vault and are never part of vault content, and that secret values are never stored in any vault repository.
- `security`: amend "Dashboard file and data access is least-privilege" — dashboard operations still never accept arbitrary paths or raw credentials, but a fixed, validated host-mediated fetch operation may reference secrets by name. Add requirements: secret values never cross into dashboard or agent context; secrets are encrypted at rest; plaintext fallback when OS encryption is unavailable is refused (secrets unavailable rather than stored insecurely); network egress via `secureFetch` requires an explicit privileged grant.

## Impact

- **Main process**: `electron/dashboard-storage.ts` (root resolution for two locations, move between locations), new `electron/dashboard-secrets.ts` (encrypted store, `safeStorage`), `electron/dashboard-runtime.ts` (capability checks + new service callbacks), `electron/main.ts` (IPC channels, wiring), `electron/dashboard-storage-ipc.ts`.
- **Shared contracts**: `src/dashboard-contracts.ts` (new capability id, manifest field, API operation types, limits), `electron/dashboard-preload.ts`, `electron/dashboard-preload-validation.ts`.
- **Renderer (trusted UI)**: storage-location picker on dashboard create/move; new secrets panel; extension of the permission dialog to show secret/network access.
- **Specs**: `custom-dashboards`, `vault-format`, `security` deltas; new `dashboard-secrets` spec.
- **Tests**: new unit tests alongside each touched module (storage location resolution, secrets store, preload validation, runtime capability enforcement, hostile-manifest fixtures) and e2e coverage for the secrets panel and `secureFetch` path.
- **Dependencies**: none planned — uses Electron `safeStorage` and Node's built-in fetch in the main process.
