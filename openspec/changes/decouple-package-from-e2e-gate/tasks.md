## 1. Unblock packaging

- [x] 1.1 Depend `package` on `test` only, so installers are not withheld by a Linux-only test environment.
- [x] 1.2 Keep `e2e` running on every push and pull request so a failure still marks the workflow failed.
- [x] 1.3 Record in the workflow that the relaxed gate is temporary, what it costs, and the condition under which it is restored.

## 2. Verification

- [x] 2.1 Confirm the workflow parses and that `package.needs` no longer includes `e2e` while `release.needs` still chains through `package`.
- [ ] 2.2 Confirm on a tagged push that installers publish for all three platforms. Not verifiable off CI.

## 3. Restore

- [x] 3.1 Restore `needs: [test, e2e]` once `fix-linux-secret-e2e-keyring` is confirmed green on CI. Restored after run 29841061794 passed 14/14 end-to-end tests with `Selected backend: gnome_libsecret`.

## 4. Status: reverted, do not sync

**This change has been fully reverted and its spec delta MUST NOT be synced into
`openspec/specs/`.** The relaxed gate existed for roughly one hour to unblock a
four-day release outage, and `package` now depends on `[test, e2e]` again. The
`release-pipeline` requirement stating that installers are not gated by
platform-specific test environments is no longer true of this repository.

Archive this change as a historical record of why the gate was relaxed and when
it was restored. Do not treat its spec delta as current.

## 5. Worth re-proposing separately

- [ ] 5.1 Make release publication observable: a tagged push that does not publish should be detectable without reading workflow run history. This is the one requirement from this change that is still worth holding, and it is the reason the outage lasted four days rather than one run. It was never implemented, so it is not carried forward here.
- [ ] 5.2 Split the E2E suite into keyring-dependent and platform-independent Playwright projects, gating `package` on the latter. Would have avoided the whole trade-off, and remains the better end state.
