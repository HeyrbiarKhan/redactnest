import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against a production build, never `next dev`.
 *
 * Two reasons, both from spec 0001. The content security policy is looser in
 * development (Fast Refresh needs `eval` and a websocket), so asserting the
 * policy against a dev server would assert the wrong thing. And the tool route
 * has to be proved to hydrate and work with the real policy enforced, which is
 * the gate that catches the App Router inline script problem here rather than in
 * production.
 */

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Set explicitly rather than leaned on from `.env.local`, so a fresh clone can
 * run these without first being configured. Values set in the environment take
 * precedence over `.env` files in Next.js.
 */
const BUILD_ENV = {
  NEXT_PUBLIC_FREE_PAGE_CAP: "3",
  NEXT_PUBLIC_MAX_PAGES: "50",
  NEXT_PUBLIC_MAX_FILE_BYTES: "26214400",
  NEXT_PUBLIC_SITE_URL: "https://redactnest.test",
  NEXT_PUBLIC_SOURCE_URL: "https://example.invalid/redactnest/tree/test",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm build && pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The engine sync plus a production build plus a 10 MB WebAssembly payload.
    timeout: 300_000,
    env: BUILD_ENV,
  },
});
