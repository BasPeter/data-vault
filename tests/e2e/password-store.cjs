// Force the OS-backed secret backend for E2E runs.
//
// Playwright's Electron loader hardcodes an insecure plaintext password store
// and applies it with `app.commandLine.appendSwitch` from its own `-r` preload.
// Chromium's switch map is last-write-wins, and Electron does not read the value
// until PostCreateMainMessageLoop, so a `--password-store` argument on the
// command line is silently overwritten before it is ever read.
//
// This preload is injected with a second `-r`, after Playwright's, so the value
// below is the one Electron actually reads. Without it the suite runs against
// plaintext storage, safeStorage reports unavailable, and the secret-persistence
// tests fail for a reason that looks like a broken keyring.
//
// Test-only: production launches never load this file and keep Electron's
// platform default.
const { app } = require("electron");

app.commandLine.appendSwitch("password-store", "gnome-libsecret");
