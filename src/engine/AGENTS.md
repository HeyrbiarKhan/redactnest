# src/engine

The redaction engine: MuPDF compiled to WebAssembly, behind the engine wall. It refuses what is not a PDF, opens and prepares the review copy, and redacts a fresh working copy of the original into a rebuilt file that it checks before anything leaves. The decision is [spec 0004](../../docs/specs/0004-redaction-engine/index.md), with the measurements behind it in [rationale.md](../../docs/specs/0004-redaction-engine/rationale.md). The wall itself is [spec 0001](../../docs/specs/0001-browser-only-redaction-stack/index.md).

## Files

- One file per step, mapped in the header of `index.ts`. `index.ts` is the only entry: callers import from `@/engine`, never from a file inside it.
- Only `src/worker/engine.worker.ts` imports this folder, and only this folder names `mupdf`. The `redactnest/engine-wall` lint zones enforce both. `tests/` sits outside the wall on purpose, because a test of the walled module has to import it.
- `objects.ts` holds the small readers over MuPDF's object model that the inventory, the rebuild and the self check share, so all three agree on what "an object carries a key" means.

## Conventions

- A run never touches the review copy or `EngineSession.bytes`. `redactDocument` takes the clean bytes, never the review handle, and opens a working copy of its own that it destroys before returning. INV-1.
- The pipeline order in `redact.ts` is fixed: inventory, prepare, validate targets, slant, images, record every page, the three passes page by page, rebuild, write, self check. Each step's comment says why it sits where it does, so do not reorder them. Spec 0004, *State transitions*.
- Anything that changes what a page shows goes into `prepareDocument` in `prepare.ts`, which runs on the review copy at open and on every working copy. Never apply such a change to one copy alone, or detection and redaction read different pages. INV-9, AC-22.
- Text is removed only on the removal band, a thin strip through the middle of each quad (the four cornered area that outlines a match). Never on a line box, a padded area or a raw quad, because MuPDF takes out every glyph whose full height box touches the area. The black box is drawn last, on the line box. INV-11.
- The three passes in `passes.ts` write out all four `applyRedactions` arguments, defaults included, so a MuPDF upgrade cannot quietly change what is removed. After each pass the page must hold no `Redact` annotation, or the run fails. INV-5.
- A slanted target is refused with `slanted-text`, and an image that would be blanked too far with `redaction-overreach`, before anything is removed. Never cut an area into pieces to get round this: MuPDF judges covered line art one area at a time, so a mark that straddles a join would survive. AC-28, AC-29, INV-15.
- The engine never edits a content stream itself. What MuPDF cannot remove is refused, never patched, because a hand written edit would be a second PDF parser. INV-13.
- The output is rebuilt from allowlists, never cleaned by subtracting known keys: `PAGE_KEYS`, `CATALOG_KEYS`, `CARRIER_KEYS` and `WRITE_OPTIONS` in `rebuild.ts`. The write is never `incremental`, `encrypt` or `linearize`. Changing a list is a reviewed change with a failing fixture as its proof. INV-3.
- Every MuPDF object (document, page, structured text, buffer) is destroyed in a `finally` on every path out, because garbage collection never reclaims MuPDF's native memory. The destroy order in `redact.ts` holds a run's peak at about four copies of the document.
- A failure is an `EngineFailure` carrying one kind and nothing else. A throw while a pass runs is `unsupported`. A throw while checking the output is `redaction-incomplete`, because a check that cannot finish vouches for nothing. `RunCancelled` is not a failure, and the worker never posts it.
- The engine only yields and asks. At each checkpoint a run yields a macrotask (`setTimeout` with 0, so a waiting `cancel` message is delivered first), then reads `isCancelled`. The worker owns the run queue, the cancelled set and replacement. AC-17, AC-18, AC-23.
- `PDF_HEADER_WINDOW`, the geometry values in `geometry.ts` and the self check's values in `characters.ts` are engine constants, never config. They are rules about the file format and about geometry, not caps on the visitor, and an environment variable would let a typo switch a check off. They are the deliberate exception to "every cap comes from `src/config`", and each comment says so.
- Two extraction settings, never mixed. `EXTRACTION_OPTIONS` (MuPDF's defaults, which clip to the page) serves detection and target validation. `CHECK_EXTRACTION_OPTIONS` (the same plus `clip=no`) serves the character record and the self check. Never add `dehyphenate`, `collect-styles`, `segment`, `clip` or `accurate-bboxes` to the first: each changes which characters exist or where they sit.
- The character record holds document text (code points and positions) for the length of a run. It is never logged, never crosses the boundary, and is dropped when the run returns or fails.

## The self check

- `self-check.ts` reopens the written output from the exact bytes that will cross, and nothing is returned unless all three parts pass. Structure: only allowlisted keys, no carrier keys, no `/JS`, one revision, the source's page count. Characters: every page equals the source's characters less the ticked ones, in both extraction modes, with none centred under a box. Pixels: every image under a target is blank there. INV-2, AC-13.
- Compare, never sample. Every page is recorded before any page is redacted, and pages with no target are compared too, so damage to a shared resource, or text the write drops, is caught.
- The kind follows AC-25's order, a leak first: `redaction-incomplete`, then `replacement-text`, then `redaction-overreach`. On a run with nothing ticked, any difference is `unsupported`.

## MuPDF quirks

Measured on MuPDF 1.28.1. The ones the design rests on are pinned by a test, so an upgrade that changes them fails a test rather than quietly widening what a pass can reach.

- MuPDF picks its handler by sniffing content, so it opens a PNG as a one page document even when told `application/pdf`. `door.ts` looks for `%PDF-` in the first 1024 bytes before the engine loads, and never reads the file name or declared type. AC-1, INV-4.
- It acts on each redaction area's upright bounds, not the area itself. Covered line art is judged over the bounds, and pixels are blanked over the bounds in each image's own pixel grid, whole pixels at a time. That is why the slant and image reach checks exist. Pinned by `bounds-pin.pdf` in `tests/unit/redaction-matrix.test.ts`.
- Default extraction clips to the page. The content filter, which the text pass and the `sanitize` write both run, rewrites a text object positioned with `Td` that later shows a line with `'` or `"`, so those lines jump, often off the page, and a match on them is kept rather than removed. That is why the check reads with `clip=no`. Pinned by `next-line-0.pdf` to `next-line-4.pdf`.
- A size change (`Tf`) or horizontal scaling change (`Tz`) inside one text object, between removed glyphs and the next kept one, moves the text after them. A combining mark drawn at zero width on a match's last letter survives the band. The self check refuses both with `redaction-incomplete`. They are honest limits, not bugs to patch (`reach.pdf`, `combining.pdf`).
- The log is silenced with a callback that discards every line (`silenceEngineLog` in `load.ts`), installed as the engine loads, never with `setLog(null)`. `null` means no callback, and what MuPDF does then is its own choice. AC-24.
- `page.getAnnotations()` answers from a list MuPDF.js keeps on its side, which a redaction does not refresh. Read `/Annots` from the page object instead, as `passes.ts` does.
- `asUint8Array()` on a MuPDF buffer is a view into the WebAssembly heap. Copy it with `slice()` before the buffer is destroyed, as `takeOutput` in `redact.ts` does.
- A missing key comes back as one shared `Null` object, and calling `get` on it throws. Look keys up through `hasKey` and the other readers in `objects.ts`.
- `graftPage` is not relied on to carry a page's `/Group`, so `rebuild.ts` grafts it across explicitly.

## Tests

- The seam: each function ending in `With` (`openDocumentWith`, `redactDocumentWith`) takes the loaded MuPDF module, so Vitest runs the real engine in Node. The worker calls the plain versions, which load it themselves. Never add a setter on `loadEngine` instead, because the walled module holds no mutable hook.
- `Pipeline` in `redact.ts` is a frozen parameter whose default is `PIPELINE`. A test swaps the text pass, the padded pass, the removal area or the carrier sweep to prove each part of the self check fires (`tests/unit/redaction-check.test.ts`). The worker only ever runs the default.
- `tests/support/mupdf.ts` inspects an output with its own code, written apart from `src/engine`, so a test never just proves the engine agrees with itself. Check outputs with it, never with the engine's own readers.
- `tests/support/targets.ts` (`findTargets`) stands in for feature 6. It prepares the fixture as the review copy is prepared, searches with `EXTRACTION_OPTIONS`, and sets `text` to the needle.
- `tests/support/bytes.ts` loads a committed fixture without importing MuPDF, for tests of what happens before the engine loads.
- Where the rest live: `tests/unit/redaction*.test.ts` (removal, the fixture matrix, the self check, geometry, the inventory), `engine.test.ts` (the size cap, the header window, loading), `engine-log.test.ts` (silence) and `engine-worker.test.ts` (queue, cancel, replacement). In a real browser: `tests/e2e/engine.spec.ts`, `cancel.spec.ts` and the redaction leg of `privacy.spec.ts`.

## Fixtures

- `tests/fixtures/*.pdf` are written by `node scripts/make-fixture.mjs`, object by object, with `scripts/lib/`: `pdf-writer.mjs` serialises, `redaction-fixtures.mjs` holds the matrix, `pdf-encrypt.mjs` encrypts the `rc4`, `aes-128` and `aes-256` owner password files with `node:crypto`, and `truetype.mjs` reads Carlito's metrics. None is made by MuPDF, so an engine bug cannot write a fixture that hides itself.
- Change the script, never a PDF by hand. Run it and commit what changes. With no script change, a run leaves `git status tests/fixtures` clean.
- Fonts: MuPDF's built in Helvetica (a 1.37 em quad) and Courier (1.25 em), and Carlito embedded (1.0 em, metric compatible with Calibri) from `scripts/fonts/`, with its SIL Open Font License beside it. Microsoft's fonts cannot ship in this public AGPL repository.
- Write each needle in the same case as the page, because the target helper searches for it.
- Never commit a real document, not even for a corpus measurement: the repository is public.
- The heavy 50 page document the browser cancel test needs is built inside `tests/e2e/cancel.spec.ts`, not committed.

_Drafted by /sync from the introducing change, worth a quick human pass._
