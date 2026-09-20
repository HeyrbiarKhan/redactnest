import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser support detection. Spec 0001 SD-8.
 *
 * Everything happens on the visitor's machine, so a browser missing any one of
 * these cannot do the work at all. The detector is what turns that into an
 * honest "this will not work here" rather than a drop area that fails after the
 * file has already been chosen.
 *
 * `/check verify` proves the real gap in a real browser. These lock in the
 * decision logic behind it, including the case the browser test cannot easily
 * reach: WebAssembly present but refused at compile time.
 *
 * The module caches its answer, so every case starts from a clean registry with
 * the globals already arranged rather than calling a reset.
 */

async function loadSupport() {
  vi.resetModules();
  return import("@/lib/support");
}

/** Node has `File` but no `Worker` and no `FileReader`, so a capable browser
 * has to be built here rather than assumed. */
beforeEach(() => {
  vi.stubGlobal("Worker", class FakeWorker {});
  vi.stubGlobal("File", class FakeFile {});
  vi.stubGlobal("FileReader", class FakeFileReader {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a browser that can run RedactNest", () => {
  it("reports supported with no gaps", async () => {
    const { detectSupport } = await loadSupport();

    expect(detectSupport()).toEqual({ supported: true, missing: [] });
  });
});

describe("each capability the product cannot do without", () => {
  it("reports the gap when WebAssembly is absent entirely", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing).toContain("webassembly");
  });

  /**
   * The case that matters most in practice. A workplace policy usually leaves
   * the global in place and refuses at compile time, so a truthiness check on
   * `window.WebAssembly` would report a working browser and then fail on a real
   * document.
   */
  it("reports the gap when WebAssembly is present but compiling is refused", async () => {
    vi.stubGlobal("WebAssembly", {
      Module: function BlockedModule() {
        throw new Error("WebAssembly.compile is disallowed by policy");
      },
    });
    const { detectSupport } = await loadSupport();

    const report = detectSupport();
    expect(report.supported).toBe(false);
    expect(report.missing).toContain("webassembly");
  });

  it("reports the gap when compiling returns something that is not a module", async () => {
    class NotAModule {}
    vi.stubGlobal("WebAssembly", {
      Module: function PretendModule() {
        return new NotAModule();
      },
    });
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing).toContain("webassembly");
  });

  it("reports the gap when Web Workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing).toContain("web-workers");
  });

  it("reports the gap when File is unavailable", async () => {
    vi.stubGlobal("File", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing).toContain("file-api");
  });

  it("reports the gap when FileReader is unavailable", async () => {
    vi.stubGlobal("FileReader", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing).toContain("file-api");
  });

  it("reports the file gap once when both halves are missing", async () => {
    vi.stubGlobal("File", undefined);
    vi.stubGlobal("FileReader", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport().missing.filter((gap) => gap === "file-api")).toHaveLength(1);
  });

  it("lists every gap when nothing is available", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("File", undefined);
    vi.stubGlobal("FileReader", undefined);
    const { detectSupport } = await loadSupport();

    expect(detectSupport()).toEqual({
      supported: false,
      missing: ["webassembly", "web-workers", "file-api"],
    });
  });
});

describe("the cached answer", () => {
  /**
   * `useSyncExternalStore` compares snapshots by identity. A fresh object per
   * call would re-render the tool page forever, so this is load bearing rather
   * than an optimisation.
   */
  it("hands back the very same object every time", async () => {
    const { getSupport } = await loadSupport();

    expect(getSupport()).toBe(getSupport());
  });

  it("keeps its first answer, because nothing here can change while a page is open", async () => {
    const { getSupport } = await loadSupport();
    const first = getSupport();

    vi.stubGlobal("Worker", undefined);

    expect(getSupport()).toBe(first);
    expect(first.supported).toBe(true);
  });
});

describe("the explanations shown to the visitor", () => {
  it("has plain wording for every gap the detector can report", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("File", undefined);
    const { detectSupport, SUPPORT_GAP_TEXT } = await loadSupport();

    const reportable = detectSupport().missing;
    expect(reportable.length).toBeGreaterThan(0);
    for (const gap of reportable) {
      expect(SUPPORT_GAP_TEXT[gap], `no explanation for ${gap}`).toBeTruthy();
    }
    expect(Object.keys(SUPPORT_GAP_TEXT).sort()).toEqual([...reportable].sort());
  });

  it("explains the reason rather than naming the missing global alone", async () => {
    const { SUPPORT_GAP_TEXT } = await loadSupport();

    for (const [gap, text] of Object.entries(SUPPORT_GAP_TEXT)) {
      expect(text.length, `${gap} needs a real explanation`).toBeGreaterThan(40);
      expect(text.trim().endsWith("."), `${gap} should read as a sentence`).toBe(true);
    }
  });
});
