import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * The guarantee, proved rather than promised. Spec 0002, AC-2 and AC-3.
 *
 * This is the test feature 16 sells and a buyer can read: a real browser runs a
 * real document through the tool while every way of writing something down is
 * watched, and nothing writes.
 *
 * Recorded rather than sampled, which is the point. Checking `localStorage` at
 * the end would pass a write that was cleared a moment before the run finished.
 * Every mutating call is captured as it happens, so a write that existed for a
 * millisecond still fails this.
 *
 * Honest about its reach, because spec 0002 is: these proxies watch the
 * accessors they were told about. A storage API nobody has invented yet walks
 * past them, exactly as it walks past the lint zone in `eslint.config.mjs`. The
 * two mechanisms cover different holes and neither covers the unknown one.
 */

const FIXTURE = resolve("tests/fixtures/two-pages.pdf");

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

/**
 * A name nothing in the product has any reason to utter.
 *
 * Uploaded in place of the fixture's own name so "no request carries the file
 * name" is a search for one distinctive string rather than an argument about
 * what counts as a name.
 */
const FILE_NAME = "zzsecretpayroll2026.pdf";

/** Same origin and not a document request: the page's own code and the engine. */
const ASSET_PATHS = [/^\/_next\//, /^\/engine\//, /^\/favicon\./];

interface RecordedWrite {
  readonly api: string;
  readonly detail: string;
}

declare global {
  interface Window {
    __redactnestWrites?: RecordedWrite[];
  }
}

/**
 * Wrap every mutating storage call before a single line of the page has run.
 *
 * Prototype methods rather than the globals themselves, so `localStorage.x()`,
 * `window.localStorage.x()` and a reference captured into a variable are all the
 * same call and all recorded. Each wrapper passes through to the original, so a
 * page that did write would still work and would still be caught, rather than
 * breaking in a way that could be mistaken for the guarantee holding.
 */
async function watchStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: RecordedWrite[] = [];
    window.__redactnestWrites = writes;

    function wrap(target: object | undefined, method: string, api: string): void {
      if (!target) return;
      const holder = target as Record<string, unknown>;
      const original = holder[method];
      if (typeof original !== "function") return;

      holder[method] = function patched(this: unknown, ...args: unknown[]) {
        writes.push({ api: `${api}.${method}`, detail: String(args[0] ?? "") });
        return (original as (...inner: unknown[]) => unknown).apply(this, args);
      };
    }

    // localStorage and sessionStorage share one prototype, so this covers both.
    wrap(Storage.prototype, "setItem", "Storage");
    wrap(Storage.prototype, "removeItem", "Storage");
    wrap(Storage.prototype, "clear", "Storage");

    wrap(IDBFactory.prototype, "open", "indexedDB");
    wrap(IDBFactory.prototype, "deleteDatabase", "indexedDB");

    wrap(CacheStorage.prototype, "open", "caches");
    wrap(CacheStorage.prototype, "delete", "caches");

    // The origin private file system, reached through navigator.storage.
    wrap(
      (globalThis as { StorageManager?: { prototype: object } }).StorageManager
        ?.prototype,
      "getDirectory",
      "navigator.storage",
    );

    wrap(
      (globalThis as { ServiceWorkerContainer?: { prototype: object } })
        .ServiceWorkerContainer?.prototype,
      "register",
      "navigator.serviceWorker",
    );

    // The file system access API, which writes straight to the visitor's disk.
    for (const picker of [
      "showSaveFilePicker",
      "showOpenFilePicker",
      "showDirectoryPicker",
    ]) {
      wrap(window, picker, "window");
    }
  });
}

/**
 * Everything the page asked the network for, in order.
 *
 * Http and https only. A download is handed to the browser through a `blob:`
 * URL, which names memory already inside the tab and goes nowhere, so it is not
 * a request in the sense this file cares about (spec 0004, AC-21).
 */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) requests.push(request);
  });
  return requests;
}

/** Choose the fixture under the distinctive name, and wait for it to open. */
async function openDocument(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: readFileSync(FIXTURE),
  });

  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/**
 * Drive a whole run, as far as a session goes: open, redact, download. Spec
 * 0004, AC-21. Resolves once the browser has the file.
 */
async function redactAndDownload(page: Page): Promise<void> {
  await openDocument(page);
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await (await downloading).path();
}

test("a document can be opened without anything being written down", async ({ page }) => {
  await watchStorage(page);
  await page.goto("/tool");
  await openDocument(page);

  const writes = await page.evaluate(() => window.__redactnestWrites ?? []);

  expect(
    writes,
    `something wrote to browser storage:\n${writes
      .map((write) => `${write.api}(${write.detail})`)
      .join("\n")}`,
  ).toEqual([]);
});

test("the proxies are really installed, so the test above can fail", async ({ page }) => {
  await watchStorage(page);
  await page.goto("/tool");

  // Without this, a wrapper that silently failed to install would make every
  // assertion above pass for the wrong reason, which is the one way a proof
  // like this is worse than no proof at all.
  await page.evaluate(() => {
    window.localStorage.setItem("canary", "1");
    window.localStorage.removeItem("canary");
  });

  const writes = await page.evaluate(() => window.__redactnestWrites ?? []);
  expect(writes.map((write) => write.api)).toEqual([
    "Storage.setItem",
    "Storage.removeItem",
  ]);
});

test("every store is empty for the origin after a run", async ({ page }) => {
  await watchStorage(page);
  await page.goto("/tool");
  await openDocument(page);

  const state = await page.evaluate(async () => ({
    localStorage: window.localStorage.length,
    sessionStorage: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));

  expect(state).toEqual({
    localStorage: 0,
    sessionStorage: 0,
    databases: 0,
    caches: 0,
    serviceWorkers: 0,
  });
});

test("the file input keeps no FileList once the file is in hand", async ({ page }) => {
  await page.goto("/tool");
  await openDocument(page);

  // AC-2. An input left holding a FileList is a reference to the visitor's file
  // sitting in the page for as long as the tab is open.
  const held = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]');
    return input?.files?.length ?? -1;
  });

  expect(held).toBe(0);
});

test("no request carries the document, its text or its name", async ({ page }) => {
  await watchStorage(page);
  const requests = recordRequests(page);

  await page.goto("/tool");
  await openDocument(page);

  for (const request of requests) {
    const url = request.url();
    const body = request.postData() ?? "";

    expect(url, "a request named the file").not.toContain("zzsecretpayroll");
    expect(body, "a request body named the file").not.toContain("zzsecretpayroll");
    // The fixture's own text layer. Nothing extracted from a document may be
    // sent anywhere, which is what makes us not a processor of its content.
    expect(body, "a request body carried extracted text").not.toContain("RedactNest");
    expect(new URL(url).origin, "the tool route reached a third party origin").toBe(
      new URL(page.url()).origin,
    );
  }
});

/**
 * Spec 0003, AC-4 and AC-20. The design system added a font and an icon set,
 * and neither may bring a third party with it. `next/font` self hosts Inter at
 * build time and the icons compile into our bundle, so every request either
 * page makes, the font files included, goes to our own origin.
 *
 * The font requests are counted too, so this cannot pass on a page that simply
 * never asked for a font: a regression to a CDN stylesheet would show up as a
 * font request to someone else, not as no font request at all.
 */
for (const path of ["/", "/tool"]) {
  test(`every request on ${path}, fonts included, stays on our own origin`, async ({
    page,
  }) => {
    const requests = recordRequests(page);

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const origin = new URL(page.url()).origin;
    const fonts = requests.filter((request) => request.resourceType() === "font");

    expect(fonts.length, "the page asked for no font file at all").toBeGreaterThan(0);
    for (const request of requests) {
      expect(new URL(request.url()).origin, `${request.url()} is a third party`).toBe(
        origin,
      );
    }
  });
}

test("the only thing the tool route asks its own server for is the entitlement", async ({
  page,
}) => {
  const requests = recordRequests(page);

  await page.goto("/tool");
  await openDocument(page);

  // AC-3. Everything else the route fetches is its own code and the engine, both
  // static assets. What is left is the one endpoint spec 0001 allows, and that
  // endpoint accepts no document data and returns none.
  const dataRequests = requests
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => path !== "/tool")
    .filter((path) => !ASSET_PATHS.some((asset) => asset.test(path)));

  expect([...new Set(dataRequests)]).toEqual(["/api/entitlement"]);
});

/**
 * Spec 0004, AC-21. The proof above, carried through a whole run: open, redact
 * and download. The redacted file comes back to the main thread and is handed
 * to the browser, and still nothing is written down and nothing goes out.
 */
test("a full run, open to download, writes nothing down", async ({ page }) => {
  await watchStorage(page);
  await page.goto("/tool");
  await redactAndDownload(page);

  const writes = await page.evaluate(() => window.__redactnestWrites ?? []);

  expect(
    writes,
    `something wrote to browser storage:\n${writes
      .map((write) => `${write.api}(${write.detail})`)
      .join("\n")}`,
  ).toEqual([]);
});

test("a full run sends no document, text, match or name anywhere", async ({ page }) => {
  await watchStorage(page);
  const requests = recordRequests(page);

  await page.goto("/tool");
  await redactAndDownload(page);

  const origin = new URL(page.url()).origin;
  for (const request of requests) {
    const url = request.url();
    const body = request.postData() ?? "";

    expect(url, "a request named the file").not.toContain("zzsecretpayroll");
    expect(body, "a request body named the file").not.toContain("zzsecretpayroll");
    expect(body, "a request body carried extracted text").not.toContain("RedactNest");
    expect(body, "a request body carried match text").not.toContain(
      "contact@example.com",
    );
    expect(body, "a request body carried a PDF").not.toContain("%PDF-");
    expect(new URL(url).origin, "the tool route reached a third party origin").toBe(
      origin,
    );
  }

  // The entitlement is still the only thing the route asks its own server for.
  const dataRequests = requests
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => path !== "/tool")
    .filter((path) => !ASSET_PATHS.some((asset) => asset.test(path)));

  expect([...new Set(dataRequests)]).toEqual(["/api/entitlement"]);
});

/**
 * Spec 0005, AC-15. Detection puts document text on the main thread for the
 * first time as more than one fixture line: every match, and the words either
 * side of it. A run over a document full of them, open to download, and none of
 * it reaches a request, a store or the console.
 */
test("a detected redaction sends, stores and logs no match text or context", async ({
  page,
}) => {
  await watchStorage(page);
  const requests = recordRequests(page);
  const logged: string[] = [];
  page.on("console", (message) => logged.push(message.text()));

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: readFileSync(resolve("tests/fixtures/detect-email.pdf")),
  });

  // On screen, so the page really holds the text this test looks for.
  const checklist = page.getByTestId("checklist");
  await expect(checklist).toContainText("sales@example.org", { timeout: ENGINE_TIMEOUT });
  await expect(checklist).toContainText("for the report");

  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await (await downloading).path();

  const found = [
    "jane.doe@example.com",
    "sales@example.org",
    "support@example.net",
    "δοκιμή@παράδειγμα.ελ",
    "left@example.com",
    // Context either side of a match.
    "for the report",
    "Berlin office",
    "Mail right",
  ];

  for (const request of requests) {
    const sent = `${request.url()}\n${request.postData() ?? ""}`;
    for (const text of found) {
      expect(sent, `a request carried "${text}"`).not.toContain(text);
      expect(sent, `a request carried "${text}", encoded`).not.toContain(
        encodeURIComponent(text),
      );
    }
  }

  const writes = await page.evaluate(() => window.__redactnestWrites ?? []);
  expect(writes).toEqual([]);

  for (const line of logged) {
    for (const text of found) {
      expect(line, `the console printed "${text}"`).not.toContain(text);
    }
  }
});
