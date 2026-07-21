## 1. Canonical dashboard guide

- [x] 1.1 Add a versioned `vault-dashboard-guide` definition to the generated-skill registry with an independent marker and canonical renderer.
- [x] 1.2 Write the guide's safe read, create, and update workflow, bundle-file boundaries, manifest capability model, local asset constraints, and recovery guidance.
- [x] 1.3 Document every fixed dashboard API method with its input/result shape, capability or confirmation requirements, bounded failures, and security restrictions.
- [x] 1.4 Replace duplicated dashboard API material in `vault-guide` with a concise referral to `vault-dashboard-guide`.

## 2. Installation and Claude plugin integration

- [x] 2.1 Ensure selected-provider install, refresh, status, tamper detection, and freshness behavior include `vault-dashboard-guide` through the existing trusted fixed-root mechanism.
- [x] 2.2 Add the canonical guide to the Claude plugin's fixed archive entries and packaged skill layout, and extend the trusted stale-plugin update prompt's fixed source-skill allowlist and wording.
- [x] 2.3 Update dashboard authoring handoff text to refer agents to the installed dedicated guide.

## 3. Coverage and verification

- [x] 3.1 Extend generated-skill tests for rendering, provider installation/status/currentness, API completeness, and security guidance.
- [x] 3.2 Extend Claude plugin and stale-update prompt tests for the exact new archive entry, canonical guide content, and fixed three-skill source allowlist.
- [x] 3.3 Extend dashboard storage/handoff tests for the dedicated guide referral.
- [x] 3.4 Run focused generated-skill, plugin, and dashboard-handoff tests, then `npm run typecheck`, `npm run lint`, and `npm run format:check`; resolve failures before marking complete.
