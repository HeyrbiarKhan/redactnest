/**
 * Handing the finished file to the browser, and letting go of it immediately.
 *
 * Spec 0002, INV-7: the output buffer is released as soon as the download is
 * handed over, the object URL is revoked in the next macrotask, and neither is
 * retained. During redaction a tab already holds the source bytes, the parsed
 * document and the output at once, so the output is the one of the three we can
 * give back straight away.
 *
 * What this deliberately does not do is end the session. The document stays open
 * in the worker, which is what lets somebody change a tick and run again without
 * a second trip to the file picker (AC-14). The three release triggers are a new
 * file, starting over, and leaving the page. A successful download is not one of
 * them.
 */

/** The one media type this tool produces. */
const PDF_MEDIA_TYPE = "application/pdf";

/**
 * Offer `bytes` to the browser as a download named `fileName`.
 *
 * Takes ownership: the caller must drop its own reference afterwards, which is
 * what the `downloaded` action on the session is for.
 *
 * Returns once the click has been dispatched. Revoking happens in the next
 * macrotask rather than immediately, because a URL revoked in the same task as
 * the click can lose the race against the browser starting to read it.
 */
export function offerDownload(bytes: ArrayBuffer, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: PDF_MEDIA_TYPE }));
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  // Never rendered. Appending is what makes the click reliable in every browser.
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}
