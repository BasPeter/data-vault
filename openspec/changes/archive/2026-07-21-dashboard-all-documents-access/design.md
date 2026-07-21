## Context

Dashboard document grants currently persist only a bounded list of selected document IDs. Enforcement checks each requested ID against that list and current manifest membership. The trusted permission dialog offers per-document checkboxes. This cannot express a continuing grant for every current and future document, and materializing all current IDs would be capped, become stale, and misrepresent the requested behavior.

Permission state is application-private and bound to vault identity, dashboard ID, canonical capability-request digest, and bundle digest. Dashboard content is untrusted and must not be able to request, persist, or restore broader scope itself.

## Goals / Non-Goals

**Goals:**

- Let users choose between selected documents and all current and future documents in trusted UI.
- Persist and enforce all-documents scope as explicit trusted authority.
- Preserve existing explicit selections, digest binding, revocation, containment, current-document validation, and request/response bounds.
- Keep existing permission records readable without a global dashboard schema-version bump.

**Non-Goals:**

- Giving dashboards filesystem, path, glob, or query authority.
- Automatically granting `vault:index:read` when document-content access is granted.
- Changing dashboard document request or response bounds.
- Letting manifests declare or influence document scope.

## Decisions

### 1. Persist a discriminated trusted document scope

Permission grants and effective permissions gain `documentScope: "selected" | "all"`. `selectedDocumentIds` remains the bounded list used only by `selected` scope. Existing records without `documentScope` are parsed as `selected`, preserving their exact authority. New records are written with the explicit discriminator.

Materializing all current IDs was rejected because it excludes future documents, hits the 2,000-ID grant bound, and can accidentally restore access when an old ID reappears.

### 2. All scope is dynamic and evaluated against current valid documents

For `documentScope: "all"`, host enforcement treats any requested document ID that is currently present in the validated manifest as within scope. Existing containment, supported-file, per-document, aggregate-size, and request-count checks still apply. The dashboard API remains ID-based and does not gain paths, globs, or an unbounded bulk-read operation.

### 3. Consent uses an explicit scope choice

Trusted permission UI presents mutually exclusive “Selected documents” and “All documents” choices. The all-documents option states that it includes documents added in the future until access is changed or revoked. Per-document controls are disabled or hidden while all scope is active. Previously selected IDs remain in local dialog state so switching back before saving restores the selection; persisted all-scope grants store an empty selected list to avoid ambiguous authority.

### 4. Scope remains host-owned and digest-bound

The renderer submits the chosen fixed scope through the existing validated permission-management IPC. Main validates the discriminator and selected-ID rules, then persists it in the same app-private, digest-bound grant record. Repository content and dashboard runtime APIs cannot set scope. Revocation and lineage replacement apply identically to both scopes.

### 5. Avoid a global schema-version bump

This is a backward-compatible permission-store evolution: missing scope defaults to `selected`; new records contain the discriminator. The shared `DASHBOARD_SCHEMA_VERSION` remains unchanged because it also gates unrelated vault, registry, and manifest formats with exact matching.

## Risks / Trade-offs

- **[Future sensitive documents become readable automatically]** → Use explicit durable-consent copy and a distinct scope control in trusted, isolated UI.
- **[Old grants silently widen]** → Parse every record without the discriminator as `selected`, never `all`.
- **[Repository content grants broad access]** → Store scope only in app-private trusted state and validate fixed IPC input.
- **[All scope bypasses containment]** → Treat scope membership as only one authorization check; retain current manifest, real-path, file-type, and size enforcement.
- **[Ambiguous selected IDs coexist with all scope]** → Canonicalize persisted all-scope records with an empty selected list.

## Migration Plan

Read legacy permission records as selected scope and write the explicit discriminator whenever a grant is next saved. Existing grants retain identical access. New all-scope grants require affirmative trusted consent. Rollback fails closed for records containing an unknown field unless the old exact parser is made forward-compatible as part of this change; therefore the parser shall explicitly accept the optional discriminator before all-scope records can be written.

## Open Questions

None.
