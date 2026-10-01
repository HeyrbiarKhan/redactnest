import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import { diskReader, toPosix } from "../../scripts/lib/disk-reader.mjs";
import {
  buildNotices,
  checkLicences,
  declaredLicence,
  formatPackage,
  judgeLicence,
  NoticesError,
  readSpdxIds,
  walkClosure,
} from "../../scripts/lib/notices.mjs";
import { manifest, memoryReader } from "../support/memory-reader";

/**
 * The third party notices. Spec 0009, AC-13 and AC-14.
 *
 * The walk and the licence rules run over trees built in memory, so each case
 * shows exactly the layout it is about. Determinism runs over the real
 * installed tree, because that is the tree the notices describe.
 */

const SPDX_IDS = readSpdxIds(readFileSync("scripts/legal/spdx-licence-ids.txt", "utf8"));

describe("the closure walk", () => {
  /** covers: AC-13 */
  it("follows dependencies and installed optional ones, never peers", () => {
    const reader = memoryReader({
      "/repo/package.json": manifest({ dependencies: { app: "1" } }),
      "/repo/node_modules/app/package.json": manifest({
        name: "app",
        version: "1.0.0",
        dependencies: { dep: "1" },
        optionalDependencies: { here: "1", absent: "1" },
        peerDependencies: { peer: "1" },
      }),
      "/repo/node_modules/dep/package.json": manifest({ name: "dep", version: "2.0.0" }),
      "/repo/node_modules/here/package.json": manifest({
        name: "here",
        version: "3.0.0",
      }),
      "/repo/node_modules/peer/package.json": manifest({
        name: "peer",
        version: "4.0.0",
      }),
    });

    const names = walkClosure("/repo", reader).map((pkg) => `${pkg.name}@${pkg.version}`);

    expect(names).toEqual(["app@1.0.0", "dep@2.0.0", "here@3.0.0"]);
  });

  /** covers: AC-13. pnpm's layout: a package's own dependencies sit beside it. */
  it("finds each package from its parent's real folder, the way Node does", () => {
    const store = "/repo/node_modules/.pnpm";
    const reader = memoryReader(
      {
        "/repo/package.json": manifest({ dependencies: { app: "1", other: "1" } }),
        [`${store}/app@1.0.0/node_modules/app/package.json`]: manifest({
          name: "app",
          version: "1.0.0",
          dependencies: { shared: "1" },
        }),
        [`${store}/other@1.0.0/node_modules/other/package.json`]: manifest({
          name: "other",
          version: "1.0.0",
          dependencies: { shared: "2" },
        }),
        [`${store}/shared@1.0.0/node_modules/shared/package.json`]: manifest({
          name: "shared",
          version: "1.0.0",
        }),
        [`${store}/shared@2.0.0/node_modules/shared/package.json`]: manifest({
          name: "shared",
          version: "2.0.0",
        }),
      },
      {
        "/repo/node_modules/app": `${store}/app@1.0.0/node_modules/app`,
        "/repo/node_modules/other": `${store}/other@1.0.0/node_modules/other`,
        [`${store}/app@1.0.0/node_modules/shared`]: `${store}/shared@1.0.0/node_modules/shared`,
        [`${store}/other@1.0.0/node_modules/shared`]: `${store}/shared@2.0.0/node_modules/shared`,
      },
    );

    const names = walkClosure("/repo", reader).map((pkg) => `${pkg.name}@${pkg.version}`);

    expect(names).toEqual(["app@1.0.0", "other@1.0.0", "shared@1.0.0", "shared@2.0.0"]);
  });

  /** covers: AC-13 */
  it("lists a package once however many times the tree needs it", () => {
    const reader = memoryReader({
      "/repo/package.json": manifest({ dependencies: { a: "1", b: "1" } }),
      "/repo/node_modules/a/package.json": manifest({
        name: "a",
        version: "1.0.0",
        dependencies: { c: "1" },
      }),
      "/repo/node_modules/b/package.json": manifest({
        name: "b",
        version: "1.0.0",
        dependencies: { c: "1" },
      }),
      "/repo/node_modules/a/node_modules/c/package.json": manifest({
        name: "c",
        version: "1.0.0",
      }),
      "/repo/node_modules/b/node_modules/c/package.json": manifest({
        name: "c",
        version: "1.0.0",
      }),
    });

    const names = walkClosure("/repo", reader).map((pkg) => `${pkg.name}@${pkg.version}`);

    expect(names).toEqual(["a@1.0.0", "b@1.0.0", "c@1.0.0"]);
  });

  /**
   * covers: AC-13. mupdf exports only its entry point, so
   * `require.resolve("mupdf/package.json")` throws. The walk never asks.
   */
  it("still finds a package whose exports hide its package.json", () => {
    const reader = memoryReader({
      "/repo/package.json": manifest({ dependencies: { engine: "1" } }),
      "/repo/node_modules/engine/package.json": manifest({
        name: "engine",
        version: "1.28.1",
        exports: { ".": "./dist/engine.js" },
      }),
    });

    expect(walkClosure("/repo", reader).map((pkg) => pkg.name)).toEqual(["engine"]);
  });

  it("fails when a dependency is not installed, since the notices would be short", () => {
    const reader = memoryReader({
      "/repo/package.json": manifest({ dependencies: { gone: "1" } }),
    });

    expect(() => walkClosure("/repo", reader)).toThrow(
      /gone is a dependency of package\.json/,
    );
  });
});

describe("the licence rules", () => {
  /** covers: AC-14 */
  it.each([
    ["GPL-2.0-only", /allowlist does not satisfy/],
    ["UNLICENSED", /UNLICENSED/],
    ["SEE LICENSE IN LICENSE.txt", /custom file/],
    ["MIT WITH Some-exception", /exception/],
    ["LGPL-3.0+", /"\+" suffix/],
    ["LicenseRef-Custom", /not a public licence/],
    ["BSD", /not on the SPDX list/],
    ["Apache 2.0", /not a licence expression/],
    ["(MIT OR ISC) WITH Some-exception", /exception/],
    ["MIT OR LicenseRef-Custom", /not a public licence/],
    ["MIT AND", /not a licence expression/],
    ["(MIT", /not a licence expression/],
  ])("refuses %s", (declared, reason) => {
    const verdict = judgeLicence(declared, SPDX_IDS);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(reason);
  });

  /** covers: AC-14 */
  it("refuses a package that declares no licence", () => {
    expect(judgeLicence(undefined, SPDX_IDS)).toEqual({
      allowed: false,
      reason: "it declares no licence",
    });
  });

  /** covers: AC-14 */
  it.each([
    "(MIT OR GPL-3.0-only)",
    "mit or apache-2.0",
    "Apache-2.0 AND LGPL-3.0-or-later",
    "MIT AND GPL-2.0-only OR ISC",
    "AGPL-3.0-or-later",
    "CC-BY-4.0",
  ])("allows %s", (declared) => {
    expect(judgeLicence(declared, SPDX_IDS)).toEqual({ allowed: true });
  });

  /** AND binds tighter than OR, so grouping the other way changes the answer. */
  it("lets parentheses group against the precedence", () => {
    expect(judgeLicence("MIT AND (GPL-2.0-only OR ISC)", SPDX_IDS).allowed).toBe(true);
    expect(judgeLicence("(MIT OR ISC) AND GPL-2.0-only", SPDX_IDS).allowed).toBe(false);
  });

  /** covers: AC-14 */
  it("reads the legacy object and array forms", () => {
    expect(declaredLicence({ license: { type: "MIT", url: "x" } })).toBe("MIT");
    expect(declaredLicence({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe(
      "(MIT) OR (Apache-2.0)",
    );
    expect(declaredLicence({ licenses: ["ISC"] })).toBe("ISC");
    expect(declaredLicence({ license: "  " })).toBeUndefined();
    expect(declaredLicence({})).toBeUndefined();

    expect(judgeLicence(declaredLicence({ license: { type: "MIT" } }), SPDX_IDS)).toEqual(
      {
        allowed: true,
      },
    );
    expect(
      judgeLicence(
        declaredLicence({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }),
        SPDX_IDS,
      ),
    ).toEqual({ allowed: true });
  });

  /** covers: AC-14. The failure names the package, its version and its licence. */
  it("names every refused package at once", () => {
    const pkg = (name: string, license?: string) => ({
      name,
      version: "1.2.3",
      dir: `/x/${name}`,
      manifest: license === undefined ? {} : { license },
    });

    const check = () =>
      checkLicences(
        [pkg("fine", "MIT"), pkg("copyleft", "GPL-2.0-only"), pkg("bare")],
        SPDX_IDS,
      );

    expect(check).toThrow(NoticesError);
    expect(check).toThrow(/copyleft 1\.2\.3 \(GPL-2\.0-only\)/);
    expect(check).toThrow(/bare 1\.2\.3 \(no licence\)/);
    expect(check).not.toThrow(/fine/);
  });
});

describe("each package's entry", () => {
  /** covers: AC-13 */
  it("carries the licence and NOTICE files a package ships", () => {
    const reader = memoryReader({
      "/p/LICENSE": "The licence\r\n",
      "/p/NOTICE.md": "Attribution\n\n",
      "/p/README.md": "Not a licence",
    });
    const entry = formatPackage(
      { name: "p", version: "1.0.0", dir: "/p", manifest: { license: "Apache-2.0" } },
      reader,
    );

    expect(entry).toBe(
      [
        "p 1.0.0",
        "Licence: Apache-2.0",
        "",
        "File: LICENSE",
        "",
        "The licence",
        "",
        "File: NOTICE.md",
        "",
        "Attribution",
      ].join("\n"),
    );
  });

  /** covers: AC-13. A declared licence with no file is listed, not a failure. */
  it("lists a package that ships no licence file, with its author and repository", () => {
    const entry = formatPackage(
      {
        name: "bare",
        version: "1.0.0",
        dir: "/bare",
        manifest: {
          license: "MIT",
          author: { name: "Someone", email: "a@b.c" },
          repository: { type: "git", url: "https://example.com/bare" },
        },
      },
      memoryReader({ "/bare/package.json": "{}" }),
    );

    expect(entry).toBe(
      [
        "bare 1.0.0",
        "Licence: MIT",
        "Author: Someone <a@b.c>",
        "Repository: https://example.com/bare",
        "This package ships no licence file.",
      ].join("\n"),
    );
  });
});

describe("the notices for the installed tree", () => {
  const root = toPosix(process.cwd());

  /** covers: AC-13, INV-5. No date, no commit, no order from the walk. */
  it("are the same bytes every time", () => {
    const first = buildNotices(root, diskReader);
    const second = buildNotices(root, diskReader);

    expect(second).toBe(first);
  });

  /** covers: AC-13. The sections, in order, and the entries the spec names. */
  it("hold the five sections in order", () => {
    const notices = buildNotices(root, diskReader);
    const headings = [...notices.matchAll(/^# (\d)\. /gm)].map((match) => match[1]);

    expect(headings).toEqual(["1", "2", "3", "4", "5"]);
    expect(notices).toMatch(
      /^libphonenumber-js \d+\.\d+\.\d+\nLicence: MIT for the package/m,
    );
    expect(notices).toContain("Copyright (C) 2009 The Libphonenumber Authors");
    expect(notices).toMatch(/^Inter\nLicence: OFL-1\.1$/m);
    expect(notices).toMatch(/^Carlito\nLicence: OFL-1\.1$/m);
    expect(notices).toMatch(/^libphonenumber-js \d+\.\d+\.\d+\nLicence: MIT\n/m);
    expect(notices).toContain("next/dist/compiled/");
  });

  /** The version in section 2 is read from the install, never written down. */
  it("name libphonenumber-js at its installed version", () => {
    const installed = JSON.parse(
      readFileSync(
        posix.join("node_modules", "libphonenumber-js", "package.json"),
        "utf8",
      ),
    ).version;

    expect(buildNotices(root, diskReader)).toContain(
      `libphonenumber-js ${installed}\nLicence: MIT for the package`,
    );
  });
});
