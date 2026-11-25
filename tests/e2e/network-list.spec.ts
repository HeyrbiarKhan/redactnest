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
 * In the `chromium` project, because it times nothing.
 */

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

const FIXTURE = resolve("tests/fixtures/detect-email.pdf");

/** A name nothing in the product has any reason to utter. */
const FILE_NAME = "zznetworklist.pdf";

/** What the fixture holds and a found row shows, which no request may carry. */
const FIXTURE_TEXT = ["sales@example.org", "for the report", "%PDF-", FILE_NAME];

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

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.getByTestId("checklist")).toContainText("sales@example.org", {
    timeout: ENGINE_TIMEOUT,
  });
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
});
