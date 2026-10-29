import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The committed fixtures are what `scripts/make-fixture.mjs` writes today
 * (feature 27, from the fourth review of feature 12, which checked it by
 * hand). Every engine test opens these files, so one that has drifted from
 * its script tests something no reviewer can read as code.
 *
 * The script runs as a person runs it, in a child process, but from an empty
 * folder of its own, since it writes under the folder it runs in: it never
 * touches `tests/fixtures`. The comparison is byte for byte, because the
 * script writes the same bytes on every run on purpose (fixed dates, IDs, and
 * keys, salts and IVs from fixed seeds in `pdf-encrypt.mjs`). So a difference
 * is a change to a fixture's code nobody regenerated, or a file edited by
 * hand. Run `node scripts/make-fixture.mjs` and commit what changes.
 */

const COMMITTED = join("tests", "fixtures");
const SCRIPT = join(process.cwd(), "scripts", "make-fixture.mjs");

/** Run the script from an empty folder and read back every file it wrote. */
function written(): ReadonlyMap<string, Buffer> {
  const root = mkdtempSync(join(tmpdir(), "redactnest-fixtures-"));
  try {
    execFileSync(process.execPath, [SCRIPT], { cwd: root });
    const out = join(root, COMMITTED);
    return new Map(readdirSync(out).map((name) => [name, readFileSync(join(out, name))]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const WRITTEN = written();
const NAMES = readdirSync(COMMITTED).sort();

describe("the committed fixtures (make-fixture.mjs)", () => {
  it("commits every fixture the script writes, and no other file", () => {
    expect([...WRITTEN.keys()].sort()).toEqual(NAMES);
  });

  it.each(NAMES)("commits %s exactly as the script writes it", (name) => {
    const fresh = WRITTEN.get(name);
    const same = fresh !== undefined && fresh.equals(readFileSync(join(COMMITTED, name)));
    expect(same, `tests/fixtures/${name} differs from what the script writes`).toBe(true);
  });
});
