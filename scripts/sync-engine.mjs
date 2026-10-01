/**
 * Copy the MuPDF engine out of node_modules and into `public/engine/`.
 *
 * Spec 0001 decides the engine is self hosted from `public/`, fetched on first
 * interaction with the drop area. There is a second, harder reason it has to be
 * done this way rather than bundled: MuPDF's WebAssembly glue contains a Node
 * branch that does `await import("module")`, and a browser bundler cannot
 * resolve that specifier even though the branch never runs in a browser. Serving
 * the engine as a plain static asset means the bundler never looks at it.
 *
 * The files are generated rather than committed, so the engine can never drift
 * from the version pinned in package.json, and a 10 MB binary stays out of git.
 * `public/engine/` is gitignored; this script runs before `dev` and `build`.
 */

import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MUPDF_COPYRIGHT, mupdfSourceLinks } from "./lib/mupdf-source.mjs";

const require = createRequire(import.meta.url);

const ENGINE_FILES = ["mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm"];

// The package does not export ./package.json, so resolve its main entry point
// (dist/mupdf.js) and walk up from there instead.
const entryPath = require.resolve("mupdf");
const distDir = dirname(entryPath);
const packageJsonPath = join(distDir, "..", "package.json");
const outDir = join(process.cwd(), "public", "engine");

const { version } = JSON.parse(await readFile(packageJsonPath, "utf8"));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of ENGINE_FILES) {
  await cp(join(distDir, file), join(outDir, file));
}

// A plain record of what shipped. The last two lines are AGPL section 6(d)'s
// "clear directions next to the object code": where to get the source of this
// exact version, in the same folder as the wasm and its glue (spec 0009, AC-17).
const { archive, tree } = mupdfSourceLinks(version);
await writeFile(
  join(outDir, "VERSION"),
  [
    `mupdf ${version}`,
    "AGPL-3.0-or-later",
    MUPDF_COPYRIGHT,
    `Source: ${archive}`,
    `Browse: ${tree}`,
    "",
  ].join("\n"),
  "utf8",
);

console.log(`[sync-engine] mupdf ${version} -> public/engine/`);
