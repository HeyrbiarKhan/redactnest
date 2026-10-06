import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vitest/config";

/**
 * A static `.png` import as Next.js gives one to `next/image`: its URL and its
 * pixel size, read from the file's own PNG header. Vite alone gives a bare
 * path, which `next/image` refuses for want of a width, so without this no
 * component holding a static image (the home page's product shot, spec 0013
 * AC-12) could render in a test.
 */
function staticImages(): Plugin {
  return {
    name: "redactnest:static-images",
    enforce: "pre",
    load(id) {
      const [file = ""] = id.split("?");
      if (!file.endsWith(".png")) return null;
      const bytes = readFileSync(file);
      const image = {
        src: `/${basename(file)}`,
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      };
      return `export default ${JSON.stringify(image)};`;
    },
  };
}

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
 * alias, the static image loader and the exclude list below are set once and
 * apply to both. Neither project sets a Vite level option, so they also share
 * one Vite server and its transform cache rather than starting two.
 */
export default defineConfig({
  plugins: [staticImages()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Throws on import outside React's server build, which is its whole
      // job in the app and the wrong thing in a unit test of server code.
      "server-only": fileURLToPath(
        new URL("./tests/setup/server-only.ts", import.meta.url),
      ),
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
