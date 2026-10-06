import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page, type Request, type Response } from "@playwright/test";

import {
  CLERK_ORIGINS,
  OUTSIDE_SERVICES,
  originCoversHost,
} from "../../src/config/privacy";

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

/**
 * Same origin and not a document request: the page's own code, the engine,
 * and the icon files every page links (spec 0013, AC-3 and AC-21), all static.
 */
const ASSET_PATHS = [
  /^\/_next\//,
  /^\/engine\//,
  /^\/favicon\./,
  /^\/icon\.svg$/,
  /^\/apple-icon\.png$/,
];

/**
 * Spec 0012, AC-9: the routes outside the account group, none of which may
 * load Clerk or reach its hosts.
 */
const PUBLIC_ROUTES = ["/", "/tool", "/pricing", "/privacy", "/terms"] as const;

/**
 * Every origin Clerk's sign in uses, its images included, read from the same
 * list that feeds the policy, so a Clerk origin added there is looked for here.
 */
const CLERK_HOST_ORIGINS: readonly string[] = [
  ...CLERK_ORIGINS,
  ...OUTSIDE_SERVICES.filter((service) => service.name === "Clerk").flatMap(
    (service) => service.imageOrigins,
  ),
];

const isClerkHost = (url: string): boolean => {
  const { host } = new URL(url);
  return CLERK_HOST_ORIGINS.some((origin) => originCoversHost(origin, host));
};

/**
 * Every link the header shows on this page (the lockup, Pricing, Account and,
 * off `/tool`, Try it free), which plain `a` elements never prefetch.
 */
async function hoverHeaderLinks(page: Page): Promise<void> {
  const links = page.getByRole("banner").getByRole("link");
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    await link.hover();
  }
  await page.waitForLoadState("networkidle");
}

interface RecordedWrite {
  readonly api: string;
  readonly detail: string;
}

interface ObjectUrlRecord {
  readonly url: string;
  /** The first five bytes, read the moment the URL was made. */
  head: string | null;
}

declare global {
  interface Window {
    __redactnestWrites?: RecordedWrite[];
    __redactnestPdfUrls?: ObjectUrlRecord[];
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
 * build time and the icons compile into our bundle, so every request any page
 * makes, the font files included, goes to our own origin. Spec 0011, AC-12,
 * holds the privacy policy and the Terms of service to the same rule (claim
 * C9), and spec 0012 (task 15) holds Pricing to it too: it sells Pro without
 * a script or an origin from Polar or Clerk.
 *
 * The font requests are counted too, so this cannot pass on a page that simply
 * never asked for a font: a regression to a CDN stylesheet would show up as a
 * font request to someone else, not as no font request at all.
 *
 * Spec 0013, AC-29: the brand's icons and the home page's product shot are
 * held to it as well, and the shot is counted on `/` for the same reason the
 * fonts are, so an image moved to a CDN cannot pass as no image at all.
 */
for (const path of PUBLIC_ROUTES) {
  test(`every request on ${path}, fonts included, stays on our own origin`, async ({
    page,
  }) => {
    const requests = recordRequests(page);

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const origin = new URL(page.url()).origin;
    const fonts = requests.filter((request) => request.resourceType() === "font");

    expect(fonts.length, "the page asked for no font file at all").toBeGreaterThan(0);
    if (path === "/") {
      const shots = requests.filter(
        (request) =>
          request.resourceType() === "image" &&
          new URL(request.url()).pathname === "/_next/image",
      );
      expect(shots.length, "the home page asked for no product shot").toBeGreaterThan(0);
    }
    for (const request of requests) {
      expect(new URL(request.url()).origin, `${request.url()} is a third party`).toBe(
        origin,
      );
    }
  });
}

/**
 * Spec 0012, AC-9 and claims C7 and C9: Clerk's script loads only on the sign
 * in and account pages. Each public route is loaded and its header's Pricing
 * and Account links hovered, which `next/link` would answer with a prefetch,
 * and nothing reaches a Clerk host. The same origin check above already holds
 * this; this one names what it guards, so a failure says which wall fell.
 */
for (const path of PUBLIC_ROUTES) {
  test(`${path} reaches no Clerk host, with the header's links hovered`, async ({
    page,
  }) => {
    const requests = recordRequests(page);

    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await hoverHeaderLinks(page);

    expect(requests.length, "the page made no request at all").toBeGreaterThan(0);
    expect(
      requests.map((request) => request.url()).filter(isClerkHost),
      "a public route reached Clerk",
    ).toEqual([]);
  });
}

/** The control: the check above would see a request to a Clerk host. */
test("a request to a Clerk host would be seen", () => {
  expect(isClerkHost("https://clerk.redactnest.com/npm/@clerk/clerk-js")).toBe(true);
  expect(isClerkHost("https://redactnest-e2e-00.clerk.accounts.dev/v1/client")).toBe(
    true,
  );
  expect(isClerkHost("https://img.clerk.com/avatar")).toBe(true);
  expect(isClerkHost("https://redactnest.test/pricing")).toBe(false);
});

test("the only thing the tool route asks its own server for is the entitlement", async ({
  page,
}) => {
  const requests = recordRequests(page);

  await page.goto("/tool");
  await openDocument(page);

  // Spec 0012, AC-9: the header now links to Pricing and Account. They are
  // plain links, so hovering them prefetches neither, and the route's requests
  // stay as they were.
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Pricing", exact: true }),
  ).toHaveAttribute("href", "/pricing");
  await expect(
    header.getByRole("link", { name: "Account", exact: true }),
  ).toHaveAttribute("href", "/account");
  await hoverHeaderLinks(page);

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
  // Two waits of up to `ENGINE_TIMEOUT` each, the open and the run, which the
  // default 30 seconds cannot hold when the suite is busy in parallel.
  test.setTimeout(180_000);

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

/**
 * Spec 0006, AC-28. A document whose pages carry warnings: the readings cross
 * to the main thread as closed kinds, and nothing of the page, not its text,
 * not what a finding said about it, reaches a request, a store or the console,
 * from open to download.
 */
test("a flagged document sends, stores and logs no page text or finding detail", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await watchStorage(page);
  const requests = recordRequests(page);
  const logged: string[] = [];
  page.on("console", (message) => logged.push(message.text()));

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: readFileSync(resolve("tests/fixtures/read-mixed.pdf")),
  });

  // On screen, so the page really holds what this test looks for.
  await expect(page.getByTestId("page-warnings")).toContainText("scanned image", {
    timeout: ENGINE_TIMEOUT,
  });
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download-warning")).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await (await downloading).path();

  const secret = [
    // The document's own text.
    "Letter with an enclosure",
    "jane.doe@example.com",
    // What reading its pages found, in the protocol's words and on screen.
    "scanned",
    "Page 2",
    "zzsecretpayroll",
  ];

  for (const request of requests) {
    const sent = `${request.url()}\n${request.postData() ?? ""}`;
    for (const text of secret) {
      expect(sent, `a request carried "${text}"`).not.toContain(text);
    }
  }

  const writes = await page.evaluate(() => window.__redactnestWrites ?? []);
  expect(writes).toEqual([]);

  for (const line of logged) {
    for (const text of secret) {
      expect(line, `the console printed "${text}"`).not.toContain(text);
    }
  }

  const dataRequests = requests
    .map((request) => new URL(request.url()).pathname)
    .filter((path) => path !== "/tool")
    .filter((path) => !ASSET_PATHS.some((asset) => asset.test(path)));
  expect([...new Set(dataRequests)]).toEqual(["/api/entitlement"]);
});

/**
 * Spec 0011, AC-11, as spec 0012's AC-19 states it for anonymous visitors: no
 * page outside the sign in and account pages sets a cookie, which is the first
 * half of claim C6. A full run on the tool, open to download, and then every
 * other public page, a page that does not exist and a static file, with every
 * response's headers read in full. `headersArray()` keeps a repeated header,
 * where `headers()` would fold several `Set-Cookie` lines into one. A cookie
 * set from script never shows in a header, so the browser context's own jar
 * is read at the end as well.
 */
test.describe("cookies", () => {
  /** A path no route answers, so the not found page renders. */
  const MISSING = "/no-such-page";

  test("none is set by a full run on the tool or by any other page", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    const responses: Response[] = [];
    page.on("response", (response) => responses.push(response));

    await page.goto("/tool");
    await redactAndDownload(page);
    for (const path of ["/", "/pricing", "/privacy", "/terms", MISSING, "/licence.txt"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(path === MISSING ? 404 : 200);
      await page.waitForLoadState("networkidle");
    }

    const paths = new Set(responses.map((response) => new URL(response.url()).pathname));
    expect([...paths]).toEqual(
      expect.arrayContaining([
        "/tool",
        "/api/entitlement",
        "/",
        "/pricing",
        "/privacy",
        "/terms",
        MISSING,
        "/licence.txt",
      ]),
    );

    const setCookies: string[] = [];
    for (const response of responses) {
      for (const header of await response.headersArray()) {
        if (header.name.toLowerCase() === "set-cookie") {
          setCookies.push(`${response.url()}: ${header.value}`);
        }
      }
    }
    expect(setCookies, "a response set a cookie").toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  /** The control: the jar really does show a cookie when one is set. */
  test("a cookie set by script would be seen", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => {
      document.cookie = "canary=1; path=/";
    });

    expect((await context.cookies()).map((cookie) => cookie.name)).toEqual(["canary"]);
  });
});

/**
 * Record every object URL the page makes for a PDF, and read each one straight
 * away, in the same task that made it, before anything could revoke it. That
 * read is the control: it proves the probe below can see a live URL, and that
 * this one really carried the file.
 */
async function watchPdfUrls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const made: ObjectUrlRecord[] = [];
    window.__redactnestPdfUrls = made;

    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = original(object);
      if (object instanceof Blob && object.type === "application/pdf") {
        const record: ObjectUrlRecord = { url, head: null };
        made.push(record);
        void fetch(url)
          .then((response) => response.arrayBuffer())
          .then(
            (bytes) => {
              record.head = new TextDecoder().decode(bytes.slice(0, 5));
            },
            () => {
              record.head = "unreadable";
            },
          );
      }
      return url;
    };
  });
}

/**
 * Spec 0002, AC-4 and INV-7. Once the browser has the file, the page holds no
 * way back to it: the object URL it was handed over through resolves nothing.
 *
 * The tool route's `connect-src 'self'` refuses any `blob:` fetch, revoked or
 * not, so under the real policy this probe would pass without proving a thing.
 * This one test lifts the policy to reach the URL itself; every other test in
 * the suite runs under it.
 */
test.describe("the object URL a download goes through", () => {
  test.use({ bypassCSP: true });

  test("resolves nothing once the file is handed over", async ({ page }) => {
    await watchPdfUrls(page);
    await page.goto("/tool");
    await redactAndDownload(page);

    const heads = () =>
      page.evaluate(() => (window.__redactnestPdfUrls ?? []).map(({ head }) => head));
    await expect.poll(heads).toEqual(["%PDF-"]);

    const [url] = await page.evaluate(() =>
      (window.__redactnestPdfUrls ?? []).map((record) => record.url),
    );
    const now = await page.evaluate(async (target) => {
      try {
        await fetch(target);
        return "resolved";
      } catch {
        return "gone";
      }
    }, url);

    expect(now).toBe("gone");
  });
});
