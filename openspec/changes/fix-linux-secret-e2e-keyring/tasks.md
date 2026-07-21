## 1. Linux E2E keyring setup

- [x] 1.1 Provision libsecret and initialize an ephemeral GNOME Secret Service login keyring in the Linux release E2E job without logging credentials.
- [x] 1.2 Launch E2E Electron with the `gnome-libsecret` password-store backend only in test code and retain the production default.
- [x] 1.3 Add a setup assertion that safe storage is available before secret-persistence scenarios execute.

## 2. Verification

- [x] 2.1 Add or update focused tests for test-launch configuration and encryption availability failure behavior.
- [x] 2.2 Run relevant E2E secret tests and repository typecheck, lint, and format checks; resolve failures before marking complete.

## 3. Observable keyring setup (revision after CI failure)

The first implementation was verified locally but failed on CI, and the failure
could not be diagnosed because gnome-keyring discards its own initialization
failures and still exits 0, while `eval "$(cmd)"` prevents `bash -e` from
reacting. These tasks make the setup falsifiable rather than guessing again.

- [x] 3.1 Replace the `--login` plus `--start` handshake with a single `--daemonize --unlock --components=secrets` invocation that runs initialization inline instead of discarding its result.
- [x] 3.2 Probe the Secret Service default collection with `secret-tool` before Playwright starts, so keyring failure is reported at its source under `set -euo pipefail`.
- [x] 3.3 Report the selected safe-storage backend in the availability assertion to distinguish "no backend selected" from "backend selected but key derivation failed".
- [x] 3.4 Bound the probe with `timeout` and the job with `timeout-minutes`, so a locked collection with no prompter fails loudly instead of hanging.
- [x] 3.5 Run repository typecheck, lint, and format checks, plus the focused launch-configuration test, and shell-syntax-check the workflow script.
- [ ] 3.6 Confirm on CI that the probe passes and the secret-persistence scenarios run against OS-backed encryption. Not verifiable off CI.
