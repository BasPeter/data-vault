import { defineConfig } from "@playwright/test";

// End-to-end tests drive the built Electron application through Playwright's
// Electron runner. They require a production build in `out/`, so run
// `npm run build` (or the `test:e2e` script, which builds first) beforehand.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
