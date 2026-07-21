## Context

Secret persistence deliberately requires Electron `safeStorage` with OS-keychain-backed encryption. Linux release CI failed these tests with the correct encryption-unavailable error.

The original premise was that headless CI did not establish a usable GNOME Secret Service login keyring. That premise was wrong, and it survived three failed fix attempts before a probe disproved it. The keyring was fine; the test harness was overriding the password store at runtime. Both findings are recorded below, in the order they were established, because the sequence is the useful part: the keyring work is what made the real cause visible.

## Goals / Non-Goals

**Goals:** establish an ephemeral CI keyring, select `gnome-libsecret` for E2E Electron, and fail setup clearly if encryption remains unavailable.

**Non-Goals:** changing production secret storage, accepting Electron `basic`, logging a keyring password or secret value, or weakening encryption requirements.

## Decisions

Provision libsecret and run E2E inside a D-Bus session. Add the Electron password-store switch only in the E2E launcher. Test setup asserts safe storage availability before persisting a secret.

Establish the keyring with a single `gnome-keyring-daemon --daemonize --unlock --components=secrets` invocation, then prove the Secret Service works with a `secret-tool` store/lookup/clear probe of the default collection before Playwright starts.

**Superseded approach:** `gnome-keyring-daemon --login` followed by `--start --components=secrets`, consumed via `eval "$(...)"`. This shipped twice and failed twice on CI, and neither failure could be diagnosed. Two independent mechanisms hid it:

- `gkd_main_complete_initialization` discards the return values of its startup and initialize steps, so gnome-keyring exits 0 even when the login keyring was never created, `org.freedesktop.secrets` was never owned, or no default collection exists.
- A non-zero exit inside `eval "$(cmd)"` does not trip `bash -e`, so the step could not fail on keyring setup failure.

Chromium compounds this from the other side: `KeyStorageLibsecret::Init()` returns true if `libsecret-1.so.0` merely loads, without ever contacting the Secret Service. A backend is therefore "selected" even when no daemon is running, and the failure only surfaces much later as `isEncryptionAvailable() === false`.

The probe is the load-bearing part of this decision. `secret-tool` with no `--collection` resolves `SECRET_COLLECTION_DEFAULT` and issues the same D-Bus sequence Chromium's `AddRandomPasswordInLibsecret()` does — `ReadAlias("default")` then `CreateItem` — so it covers all three hidden failure modes at their source. The goal is not to make gnome-keyring honest but to verify its outcome from outside.

### Selecting the backend is not a command-line concern

CI proved the keyring healthy and the app still ran on plaintext storage. Playwright's Electron loader hardcodes the insecure password store and applies it with `app.commandLine.appendSwitch` from a `-r` preload that runs in `PostEarlyInitialization`. Chromium's switch map is a plain assignment, and Electron does not read the value until `PostCreateMainMessageLoop`, so the loader's write always beats a command-line argument.

Select the backend from a second `-r` preload injected after Playwright's. Keep the command-line switch as intent at the launch site.

This is why the first three attempts failed: every one of them reasoned about argv, and argv was never the deciding input. The general lesson is that a test harness may override process configuration at runtime, so asserting on launch arguments proves only what was requested, not what took effect.

**Alternative considered:** use Electron `basic`. Rejected because it permits plaintext persistence and violates the secret-storage security invariant.

**Alternative considered:** set the switch in `electron/main.ts`, which also runs after the loader. Rejected because it puts test-only backend selection into shipped production code.

**Alternative considered:** pass `executablePath` to skip Playwright's loader injection entirely. Rejected because Playwright's `initialize()` unconditionally calls a function that only that loader defines, so it breaks app-ready interception.

## Risks / Trade-offs

- [Headless desktop integration differs by runner] → Explicitly set the libsecret backend and assert availability before test scenarios.
- [Credentials leak in CI] → Use a fixed ephemeral keyring password only via stdin and never log it; do not use application secret values.
- [CI setup regresses] → Keep keyring setup isolated to Linux E2E and fail before tests with a diagnostic.
- [Probe hangs instead of failing] → If the default collection is locked with no prompter available, or D-Bus auto-activates a fresh daemon with no unlocked keyring, the store call blocks on a prompt that never resolves. That would recreate the opaque failure this change exists to remove, so the probe is wrapped in `timeout` and the job is bounded by `timeout-minutes`.
- [macOS local runs prove less than they appear to] → Playwright's loader injects `--use-mock-keychain` one line below the password-store switch this change fixes. It is the same override pattern, still present. On macOS, `isEncryptionAvailable()` therefore reports a functional _mock_ Keychain rather than the real one, so a local run can go green while real OS Keychain integration is unverified — and a future Playwright change that broke our preload would fail silently there. Linux CI is the only gate that proves OS-backed encryption. Follow-up is a single `removeSwitch("use-mock-keychain")` in the same preload, gated on confirming it does not cause prompt-driven hangs on real macOS hardware.

## Migration Plan

The change affects only CI/test launch. Rollback removes the test environment setup; production behavior and stored secrets are unchanged.

## Open Questions

None.
