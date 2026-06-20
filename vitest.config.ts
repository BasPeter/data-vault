import { defineConfig } from "vitest/config";

// Unit tests live next to the code they cover. The Playwright end-to-end specs
// under `tests/e2e` use a `.spec.ts` suffix and are run by Playwright, so they
// are intentionally excluded from the Vitest run.
export default defineConfig({
  test: {
    include: ["electron/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
  },
});
