/**
 * The real file system, in the shape `scripts/lib/notices.mjs` reads through.
 *
 * Every path it returns is POSIX, so the notices are built the same way on
 * Windows and Linux. Node's file functions accept forward slashes on both.
 */

import { readdirSync, readFileSync, realpathSync } from "node:fs";

/** `D:\a\b` to `D:/a/b`. A POSIX path is returned unchanged. */
export const toPosix = (path) => path.replaceAll("\\", "/");

const MISSING = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

const orElse = (read, fallback) => {
  try {
    return read();
  } catch (error) {
    if (MISSING.has(error?.code)) return fallback;
    throw error;
  }
};

export const diskReader = Object.freeze({
  readText: (path) => orElse(() => readFileSync(path, "utf8"), undefined),
  listFiles: (dir) =>
    orElse(
      () =>
        readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name),
      [],
    ),
  listDirs: (dir) =>
    orElse(
      () =>
        readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
      [],
    ),
  realPath: (path) => toPosix(realpathSync(path)),
});
