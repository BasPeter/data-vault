## 1. Shared Contract and Validation

- [x] 1.1 Extend the dashboard injection union with `authorization-basic`, add the fixed 256-code-unit username limit, and keep `DASHBOARD_SCHEMA_VERSION` unchanged.
- [x] 1.2 Extend preload validation to accept the new exact variant and reject empty, over-limit, colon, CR, LF, and NUL usernames before dispatch.
- [x] 1.3 Add validation tests covering a valid Basic injection and every username rejection boundary, including proof that invalid input performs no downstream action.

## 2. Host-Side Injection and Redaction

- [x] 2.1 Update `applyInjection` to compose the exact UTF-8 `username:secretValue` Basic header in the main process and return its Base64 payload and complete field value as derived sensitive variants.
- [x] 2.2 Update `performDashboardSecureFetch` to combine derived variants with existing secret variants and redact them from every bounded response and error field before return or logging.
- [x] 2.3 Add focused tests proving a known username/secret pair produces the correct authorization header while caller-supplied authorization remains forbidden.
- [x] 2.4 Add the mandatory regression test proving an echoed Base64 credential payload and complete Basic authorization value are scrubbed from the response body and failure output.

## 3. Authoring Guidance

- [x] 3.1 Update generated dashboard skill guidance to document `authorization-basic`, its non-secret username rules, and host-only credential composition without changing persisted schema versions.
- [x] 3.2 Update or add guidance snapshots/tests so the documented contract matches the shared injection union.

## 4. Verification and Review

- [x] 4.1 Run the narrow Vitest files for contract validation, secure-fetch injection/redaction, and generated guidance.
- [x] 4.2 Run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run test`, surfacing any skipped or unrelated failures.
- [x] 4.3 Have a Verifier compare the implementation and tests against both delta specs and confirm no unrelated files changed.
- [x] 4.4 Have a Reviewer scrutinize the widened security wording, derived-value redaction guarantee, and no-version-bump compatibility decision before acceptance.
