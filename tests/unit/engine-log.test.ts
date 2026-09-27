import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";

import { fixture } from "../support/bytes";

/**
 * Spec 0004, AC-24. MuPDF's own warnings and errors never reach the console.
 *
 * In a file of its own, because the proof needs MuPDF to load after the console
 * is being watched. MuPDF binds its default printer to `console.error` the
 * moment it loads, so a spy installed later would see nothing whether MuPDF
 * printed or not, and the silence below would prove nothing. Vitest gives every
 * test file a fresh module graph, so this file's MuPDF is its own.
 *
 * The three steps run in order and build on each other:
 *
 *  1. The canary. Left alone, MuPDF does print while it repairs a damaged file,
 *     and this spy sees it. Without this the other two could pass on a console
 *     nobody was watching.
 *  2. With a recording log installed, opening, flattening and redacting reach
 *     MuPDF's log callback, and nothing reaches the console.
 *  3. With the engine's silencer installed, the same work reaches neither.
 */

type MuPdf = typeof import("mupdf");
type Engine = typeof import("@/engine");

const LIMITS = { maxBytes: 26_214_400, maxPages: 50 };

let consoleCalls: MockInstance[];
let mupdf: MuPdf;
let engine: Engine;

function consoleCallCount(): number {
  return consoleCalls.reduce((total, spy) => total + spy.mock.calls.length, 0);
}

/** Open the damaged fixture, prepare it, and run a redaction over it. */
async function openFlattenAndRedact(): Promise<void> {
  engine.openDocumentWith(mupdf, fixture("damaged.pdf"), LIMITS).close();
  await engine.redactDocumentWith(mupdf, fixture("damaged.pdf"), []);
}

beforeAll(async () => {
  consoleCalls = (["error", "warn", "log", "info", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  mupdf = await import("mupdf");
  engine = await import("@/engine");
});

afterAll(() => {
  for (const spy of consoleCalls) spy.mockRestore();
});

describe("MuPDF's log", () => {
  it("prints to the console when nobody has silenced it", () => {
    mupdf.Document.openDocument(fixture("damaged.pdf"), "application/pdf").destroy();

    expect(consoleCallCount()).toBeGreaterThan(0);
  });

  it("reaches a log callback, and not the console, once one is installed", async () => {
    const lines: string[] = [];
    mupdf.setLog((line) => lines.push(line));
    const before = consoleCallCount();

    await openFlattenAndRedact();

    expect(lines.length).toBeGreaterThan(0);
    expect(consoleCallCount()).toBe(before);
  });

  it("reaches nothing at all once the engine has silenced it", async () => {
    engine.silenceEngineLog(mupdf);
    const before = consoleCallCount();

    await openFlattenAndRedact();

    expect(consoleCallCount()).toBe(before);
  });
});
