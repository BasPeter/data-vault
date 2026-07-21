## 1. Permission Contract and Persistence

- [x] 1.1 Add the fixed `selected | all` document-scope contract to permission grant inputs, stored records, effective permissions, and renderer types without bumping the shared dashboard schema version.
- [x] 1.2 Parse legacy permission records without a scope as `selected`, validate new exact scope fields fail-closed, and canonicalize all-scope records with no selected IDs.
- [x] 1.3 Add permission-store tests proving legacy compatibility, all-scope round trips, invalid-scope rejection, lineage replacement, and immediate revocation.

## 2. Trusted Permission UI

- [x] 2.1 Add mutually exclusive Selected documents and All documents controls to the trusted permission dialog, with explicit current-and-future-document consent copy.
- [x] 2.2 Preserve unsaved selections while toggling in the dialog, disable per-document controls under all scope, and submit the canonical scope and IDs through validated IPC.
- [x] 2.3 Add UI and IPC tests for selecting, saving, reopening, changing, cancelling, and revoking both scope modes.

## 3. Host Enforcement

- [x] 3.1 Propagate effective document scope into the active dashboard permission context while keeping it host-owned and digest-bound.
- [x] 3.2 Authorize any currently valid document ID under all scope while retaining current-manifest membership, real-path containment, supported-file, request-count, per-document, aggregate-size, and non-enumerating denial checks.
- [x] 3.3 Add data-layer tests proving future documents enter all scope dynamically, selected scope remains exact, stale/invalid IDs are denied identically, and revocation takes effect immediately.

## 4. End-to-End Coverage

- [x] 4.1 Add an end-to-end trusted-consent test that grants all scope, reads a current document, adds a document, reads the future document, changes scope, and revokes access.
- [x] 4.2 Confirm `vault:index:read` remains independent and dashboard/runtime inputs cannot supply scope, paths, globs, or bulk-read authority.

## 5. Verification and Review

- [x] 5.1 Run the narrow permission-store, dashboard-data, permission-dialog, and affected end-to-end tests.
- [x] 5.2 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test`, and `npm run test:e2e`, surfacing any skipped or unrelated failures.
- [x] 5.3 Have a Verifier compare implementation and tests against both delta specs and confirm no unrelated changes.
- [x] 5.4 Have a Reviewer scrutinize durable future-document consent, backward compatibility, host-only scope authority, revocation, and containment before acceptance.
