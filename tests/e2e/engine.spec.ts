import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

import { expect, test } from "@playwright/test";

/**
 * The gate spec 0001 calls "what the scaffold must demonstrate".
 *
 * A real browser loads the engine inside the worker, opens a PDF and reads its
 * page count, with the content security policy enforced. Running this in Node
 * would not count, because Node is not where the engine lives.
 */

// Resolved from the working directory, not from this file: Playwright loads
// specs as CommonJS, where `import.meta` does not exist.
const FIXTURE = resolve("tests/fixtures/two-pages.pdf");

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

test("the engine opens a PDF in the worker and reports its page count", async ({
  page,
}) => {
  await page.goto("/tool");

  await page.getByTestId("file-input").setInputFiles(FIXTURE);

  await expect(page.getByTestId("page-count")).toHaveText(/2 pages/, {
    timeout: ENGINE_TIMEOUT,
  });
});

test("per page text layer detection reports honestly", async ({ page }) => {
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);

  // The fixture is built with a text layer on page one and none on page two,
  // which is what feature 7's scanned page warnings will read.
  await expect(page.getByTestId("text-layer-count")).toHaveText(/1 of 2/, {
    timeout: ENGINE_TIMEOUT,
  });
});

test("the page hydrates and runs with no policy violation", async ({ page }) => {
  const violations: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy/i.test(text)) violations.push(text);
  });

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  // Hydration, the module worker and the WebAssembly compile all had to succeed
  // under the enforced policy to get this far. A violation here means a
  // directive is wrong even though the header assertions passed.
  expect(violations, `policy violations:\n${violations.join("\n")}`).toHaveLength(0);
});

test("the worker fetches the engine from our own origin, not a CDN", async ({
  page,
  baseURL,
}) => {
  // Read from the config rather than written out, so a suite pointed at another
  // host or port still asserts our own origin instead of failing on the address.
  const ownEngine = new URL("/engine/", baseURL).href;
  const engineRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("mupdf")) engineRequests.push(request.url());
  });

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  expect(engineRequests.length).toBeGreaterThan(0);
  for (const url of engineRequests) {
    // A prefix, not a substring: `https://cdn.example/?from=localhost:3000/engine/`
    // contains our address and is still a third party.
    expect(
      url.startsWith(ownEngine),
      `the engine must never come from a third party: ${url}`,
    ).toBe(true);
  }
});

declare global {
  interface Window {
    __redactnestWorkers?: number;
  }
}

/**
 * Spec 0002, AC-1, and the pre-warm spec 0001 designed the engine load around.
 *
 * One tab, one worker, however many documents pass through it. Counting the
 * `Worker` constructions is the honest measure: a request count could be
 * satisfied by the browser's own cache, while a second construction means the
 * engine was genuinely thrown away and compiled again on the one action this
 * product exists for.
 */
test("a second document reuses the worker the first one loaded", async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.Worker;
    window.__redactnestWorkers = 0;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        window.__redactnestWorkers = (window.__redactnestWorkers ?? 0) + 1;
      }
    };
  });

  await page.goto("/tool");
  const input = page.getByTestId("file-input");

  await input.setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  // A second document, and a third, each replacing the one before it. The
  // middle one fails on purpose: a refused open must still retire the document
  // it replaced, and must still leave the engine loaded for the next try.
  await input.setInputFiles({
    name: "not-really.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a PDF at all"),
  });
  await expect(page.getByTestId("error")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  await input.setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  expect(await page.evaluate(() => window.__redactnestWorkers)).toBe(1);
});

/** The release triggers still do what spec 0002 says: the worker goes. */
test("starting over gives the next document a worker of its own", async ({ page }) => {
  await page.addInitScript(() => {
    const Real = window.Worker;
    window.__redactnestWorkers = 0;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        window.__redactnestWorkers = (window.__redactnestWorkers ?? 0) + 1;
      }
    };
  });

  await page.goto("/tool");
  const input = page.getByTestId("file-input");

  await input.setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  await page.getByTestId("start-over").click();
  await expect(page.getByTestId("start-over")).toBeHidden();

  await input.setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  expect(await page.evaluate(() => window.__redactnestWorkers)).toBe(2);
});

test("document bytes leave the main thread rather than being copied", async ({
  page,
}) => {
  await page.goto("/tool");

  // The transfer neuters the sender's view of the buffer. A byteLength of 0 on
  // this side after posting is the invariant working: the main thread cannot be
  // holding document content if its buffer is detached.
  const lengthAfterTransfer = await page.evaluate(() => {
    const buffer = new ArrayBuffer(1024);
    const channel = new MessageChannel();
    channel.port1.postMessage(buffer, [buffer]);
    return buffer.byteLength;
  });

  expect(lengthAfterTransfer).toBe(0);
});

test("a file that is not a PDF fails with a kind, and says nothing about itself", async ({
  page,
}) => {
  await page.goto("/tool");

  await page.getByTestId("file-input").setInputFiles({
    name: "not-really.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a PDF at all, it is a secret note"),
  });

  const error = page.getByTestId("error");
  await expect(error).toBeVisible({ timeout: ENGINE_TIMEOUT });

  // Spec 0004, AC-1: judged from the bytes, so it is `not-pdf`, not `corrupt`.
  await expect(error).toContainText("This file is not a PDF.");

  // The error must describe the failure, never the document. No file name, no
  // extracted content: that is what makes feature 11's scrubbing achievable.
  const text = (await error.textContent()) ?? "";
  expect(text).not.toContain("not-really");
  expect(text).not.toContain("secret note");
});

/** A real one pixel PNG, named and typed as a PDF. */
function pngNamedPdf(): { name: string; mimeType: string; buffer: Buffer } {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;

  return {
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Spec 0004, AC-1. MuPDF would open a PNG as a one page document even when told
 * it is a PDF, so this is refused from its bytes, and before the engine is ever
 * fetched: a photo should not cost anybody a 10 MB download.
 */
test("a PNG named and typed as a PDF is refused before the engine loads", async ({
  page,
}) => {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("mupdf")) engineRequests.push(request.url());
  });

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(pngNamedPdf());

  await expect(page.getByTestId("error")).toContainText("This file is not a PDF.", {
    timeout: ENGINE_TIMEOUT,
  });
  expect(engineRequests).toEqual([]);
});

/** Spec 0004, AC-3, in the real worker. */
test("a PDF with layers is refused before any review exists", async ({ page }) => {
  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/layers-all-on.pdf"));

  await expect(page.getByTestId("error")).toContainText("layers", {
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByTestId("redact")).toHaveCount(0);
});

/** What Node's MuPDF finds in a file the page handed over. */
interface Inspection {
  readonly pages: number;
  readonly versions: number;
  readonly trailer: string[];
  readonly catalog: string[];
  readonly keys: string[];
  readonly text: string;
  readonly bytes: string;
}

/**
 * Open the file at `path` with the real MuPDF in Node and describe what a
 * reader could still find in it.
 *
 * Run in a child process on purpose. MuPDF is an ES module with top level
 * await, and Playwright loads this spec as CommonJS, which cannot import it.
 */
function inspectInNode(path: string): Inspection {
  const script = [
    'import * as mupdf from "mupdf";',
    'import { readFileSync } from "node:fs";',
    "mupdf.setLog(() => {});",
    'const doc = mupdf.Document.openDocument(readFileSync(process.argv[1]), "application/pdf").asPDF();',
    "const keysOf = (dict) => { const keys = []; dict.forEach((_v, k) => keys.push(k)); return keys; };",
    "const keys = new Set();",
    "const walk = (obj) => {",
    "  if (obj.isIndirect()) return;",
    "  if (obj.isDictionary()) { keysOf(obj).forEach((k) => keys.add(k)); obj.forEach(walk); }",
    "  else if (obj.isArray()) obj.forEach(walk);",
    "};",
    "for (let n = 1; n < doc.countObjects(); n += 1) walk(doc.newIndirect(n).resolve());",
    'let text = "";',
    'for (let i = 0; i < doc.countPages(); i += 1) text += doc.loadPage(i).toStructuredText("").asText();',
    'const bytes = Buffer.from(doc.saveToBuffer("decompress").asUint8Array()).toString("latin1");',
    "process.stdout.write(JSON.stringify({",
    "  pages: doc.countPages(),",
    "  versions: doc.countVersions(),",
    "  trailer: keysOf(doc.getTrailer()),",
    '  catalog: keysOf(doc.getTrailer().get("Root")),',
    "  keys: [...keys],",
    "  text,",
    "  bytes,",
    "}));",
  ].join("\n");

  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script, path],
    { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(output.toString("utf8")) as Inspection;
}

/**
 * Spec 0004, AC-7 and AC-19. The real engine in the real worker, end to end:
 * the fixture that carries everything is redacted through the page, the file
 * the browser is handed is caught, and Node opens it with MuPDF to find it
 * clean. Nothing here trusts the engine's own account of what it did.
 */
test("a redaction in the real worker hands over a file that is really clean", async ({
  page,
}) => {
  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/metadata.pdf"));
  await page.getByTestId("redact").click({ timeout: ENGINE_TIMEOUT });

  const outcome = page.getByTestId("outcome");
  await expect(outcome).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(outcome).toContainText("Removed 0 items and stripped document info");

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const download = await downloading;

  expect(download.suggestedFilename()).toBe("metadata-redacted.pdf");
  // Handed over, so the page offers it no more (spec 0002, AC-4).
  await expect(page.getByTestId("download")).toHaveCount(0);

  const cleaned = inspectInNode(await download.path());

  expect(cleaned.pages).toBe(2);
  expect(cleaned.versions).toBe(1);
  expect(cleaned.trailer).not.toContain("Info");
  expect([...cleaned.catalog].sort()).toEqual(["Lang", "Pages", "Type"]);
  for (const key of ["Annots", "AcroForm", "Outlines", "Metadata", "JS", "AA", "Thumb"]) {
    expect(cleaned.keys, `/${key} survived`).not.toContain(key);
  }
  for (const secret of ["Jane Secret", "attached secret contents", "document script"]) {
    expect(cleaned.bytes, `"${secret}" survived`).not.toContain(secret);
  }
  // What was visible stays visible (AC-8).
  expect(cleaned.text).toContain("Visible typed note");
  expect(cleaned.text).toContain("Form field value");
});

/**
 * Spec 0004, AC-24. MuPDF's warnings never reach the console, in the real
 * worker. The damaged fixture makes MuPDF repair it as it opens, and Node
 * proves MuPDF prints while doing so when nobody silences it
 * (`tests/unit/engine-log.test.ts`). Here nothing from the worker is heard at
 * all, through an open and a whole redaction run.
 */
test("MuPDF says nothing in the console while it repairs and redacts", async ({
  page,
}) => {
  const fromWorker: string[] = [];
  const mentionsRepair: string[] = [];

  page.on("console", (message) => {
    if (message.worker()) fromWorker.push(message.text());
    if (/xref|repair|format error/i.test(message.text()))
      mentionsRepair.push(message.text());
  });

  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/damaged.pdf"));
  await page.getByTestId("redact").click({ timeout: ENGINE_TIMEOUT });
  await expect(page.getByTestId("outcome")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  expect(fromWorker, `the worker printed:\n${fromWorker.join("\n")}`).toEqual([]);
  expect(mentionsRepair).toEqual([]);
});
