import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectInNode } from "./node-inspect";

/**
 * The steps spec 0002 left marked "after feature 6", which a changed tick makes
 * reachable. Spec 0005, AC-18, in a real browser with the real engine. And one
 * it left for after feature 5: leaving once the file is downloaded.
 *
 * `text-page.pdf` holds one address and one number on the same line, both
 * found and both ticked by default, so each case starts from a known tick set.
 */

const TEXT_PAGE = resolve("tests/fixtures/text-page.pdf");
const OTHER = resolve("tests/fixtures/two-pages.pdf");

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

const EMAIL = "jane.doe@example.com";
const PHONE = "020 7946 0958";

async function openTextPage(page: Page): Promise<void> {
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
  await expect(page.getByRole("checkbox", { name: PHONE })).toBeChecked({
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByRole("checkbox", { name: EMAIL })).toBeChecked();
}

/** Redact the current ticks and wait for the finished file to be offered. */
async function redact(page: Page): Promise<void> {
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** Download the finished file, and resolve with where the browser saved it. */
async function download(page: Page): Promise<string> {
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  return (await downloading).path();
}

/** Redact the current ticks, download, and read the file back in Node. */
async function redactAndRead(page: Page): Promise<string> {
  await redact(page);
  return inspectInNode(await download(page)).text;
}

/**
 * Spec 0002, AC-14. From `complete`, change one tick, run again, and download
 * a second time without going back to the file picker. The second file matches
 * the new ticks, and the first run's removal did not carry over.
 */
test("a changed tick runs again from the same document and makes a file that matches it", async ({
  page,
}) => {
  await openTextPage(page);

  const first = await redactAndRead(page);
  expect(first).not.toContain(EMAIL);
  expect(first).not.toContain(PHONE);

  await page.getByRole("checkbox", { name: PHONE }).click();
  await expect(page.getByTestId("download")).toHaveCount(0);
  const second = await redactAndRead(page);

  expect(second).not.toContain(EMAIL);
  expect(second).toContain(PHONE);
  expect(second).toContain("Keep this sentence exactly as it is");
});

/** Spec 0002, AC-1. A changed tick is work worth asking about before it goes. */
test.describe("choosing a second file with a tick changed", () => {
  test("asks first, and keeps the session when the answer is no", async ({ page }) => {
    await openTextPage(page);
    await page.getByRole("checkbox", { name: PHONE }).click();

    const asked: string[] = [];
    page.once("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.getByTestId("file-input").setInputFiles(OTHER);

    await expect.poll(() => asked).toEqual(["confirm"]);
    await expect(page.getByRole("checkbox", { name: PHONE })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: EMAIL })).toBeChecked();
  });

  test("replaces the session when the answer is yes", async ({ page }) => {
    await openTextPage(page);
    await page.getByRole("checkbox", { name: PHONE }).click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("file-input").setInputFiles(OTHER);

    await expect(page.getByRole("checkbox", { name: "contact@example.com" })).toBeVisible(
      {
        timeout: ENGINE_TIMEOUT,
      },
    );
    await expect(page.getByRole("checkbox", { name: PHONE })).toHaveCount(0);
  });

  test("does not ask when no tick changed", async ({ page }) => {
    await openTextPage(page);

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.getByTestId("file-input").setInputFiles(OTHER);

    await expect(page.getByRole("checkbox", { name: "contact@example.com" })).toBeVisible(
      {
        timeout: ENGINE_TIMEOUT,
      },
    );
    expect(asked).toEqual([]);
  });
});

/** Spec 0002, AC-13. The browser's own leave warning, only once a tick changed. */
test.describe("leaving with a tick changed", () => {
  test("brings the browser's leave warning", async ({ page }) => {
    await openTextPage(page);
    await page.getByRole("checkbox", { name: PHONE }).click();

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });

    await expect.poll(() => asked).toEqual(["beforeunload"]);
  });

  test("stays quiet when the checklist was read and left alone", async ({ page }) => {
    await openTextPage(page);
    // A click that changes nothing, so the page has the user activation a leave
    // warning needs, and the only thing missing is a changed tick.
    await page.getByRole("checkbox", { name: PHONE }).click();
    await page.getByRole("checkbox", { name: PHONE }).click();

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });

    expect(asked).toEqual([]);
  });
});

/**
 * Spec 0002, AC-13. A finished file is work until it is downloaded, and then it
 * is not: the download is what the run was for, and the ticks that made it are
 * still the ones on screen.
 */
test.describe("leaving after a run", () => {
  test("brings the leave warning while the finished file waits", async ({ page }) => {
    await openTextPage(page);
    await redact(page);

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });

    await expect.poll(() => asked).toEqual(["beforeunload"]);
  });

  test("stays quiet once the file is downloaded", async ({ page }) => {
    await openTextPage(page);
    await redact(page);
    await download(page);
    await expect(page.getByTestId("download")).toHaveCount(0);

    // Accepted rather than dismissed, so a warning that did appear still lets
    // the page close and fails on the list below rather than on a timeout.
    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.accept();
    });
    const closed = page.waitForEvent("close");
    await page.close({ runBeforeUnload: true });
    await closed;

    expect(asked).toEqual([]);
  });
});
