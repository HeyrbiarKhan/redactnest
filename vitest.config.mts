import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // The browser tests are Playwright's. Vitest must not try to run them.
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
