import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Two projects, because the two kinds of test need two different worlds.
 *
 * The logic under `src/lib`, `src/config` and `src/worker/protocol.ts` is plain
 * data and pure functions, and it is tested in `node`: no DOM, so nothing can
 * quietly lean on one. Components need a DOM to render into, so they run in
 * `jsdom`. Keeping them apart means a component test cannot accidentally give a
 * unit test a `window` it should never have had.
 *
 * Feature 2 (coding standards & tooling). Vitest 5 removed
 * `environmentMatchGlobs`, so `projects` is the way to do this now.
 *
 * Inline projects inherit this file (`extends` defaults to `true`), so the `@`
 * alias and the exclude list below are set once and apply to both. Neither
 * project sets a Vite level option, so they also share one Vite server and its
 * transform cache rather than starting two.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The browser tests are Playwright's. Vitest must not try to run them.
    exclude: ["tests/e2e/**", "node_modules/**"],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "component",
          environment: "jsdom",
          // `.ts` as well as `.tsx`, so a test of a hook or of a component's
          // plain helpers sits beside the render tests rather than away in
          // `tests/unit` where there is no DOM for it.
          include: ["tests/component/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup/component.ts"],
        },
      },
    ],
  },
});
