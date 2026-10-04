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

/**
 * The rules the wall is built from, and the log ban every zone carries (spec
 * 0011, AC-15). Anything else ESLint says is noise.
 */
const WALL_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-console",
]);

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
const TOOL_CLIENT = /Only src\/app\/tool\/page\.tsx may render ToolClient/;
const DETECT = /Only src\/engine may import @\/detect/;
const PHONE_LIBRARY = /Only src\/detect may import libphonenumber-js/;
const SEARCH = /it never calls search\(\)/;
const DETECT_ZONE = /src\/detect is pure text in, offsets out/;
const CONSOLE = /Unexpected console statement/;
const STREAM = /RedactNest's own code writes no log/;

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

/** A detector, and the one page allowed to render the tool client. */
const DETECTOR = "src/detect/probe.ts";
const TOOL_PAGE = "src/app/tool/page.tsx";

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
  it.each([
    ROUTE,
    LIBRARY,
    ENGINE_MODULE,
    WORKER,
    CLIENT,
    UNIT_TEST,
    PRIMITIVE,
    DETECTOR,
  ])("says nothing about ordinary code in %s", async (path) => {
    expect(await wallErrors(path, "export const pageCount = 2;\n")).toEqual([]);
  });
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

/**
 * Spec 0003, INV-11. The tool page's load guard trusts that it runs at `/tool`,
 * so only the tool page may render `ToolClient`. Anywhere else the guard could
 * only show a dead end, and this is what keeps that a lint error rather than
 * something a visitor finds.
 */
describe("rendering the tool page's client anywhere but the tool page", () => {
  const HOME = "src/app/page.tsx";

  it("is rejected on another page", async () => {
    expect(
      await wallErrors(
        HOME,
        'import { ToolClient } from "./tool/tool-client";\nexport const x = ToolClient;\n',
      ),
    ).toContainEqual(expect.stringMatching(TOOL_CLIENT));
  });

  it("is rejected in a primitive, by its alias", async () => {
    expect(
      await wallErrors(
        PRIMITIVE,
        'import { ToolClient } from "@/app/tool/tool-client";\nexport const x = ToolClient;\n',
      ),
    ).toContainEqual(expect.stringMatching(TOOL_CLIENT));
  });

  it("is rejected as a dynamic import, which no-restricted-imports cannot see", async () => {
    expect(
      await wallErrors(HOME, 'export const load = () => import("./tool/tool-client");\n'),
    ).toContainEqual(expect.stringMatching(TOOL_CLIENT));
  });

  it("is rejected as a type only import", async () => {
    expect(
      await wallErrors(
        ROUTE,
        'export type T = typeof import("@/app/tool/tool-client");\n',
      ),
    ).toContainEqual(expect.stringMatching(TOOL_CLIENT));
  });

  it("is allowed on the tool page", async () => {
    expect(
      await wallErrors(
        TOOL_PAGE,
        'import { ToolClient } from "./tool-client";\nexport const x = ToolClient;\n',
      ),
    ).toEqual([]);
  });

  it("leaves the tool page inside the engine wall", async () => {
    expect(await wallErrors(TOOL_PAGE, IMPORTS_MUPDF)).toContainEqual(
      expect.stringMatching(MUPDF),
    );
  });
});

/**
 * Spec 0005, INV-8. Only the engine imports the detectors, and only the
 * detectors import the phone library, so its metadata ships in the worker's
 * chunk and never in a page's. Both proved in every zone, in every spelling
 * `no-restricted-imports` misses, as the engine wall is.
 */
describe("importing the detectors anywhere but the engine", () => {
  const IMPORTS_DETECT = 'import { detect } from "@/detect";\nexport const d = detect;\n';

  it.each([
    ["a static import", IMPORTS_DETECT],
    [
      "a subpath import",
      'import { detectEmail } from "@/detect/email";\nexport const d = detectEmail;\n',
    ],
    [
      "a relative import",
      'import { detect } from "../detect";\nexport const d = detect;\n',
    ],
    ["a dynamic import", 'export const mod = await import("@/detect");\n'],
    ["a type only import", 'export type Mod = typeof import("@/detect");\n'],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(ROUTE, code)).toContainEqual(expect.stringMatching(DETECT));
  });

  it.each([ROUTE, LIBRARY, WORKER, CLIENT, PRIMITIVE, TOOL_PAGE, DETECTOR])(
    "is rejected in %s",
    async (path) => {
      expect(await wallErrors(path, IMPORTS_DETECT)).toContainEqual(
        expect.stringMatching(DETECT),
      );
    },
  );

  it("is allowed in the engine, which runs detection", async () => {
    expect(await wallErrors("src/engine/find.ts", IMPORTS_DETECT)).toEqual([]);
  });
});

describe("importing the phone library anywhere but the detectors", () => {
  const IMPORTS_PHONE =
    'import { findNumbers } from "libphonenumber-js/max";\nexport const f = findNumbers;\n';

  it.each([
    ["a static import", IMPORTS_PHONE],
    [
      "the package root",
      'import { parsePhoneNumber } from "libphonenumber-js";\nexport const p = parsePhoneNumber;\n',
    ],
    ["a dynamic import", 'export const mod = await import("libphonenumber-js/max");\n'],
    ["a type only import", 'export type Mod = typeof import("libphonenumber-js");\n'],
  ])("is rejected as %s", async (_form, code) => {
    expect(await wallErrors(LIBRARY, code)).toContainEqual(
      expect.stringMatching(PHONE_LIBRARY),
    );
  });

  it.each([ROUTE, LIBRARY, ENGINE_MODULE, WORKER, CLIENT, PRIMITIVE, TOOL_PAGE])(
    "is rejected in %s",
    async (path) => {
      expect(await wallErrors(path, IMPORTS_PHONE)).toContainEqual(
        expect.stringMatching(PHONE_LIBRARY),
      );
    },
  );

  it("is allowed in the detectors", async () => {
    expect(await wallErrors(DETECTOR, IMPORTS_PHONE)).toEqual([]);
  });
});

/** Spec 0005, INV-5. The detectors see text and nothing else. */
describe("the detectors", () => {
  it.each([
    ["the engine", IMPORTS_ENGINE, ENGINE],
    ["MuPDF", IMPORTS_MUPDF, MUPDF],
    [
      "a primitive",
      'import { Button } from "@/ui/button";\nexport const b = Button;\n',
      DETECT_ZONE,
    ],
    [
      "the library folder",
      'import { cx } from "@/lib/cx";\nexport const c = cx;\n',
      DETECT_ZONE,
    ],
    [
      "the config",
      'import { config } from "@/config";\nexport const c = config;\n',
      DETECT_ZONE,
    ],
    [
      "React",
      'import { useState } from "react";\nexport const u = useState;\n',
      DETECT_ZONE,
    ],
    ["Next.js", 'import Link from "next/link";\nexport const l = Link;\n', DETECT_ZONE],
    [
      "the worker client",
      'import { openSession } from "@/worker/client";\nexport const o = openSession;\n',
      DETECT_ZONE,
    ],
    [
      "the worker by a relative path",
      'import { openSession } from "../worker/client";\nexport const o = openSession;\n',
      DETECT_ZONE,
    ],
    [
      "a value from the protocol",
      'import { DETECTOR_KINDS } from "@/worker/protocol";\nexport const k = DETECTOR_KINDS;\n',
      DETECT_ZONE,
    ],
    [
      "the worker dynamically",
      'export const mod = await import("@/worker/client");\n',
      DETECT_ZONE,
    ],
  ])("may not import %s", async (_what, code, message) => {
    const [result] = await eslint.lintText(code, {
      filePath: DETECTOR,
      warnIgnored: false,
    });
    expect(result.messages.map((each) => each.message)).toContainEqual(
      expect.stringMatching(message),
    );
  });

  it("may import a type from the protocol", async () => {
    const [result] = await eslint.lintText(
      'import type { DetectorKind } from "@/worker/protocol";\nexport type K = DetectorKind;\n',
      { filePath: DETECTOR, warnIgnored: false },
    );
    expect(result.messages).toEqual([]);
  });

  it("may not write to the console, since it holds document text", async () => {
    const [result] = await eslint.lintText(
      'export const log = () => console.log("x");\n',
      {
        filePath: DETECTOR,
        warnIgnored: false,
      },
    );
    expect(result.messages.map((each) => each.ruleId)).toContain("no-console");
  });

  it("still carries the storage ban", async () => {
    expect(
      await wallErrors(
        DETECTOR,
        'export const go = () => localStorage.setItem("k", "v");\n',
      ),
    ).toContainEqual(expect.stringMatching(STORAGE));
  });
});

/**
 * Spec 0005, INV-11. Detection walks every character, because MuPDF.js caps
 * `search()` at 500 quads and drops the rest in silence.
 */
describe("calling search()", () => {
  const CALLS_SEARCH =
    'export const hits = (stext: { search(n: string): unknown }) => stext.search("a");\n';

  it.each(["src/engine/find.ts", ENGINE_MODULE, DETECTOR])(
    "is rejected in %s",
    async (path) => {
      expect(await wallErrors(path, CALLS_SEARCH)).toContainEqual(
        expect.stringMatching(SEARCH),
      );
    },
  );

  it("is allowed in a test, which compares against it", async () => {
    expect(await wallErrors(UNIT_TEST, CALLS_SEARCH)).toEqual([]);
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

/**
 * Spec 0011, AC-15. RedactNest's own code writes no log, in any zone, because
 * the privacy policy says so (claim C8) and a line written from the worker or
 * the engine could carry document detail. `zone()` adds the ban, so every zone
 * carries it and none can relax it; each zone is proved here on its own.
 */
describe("writing a log", () => {
  const ZONES = [
    ENGINE_MODULE,
    DETECTOR,
    WORKER,
    CLIENT,
    PRIMITIVE,
    TOOL_PAGE,
    ROUTE,
    LIBRARY,
    PAGE,
  ];
  const LOGS = 'export const log = () => console.log("x");\n';
  const WRITES = 'export const write = () => process.stdout.write("x");\n';

  it.each(ZONES)("through the console is rejected in %s", async (path) => {
    expect(await wallErrors(path, LOGS)).toContainEqual(expect.stringMatching(CONSOLE));
  });

  it.each(ZONES)("through process.stdout is rejected in %s", async (path) => {
    expect(await wallErrors(path, WRITES)).toContainEqual(expect.stringMatching(STREAM));
  });

  it.each([
    ["console.error", 'export const log = () => console.error("x");\n', CONSOLE],
    ["console.warn", 'export const log = () => console.warn("x");\n', CONSOLE],
    ["process.stderr", 'export const w = () => process.stderr.write("x");\n', STREAM],
    [
      "a computed member",
      'export const w = () => process["stdout"].write("x");\n',
      STREAM,
    ],
    [
      "a destructured stream",
      'const { stderr } = process;\nexport const w = () => stderr.write("x");\n',
      STREAM,
    ],
  ])("is rejected as %s", async (_form, code, message) => {
    expect(await wallErrors(LIBRARY, code)).toContainEqual(
      expect.stringMatching(message),
    );
  });

  /** The ban is on writing, not on reading the rest of `process`. */
  it("leaves the rest of process alone", async () => {
    expect(
      await wallErrors(LIBRARY, "export const env = process.env.NODE_ENV;\n"),
    ).toEqual([]);
  });

  /** A test ships to nobody, so it may still log while it is written. */
  it("lets a unit test log", async () => {
    expect(await wallErrors(UNIT_TEST, LOGS)).toEqual([]);
  });
});

/**
 * Spec 0012, AC-20 and INV-1: Clerk and Polar behind their walls. Only
 * src/billing names Clerk's backend and Polar, only the account group and the
 * proxy name Clerk's Next.js package, and only the plan check, the account
 * group, the proxy and the root layout import the billing modules. Nothing
 * reachable from /tool names any of them.
 */
describe("Clerk, Polar and the billing modules", () => {
  const CLERK_POLAR = /Clerk and Polar stay behind their walls/;
  const BILLING_MODULE = /may import @\/billing or @\/config\/billing/;

  const BILLING = "src/billing/probe.ts";
  const CONFIG_BILLING = "src/config/billing.ts";
  const ACCOUNT_PAGE = "src/app/(account)/account/probe/page.tsx";
  const PROXY = "src/proxy.ts";
  const PLAN_CHECK = "src/app/api/entitlement/route.ts";
  const ROOT_LAYOUT = "src/app/layout.tsx";
  const TOOL_MODULE = "src/app/tool/probe.tsx";

  const importing = (specifier: string) =>
    `import * as probe from "${specifier}";\nexport const p = probe;\n`;

  const CLERK_NEXT = importing("@clerk/nextjs");
  const CLERK_SERVER = importing("@clerk/nextjs/server");
  const CLERK_BACKEND = importing("@clerk/backend");
  const CLERK_SHARED = importing("@clerk/shared/keys");
  const POLAR = importing("@polar-sh/sdk/2026-10");
  const BILLING_PLAN = importing("@/billing/plan");
  const BILLING_CONFIG = importing("@/config/billing");

  /** AC-20's fenced zones, plus the shared shell pages, which are walled too. */
  const FENCED = [
    TOOL_PAGE,
    TOOL_MODULE,
    LIBRARY,
    PRIMITIVE,
    WORKER,
    CLIENT,
    ENGINE_MODULE,
    DETECTOR,
    ROUTE,
    PAGE,
  ];

  it.each(FENCED)("rejects every Clerk and Polar package in %s", async (path) => {
    for (const code of [CLERK_NEXT, CLERK_SERVER, CLERK_BACKEND, CLERK_SHARED, POLAR]) {
      expect(await wallErrors(path, code)).toContainEqual(
        expect.stringMatching(CLERK_POLAR),
      );
    }
  });

  it.each(FENCED)("rejects the billing modules in %s", async (path) => {
    for (const code of [BILLING_PLAN, BILLING_CONFIG]) {
      expect(await wallErrors(path, code)).toContainEqual(
        expect.stringMatching(BILLING_MODULE),
      );
    }
  });

  it.each([
    [
      "a dynamic import of Clerk",
      'export const m = await import("@clerk/nextjs");\n',
      CLERK_POLAR,
    ],
    [
      "a type only import of Polar",
      'export type M = typeof import("@polar-sh/sdk");\n',
      CLERK_POLAR,
    ],
    [
      "a dynamic import of billing",
      'export const m = await import("@/billing/plan");\n',
      BILLING_MODULE,
    ],
    [
      "a type only import of the gate",
      'export type M = typeof import("@/config/billing");\n',
      BILLING_MODULE,
    ],
    ["a relative path to billing", importing("../billing/plan"), BILLING_MODULE],
    ["a relative path to the gate", importing("../config/billing"), BILLING_MODULE],
  ])("rejects %s in a shared library", async (_form, code, message) => {
    expect(await wallErrors(LIBRARY, code)).toContainEqual(
      expect.stringMatching(message),
    );
  });

  it("lets src/billing use Clerk's backend, its shared keys and Polar, and nothing else of Clerk's", async () => {
    for (const code of [
      CLERK_BACKEND,
      importing("@clerk/backend/errors"),
      CLERK_SHARED,
      POLAR,
      BILLING_CONFIG,
    ]) {
      expect(await wallErrors(BILLING, code)).toEqual([]);
    }
    for (const code of [CLERK_NEXT, CLERK_SERVER]) {
      expect(await wallErrors(BILLING, code)).toContainEqual(
        expect.stringMatching(CLERK_POLAR),
      );
    }
  });

  it("lets the billing gate use Clerk's shared keys and nothing else", async () => {
    expect(await wallErrors(CONFIG_BILLING, CLERK_SHARED)).toEqual([]);
    for (const code of [CLERK_BACKEND, CLERK_NEXT, POLAR]) {
      expect(await wallErrors(CONFIG_BILLING, code)).toContainEqual(
        expect.stringMatching(CLERK_POLAR),
      );
    }
  });

  it.each([ACCOUNT_PAGE, PROXY])(
    "lets %s use Clerk's Next.js package and the billing modules, never Polar or Clerk's backend",
    async (path) => {
      for (const code of [CLERK_NEXT, CLERK_SERVER, BILLING_PLAN, BILLING_CONFIG]) {
        expect(await wallErrors(path, code)).toEqual([]);
      }
      for (const code of [CLERK_BACKEND, POLAR]) {
        expect(await wallErrors(path, code)).toContainEqual(
          expect.stringMatching(CLERK_POLAR),
        );
      }
    },
  );

  it.each([PLAN_CHECK, ROOT_LAYOUT])(
    "lets %s import the billing modules, never Clerk or Polar",
    async (path) => {
      for (const code of [BILLING_PLAN, BILLING_CONFIG]) {
        expect(await wallErrors(path, code)).toEqual([]);
      }
      for (const code of [CLERK_NEXT, CLERK_BACKEND, POLAR]) {
        expect(await wallErrors(path, code)).toContainEqual(
          expect.stringMatching(CLERK_POLAR),
        );
      }
    },
  );

  it("keeps the engine wall in every billing zone", async () => {
    for (const path of [BILLING, CONFIG_BILLING, ACCOUNT_PAGE, PROXY, PLAN_CHECK]) {
      expect(await wallErrors(path, IMPORTS_MUPDF)).toContainEqual(
        expect.stringMatching(MUPDF),
      );
      expect(await wallErrors(path, IMPORTS_ENGINE)).toContainEqual(
        expect.stringMatching(ENGINE),
      );
    }
  });
});

/**
 * Spec 0012, INV-13: every way out of the account group is a full page load.
 * Clerk's `SignOutButton` and `UserButton` sign out with Clerk's client side
 * navigation, so both are banned by name in every zone, the account group
 * (the only one allowed `@clerk/nextjs` at all) included.
 */
describe("Clerk's sign out components", () => {
  const CLERK_SIGN_OUT = /Clerk's SignOutButton and UserButton sign out/;
  const ACCOUNT_PAGE = "src/app/(account)/account/probe/page.tsx";

  const NAMED =
    'import { SignOutButton } from "@clerk/nextjs";\nexport const s = SignOutButton;\n';

  it.each([
    ["a named import", NAMED],
    [
      "UserButton",
      'import { UserButton } from "@clerk/nextjs";\nexport const u = UserButton;\n',
    ],
    [
      "an aliased import",
      'import { SignOutButton as Leave } from "@clerk/nextjs";\nexport const l = Leave;\n',
    ],
    [
      "a namespace import's member",
      'import * as clerk from "@clerk/nextjs";\nexport const s = clerk.SignOutButton;\n',
    ],
    [
      "a computed member",
      'import * as clerk from "@clerk/nextjs";\nexport const u = clerk["UserButton"];\n',
    ],
    [
      "a destructured dynamic import",
      'export const { UserButton: u } = await import("@clerk/nextjs");\n',
    ],
    [
      "JSX through a namespace",
      'import * as clerk from "@clerk/nextjs";\nexport const s = <clerk.SignOutButton />;\n',
    ],
    ["a re-export", 'export { SignOutButton } from "@clerk/nextjs";\n'],
  ])("rejects %s in the account group", async (_form, code) => {
    expect(await wallErrors(ACCOUNT_PAGE, code)).toContainEqual(
      expect.stringMatching(CLERK_SIGN_OUT),
    );
  });

  it.each([
    ROUTE,
    LIBRARY,
    PRIMITIVE,
    PAGE,
    TOOL_PAGE,
    ENGINE_MODULE,
    WORKER,
    CLIENT,
    DETECTOR,
    "src/billing/probe.ts",
    "src/config/billing.ts",
    ACCOUNT_PAGE,
    "src/proxy.ts",
    "src/app/api/entitlement/route.ts",
    "src/app/layout.tsx",
  ])("rejects it in %s, because no zone gets to relax this one", async (path) => {
    expect(await wallErrors(path, NAMED)).toContainEqual(
      expect.stringMatching(CLERK_SIGN_OUT),
    );
  });

  it("lets the account group use the rest of Clerk's Next.js package", async () => {
    expect(
      await wallErrors(
        ACCOUNT_PAGE,
        'import { SignIn, useClerk } from "@clerk/nextjs";\nexport const p = [SignIn, useClerk];\n',
      ),
    ).toEqual([]);
  });
});
