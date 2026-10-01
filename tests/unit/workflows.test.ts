import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Who may write to the repository. Spec 0009, AC-8 and INV-3.
 *
 * Read as text, with no YAML library, because the rules are about lines a
 * reviewer can see: one workflow holds the write, it runs no third party code,
 * and no event value is pasted into a script where it could run as shell.
 */

const DIR = ".github/workflows";

const WORKFLOWS = readdirSync(DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, text: readFileSync(join(DIR, file), "utf8") }));

const workflow = (file: string) => {
  const found = WORKFLOWS.find((candidate) => candidate.file === file);
  if (!found) throw new Error(`${DIR}/${file} is missing`);
  return found.text;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * Every line that is shell: an inline `run: …`, and each line of a `run: |`
 * block, which runs on until a line no deeper than the `run:` key.
 */
function runLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const found: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(- )?run:\s*(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;

    const keyIndent = (match[1] ?? "").length + (match[2] ? 2 : 0);
    const rest = (match[3] ?? "").trim();
    if (!/^[|>][+-]?$/.test(rest)) {
      found.push(rest);
      continue;
    }

    while (index + 1 < lines.length) {
      const next = lines[index + 1] ?? "";
      if (next.trim() !== "" && indentOf(next) <= keyIndent) break;
      found.push(next);
      index += 1;
    }
  }
  return found;
}

describe("the workflows' write access", () => {
  /** covers: AC-8 */
  it("gives tag-deploy.yml nothing by default", () => {
    expect(workflow("tag-deploy.yml")).toMatch(/^permissions: \{\}$/m);
  });

  /** covers: AC-8, INV-3. One write, in one place. */
  it("grants contents: write exactly once, in tag-deploy.yml", () => {
    const grants = WORKFLOWS.flatMap(({ file, text }) =>
      [...text.matchAll(/^\s*contents:\s*write\s*$/gm)].map(() => file),
    );
    expect(grants).toEqual(["tag-deploy.yml"]);
  });

  /** covers: AC-8. Its one job asks for contents and nothing else. */
  it("lets tag-deploy.yml's job ask for nothing beyond contents", () => {
    const text = workflow("tag-deploy.yml");
    const scopes = [...text.matchAll(/^ {6}([a-z-]+):\s*(read|write|none)\s*$/gm)].map(
      (match) => `${match[1]}: ${match[2]}`,
    );
    expect(scopes).toEqual(["contents: write"]);

    // One job: a single key two spaces in, under `jobs:`.
    const jobs = text.slice(text.search(/^jobs:$/m));
    expect(jobs.match(/^ {2}\S/gm)).toHaveLength(1);
  });

  /** covers: AC-8. No checkout and no third party action runs beside the token. */
  it("uses no action in tag-deploy.yml", () => {
    expect(workflow("tag-deploy.yml")).not.toMatch(/^\s*(- )?uses:/m);
  });

  /** covers: AC-8. Event values arrive through env, never pasted into shell. */
  it("puts no expression inside any run block", () => {
    for (const { file, text } of WORKFLOWS) {
      const pasted = runLines(text).filter((line) => line.includes("${{"));
      expect(pasted, file).toEqual([]);
    }
  });

  /** covers: AC-8 */
  it("keeps ci.yml read only", () => {
    expect(workflow("ci.yml")).toMatch(/^permissions:\n\s+contents: read$/m);
  });
});

describe("finding the run blocks", () => {
  const SAMPLE = [
    "jobs:",
    "  a:",
    "    steps:",
    "      - run: echo inline",
    "      - name: block",
    "        env:",
    "          X: ${{ github.sha }}",
    "        run: |",
    '          echo "$X"',
    "",
    "            indented further",
    "      - run: >-",
    "          folded",
    "  b:",
    "    runs-on: ubuntu-latest",
  ].join("\n");

  it("takes inline runs and whole blocks, and stops where the block ends", () => {
    expect(runLines(SAMPLE)).toEqual([
      "echo inline",
      '          echo "$X"',
      "",
      "            indented further",
      "          folded",
    ]);
  });

  it("would catch an expression pasted into a block", () => {
    const pasted = SAMPLE.replace('echo "$X"', 'echo "${{ github.event.x }}"');
    expect(runLines(pasted).some((line) => line.includes("${{"))).toBe(true);
  });

  it("leaves an expression in env alone", () => {
    expect(runLines(SAMPLE).some((line) => line.includes("${{"))).toBe(false);
  });
});
