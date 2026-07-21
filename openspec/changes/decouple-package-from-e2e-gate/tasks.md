## 1. Unblock packaging

- [x] 1.1 Depend `package` on `test` only, so installers are not withheld by a Linux-only test environment.
- [x] 1.2 Keep `e2e` running on every push and pull request so a failure still marks the workflow failed.
- [x] 1.3 Record in the workflow that the relaxed gate is temporary, what it costs, and the condition under which it is restored.

## 2. Verification

- [x] 2.1 Confirm the workflow parses and that `package.needs` no longer includes `e2e` while `release.needs` still chains through `package`.
- [ ] 2.2 Confirm on a tagged push that installers publish for all three platforms. Not verifiable off CI.

## 3. Follow-up (not in this change)

- [ ] 3.1 Split the E2E suite into keyring-dependent and platform-independent Playwright projects, and gate `package` on the platform-independent project. This restores a meaningful release gate without reintroducing the Linux coupling.
- [ ] 3.2 Restore `needs: [test, e2e]`, or the narrower gate from 3.1, once `fix-linux-secret-e2e-keyring` is confirmed green on CI.
- [ ] 3.3 Surface tagged-push publish failures directly, so a tag without a release cannot go unnoticed for days again.
