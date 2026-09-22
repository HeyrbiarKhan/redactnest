import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Where the current document was loaded, spec 0003, AC-21.
 *
 * The tool page's load guard trusts this to tell a document the browser loaded
 * at `/tool` from one a client side navigation merely moved there. What the
 * guard does with the answer is `tests/component/tool-client.test.tsx`'s.
 *
 * The module caches its answer, so every case starts from a clean registry with
 * the globals already arranged, as `support.test.ts` does.
 */

async function loadModule() {
  vi.resetModules();
  return import("@/lib/document-load");
}

function navigationEntries(...names: string[]) {
  // A spy, not a stubbed global: Vitest times itself with `performance.now`.
  return vi
    .spyOn(performance, "getEntriesByType")
    .mockImplementation((type: string) =>
      type === "navigation" ? names.map((name) => ({ name }) as PerformanceEntry) : [],
    );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("loadedAt", () => {
  it("is the path the document was loaded at", async () => {
    navigationEntries("https://redactnest.test/tool");
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBe("/tool");
  });

  it("leaves out the query string and the hash, which are not the path", async () => {
    navigationEntries("https://redactnest.test/tool?from=home#top");
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBe("/tool");
  });

  it("reports another page as that page, so the guard can refuse it", async () => {
    navigationEntries("https://redactnest.test/");
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBe("/");
  });

  it("is null when the browser reports no load", async () => {
    navigationEntries();
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBeNull();
  });

  it("is null when there is no performance timeline at all", async () => {
    vi.stubGlobal("performance", undefined);
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBeNull();
  });

  it("is null rather than a throw when the entry is not a URL", async () => {
    navigationEntries("not a url");
    const { loadedAt } = await loadModule();

    expect(loadedAt()).toBeNull();
  });

  it("reads once and reuses the answer, because the load cannot change", async () => {
    const getEntriesByType = navigationEntries("https://redactnest.test/tool");
    const { loadedAt } = await loadModule();

    loadedAt();
    loadedAt();

    expect(getEntriesByType).toHaveBeenCalledTimes(1);
  });
});

describe("currentPath", () => {
  it("is the address bar's path", async () => {
    vi.stubGlobal("location", { pathname: "/tool" });
    const { currentPath } = await loadModule();

    expect(currentPath()).toBe("/tool");
  });

  it("is read fresh each time, because a client side navigation changes it", async () => {
    const address = { pathname: "/" };
    vi.stubGlobal("location", address);
    const { currentPath } = await loadModule();

    currentPath();
    address.pathname = "/tool";

    expect(currentPath()).toBe("/tool");
  });
});

/**
 * Spec 0003, INV-11. The one thing that must hold: `"reload"` only ever comes
 * back when the address bar reads `/tool`, so the load it asks for passes.
 */
describe("loadGuard", () => {
  it.each([
    [null, "/", "ok"],
    ["/tool", "/", "ok"],
    ["/tool", "/tool", "ok"],
    ["/", "/tool", "reload"],
    ["/", "/", "wrong-url"],
    ["/", "/tool/", "wrong-url"],
    ["/elsewhere", "/elsewhere", "wrong-url"],
  ] as const)(
    "loaded at %s with the address at %s is %s",
    async (loaded, address, expected) => {
      const { loadGuard } = await loadModule();

      expect(loadGuard(loaded, address)).toBe(expected);
    },
  );
});

describe("reloadDocument", () => {
  it("asks the browser for a real page load", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const { reloadDocument } = await loadModule();

    reloadDocument();

    expect(reload).toHaveBeenCalledOnce();
  });
});
