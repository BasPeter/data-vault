## 1. Provider registry and trusted install path

- [x] 1.1 Add Pi to the shared provider ID and the trusted main-process fixed-root registry at `~/.pi/agent/skills`.
- [x] 1.2 Add a shared symlink-safe containment guard for generated-skill and marker writes at every fixed provider root, reporting a provider-specific error without writing through a symlink.
- [x] 1.3 Preserve selected-only install, marker/fingerprint, status, and non-destructive deselection behavior for Pi with the containment guard applied.

## 2. User interface and product copy

- [x] 2.1 Update Agent Skills panel fixtures and provider-facing copy so Pi is selectable and its status is displayed through the shared provider contract.
- [x] 2.2 Update provider lists in relevant product documentation and guided-tour text without changing unrelated guide content.

## 3. Verification

- [x] 3.1 Add focused installer tests for Pi’s fixed target, all generated skills, selected-only writes, failure isolation, freshness/tamper handling, and symlink-escape rejection for every provider root.
- [x] 3.2 Update Agent Skills panel tests and E2E coverage for Pi and all three generated skills.
- [x] 3.3 Run the narrowest relevant tests, lint/format/type checks, and a build as applicable; obtain independent Reviewer approval because the security allowlist changes.
