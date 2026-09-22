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
 *
 * Spec 0003 added two more restrictions built from the same two rules, so they
 * are proved here the same way: the colour patterns every zone carries (AC-3),
 * and the `src/ui` zone that keeps the primitives presentation only (AC-19).
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
const OPACITY = /No alpha modifier on a colour utility/;
const ARBITRARY_COLOUR = /No arbitrary colour value/;
const UI_IMPORT = /src\/ui is presentation only/;
const INNER_HTML = /Document derived text is untrusted input/;

/** Ordinary main thread code: a route and a shared library, fully walled. */
const ROUTE = "src/app/probe.ts";
const LIBRARY = "src/lib/probe.ts";

/** A design system primitive, and a page that renders JSX. */
const PRIMITIVE = "src/ui/probe.tsx";
const PAGE = "src/app/probe.tsx";

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
  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER, CLIENT, UNIT_TEST, PRIMITIVE])(
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

  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER, CLIENT, PRIMITIVE])(
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

/**
 * Spec 0003, AC-3. Every colour on screen is a token whose contrast a test
 * checked, so the two ways Tailwind offers round that are closed: an arbitrary
 * value, and an alpha modifier that turns a checked colour into an unchecked one.
 */
describe("a colour the contrast test never checked", () => {
  it.each([
    ["a hex value", 'export const c = "rounded-lg bg-[#fff] p-4";\n'],
    ["an rgb function", 'export const c = "text-[rgb(10,20,30)]";\n'],
    ["an oklch function", 'export const c = "border-[oklch(0.5_0.1_200)]";\n'],
    ["a hex value behind a variant", 'export const c = "hover:bg-[#1a2b3c]";\n'],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(
      expect.stringMatching(ARBITRARY_COLOUR),
    );
  });

  it.each([
    ["an alpha modifier", 'export const c = "text-ink/70";\n'],
    ["an arbitrary alpha", 'export const c = "bg-accent/[0.4]";\n'],
    ["an alpha modifier behind a variant", 'export const c = "focus:ring-accent/50";\n'],
    ["an alpha modifier on a side border", 'export const c = "border-t-border/40";\n'],
    ["the size and leading shorthand", 'export const c = "text-sm/6";\n'],
    [
      "an alpha modifier inside a template literal",
      "export const c = (on: boolean) => `p-2 ${on ? 'x' : 'y'} border-current/40`;\n",
    ],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(expect.stringMatching(OPACITY));
  });

  it("is rejected in a JSX class name, which is a string literal too", async () => {
    expect(
      await wallErrors(
        PAGE,
        'export const P = () => <p className="text-ink/70">x</p>;\n',
      ),
    ).toContainEqual(expect.stringMatching(OPACITY));
  });

  it.each([ROUTE, LIBRARY, CLIENT, PRIMITIVE])("is rejected in %s", async (path) => {
    expect(await wallErrors(path, 'export const c = "bg-[#fff]";\n')).toContainEqual(
      expect.stringMatching(ARBITRARY_COLOUR),
    );
  });

  /** The other uses of `/` and `[` Tailwind has, none of them a colour. */
  it.each([
    ["a fraction", 'export const c = "w-1/2 -translate-x-1/2";\n'],
    ["a named group", 'export const c = "group/row group-hover/row:underline";\n'],
    ["an arbitrary ratio", 'export const c = "aspect-[16/9]";\n'],
    ["a token", 'export const c = "bg-accent-soft text-accent-strong border-border";\n'],
    ["a token followed by a breakpoint", 'export const c = "bg-accent 2xl:px-4";\n'],
    ["a media type", 'export const accept = "application/pdf";\n'],
    ["an arbitrary length", 'export const c = "max-w-[44rem] border-[3px]";\n'],
  ])("allows %s", async (_form, code) => {
    expect(await wallErrors(PAGE, code)).toEqual([]);
  });
});

/**
 * Spec 0003, AC-19. The primitives render what they are given and reach for
 * nothing, which is what keeps document state out of a presentation folder.
 */
describe("the design system's primitives", () => {
  it.each([
    ["the worker client", 'import { openSession } from "@/worker/client";'],
    ["the protocol", 'import { EngineError } from "@/worker/protocol";'],
    ["the config", 'import { config } from "@/config";'],
    ["the session", 'import { IDLE } from "@/lib/session";'],
    ["the entitlement", 'import { getEntitlement } from "@/lib/entitlement";'],
    ["the worker, by a relative path", 'import { openSession } from "../worker/client";'],
    ["the config, by a relative path", 'import { config } from "../config";'],
  ])("may not import %s", async (_what, code) => {
    expect(await wallErrors(PRIMITIVE, `${code}\nexport const x = 1;\n`)).toContainEqual(
      expect.stringMatching(UI_IMPORT),
    );
  });

  it("still sits inside the engine wall", async () => {
    expect(await wallErrors(PRIMITIVE, IMPORTS_ENGINE)).toContainEqual(
      expect.stringMatching(ENGINE),
    );
  });

  it.each([
    [
      "an attribute",
      "export const P = ({ t }: { t: string }) => <p dangerouslySetInnerHTML={{ __html: t }} />;\n",
    ],
    [
      "a spread object",
      "export const P = ({ t }: { t: string }) => <p {...{ dangerouslySetInnerHTML: { __html: t } }} />;\n",
    ],
  ])("may not write raw HTML through %s", async (_form, code) => {
    expect(await wallErrors(PRIMITIVE, code)).toContainEqual(
      expect.stringMatching(INNER_HTML),
    );
  });

  it("may import the class joiner and the icon set", async () => {
    expect(
      await wallErrors(
        PRIMITIVE,
        'import { cx } from "@/lib/cx";\nimport { Info } from "lucide-react";\nexport const x = [cx, Info];\n',
      ),
    ).toEqual([]);
  });
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
