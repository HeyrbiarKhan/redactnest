import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { diskReader, toPosix } from "../../scripts/lib/disk-reader.mjs";
import {
  checkMupdfVersion,
  mupdfSourceLinks,
  readMupdfLegal,
  signatureProblems,
} from "../../scripts/lib/mupdf-source.mjs";
import { buildNotices, NoticesError } from "../../scripts/lib/notices.mjs";
import { manifest, memoryReader } from "../support/memory-reader";

/**
 * What is inside MuPDF, and the notices that say so. Spec 0009, AC-15 to
 * AC-17, INV-6.
 *
 * `scripts/legal/mupdf.txt` is copied by hand from one version's source
 * archive. These tests tie it to the version installed and to the wasm that
 * ships, so an upgrade cannot quietly keep the old list.
 */

/**
 * Spec 0009's signature table: a name the `-g2` build keeps in the wasm for
 * each library, and whether 1.28.1 holds it. Kept here as data so the check
 * reads the binary itself, not its build flags.
 */
const SIGNATURES = [
  { library: "FreeType", signature: "FT_Load_Glyph", in: true },
  { library: "HarfBuzz", signature: "hb_shape", in: true },
  { library: "jbig2dec", signature: "jbig2_ctx_new", in: true },
  { library: "libjpeg", signature: "jpeg_CreateDecompress", in: true },
  { library: "OpenJPEG", signature: "opj_decode", in: true },
  { library: "zlib", signature: "inflateInit", in: true },
  { library: "lcms2mt", signature: "cmsCreateContext", in: true },
  { library: "Gumbo", signature: "gumbo_", in: true },
  { library: "cmark-gfm", signature: "cmark_iter_new", in: true },
  { library: "ucdn", signature: "ucdn_get_script", in: true },
  { library: "URW base 14 fonts", signature: "(URW)++", in: true },
  { library: "musl libc", signature: "__stdio_write", in: true },
  { library: "Emscripten runtime", signature: "emscripten_builtin_malloc", in: true },
  // Named only: the LLVM exception waives the notice for compiled object code.
  { library: "compiler-rt", signature: "__multi3", in: true },
  { library: "mujs", signature: "js_newstate", in: false },
  { library: "brotli", signature: "BrotliDecoderCreateInstance", in: false },
  { library: "extract", signature: "extract_begin", in: false },
  { library: "Tesseract", signature: "TessBaseAPI", in: false },
  { library: "Leptonica", signature: "pixCreate", in: false },
  { library: "ZXing", signature: "ZXing", in: false },
  { library: "zint", signature: "zint_", in: false },
  { library: "curl", signature: "curl_easy", in: false },
] as const;

const LEGAL_TEXT = readFileSync("scripts/legal/mupdf.txt", "utf8");
const LEGAL = readMupdfLegal(LEGAL_TEXT);
const INSTALLED = JSON.parse(
  readFileSync("node_modules/mupdf/package.json", "utf8"),
).version;

/** A buffer holding exactly these signatures, between bytes that hold none. */
const wasmWith = (signatures: readonly string[]) =>
  Buffer.from(`\0asm${signatures.map((name) => `\0${name}\0`).join("")}`, "latin1");

const PRESENT = SIGNATURES.filter((row) => row.in).map((row) => row.signature);

describe("mupdf.txt and the installed version", () => {
  /** covers: AC-16, INV-6 */
  it("covers the version that is installed", () => {
    expect(LEGAL.version).toBe(INSTALLED);
  });

  /** covers: AC-15. The archive's checksum, recorded beside its link. */
  it("records the archive's SHA-256", () => {
    expect(LEGAL.sha256).toBe(
      "dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3",
    );
  });

  /** covers: AC-16 */
  it("refuses a version that differs from the installed one", () => {
    expect(() => checkMupdfVersion({ ...LEGAL, version: "1.28.0" }, "1.28.1")).toThrow(
      /covers mupdf 1\.28\.0, but mupdf 1\.28\.1 is installed/,
    );
    expect(() => checkMupdfVersion(LEGAL, LEGAL.version)).not.toThrow();
  });

  /** covers: AC-16. The script stops on it before anything else is judged. */
  it("stops the notices from being written", () => {
    const reader = memoryReader({
      "/repo/package.json": manifest({ dependencies: { mupdf: "1.28.1" } }),
      "/repo/node_modules/mupdf/package.json": manifest({
        name: "mupdf",
        version: "1.28.1",
        license: "AGPL-3.0-or-later",
      }),
      "/repo/scripts/legal/spdx-licence-ids.txt": readFileSync(
        "scripts/legal/spdx-licence-ids.txt",
        "utf8",
      ),
      "/repo/scripts/legal/mupdf.txt": LEGAL_TEXT.replace(/^mupdf \S+/, "mupdf 1.28.0"),
    });

    expect(() => buildNotices("/repo", reader)).toThrow(NoticesError);
    expect(() => buildNotices("/repo", reader)).toThrow(/covers mupdf 1\.28\.0/);
  });

  it("refuses a file whose first two lines are not the version and checksum", () => {
    expect(() => readMupdfLegal("mupdf 1.28.1\nsha256 nothex\n")).toThrow(NoticesError);
    expect(() => readMupdfLegal("Name: FreeType\n")).toThrow(/must open with/);
  });
});

describe("mupdf.txt against the wasm that ships", () => {
  /** covers: AC-16. Every library inside is covered, and nothing covered is missing. */
  it("agrees with the installed wasm", () => {
    const wasm = readFileSync("node_modules/mupdf/dist/mupdf-wasm.wasm");

    expect(signatureProblems(wasm, SIGNATURES, LEGAL.names)).toEqual([]);
  });

  /** The table and the file agree on which libraries ship, as spec 0009 measured. */
  it("covers exactly the libraries the table says are inside", () => {
    const covered = new Set(LEGAL.names);
    for (const row of SIGNATURES) expect(covered.has(row.library)).toBe(row.in);
  });

  /** covers: AC-16. A new library in the wasm with no licence text fails, by name. */
  it("names a library that arrives in the wasm without a text", () => {
    const problems = signatureProblems(
      wasmWith([...PRESENT, "js_newstate"]),
      SIGNATURES,
      LEGAL.names,
    );

    expect(problems).toEqual([
      "mujs is in the wasm (js_newstate) but mupdf.txt does not cover it.",
    ]);
  });

  /** covers: AC-16. One covered but gone from the wasm is a stale list. */
  it("names a library the list covers but the wasm no longer holds", () => {
    const problems = signatureProblems(
      wasmWith(PRESENT.filter((name) => name !== "opj_decode")),
      SIGNATURES,
      LEGAL.names,
    );

    expect(problems).toEqual([
      "mupdf.txt covers OpenJPEG, but the wasm does not hold it (opj_decode).",
    ]);
  });

  /** covers: AC-16. A build with its names stripped cannot be checked this way. */
  it("fails as stripped when no signature at all is found", () => {
    const problems = signatureProblems(
      wasmWith(["main", "memcpy"]),
      SIGNATURES,
      LEGAL.names,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/No signature found/);
  });
});

describe("MuPDF's source links", () => {
  /** covers: AC-15, AC-17. Spelled once, for the notices and for VERSION alike. */
  it("name the complete archive and the tagged tree for a version", () => {
    expect(mupdfSourceLinks("1.28.1")).toEqual({
      archive: "https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz",
      tree: "https://github.com/ArtifexSoftware/mupdf/tree/1.28.1",
    });
  });

  /** covers: AC-15. Section 1 of the notices, for the installed version. */
  it("open section 1 of the notices, with the checksum beside the archive", () => {
    const notices = buildNotices(toPosix(process.cwd()), diskReader);
    const { archive, tree } = mupdfSourceLinks(INSTALLED);

    expect(notices).toContain(
      [
        `mupdf ${INSTALLED}`,
        "Licence: AGPL-3.0-or-later",
        "Copyright (C) 2004-2026 Artifex Software, Inc.",
        "",
        "The complete source of this version, as Artifex publish it:",
        archive,
        `SHA-256: ${LEGAL.sha256}`,
      ].join("\n"),
    );
    expect(notices).toContain(tree);
    expect(notices).toContain(
      "This software is based in part on the work of the Independent JPEG Group.",
    );
    expect(notices).toContain(
      "Portions of this software are copyright © 2026 The FreeType",
    );
    expect(notices).toContain("Name: Emscripten runtime");
    expect(notices).not.toMatch(/^mupdf \S+\nsha256 /m);
  });
});
