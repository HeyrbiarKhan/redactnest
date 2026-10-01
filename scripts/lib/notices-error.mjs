/**
 * An expected failure while writing the legal files: the build stops and says
 * why, with no stack trace. Its own module so `notices.mjs` and
 * `mupdf-source.mjs` can both throw it without importing each other.
 */
export class NoticesError extends Error {
  constructor(message) {
    super(message);
    this.name = "NoticesError";
  }
}
