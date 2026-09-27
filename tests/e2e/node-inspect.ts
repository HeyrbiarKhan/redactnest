import { execFileSync } from "node:child_process";

/** What Node's MuPDF finds in a file the page handed over. */
export interface Inspection {
  readonly pages: number;
  readonly versions: number;
  readonly trailer: string[];
  readonly catalog: string[];
  readonly keys: string[];
  readonly text: string;
  readonly bytes: string;
}

/**
 * Open the file at `path` with the real MuPDF in Node and describe what a
 * reader could still find in it. Shared by the browser specs that catch a
 * download, so none of them trusts the engine's own account of what it did.
 *
 * Run in a child process on purpose. MuPDF is an ES module with top level
 * await, and Playwright loads specs as CommonJS, which cannot import it.
 */
export function inspectInNode(path: string): Inspection {
  const script = [
    'import * as mupdf from "mupdf";',
    'import { readFileSync } from "node:fs";',
    "mupdf.setLog(() => {});",
    'const doc = mupdf.Document.openDocument(readFileSync(process.argv[1]), "application/pdf").asPDF();',
    "const keysOf = (dict) => { const keys = []; dict.forEach((_v, k) => keys.push(k)); return keys; };",
    "const keys = new Set();",
    "const walk = (obj) => {",
    "  if (obj.isIndirect()) return;",
    "  if (obj.isDictionary()) { keysOf(obj).forEach((k) => keys.add(k)); obj.forEach(walk); }",
    "  else if (obj.isArray()) obj.forEach(walk);",
    "};",
    "for (let n = 1; n < doc.countObjects(); n += 1) walk(doc.newIndirect(n).resolve());",
    'let text = "";',
    'for (let i = 0; i < doc.countPages(); i += 1) text += doc.loadPage(i).toStructuredText("").asText();',
    'const bytes = Buffer.from(doc.saveToBuffer("decompress").asUint8Array()).toString("latin1");',
    "process.stdout.write(JSON.stringify({",
    "  pages: doc.countPages(),",
    "  versions: doc.countVersions(),",
    "  trailer: keysOf(doc.getTrailer()),",
    '  catalog: keysOf(doc.getTrailer().get("Root")),',
    "  keys: [...keys],",
    "  text,",
    "  bytes,",
    "}));",
  ].join("\n");

  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script, path],
    { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(output.toString("utf8")) as Inspection;
}
