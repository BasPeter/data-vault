## 1. Linux E2E keyring setup

- [x] 1.1 Provision libsecret and initialize an ephemeral GNOME Secret Service login keyring in the Linux release E2E job without logging credentials.
- [x] 1.2 Launch E2E Electron with the `gnome-libsecret` password-store backend only in test code and retain the production default.
- [x] 1.3 Add a setup assertion that safe storage is available before secret-persistence scenarios execute.

## 2. Verification

- [x] 2.1 Add or update focused tests for test-launch configuration and encryption availability failure behavior.
- [x] 2.2 Run relevant E2E secret tests and repository typecheck, lint, and format checks; resolve failures before marking complete.
