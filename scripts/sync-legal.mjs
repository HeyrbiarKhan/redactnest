/**
 * Write the licence and the third party notices into `public/`.
 *
 * Spec 0009, AC-12 and AC-13. RedactNest ships MuPDF to every visitor, so its
 * licence and the licences of everything it ships are served from our own
 * origin, at `/licence.txt` and `/third-party-notices.txt`. Both files are
 * generated rather than committed, so they describe exactly the tree that was
 * built and can never fall behind it (INV-5). Both are gitignored; this script
 * runs before `dev` and `build`, after `sync-engine.mjs`.
 *
 * It fails the run, `pnpm dev` included, when a package's licence is not on the
 * allowlist (AC-14). That is on purpose: an unknown licence needs a person.
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { diskReader, toPosix } from "./lib/disk-reader.mjs";
import { buildNotices, NoticesError } from "./lib/notices.mjs";

const root = process.cwd();
const outDir = join(root, "public");

/** Until slice 2 of spec 0009 lists what is compiled into the engine. */
const mupdfSection = (pkg) =>
  [
    `mupdf ${pkg.version}`,
    "Licence: AGPL-3.0-or-later",
    "Copyright (C) 2004-2026 Artifex Software, Inc.",
    "",
    "The licences of the libraries compiled into MuPDF are still to be listed here.",
  ].join("\n");

try {
  const notices = buildNotices(toPosix(root), diskReader, mupdfSection);

  await mkdir(outDir, { recursive: true });
  // Copied, never rewritten, so `/licence.txt` is `LICENSE` byte for byte (INV-7).
  await copyFile(join(root, "LICENSE"), join(outDir, "licence.txt"));
  await writeFile(join(outDir, "third-party-notices.txt"), notices, "utf8");

  console.log(
    "[sync-legal] LICENSE -> public/licence.txt, notices -> public/third-party-notices.txt",
  );
} catch (error) {
  if (!(error instanceof NoticesError)) throw error;
  console.error(`[sync-legal] ${error.message}`);
  process.exit(1);
}
