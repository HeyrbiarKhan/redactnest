import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The walled module, asserted rather than trusted. Spec 0001 INV-5 and INV-6.
 *
 * `/check verify` proves these with two `grep` steps run by hand. This is the
 * same two invariants as a test that runs on every commit, because the wall is
 * what the privacy claim rests on and a single stray import quietly removes it.
 *
 * Feature 2 replaces this with a lint rule. Until it lands, this is the guard.
 */

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

/** Every source file under `src/`, as repository relative paths with `/`. */
function sourceFiles(): string[] {
  const found: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts)$/.test(entry.name)) found.push(full);
    }
  }

  walk(SRC);
  return found.map((file) => `src/${relative(SRC, file).split(sep).join("/")}`);
}

const FILES = sourceFiles().map((path) => ({
  path,
  text: readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8"),
}));

function filesMatching(pattern: RegExp): string[] {
  return FILES.filter((file) => pattern.test(file.text))
    .map((file) => file.path)
    .sort();
}

describe("the source tree this guards", () => {
  it("was actually found and read", () => {
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES.map((file) => file.path)).toContain("src/engine/index.ts");
  });
});

describe("one PDF parser, and only the walled module may reach it", () => {
  /** INV-5. Nothing else in the codebase parses or renders a PDF. */
  it("names the mupdf package in the engine module and nowhere else", () => {
    expect(filesMatching(/["']mupdf["']/)).toEqual(["src/engine/index.ts"]);
  });

  /** The runtime path the engine is served from, for the same reason. */
  it("names the served engine path in the engine module and nowhere else", () => {
    expect(filesMatching(/\/engine\/mupdf/)).toEqual(["src/engine/index.ts"]);
  });

  /** INV-6. Only the worker may import the engine. */
  it("is imported by the engine worker and nothing else", () => {
    expect(filesMatching(/from\s+["']@\/engine["']/)).toEqual([
      "src/worker/engine.worker.ts",
    ]);
  });

  it("is never reached from a route, a component or a shared library", () => {
    const mainThread = FILES.filter(
      (file) => file.path.startsWith("src/app/") || file.path.startsWith("src/lib/"),
    );

    expect(mainThread.length).toBeGreaterThan(0);
    for (const file of mainThread) {
      expect(file.text, `${file.path} must not reach the engine`).not.toMatch(
        /@\/engine|["']mupdf["']/,
      );
    }
  });

  /**
   * The engine module may depend on the protocol's types, never the other way
   * round. A protocol that imported the engine would drag MuPDF onto the main
   * thread through `src/worker/client.ts`.
   */
  it("is never imported by the protocol the main thread reads", () => {
    const protocol = FILES.find((file) => file.path === "src/worker/protocol.ts");

    expect(protocol).toBeDefined();
    expect(protocol?.text).not.toMatch(/@\/engine|["']mupdf["']/);
  });
});

describe("the main thread's only route to the engine", () => {
  it("is the worker client, which is the only thing that constructs a Worker", () => {
    expect(filesMatching(/new\s+Worker\(/)).toEqual(["src/worker/client.ts"]);
  });
});
