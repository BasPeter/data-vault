## 1. Deterministic E2E Fixtures

- [x] 1.1 Set the dashboard runtime fixture content size explicitly before its bounded-view assertion.

## 2. Linux Secret Service

- [x] 2.1 Provision and start a real Linux Secret Service for the GitHub Actions E2E command without enabling an insecure password-store fallback.

## 3. Verification and Review

- [x] 3.1 Run the affected dashboard E2E tests locally where supported and run formatting, lint, typecheck, and unit tests.
- [x] 3.2 Have a Verifier compare the workflow and fixture changes against the security delta spec.
- [x] 3.3 Have a Reviewer confirm CI preserves the OS-keychain-only secret-storage invariant.
