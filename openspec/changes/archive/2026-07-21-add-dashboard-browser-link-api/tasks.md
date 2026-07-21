## 1. Fixed dashboard API contract

- [x] 1.1 Add the typed `openExternalLink` request and bounded success/cancellation result to the dashboard contracts and fixed operation maps.
- [x] 1.2 Expose only the validated, frozen `openExternalLink` method from the dashboard preload and extend its API-surface tests.
- [x] 1.3 Add the operation's schema validation and active-runtime sender/frame authentication to the dashboard runtime policy and dispatch tests.

## 2. Trusted external-browser flow

- [x] 2.1 Implement main-process handling that revalidates the 8,192-code-unit canonical HTTPS URL policy, permits at most one active confirmation, and uses trusted host UI to present the complete untruncated canonical destination.
- [x] 2.2 Cancel pending confirmation on runtime teardown or generation change, re-authenticate the same sender/frame/runtime/generation after affirmation, and launch only a user-confirmed validated URL with Electron's external-browser facility; return bounded cancellation and failure results without leaking runtime context.
- [x] 2.3 Preserve existing navigation, popup, session-request, CSP, and browser-permission denial behavior, adding regression tests around the new flow.

## 3. Authoring and verification

- [x] 3.1 Update generated dashboard authoring handoff text to document the fixed HTTPS-only, user-confirmed API and no broader browser authority.
- [x] 3.2 Add unit coverage for canonical valid URLs; malformed, oversized, non-canonical, non-HTTPS, credential-bearing, whitespace/control-character, and invalid-percent-encoded rejection; complete confirmation display; cancellation; sender/frame authentication; stale runtime rejection before launch; and prompt rate/concurrency bounds.
- [x] 3.3 Add end-to-end coverage that confirms the frozen dashboard API includes the operation and that `window.open` and in-dashboard navigation remain blocked.
- [x] 3.4 Run the narrow dashboard tests, then `npm run typecheck`, `npm run lint`, `npm run format:check`, and the relevant end-to-end test; resolve any failures before marking tasks complete.
