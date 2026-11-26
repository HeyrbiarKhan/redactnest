import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Request } from "@playwright/test";

import { TELEMETRY_PATH } from "../../src/lib/routes";

/**
 * Spec 0026, AC-9 and AC-14. The home page's network band lists what `/tool`
 * fetches, each row with the paths on our own origin it stands for. This
 * reads that list from the page a visitor sees, then runs a fixture through
 * `/tool` (open, redact, download) in the Playwright build, which reports
 * counts, and holds every request to it: each one is on our own origin and
 * matches a row, every row with a path is seen, and no request but the counts
 * post sends a body. The counts post is checked for the fixture's text and
 * name. So the list cannot drift from what the page does.
 *
 * Spec 0026 child 0002, AC-52: at 1280 by 800 the page preview shows, so the
 * run walks it too, between the list appearing and Redact: the page's picture
 * and the thumbnails in view, two zooms in and one out, the other page
 * through the rail, then a row on the first page picked by focusing its
 * checkbox. No request may be made during the walk. A picture turned into a
 * `blob:` or `data:` URL makes no `http` request, so an init script spies on
 * the export calls instead: `toDataURL` and `toBlob` at any time, and
 * `URL.createObjectURL` during the walk (Download makes one of its own,
 * `src/lib/download.ts`). A script cannot reach inside the worker, so
 * `convertToBlob` there is held by the lint ban alone.
 *
 * In the `chromium` project, because it times nothing.
 */

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

/** Two pages, with finds on each (`SAMPLE_AGREEMENT`). */
const FIXTURE = resolve("tests/fixtures/sample-agreement.pdf");

/** A name nothing in the product has any reason to utter. */
const FILE_NAME = "zznetworklist.pdf";

/** What the fixture holds and a found row shows, which no request may carry. */
const FIXTURE_TEXT = [
  "alex.morgan@example.com",
  "payroll@example.com",
  "020 7946 0182",
  "%PDF-",
  FILE_NAME,
];

interface ExportCall {
  readonly name: string;
  readonly at: number;
}

declare global {
  interface Window {
    __exports?: ExportCall[];
  }
}

/** Runs before the page's own code: every export call is noted with its time. */
function spyOnExports(): void {
  const calls: ExportCall[] = [];
  window.__exports = calls;
  const note = (name: string) => calls.push({ name, at: performance.now() });
  const canvas = HTMLCanvasElement.prototype;
  const toDataURL = canvas.toDataURL;
  canvas.toDataURL = function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement["toDataURL"]>
  ) {
    note("toDataURL");
    return toDataURL.apply(this, args);
  };
  const toBlob = canvas.toBlob;
  canvas.toBlob = function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement["toBlob"]>
  ) {
    note("toBlob");
    return toBlob.apply(this, args);
  };
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (object: Blob | MediaSource) {
    note("createObjectURL");
    return createObjectURL.call(URL, object);
  };
}

interface Row {
  readonly label: string;
  readonly paths: readonly string[];
}

/** A path ending in `/` covers everything under it; any other, itself alone. */
function covers(path: string, pathname: string): boolean {
  return path.endsWith("/") ? pathname.startsWith(path) : pathname === path;
}

test("lists every request a full run on /tool makes, and nothing else", async ({
  page,
}) => {
  // Two waits of up to `ENGINE_TIMEOUT` each, the open and the run.
  test.setTimeout(180_000);

  await page.goto("/");
  const rows: Row[] = await page.getByTestId("network-row").evaluateAll((elements) =>
    elements.map((element) => ({
      label: element.querySelector("span span")?.textContent ?? "",
      paths: (element.getAttribute("data-paths") ?? "").split(" ").filter(Boolean),
    })),
  );
  expect(rows.length).toBeGreaterThan(1);
  // The last row is the visitor's file, which no request may carry.
  expect(rows.at(-1)?.paths).toEqual([]);

  const requests: Request[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request);
  });

  await page.addInitScript(spyOnExports);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.getByTestId("checklist")).toContainText("alex.morgan@example.com", {
    timeout: ENGINE_TIMEOUT,
  });

  // The preview walk (AC-52). The page's picture and the thumbnails in view
  // land first, so the walk starts with nothing in flight.
  await expect(page.getByTestId("preview-page")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("preview-canvas")).not.toHaveClass(/invisible/);
  await expect(page.locator('[data-testid="preview-thumb"] .bg-surface')).toHaveCount(2);
  const walkFrom = await page.evaluate(() => performance.now());
  const requestsBefore = requests.length;

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByTestId("preview-zoom-level")).toHaveText("125%");
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: /^Page 2\b/ })
    .click();
  await expect(page.getByTestId("preview-page-of")).toHaveText("Page 2 of 2");
  await expect(page.getByTestId("preview-canvas")).not.toHaveClass(/invisible/);
  await page.getByRole("checkbox", { name: "alex.morgan@example.com" }).focus();
  await expect(page.getByTestId("preview-page-of")).toHaveText("Page 1 of 2");
  await expect(page.locator("[data-box][data-picked]")).toHaveCount(1);

  // No picture in the preview names a URL of its own.
  const named = await page.getByTestId("area-preview").evaluate((preview) =>
    [...preview.querySelectorAll("*")].flatMap((element) => {
      const values = [
        element.getAttribute("src") ?? "",
        element.getAttribute("srcset") ?? "",
        getComputedStyle(element).backgroundImage,
      ];
      return values.filter((value) => /(blob|data):/.test(value));
    }),
  );
  expect(named).toEqual([]);

  const walkTo = await page.evaluate(() => performance.now());
  expect(
    requests.slice(requestsBefore).map((request) => request.url()),
    "a request was made during the preview walk",
  ).toEqual([]);

  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await (await downloading).path();
  // The counts go as each thing happens; wait for one to be sure the row is seen.
  await expect
    .poll(
      () =>
        requests.some((request) => new URL(request.url()).pathname === TELEMETRY_PATH),
      { timeout: ENGINE_TIMEOUT },
    )
    .toBe(true);

  const origin = new URL(page.url()).origin;
  const seen = new Set<string>();
  for (const request of requests) {
    const url = new URL(request.url());
    expect(url.origin, `${request.url()} is on another origin`).toBe(origin);

    const row = rows.find(({ paths }) =>
      paths.some((path) => covers(path, url.pathname)),
    );
    expect(row, `${request.method()} ${url.pathname} matches no row`).toBeDefined();
    if (row) seen.add(row.label);

    const body = request.postDataBuffer();
    if (url.pathname === TELEMETRY_PATH) {
      const sent = body?.toString("utf8") ?? "";
      for (const text of FIXTURE_TEXT) {
        expect(sent, `a counts post carried "${text}"`).not.toContain(text);
      }
    } else {
      expect(body?.length ?? 0, `${request.method()} ${url.pathname} sent a body`).toBe(
        0,
      );
    }
  }

  for (const row of rows.filter(({ paths }) => paths.length > 0)) {
    expect([...seen], `${row.label} was never seen`).toContain(row.label);
  }

  const exports = await page.evaluate(() => window.__exports ?? []);
  expect(
    exports.filter(({ name }) => name === "toDataURL" || name === "toBlob"),
    "a canvas was turned into a URL or a blob",
  ).toEqual([]);
  expect(
    exports.filter(
      ({ name, at }) => name === "createObjectURL" && at >= walkFrom && at <= walkTo,
    ),
    "a URL was made for something during the preview walk",
  ).toEqual([]);
});
