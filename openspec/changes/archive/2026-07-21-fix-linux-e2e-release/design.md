## Context

Ubuntu CI runs dashboard end-to-end tests under Xvfb. Window-manager
decorations make outer-window dimensions unsuitable for fixed content-bound
assertions, and no desktop Secret Service is started by default. The product
correctly refuses secret persistence without OS-backed encryption, so the test
environment—not application security behavior—must change.

## Goals / Non-Goals

**Goals:**

- Make the dashboard runtime bounds fixture independent of native window
  decorations.
- Run secret E2E coverage with an actual Linux Secret Service.
- Preserve the no-plaintext-fallback secret-storage invariant.

**Non-Goals:**

- Change production `safeStorage` behavior or secret persistence formats.
- Add a CI-only insecure encryption backend or disable secret E2E coverage.
- Change dashboard runtime layout behavior.

## Decisions

- Set the fixture's content size explicitly before its fixed bounds assertion.
  This tests the intended 56px host header calculation without relying on an
  operating system's outer-window decoration size. Deriving the expectation
  from the current content size was considered, but would reduce fixture
  clarity and leave its intended layout size implicit.
- Start `gnome-keyring-daemon` with its secrets component inside a DBus session
  around the Linux E2E command. This provides the real Secret Service Electron
  requires. `--password-store=basic` was rejected because it bypasses
  OS-keychain-backed encryption.

## Risks / Trade-offs

- [Keyring startup differs across runner images] → install the required keyring
  package and start it explicitly in the workflow command.
- [CI shell quoting obscures the setup] → keep the command small and run the
  existing E2E script unchanged inside the prepared session.
- [Content-size call could affect fixture timing] → set it before opening the
  runtime and retain the existing assertion and lifecycle coverage.
