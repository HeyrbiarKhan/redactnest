import { EngineFailure } from "./failure";

/**
 * How far into a file the `%PDF-` marker may sit. Spec 0004, AC-1.
 *
 * The whole five byte marker has to lie inside this window, so it may start at
 * offset 1019 or earlier. Real readers tolerate a little junk ahead of the
 * marker (a mail gateway's header, a MacBinary prefix), and this matches them.
 *
 * A named engine constant, deliberately not a config value. It is a rule about
 * the file format rather than a cap on the visitor, and an environment variable
 * would let a typo set it to 0 and switch the check off. It is a deliberate
 * exception to "every size limit comes from `src/config`", with the target
 * geometry constants in `geometry.ts` and the self check's in `characters.ts`.
 */
export const PDF_HEADER_WINDOW = 1024;

/** `%PDF-`, as bytes. */
const PDF_MARKER: readonly number[] = Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d]);

/**
 * Does the whole `%PDF-` marker lie within the first `PDF_HEADER_WINDOW` bytes?
 *
 * Spec 0004, INV-4: this reads bytes and nothing else. The file name and the
 * type the browser declared are never consulted anywhere in the engine, because
 * both are whatever the visitor's system says they are. MuPDF picks its handler
 * by sniffing content, so without this a PNG named `scan.pdf` opens as a one page
 * document and would come out the other end as a `-redacted.pdf`.
 */
export function hasPdfHeader(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, PDF_HEADER_WINDOW));
  const lastStart = head.length - PDF_MARKER.length;

  for (let start = 0; start <= lastStart; start += 1) {
    if (PDF_MARKER.every((byte, offset) => head[start + offset] === byte)) return true;
  }
  return false;
}

/**
 * The refusals that need no engine: the size cap, then the header.
 *
 * Both run before `loadEngine`, so a file that is too big or is not a PDF never
 * costs anybody the multi megabyte engine download.
 */
export function refuseAtTheDoor(bytes: ArrayBuffer, limits: { maxBytes: number }): void {
  if (bytes.byteLength > limits.maxBytes) {
    throw new EngineFailure("too-large");
  }
  if (!hasPdfHeader(bytes)) {
    throw new EngineFailure("not-pdf");
  }
}
