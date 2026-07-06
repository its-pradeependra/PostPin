import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for the marketing site, SEO surface and blog publishing flow.
 *
 * Prerequisites (local run):
 *   1. Backend running on http://localhost:4000 with MongoDB + seeded super admin
 *      (cd server && npm run seed && npm run dev)
 *   2. Frontend started automatically by the webServer block below,
 *      or already running on http://localhost:3000.
 *
 * Env overrides:
 *   PLAYWRIGHT_BASE_URL  — test a deployed URL instead of localhost
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — super admin credentials
 *                          (defaults match server/.env SEED_ADMIN_*)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // blog CRUD specs mutate shared state; keep ordered
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
