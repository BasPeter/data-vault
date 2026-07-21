## Why

Granting a dashboard document access currently requires selecting documents individually, which is impractical for dashboards intended to operate over an entire vault. Users need an explicit trusted option that continues to cover documents added later without repeatedly reopening permission management.

## What Changes

- Add an “All documents” scope to the trusted dashboard permission dialog alongside explicit document selection.
- Define “All documents” as a durable grant covering every current and future valid vault document until the user changes or revokes access.
- Persist the scope in trusted application-private permission state and expose only the effective scope needed for host-side enforcement.
- Preserve bundle/capability digest binding, trusted consent isolation, containment, response bounds, non-enumerating denials, and immediate revocation.
- Keep existing selected-document grants valid and scoped exactly as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-dashboards`: Dashboard document permissions gain an explicit dynamic all-documents scope.
- `security`: Trusted consent and least-privilege requirements define the broader durable scope and its host-only authority.

## Impact

- Shared dashboard permission contracts and renderer API types.
- Trusted dashboard permission dialog and tests.
- Application-private dashboard permission parsing, persistence, and effective grant calculation.
- Host-side dashboard document authorization and data tests.
- End-to-end permission, future-document, scope-change, and revocation coverage.
- No dependency changes and no global dashboard schema-version bump.
