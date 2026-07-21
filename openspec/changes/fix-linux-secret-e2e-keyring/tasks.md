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
- [x] 3.6 Confirm on CI that the probe passes. Confirmed on run 29838545900: the probe stored, looked up, and cleared a value in the default collection without error, proving the Secret Service healthy.

## 4. Actual root cause: Playwright overwrites the password store

The probe in section 3 did its job and disproved the premise of this change. The
keyring was never broken. With a healthy Secret Service the E2E app still
reported `Selected backend: basic_text`, because Playwright's Electron loader
appends the insecure plaintext store via `app.commandLine.appendSwitch` from its
own `-r` preload. Chromium's switch map is last-write-wins and Electron reads the
value later, so the command-line switch was overwritten before it was ever read.

- [x] 4.1 Inject a test-only `-r` preload after Playwright's that selects `gnome-libsecret`, so the OS-backed backend is the value Electron actually reads.
- [x] 4.2 Keep the command-line switch at the launch site: it documents intent and becomes sufficient if Playwright drops its override.
- [x] 4.3 Extend the launch-configuration guard to assert the preload is injected before the app entry and selects the OS-backed backend, since asserting on the switch alone passed while the suite ran on plaintext storage.
- [x] 4.4 Teach ESLint about CommonJS preloads; the repository had no `.cjs` files and Node's `--require` does not accept ES modules.
- [x] 4.5 Verify the guard fails when the preload is removed, not merely that it passes.
- [x] 4.6 Assert the selected backend directly on Linux rather than inferring it from availability, so the exact regression is named.
- [ ] 4.7 Confirm on CI that the suite reports `Selected backend: gnome_libsecret` and the secret-persistence scenarios pass. Not verifiable off CI.

## 5. Follow-up (not in this change)

- [ ] 5.1 Remove Playwright's injected `--use-mock-keychain` in the same preload, so macOS runs exercise the real Keychain instead of a mock. Requires verification on macOS hardware that it does not introduce prompt-driven hangs. Until then, Linux CI is the only gate proving OS-backed encryption.
