## 1. Contracts and manifest schema

- [x] 1.1 Add `DashboardStorageLocation` and derived `DashboardListEntry` (manifest + location) contract types — location must NOT be a `DashboardManifest` field — add `secrets:use` to `DASHBOARD_PRIVILEGED_CAPABILITY_IDS`, and add `listSecrets`/`secureFetch` to the `DashboardApi` type and request/response maps in `src/dashboard-contracts.ts`, including fixed limits (secret count, name pattern, origin count, request/response sizes, rate)
- [x] 1.2 Extend `parseManifest` in `electron/dashboard-storage.ts` (and the `exactKeys` list) with the optional `secrets` field: bounded validated names, exact HTTPS origins, no wildcards. Do NOT bump `DASHBOARD_SCHEMA_VERSION` (shared by namespace-config/registry/manifest parsing; a bump breaks every existing vault — see design D5)
- [x] 1.3 Include the `secrets` declaration in the canonical capability-request digest in `electron/dashboard-permissions.ts`
- [x] 1.4 Extend `electron/dashboard-contracts.test.ts`, `electron/dashboard-storage.test.ts`, and `electron/dashboard-permissions.test.ts` for the new field, capability, and digest behavior; add hostile-manifest fixtures (malformed names, wildcard/http origins, extra keys) under `tests/fixtures/dashboards/hostile/`

## 2. App-local storage location

- [x] 2.1 Parameterize `DashboardStorage` root resolution so it can own either the vault namespace or `<userData>/dashboards/<vaultKey>/` with identical layout, validation, atomicity, and trash semantics
- [x] 2.2 Compose both storages in `VaultService` (`electron/vault.ts`): merged discovery (vault first, then app-local, each in registry order), `location` on every dashboard, vault-wins ID-collision handling reported as a recoverable per-dashboard error
- [x] 2.3 Route create/rename/reorder/remove to the owning storage by location; creation accepts a location argument
- [x] 2.4 Implement move-between-locations as copy → register destination → unregister and delete source, with rollback of destination artifacts on failure and preservation of ID, digest, and grants
- [x] 2.5 Extend `electron/dashboard-storage.test.ts` / `electron/dashboard-storage-ipc.test.ts`: app-local root resolution, merged discovery ordering, ID collision, move success, and move rollback on injected failure

## 3. Secret store

- [x] 3.1 Create `electron/dashboard-secrets.ts`: `DashboardSecretStore(userDataDirectory)` with atomic private JSON writes (0600, temp+rename), `safeStorage` encryption, and hard refusal to persist when `safeStorage.isEncryptionAvailable()` is false
- [x] 3.2 Expose store operations: list required names (union across installed dashboards plus orphaned stored names, with requiring dashboards and set/unset status), set, delete — no operation returns a value
- [x] 3.3 Add `electron/dashboard-secrets.test.ts`: encrypt-at-rest, refusal without encryption, set/delete lifecycle, metadata-only listing, file permissions

## 4. Dashboard API: listSecrets and secureFetch

- [x] 4.1 Add `dashboard-api:list-secrets` and `dashboard-api:secure-fetch` methods to `electron/dashboard-preload.ts` with argument validation in `electron/dashboard-preload-validation.ts`
- [x] 4.2 Enforce in `electron/dashboard-runtime.ts` `handleApiCall`: `secrets:use` capability, name declared in manifest, bounded request schema; wire `services.listSecrets`/`services.secureFetch` callbacks in `electron/main.ts`
- [x] 4.3 Implement main-process `secureFetch`: exact declared-origin HTTPS match, fixed injection points, caller headers cannot override injection, redirects returned unfollowed, response size/time/rate bounds, unset-secret bounded error, no secret value in results, errors, or logs
- [x] 4.4 Register the new IPC channels in `electron/main.ts` with `assertTrusted` sender checks, following the existing `dashboard-api:*` pattern
- [x] 4.5 Tests: extend `electron/dashboard-preload-validation.test.ts` and add secureFetch policy tests (undeclared origin, redirect, header override, oversize response, unset secret, ungranted capability) with a mocked network layer

## 5. Trusted UI

- [x] 5.1 Add the storage-location choice (vault vs this computer, default vault) to the dashboard create flow, and a "Move to vault / Move to this computer" action to dashboard management UI, with location shown per dashboard
- [x] 5.2 Build the secrets panel (modeled on `src/components/dashboard-permission-dialog.tsx`): required secrets with requiring dashboards and set/unset status, set/update/delete with never-pre-filled inputs, encryption-unavailable state
- [x] 5.3 Surface a host-owned "missing secret" prompt that opens the secrets panel when a running dashboard reports an unset declared secret; dashboard cannot open or overlay it
- [x] 5.4 Extend the permission consent dialog to render declared secret names and their allowed origins in plain language for `secrets:use` requests

## 6. Agent handoff and verification

- [x] 6.1 Update the agent authoring handoff contract (`dashboard:agent-handoff`) to document the `secrets` manifest field, metadata-only semantics, and `secureFetch` usage
- [x] 6.2 Add e2e coverage in `tests/e2e/`: create app-local dashboard, move between locations, secrets panel set/update, granted `secureFetch` round-trip against a local HTTPS test server, and denial without grant
- [x] 6.3 Run quality gates: narrow vitest suites for touched modules, then `npm run test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
- [x] 6.4 Reviewer pass (security-sensitive change) covering origin binding, no-value-crossing guarantees, and plaintext-refusal behavior
