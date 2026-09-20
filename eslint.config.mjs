import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The engine wall, enforced rather than trusted. Spec 0001, INV-5 and INV-6.
 *
 * Document bytes exist in one place only, the worker, and one module only ever
 * touches MuPDF. That is what makes "your document never leaves your machine"
 * structurally true instead of a promise. A single stray import on the main
 * thread quietly removes it, and nothing else would notice.
 *
 * Feature 2 moved this guard here from `tests/unit/boundaries.test.ts`, so it
 * now lands in the editor as you type rather than at the end of a test run.
 *
 * ESLint flat config replaces a rule wholesale rather than merging it, so each
 * zone below restates every restriction that still applies to it. The pieces
 * are named once here and recombined per zone, so a zone can only ever relax
 * what it explicitly names.
 */

const WALL = "src/**/*.{ts,tsx,mts}";

const MUPDF_MESSAGE =
  "Only src/engine may touch mupdf (spec 0001, INV-5: one PDF parser, ever). " +
  "Ask the worker instead, through src/worker/client.ts.";

const ENGINE_MESSAGE =
  "Only src/worker/engine.worker.ts may import @/engine (spec 0001, INV-6). " +
  "Importing it anywhere else drags MuPDF and the document's bytes onto the " +
  "main thread. Talk to the worker through src/worker/client.ts.";

const WORKER_MESSAGE =
  "src/worker/client.ts is the main thread's only route to the engine. A second " +
  "Worker means a second place document bytes can live (spec 0001, INV-6).";

/** Static `import`/`export ... from` of the engine package. */
const noMupdfImport = { group: ["mupdf", "mupdf/*"], message: MUPDF_MESSAGE };

/** Static `import`/`export ... from` of the walled module, by any spelling. */
const noEngineImport = {
  group: ["@/engine", "@/engine/*", "**/engine/index", "../engine", "../../engine"],
  message: ENGINE_MESSAGE,
};

/**
 * The forms `no-restricted-imports` cannot see: `await import("mupdf")`,
 * `typeof import("mupdf")`, and the runtime path the engine is served from,
 * which is a plain string rather than an import specifier.
 */
const noMupdfAnywhere = [
  // `source`, not the older `argument`, which holds the specifier one node
  // deeper and is deprecated. A selector reading `argument.value` matches
  // nothing at all, and a rule that matches nothing fails silently.
  { selector: "TSImportType[source.value=/mupdf/]", message: MUPDF_MESSAGE },
  // Any string naming it at all, which also covers `await import("mupdf")` and
  // the `/engine/mupdf.js` path the engine is served from. Case sensitive, so
  // prose saying "MuPDF" (the AGPL notice in feature 18) is left alone.
  { selector: "Literal[value=/mupdf/]", message: MUPDF_MESSAGE },
];

/**
 * `typeof import("@/engine")` and `await import("@/engine")`, same blind spot.
 *
 * The `.` stands in for the slash on purpose: esquery's selector parser ends a
 * regex at the first `/` and offers no escape for one.
 *
 * Unlike MuPDF above, nothing broader backstops these two, so a selector that
 * quietly matches nothing leaves the form wide open. `tests/unit/engine-wall.test.ts`
 * feeds both spellings through this config and checks they are caught.
 */
const noEngineAnywhere = [
  { selector: "ImportExpression > Literal[value=/^@.engine/]", message: ENGINE_MESSAGE },
  { selector: "TSImportType[source.value=/^@.engine/]", message: ENGINE_MESSAGE },
];

const noNewWorker = [
  { selector: 'NewExpression[callee.name="Worker"]', message: WORKER_MESSAGE },
];

/** A zone's rules, from the restrictions it does not get to relax. */
const zone = (imports, syntax) => ({
  "no-restricted-imports": ["error", { patterns: imports }],
  "no-restricted-syntax": ["error", ...syntax],
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored by scripts/sync-engine.mjs from the pinned mupdf dependency.
    // Not our code, and not ours to lint.
    "public/engine/**",
  ]),

  {
    // Everything inside the wall. No MuPDF, no engine, no second worker.
    // `tests/` is deliberately outside: a unit test of the walled module has to
    // import it to test it, and a test ships to nobody.
    name: "redactnest/engine-wall",
    files: [WALL],
    rules: zone(
      [noMupdfImport, noEngineImport],
      [...noMupdfAnywhere, ...noEngineAnywhere, ...noNewWorker],
    ),
  },
  {
    // The walled module itself. The one place MuPDF is named at all.
    name: "redactnest/engine-wall-engine",
    files: ["src/engine/**/*.{ts,mts}"],
    rules: zone([noEngineImport], [...noEngineAnywhere, ...noNewWorker]),
  },
  {
    // The only importer of the walled module.
    name: "redactnest/engine-wall-worker",
    files: ["src/worker/engine.worker.ts"],
    rules: zone([noMupdfImport], [...noMupdfAnywhere, ...noNewWorker]),
  },
  {
    // The main thread's single door to the worker, so the only `new Worker`.
    name: "redactnest/engine-wall-client",
    files: ["src/worker/client.ts"],
    rules: zone(
      [noMupdfImport, noEngineImport],
      [...noMupdfAnywhere, ...noEngineAnywhere],
    ),
  },
]);

export default eslintConfig;
