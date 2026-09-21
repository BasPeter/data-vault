import { describe, expect, it } from "vitest";
import { verifyOpenCodeLinuxRuntimeBackend } from "./opencode-credentials";

// This is deliberately not mocked: it is the CI-facing proof that observes the
// backend Electron actually selected. Normal Node Vitest runs skip it because
// `safeStorage` is unavailable there. Run this target inside Electron CI after
// its ephemeral OS keychain has started: `npx vitest run electron/opencode-credentials.runtime.test.ts`.
const runtimeCanQuerySafeStorage = process.platform === "linux" && Boolean(process.versions.electron);

describe.runIf(runtimeCanQuerySafeStorage)("OpenCode Linux safeStorage runtime verification", () => {
  it("uses the actual selected OS-keychain backend, never basic/plaintext/unknown", () => {
    expect(() => verifyOpenCodeLinuxRuntimeBackend()).not.toThrow();
  });
});
