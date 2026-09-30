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

/** The one spec that times the page, run in a project of its own. */
const SPEED_SPEC = /checklist-speed\.spec\.ts$/;

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
    /**
     * Every test records a trace, so a failure has one, but without the
     * screencast. The spinner turns for the whole engine load, and a screencast
     * encodes every frame it paints; with the workers opening documents side by
     * side that starved the 10 MB engine download and stretched a two page open
     * from about 2 seconds to 15 to 30, past the 30 second test timeout. The
     * DOM snapshot before and after each action is still in the trace.
     */
    trace: { mode: "retain-on-failure", screenshots: false },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: SPEED_SPEC,
    },
    /**
     * Spec 0007, AC-8. The checklist's speed is a stopwatch, so it runs alone:
     * after every other test has finished, on one worker. Beside the parallel
     * pool it timed the machine, not the page (a 140 ms first render took 7.6 s
     * there while other workers opened documents), and a gate that fails on a
     * healthy tree is one people learn to ignore.
     *
     * A dependency, so if any other test fails this one is reported as not run
     * rather than timed. To run it on its own, pass `--project=speed --no-deps`.
     */
    {
      name: "speed",
      use: { ...devices["Desktop Chrome"] },
      testMatch: SPEED_SPEC,
      dependencies: ["chromium"],
      workers: 1,
    },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The engine sync plus a production build plus a 10 MB WebAssembly payload.
    timeout: 300_000,
    env: BUILD_ENV,
  },
});
