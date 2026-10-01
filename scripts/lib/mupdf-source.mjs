/**
 * MuPDF's source, and what is compiled into it. Spec 0009, AC-15 to AC-17.
 *
 * AGPL section 6(d) lets us offer MuPDF's corresponding source as a link,
 * provided the directions sit next to the object code. So the same links go
 * into `public/engine/VERSION`, beside the wasm, and into section 1 of the
 * third party notices, spelled once here.
 */

import { NoticesError } from "./notices-error.mjs";

/** Artifex's notice, as the engine's `VERSION` file has always carried it. */
export const MUPDF_COPYRIGHT = "Copyright (C) 2004-2026 Artifex Software, Inc.";

/**
 * The complete source archive Artifex publish for `version`, and the tagged
 * tree whose `platform/wasm` folder builds the npm package.
 */
export function mupdfSourceLinks(version) {
  return Object.freeze({
    archive: `https://mupdf.com/downloads/archive/mupdf-${version}-source.tar.gz`,
    tree: `https://github.com/ArtifexSoftware/mupdf/tree/${version}`,
  });
}

/**
 * `scripts/legal/mupdf.txt`: line 1 `mupdf <version>`, line 2 `sha256 <hex>`
 * (the archive's checksum), then a heading and one block per library, each
 * opening with a line of `=` and a `Name:` line.
 */
export function readMupdfLegal(text) {
  const [first = "", second = "", ...rest] = text.replace(/\r\n?/g, "\n").split("\n");
  const version = /^mupdf (\S+)$/.exec(first)?.[1];
  const sha256 = /^sha256 ([0-9a-f]{64})$/.exec(second)?.[1];
  if (version === undefined || sha256 === undefined) {
    throw new NoticesError(
      "scripts/legal/mupdf.txt must open with `mupdf <version>` and then `sha256 <hex>`.",
    );
  }

  const body = rest.join("\n").trim();
  const names = [...body.matchAll(/^Name: (.+)$/gm)].map((match) => match[1].trim());
  return Object.freeze({ version, sha256, body, names });
}

/**
 * INV-6: a MuPDF upgrade cannot build until `mupdf.txt` has been checked
 * against the new version, because the libraries inside the wasm can change.
 */
export function checkMupdfVersion(legal, installed) {
  if (legal.version !== installed) {
    throw new NoticesError(
      [
        `scripts/legal/mupdf.txt covers mupdf ${legal.version}, but mupdf ${installed} is installed.`,
        `Copy the licence texts again from mupdf-${installed}-source.tar.gz, check them`,
        "against tests/unit/mupdf-notices.test.ts, and update the first two lines (spec 0009, AC-16).",
      ].join("\n"),
    );
  }
}

/** Section 1 of the third party notices, for the installed version. */
export function mupdfSection(legal) {
  const { archive, tree } = mupdfSourceLinks(legal.version);
  return [
    `mupdf ${legal.version}`,
    "Licence: AGPL-3.0-or-later",
    MUPDF_COPYRIGHT,
    "",
    "The complete source of this version, as Artifex publish it:",
    archive,
    `SHA-256: ${legal.sha256}`,
    "",
    "The same version to browse, whose platform/wasm folder builds the package",
    `this site ships: ${tree}`,
    "",
    legal.body,
  ].join("\n");
}

/**
 * What the wasm holds, judged by the function names it still carries, against
 * what `mupdf.txt` covers. Spec 0009, AC-16.
 *
 * `table` is `[{ library, signature }]` and `covered` the `Name:` values in
 * `mupdf.txt`. Returns every problem found, empty when the two agree: a
 * library present but not covered, one covered but absent, or no signature at
 * all, which means the names were stripped and this check can no longer see.
 */
export function signatureProblems(wasm, table, covered) {
  const bytes = Buffer.isBuffer(wasm) ? wasm : Buffer.from(wasm);
  const found = table.map((row) => ({ ...row, present: bytes.includes(row.signature) }));

  if (!found.some((row) => row.present)) {
    return [
      "No signature found in the wasm. Its function names look stripped, so this check " +
        "cannot see what it holds; it needs a new way to look.",
    ];
  }

  const names = new Set(covered);
  return found.flatMap(({ library, signature, present }) => {
    if (present && !names.has(library)) {
      return [
        `${library} is in the wasm (${signature}) but mupdf.txt does not cover it.`,
      ];
    }
    if (!present && names.has(library)) {
      return [
        `mupdf.txt covers ${library}, but the wasm does not hold it (${signature}).`,
      ];
    }
    return [];
  });
}
