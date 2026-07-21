## Context

`secureFetch` currently supports bearer, custom-header, and query-parameter secret injection. Dashboard code cannot read a secret or set `authorization`, so APIs that require HTTP Basic authentication cannot be called. The change crosses shared contracts, preload validation, main-process request construction, redaction, generated guidance, and security requirements.

The existing dashboard-storage design deliberately keeps optional manifest additions at the current `DASHBOARD_SCHEMA_VERSION`: the constant is shared by namespace, registry, and manifest parsers that require exact equality, so incrementing it without a migration would invalidate every existing dashboard configuration and manifest.

## Goals / Non-Goals

**Goals:**

- Let a dashboard declare a non-secret username and reference a secret for host-composed HTTP Basic authentication.
- Keep the resulting authorization value transient and confined to the main process.
- Redact both literal secrets and every credential representation derived during injection.
- Reject malformed usernames before secret resolution or network activity.
- Keep existing dashboards and vault configuration readable without migration.

**Non-Goals:**

- Exposing secret values or general-purpose authorization headers to dashboards.
- Supporting challenge negotiation, digest authentication, or arbitrary authentication schemes.
- Removing the Jira snapshot bridge or changing a dashboard bundle in this change.
- Adding dependencies.

## Decisions

### 1. Add a closed `authorization-basic` injection variant

The shared injection union gains `{ kind: "authorization-basic"; username: string }`. The main process constructs the UTF-8 bytes of `username + ":" + secretValue`, Base64-encodes them, and sets `authorization` to `Basic <payload>` after request headers have passed the existing forbidden-header checks.

This preserves the closed injection schema and the invariant that untrusted dashboard code cannot provide `authorization`. Allowing an arbitrary authorization scheme or permitting dashboard-supplied header values was rejected because either would widen authority beyond the specific Basic-auth use case.

### 2. Validate the username before resolving the secret

The username is a non-empty string of at most 256 UTF-16 code units and MUST NOT contain `:`, CR, LF, or NUL. It is used byte-for-byte, without trimming or normalization, so validation and header composition cannot disagree about the credential pair.

Colon is rejected because it changes the username/password boundary; CR, LF, and NUL are rejected as unsafe control delimiters. Restricting the field to email syntax was rejected because HTTP Basic usernames are not necessarily email addresses.

### 3. Injection returns derived sensitive variants

`applyInjection` returns the final request data plus a collection of sensitive strings it derived. For Basic injection this collection includes the Base64 payload and the complete `Basic <payload>` field value. `performDashboardSecureFetch` combines those strings with the existing raw and URL-encoded secret variants before redacting any response body, returned error, or diagnostic field.

Keeping derivation and variant reporting together makes it difficult to add a new encoded credential without also identifying what must be scrubbed. Reconstructing variants later in the response path was rejected because it duplicates encoding rules and can drift from the transmitted value.

### 4. Do not increment the shared dashboard schema version

`authorization-basic` is an additive member of an already versioned, strictly validated request contract and requires no persisted-data migration. `DASHBOARD_SCHEMA_VERSION` remains unchanged. Generated skill guidance is updated so newly authored bundles can use the variant.

Incrementing the shared constant was rejected because current namespace, registry, and manifest parsers all require an exact version and provide no migration path; a bump would break existing vaults without improving the rejection behavior of older applications, which already reject the unknown union member.

## Risks / Trade-offs

- **[Derived credentials can leak through echoed responses]** → Require the composed payload and complete authorization value in the redaction set, with a regression test that echoes a working credential.
- **[Future injection encodings omit redaction metadata]** → Make `applyInjection` the single source of derived sensitive variants and test each derived injection form.
- **[A username delimiter forges a different credential pair or header]** → Validate length and forbidden characters before resolving a secret or performing network activity.
- **[No schema-version bump means old hosts reject new bundles generically]** → Accept that compatibility behavior; older hosts safely reject the unknown exact-union member, while existing bundles continue to load.
- **[Redaction is exact-string replacement, not information-flow proof]** → Keep response bounds and existing raw/encoded variants; this change guarantees scrubbing of forms the host itself derives, not arbitrary transformations performed by a remote server.

## Migration Plan

No persisted-data migration is required. Release the contract, validation, main-process injection/redaction, guidance, and tests together. Existing manifests remain valid. A manifest using `authorization-basic` becomes usable only on a host containing this change; older hosts reject it as an unknown injection kind. Rollback restores the previous host behavior and causes such manifests to be rejected safely.

## Open Questions

None.
