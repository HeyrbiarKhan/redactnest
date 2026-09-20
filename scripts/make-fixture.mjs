/**
 * Build the fixture PDF the browser tests open.
 *
 * Generated rather than committed so the bytes are reviewable as code, and so
 * nobody has to trust an opaque binary in the repository of a privacy tool.
 *
 * Two pages on purpose:
 *   page 1 carries a text layer,
 *   page 2 has no content stream at all, standing in for a scanned page.
 *
 * That lets one fixture exercise the page count and the per page text layer flag
 * feature 7 will build on.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const encoder = new TextEncoder();

const pageOneContent = `BT /F1 18 Tf 72 700 Td (RedactNest fixture page one) Tj ET
BT /F1 12 Tf 72 660 Td (Contact: contact@example.com) Tj ET
`;

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    "/Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
  // No /Contents, so this page has nothing to extract text from.
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${encoder.encode(pageOneContent).length} >>\nstream\n${pageOneContent}endstream`,
];

let pdf = "%PDF-1.7\n";
const offsets = [];

objects.forEach((body, index) => {
  offsets.push(encoder.encode(pdf).length);
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefOffset = encoder.encode(pdf).length;

pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

const outDir = join(process.cwd(), "tests", "fixtures");
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "two-pages.pdf"), encoder.encode(pdf));

console.log("[make-fixture] tests/fixtures/two-pages.pdf (2 pages, 1 with text)");
