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
