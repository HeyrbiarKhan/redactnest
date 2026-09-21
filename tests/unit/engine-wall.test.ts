import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The engine wall's lint rules, tested rather than trusted. Spec 0001, INV-5
 * and INV-6.
 *
 * Feature 2 retired `tests/unit/boundaries.test.ts`, which read every file
 * under `src/` and asserted that none of them named MuPDF or imported the
 * engine. The zones in `eslint.config.mjs` took that job so a stray import
 * lands in the editor as you type rather than at the end of a test run.
 *
 * That moved the guard, and left the guard itself unguarded. A mistyped glob,
 * an esquery selector that matches nothing, or two flat config entries in the
 * wrong order would relax the wall in silence, and a clean `pnpm lint` is
 * exactly what you would see either way. The wall is what makes "your document
 * never leaves your machine" structurally true, so it is worth proving.
 *
 * So each case here feeds the real config code it must reject, and code it must
 * allow, and checks the answer.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * One instance for the whole file. Resolving the Next.js config is the slow
 * part and it happens once; every `lintText` after that costs a millisecond.
 */
const eslint = new ESLint({ cwd: ROOT });

/** The two rules the wall is built from. Anything else ESLint says is noise. */
const WALL_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

/**
 * Lint a snippet as if it were the file at `path`, and return only what the
 * wall said about it. The file does not have to exist: the zones match on the
 * path, so this asks the real config what it would do about code nobody has
 * written yet, which is the code we actually want to keep out.
 */
async function wallErrors(path: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path, warnIgnored: false });
  return result.messages
    .filter((message) => message.ruleId !== null && WALL_RULES.has(message.ruleId))
    .map((message) => message.message);
}

/**
 * Matched on instead of the rule id, so a rule that fires for the wrong reason
 * is a failure rather than a pass. Each one is a fragment of the message the
 * config sets, which both spellings of a restriction carry.
 */
const MUPDF = /Only src\/engine may touch mupdf/;
const ENGINE = /may import @\/engine/;
const SECOND_WORKER = /A second Worker means/;
const STORAGE = /Nothing is written to browser storage/;

/** Ordinary main thread code: a route and a shared library, fully walled. */
const ROUTE = "src/app/probe.ts";
const LIBRARY = "src/lib/probe.ts";

/** The three files the config names by hand, so these paths must be exact. */
const ENGINE_MODULE = "src/engine/index.ts";
const WORKER = "src/worker/engine.worker.ts";
const CLIENT = "src/worker/client.ts";

/** Deliberately outside the wall: a unit test has to import what it tests. */
const UNIT_TEST = "tests/unit/probe.test.ts";

const IMPORTS_MUPDF = 'import { Document } from "mupdf";\nexport const doc = Document;\n';
const IMPORTS_ENGINE =
  'import { openDocument } from "@/engine";\nexport const open = openDocument;\n';
const CONSTRUCTS_WORKER = 'export const worker = new Worker("/engine.worker.js");\n';

beforeAll(async () => {
  // Pay for resolving the Next.js config once, here, rather than inside
  // whichever case happens to run first and then blaming it for the time.
  await wallErrors(ROUTE, "export const ready = true;\n");
}, 60_000);

/**
 * The control. Without it, a config that had quietly stopped applying would
 * make every "allows" case below pass for entirely the wrong reason.
 */
describe("the harness itself", () => {
  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER, CLIENT, UNIT_TEST])(
    "says nothing about ordinary code in %s",
    async (path) => {
      expect(await wallErrors(path, "export const pageCount = 2;\n")).toEqual([]);
    },
  );
});

/** INV-5. One PDF parser, ever, and only the walled module may reach it. */
describe("naming MuPDF anywhere but the walled module", () => {
  it.each([
    ["a static import", IMPORTS_MUPDF],
    [
      "a submodule import",
      'import { Document } from "mupdf/mupdf";\nexport const doc = Document;\n',
    ],
    ["a dynamic import", 'export const mod = await import("mupdf");\n'],
    ["a type only import", 'export type Mod = typeof import("mupdf");\n'],
    ["the path the engine is served from", 'export const url = "/engine/mupdf.js";\n'],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(expect.stringMatching(MUPDF));
  });

  it.each([ROUTE, LIBRARY, WORKER, CLIENT])("is rejected in %s", async (path) => {
    expect(await wallErrors(path, IMPORTS_MUPDF)).toContainEqual(
      expect.stringMatching(MUPDF),
    );
  });

  /**
   * The wall zone matches every file under `src`, the engine included, so this
   * passes only because the engine's own zone comes after it and flat config
   * replaces a rule rather than merging it. Get that order wrong and the engine
   * cannot import the one thing it exists to wrap.
   */
  it("is allowed in the walled module, which is the whole point of the wall", async () => {
    expect(await wallErrors(ENGINE_MODULE, IMPORTS_MUPDF)).toEqual([]);
  });
});

/** INV-6. Only the worker may import the engine. */
describe("importing the engine anywhere but the worker", () => {
  it.each([
    ["a static import", IMPORTS_ENGINE],
    [
      "a subpath import",
      'import { openDocument } from "@/engine/index";\nexport const open = openDocument;\n',
    ],
    ["a re-export", 'export { openDocument } from "@/engine";\n'],
    [
      "a relative import",
      'import { openDocument } from "../engine";\nexport const open = openDocument;\n',
    ],
    [
      "a deeper relative import",
      'import { openDocument } from "../../engine/index";\nexport const open = openDocument;\n',
    ],
    ["a dynamic import", 'export const mod = await import("@/engine");\n'],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(expect.stringMatching(ENGINE));
  });

  /**
   * This one caught a real hole when it was written. The selector read
   * `argument.value`, which is one node short of where a `TSImportType` keeps
   * its specifier, so it matched nothing and the form went straight through.
   *
   * TypeScript erases a type only import, so no bytes ever reached the main
   * thread and INV-6 held in the build regardless. The guard was the broken
   * part, and it read as though it covered a case it did not. That is the
   * failure mode this whole file exists to catch, so the case stays.
   */
  it("is rejected as a type only import", async () => {
    expect(
      await wallErrors(ROUTE, 'export type Mod = typeof import("@/engine");\n'),
    ).toContainEqual(expect.stringMatching(ENGINE));
  });

  it.each([ROUTE, LIBRARY, CLIENT, ENGINE_MODULE])("is rejected in %s", async (path) => {
    expect(await wallErrors(path, IMPORTS_ENGINE)).toContainEqual(
      expect.stringMatching(ENGINE),
    );
  });

  it("is allowed in the one worker that is meant to do it", async () => {
    expect(await wallErrors(WORKER, IMPORTS_ENGINE)).toEqual([]);
  });
});

/**
 * INV-6 again, from the other side. A second `Worker` is a second place the
 * document's bytes can live, which is the thing a single door prevents.
 */
describe("constructing a Worker", () => {
  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER])("is rejected in %s", async (path) => {
    expect(await wallErrors(path, CONSTRUCTS_WORKER)).toContainEqual(
      expect.stringMatching(SECOND_WORKER),
    );
  });

  it("is allowed in the worker client, the main thread's single door", async () => {
    expect(await wallErrors(CLIENT, CONSTRUCTS_WORKER)).toEqual([]);
  });
});

/**
 * Spec 0002, INV-3. Nothing is written down, anywhere, ever.
 *
 * The rule the product rests on, so the same argument as above applies twice
 * over: a selector that quietly matches nothing would leave every one of these
 * forms wide open, and `pnpm lint` would stay green either way.
 *
 * No zone may relax this one, which is why every case below is checked in the
 * engine and the worker too, not only on the main thread.
 */
describe("writing to browser storage", () => {
  it.each([
    ["localStorage", 'export const go = () => localStorage.setItem("k", "v");\n'],
    ["sessionStorage", 'export const go = () => sessionStorage.setItem("k", "v");\n'],
    [
      "localStorage reached through window",
      "export const go = () => window.localStorage.clear();\n",
    ],
    ["IndexedDB", 'export const go = () => indexedDB.open("jobs");\n'],
    ["the Cache API", 'export const go = () => caches.open("documents");\n'],
    [
      "the origin private file system",
      "export const go = () => navigator.storage.getDirectory();\n",
    ],
    [
      "the file system access API",
      'export const go = () => showSaveFilePicker({ suggestedName: "out.pdf" });\n',
    ],
    [
      "registering a service worker",
      'export const go = () => navigator.serviceWorker.register("/sw.js");\n',
    ],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(expect.stringMatching(STORAGE));
  });

  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER, CLIENT])(
    "is rejected in %s, because no zone gets to relax this one",
    async (path) => {
      expect(
        await wallErrors(
          path,
          'export const go = () => localStorage.setItem("k", "v");\n',
        ),
      ).toContainEqual(expect.stringMatching(STORAGE));
    },
  );
});

/** The carve-outs, asserted so tightening the wall cannot remove them by accident. */
describe("what the wall deliberately leaves alone", () => {
  /**
   * The restriction is case sensitive on purpose. Feature 18 owes the reader an
   * AGPL notice that says "MuPDF" in prose, and prose is not an import.
   */
  it("lets prose name MuPDF, which the AGPL notice has to do", async () => {
    expect(
      await wallErrors(ROUTE, 'export const notice = "MuPDF is AGPL 3.0";\n'),
    ).toEqual([]);
  });

  /** A unit test of the walled module has to import it, and a test ships to nobody. */
  it.each([
    ["the engine", IMPORTS_ENGINE],
    ["MuPDF", IMPORTS_MUPDF],
  ])("lets a unit test import %s", async (_what, code) => {
    expect(await wallErrors(UNIT_TEST, code)).toEqual([]);
  });
});
