import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { inspectInNode } from "./node-inspect";

/**
 * Spec 0007 in a real browser: the redact flow as one page, from drop to
 * download, with the real engine in the real worker. The component tests cover
 * every branch; these prove the whole pass holds together on a production
 * build, under the tool's real content security policy.
 */

/**
 * The two addresses in `detect-stamped.pdf`, as `DETECT_STAMPED` in
 * `scripts/lib/detection-fixtures.mjs` names them. Written out here because
 * Playwright's loader cannot import that module (it reads `import.meta`).
 */
const DETECT_STAMPED = Object.freeze({
  stamped: "jane.doe@example.com",
  clear: "office@example.org",
});

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

test.describe.configure({ timeout: ENGINE_TIMEOUT + 60_000 });

/** A real drop, the way a file dragged from the desktop arrives. */
async function dropFile(page: Page, fixture: string): Promise<void> {
  const bytes = [...readFileSync(resolve("tests/fixtures", fixture))];
  const transfer = await page.evaluateHandle(
    ({ bytes, name }) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], name, { type: "application/pdf" }),
      );
      return data;
    },
    { bytes, name: fixture },
  );
  await page
    .getByTestId("drop-area")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await page.getByTestId("drop-area").dispatchEvent("drop", { dataTransfer: transfer });
}

function descriptions(page: Page) {
  return page.getByTestId("outcome").locator("dd");
}

/**
 * AC-1, AC-3, AC-6, AC-7, AC-11, AC-13 and AC-20. One pass: drop, review with
 * select all, redact, read the result, download, and on to another PDF, with no
 * other page load.
 */
test("takes a document from drop to download in one pass, a step at a time", async ({
  page,
}) => {
  await page.goto("/tool");
  // A mark on this document's window: any other page load would replace the
  // window and lose it. (A download starts a navigation that never loads a page,
  // so counting navigations would count it.)
  await page.evaluate(() => {
    (window as Window & { __sameDocument?: boolean }).__sameDocument = true;
  });

  await dropFile(page, "detect-email.pdf");

  // The drop zone gives way to the file bar, which names the file and, once
  // it is open, its pages.
  const bar = page.getByTestId("file-bar");
  await expect(bar).toContainText("detect-email.pdf");
  await expect(bar.getByTestId("page-count")).toHaveText("3 pages", {
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByTestId("drop-area")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Choose another PDF" })).toBeFocused();

  // Select all clears every email, then ticks them all again, each in one go.
  const selectAll = page.getByTestId("select-all-email").getByRole("checkbox");
  const name = (await selectAll.getAttribute("aria-labelledby")) ?? "";
  const label = await page.locator(`[id="${name}"]`).textContent();
  const count = Number(/^Select all (\d+) email addresses$/.exec(label ?? "")?.[1]);
  expect(count).toBeGreaterThan(1);
  await expect(selectAll).toBeChecked();

  await selectAll.click();
  await expect(selectAll).not.toBeChecked();
  await expect(page.getByTestId("tick-count")).toHaveText(
    "Nothing is ticked, so nothing will be removed.",
  );
  await expect(page.getByTestId("redact")).toHaveText("Make a cleaned copy");

  await selectAll.click();
  await expect(selectAll).toBeChecked();
  await expect(page.getByTestId("redact")).toHaveText(`Redact ${count} items`);

  await page.getByTestId("redact").click();

  // The result card takes the action panel's place, and focus moves to it.
  const heading = page.getByRole("heading", {
    level: 2,
    name: "Your redacted file is ready",
  });
  await expect(heading).toBeFocused({ timeout: ENGINE_TIMEOUT });
  await expect(page.getByTestId("action-panel")).toHaveCount(0);
  await expect(page.getByTestId("outcome").locator("dt")).toHaveText([
    "Removed",
    "Left in the file",
    "Also stripped",
  ]);
  await expect(descriptions(page).first()).toHaveText(`${count} email addresses`);
  await expect(descriptions(page).nth(1)).toHaveText("Nothing RedactNest found.");

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  expect((await downloading).suggestedFilename()).toBe("detect-email-redacted.pdf");

  await expect(page.getByTestId("downloaded")).toHaveText("Your browser has the file.");
  await expect(page.getByTestId("redact-another")).toBeFocused();

  await page.getByTestId("redact-another").click();
  await expect(page.getByTestId("drop-area")).toBeVisible();
  await expect(page.getByTestId("choose-file")).toBeFocused();
  await expect(page.getByTestId("result")).toHaveCount(0);

  expect(
    await page.evaluate(
      () => (window as Window & { __sameDocument?: boolean }).__sameDocument,
    ),
  ).toBe(true);
});

/**
 * AC-14, AC-20 and AC-23. A run refused for something a tick caused keeps the
 * review, says why, and stays through tick changes; replacing the file while it
 * shows asks first; unticking the cause and running again succeeds.
 */
test("keeps the review through a refused run, and runs again once the cause is unticked", async ({
  page,
}) => {
  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/detect-stamped.pdf"));

  const stamped = page.getByRole("checkbox", { name: DETECT_STAMPED.stamped });
  const clear = page.getByRole("checkbox", { name: DETECT_STAMPED.clear });
  await expect(stamped).toBeChecked({ timeout: ENGINE_TIMEOUT });
  await expect(clear).toBeChecked();

  await page.getByTestId("redact").click();

  const refusal = page.getByTestId("run-refusal");
  await expect(refusal).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).toContainText("Your last run was stopped");
  await expect(
    refusal.getByRole("heading", {
      level: 2,
      name: "Removing what you ticked would remove more",
    }),
  ).toBeFocused();
  await expect(refusal).toContainText("a stamp such as CONFIDENTIAL or DRAFT");
  // Every tick kept, and no file made.
  await expect(stamped).toBeChecked();
  await expect(clear).toBeChecked();
  await expect(page.getByTestId("download")).toHaveCount(0);
  await expect(page.getByTestId("redact")).toHaveText("Redact 2 items");

  // It stays through a tick change and a select all.
  await stamped.click();
  await expect(refusal).toBeVisible();
  const selectAll = page.getByTestId("select-all-email").getByRole("checkbox");
  await selectAll.click();
  await expect(stamped).toBeChecked();
  await expect(refusal).toBeVisible();

  // Replacing the file while it shows asks first; no keeps everything.
  let asked = 0;
  page.once("dialog", (dialog) => {
    asked += 1;
    void dialog.dismiss();
  });
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/two-pages.pdf"));
  await expect.poll(() => asked).toBe(1);
  await expect(page.getByTestId("file-bar")).toContainText("detect-stamped.pdf");
  await expect(refusal).toBeVisible();

  // Untick the cause and run again: the refusal clears, and the run succeeds.
  await stamped.click();
  await page.getByTestId("redact").click();
  await expect(refusal).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: "Your redacted file is ready" }),
  ).toBeFocused({ timeout: ENGINE_TIMEOUT });
  await expect(descriptions(page)).toHaveText([
    "1 email address",
    "1 email address you left unticked.",
    /./,
  ]);

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("detect-stamped-redacted.pdf");
  const cleaned = inspectInNode(await download.path());
  expect(cleaned.text).not.toContain(DETECT_STAMPED.clear);
  expect(cleaned.text).toContain(DETECT_STAMPED.stamped);
});

/**
 * AC-6 and AC-12. Nothing ticked on a partly readable file: the button says
 * what it makes, and the file is a cleaned copy by title and by name, with the
 * page warning kept and its reason for a partly name left out.
 */
test("names a run with nothing ticked a cleaned copy, even on a partly readable file", async ({
  page,
}) => {
  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-mixed.pdf"));
  await expect(page.getByTestId("page-warnings")).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });

  for (const box of await page.getByTestId("checklist").getByRole("checkbox").all()) {
    if ((await box.isEnabled()) && (await box.isChecked())) await box.click();
  }
  await expect(page.getByTestId("redact")).toHaveText("Make a cleaned copy");
  await page.getByTestId("redact").click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing was removed" }),
  ).toBeFocused({ timeout: ENGINE_TIMEOUT });
  await expect(descriptions(page).first()).toHaveText("Nothing");
  const warning = page.getByTestId("download-warning");
  await expect(warning).toContainText("scanned image");
  await expect(warning).not.toContainText("partly redacted");

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  expect((await downloading).suggestedFilename()).toBe("read-mixed-cleaned.pdf");
});

/** AC-13. Make it again: the same ticks, run again, the same file offered afresh. */
test("makes the same file again after a download", async ({ page }) => {
  await page.goto("/tool");
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/two-pages.pdf"));
  await page.getByTestId("redact").click({ timeout: ENGINE_TIMEOUT });

  const first = page.waitForEvent("download");
  await page.getByTestId("download").click({ timeout: ENGINE_TIMEOUT });
  expect((await first).suggestedFilename()).toBe("two-pages-redacted.pdf");

  await page.getByTestId("make-again").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(
    page.getByRole("heading", { level: 2, name: "Your redacted file is ready" }),
  ).toBeFocused();

  const second = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const again = await second;
  expect(again.suggestedFilename()).toBe("two-pages-redacted.pdf");
  expect(inspectInNode(await again.path()).text).not.toContain("contact@example.com");
});

/**
 * AC-15, AC-16, AC-17 and AC-20. An open that fails says so in its kind's
 * words above the full drop zone, with focus on its heading, and holds nothing
 * of the document. No list has been shown, so none of it speaks of ticks.
 *
 * `trim-refused.pdf` and `trim-quote.pdf` are the only committed fixtures that
 * reach `edge-text` and `unsupported`, and both reach them at the open: a run
 * trims the same bytes the open did, so neither can refuse a run instead
 * (spec 0006, AC-16). Their run refusal is the component suite's to prove.
 */
const OPEN_FAILURES: readonly (readonly [
  string,
  () => Parameters<Locator["setInputFiles"]>[0],
  string,
  string,
])[] = [
  [
    "a PDF header with nothing readable after it",
    () => ({
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nnothing to see here\n"),
    }),
    "This PDF can't be read",
    "If you have another copy, try that one.",
  ],
  [
    "a file that is not a PDF",
    () => ({
      name: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("these are notes, not a PDF"),
    }),
    "This isn't a PDF",
    "save or export it as a PDF first",
  ],
  [
    "a document over the free page cap",
    () => resolve("tests/fixtures/detect-dense.pdf"),
    "This PDF has more than 3 pages",
    "Split it into parts of 3 pages or fewer",
  ],
  [
    "a document with layers",
    () => resolve("tests/fixtures/layers-all-on.pdf"),
    "This PDF has layers RedactNest can't redact yet",
    "Save a flattened copy",
  ],
  [
    "a document whose text crosses a page's edge",
    () => resolve("tests/fixtures/trim-refused.pdf"),
    "Text at a page's edge can't be removed cleanly",
    "Some text crosses the edge of a page",
  ],
  [
    "a document the trim cannot prove away from the edge",
    () => resolve("tests/fixtures/trim-quote.pdf"),
    "RedactNest stopped to be safe",
    "content near a page's edge it couldn't prove it removed",
  ],
];

for (const [label, file, title, words] of OPEN_FAILURES) {
  test(`shows ${label} above the full drop zone`, async ({ page }) => {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(file());

    const error = page.getByTestId("error");
    await expect(error.getByRole("heading", { level: 2, name: title })).toBeFocused({
      timeout: ENGINE_TIMEOUT,
    });
    await expect(error).toContainText(words);
    await expect(error).not.toContainText("ticked");
    await expect(error).toHaveAttribute("role", "alert");

    const zone = page.getByTestId("drop-area");
    await expect(zone).toBeVisible();
    const above = await error.evaluate(
      (callout, next) =>
        Boolean(
          callout.compareDocumentPosition(next as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      await zone.elementHandle(),
    );
    expect(above).toBe(true);
    await expect(page.getByTestId("file-bar")).toHaveCount(0);
    await expect(page.getByTestId("review")).toHaveCount(0);
  });
}
