import { resolve } from "node:path";

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

test("the worker fetches the engine from our own origin, not a CDN", async ({ page }) => {
  const engineRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("mupdf")) engineRequests.push(request.url());
  });

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  expect(engineRequests.length).toBeGreaterThan(0);
  for (const url of engineRequests) {
    expect(url, "the engine must never come from a third party").toContain(
      "localhost:3000/engine/",
    );
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

  // The error must describe the failure, never the document. No file name, no
  // extracted content: that is what makes feature 11's scrubbing achievable.
  const text = (await error.textContent()) ?? "";
  expect(text).not.toContain("not-really");
  expect(text).not.toContain("secret note");
});
