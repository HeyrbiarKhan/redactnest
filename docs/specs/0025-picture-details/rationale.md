# 0025. Strip the details stored inside a kept picture: rationale

The decision record behind [index.md](index.md). `/develop` reads `index.md`, not this file.

## Context

Since spec 0006 a picture under no removed item leaves with the bytes the source stored (its AC-29): the trim and the write never decode a picture, because decoding and writing again took a cropped 50 page scan past 800 MB and grew the file about five times. Spec 0019 rebuilt everything below the pages from typed allowlists, but a picture's stream data is not a key: it is the picture. So a JPEG's own EXIF (camera make, settings, often a GPS location), XMP, IPTC captions, comments, JFIF and EXIF thumbnails (small copies of the original, possibly before it was cropped) and any picture appended after the end marker ride along into the cleaned copy. JPEG 2000 carries the same in boxes (`xml `, `uuid`, `jp2i`) and codestream comments.

Feature 32 was split out of feature 31 on 2026-11-15 because this is stream data rather than a pointer from a kept object, never holds a ticked value, and needs its own proof. The security page says today that such details "can stay", and the home page's Strips card leaves XMP metadata off for the same reason (spec 0019, AC-12).

The forces:
- **No decoding** (spec 0006, INV-6, AC-29): cost, peak heap and file size rule out writing a picture again.
- **Pixels unchanged**: cleaning must never alter what a picture shows.
- **One PDF parser** (spec 0001): MuPDF reads PDF syntax; any other reader of document bytes is a named exception, kept small and read only in spirit.
- **Allowlists over subtraction** (spec 0004, INV-3; spec 0019): a carrier nobody listed must be dropped by default.
- **Claims follow gates** (spec 0018, AC-5): a page may state an absolute only behind a gate every file passes.
- **Fixtures from code** (the engine's fixture rules, and your instruction for this feature): no real photo in a public repository, nothing made by MuPDF, and no PDF or picture read from your machine.

## Options considered

### Option 1: An allowlist reader of the container

Read each DCT and JPX picture's marker segments or boxes in our own small module, keep only the parts a decoder needs, cut the rest as whole byte ranges, and write the stream back through MuPDF.js's `writeRawStream`. The self check runs the same reader on the written bytes.

**Pros**:
- Pixels and compression are untouched: the compressed data is copied, never decoded.
- Drops unknown carriers by default, as the rest of the rebuild does.
- Cheap: a linear scan of bytes, and a picture with nothing to drop is never written.

**Cons**:
- A second reader of a file format beside MuPDF, which spec 0001 must name as an exception.
- Cases it cannot read safely (chains, inline pictures, broken containers) stay as stored.

### Option 2: Let MuPDF write every picture again

Decode each picture and encode it again (MuPDF's image rewriting or a recompress on write), which drops everything but the pixels.

**Pros**:
- No reader of our own; MuPDF decides everything.
- Covers chained filters and broken containers MuPDF can still decode.

**Cons**:
- Changes pixels (lossy JPEG encoded twice) or grows files (lossless), and brings back the cost and heap spec 0006 measured past 800 MB.
- Breaks spec 0006's AC-29 for every picture, not just those holding details.

### Option 3: A denylist of known carriers

Cut only `APP1`, `APP13`, comments and bytes after the end marker; keep every other segment and box.

**Pros**:
- Smallest change to the bytes; no risk of dropping a segment some decoder wants.

**Cons**:
- An unlisted segment rides along: a maker's own `APPn`, `APP2`'s multi picture data (a second full picture), a JFIF or JFXX thumbnail.
- The opposite of how every other part of the rebuild works.

### Option 4: A third party metadata library

Ship a JavaScript library that removes EXIF (and perhaps XMP) from JPEGs.

**Pros**:
- Less code of our own for the commonest case.

**Cons**:
- The common ones cover EXIF in JPEG only: no IPTC, comments, thumbnails, appended data or JPEG 2000.
- A new shipped dependency in the worker's chunk, with its licence in the notices, for a denylist we would still have to extend.

## Rationale

Option 1 is the only one that meets the scope's two conditions together: the details go and the pixels stay. Option 2 fails both the no decoding force and the pixel force, at the scale spec 0006 already measured. Option 3 and Option 4 are denylists, which the rebuild rejected everywhere else for a reason that applies here with force: `APP2` multi picture data and JFIF thumbnails are exactly the carriers nobody thinks to list, and they hold pictures, not just text.

The reader is narrow on purpose. It reads lengths and markers, cuts whole parts, and copies the compressed data byte for byte, so the only way it can change what a picture shows is by cutting a part a decoder reads. The kept lists name every part a JPEG or JPEG 2000 decoder needs, the guard compares every decoding byte before the write, and the gate renders every fixture with the strip on and off. Where a container cannot be read safely, the picture keeps its bytes rather than fail the run, because nothing ticked can live there (scope row 32) and refusing a whole document after review over a picture's comment would cost the visitor more than the detail is worth. The security page names those cases instead.

Your calls, 2026-11-24, in the design conversation:
- An allowlist of segments, not a denylist.
- Keep a JFIF header without its thumbnail, so most scanner JPEGs keep every byte; keep an ICC profile only when the picture's dictionary names no colour space. (The thumbnail is cut from the header rather than the header dropped whole, so the decision never rests on whether a decoder reads JFIF.)
- An unreadable container keeps its stored bytes and the security page says so; no refusal, no page warning.
- Only a sole `/DCTDecode` or `/JPXDecode` filter is read; a chain keeps its bytes.
- An inline picture is a recorded limit, since stripping it would mean editing a page's drawing instructions (spec 0004, INV-13).
- A new kind, `picture-details`, beside `xmp-metadata` for XMP found in a picture.
- The pixel proof lives in tests, with a byte comparing guard in every run, not a decode per run.
- JPEG 2000: allowlisted boxes, main header comments dropped, a tile part comment leaves the picture as stored.
- Fixtures: our own baseline JPEG encoder, and a hand built flat JPEG 2000 codestream, plus a test that every tile part after the main header is byte for byte the source's.
- A leftover on the written bytes fails the run with `redaction-incomplete`.
- The cost budget: 1 second of CPU and a peak within 5% on the 50 page scan.
- The home Strips card keeps both kinds off, since a picture left as stored can keep its own details; the scope row's "lists XMP metadata again" is dropped.

## Your calls as built (2026-11-24)

Three calls made while building, recorded so the spec says what the code does. None changes the design.

- **The kind's words.** `SANITIZED_TEXT["picture-details"]` is lowercase "picture details", like every other stripped kind, and the "Also stripped" line capitalises whichever kind leads it, so it reads "Picture details" alone and "XMP metadata and picture details" after XMP. The draft's capitalised "Picture details" would have read wrong mid line.
- **AC-12's peak is live heap.** The raw peak, garbage included, moved from 210 to 395 MB between identical runs as V8's collector timing moved, so a 5% bound on it measures the collector, not the strip. `cost.test.ts` collects and samples at every checkpoint instead, the peak of what a run keeps, which is what "lets each buffer go before the next" decides. The 1 second CPU budget and the 5% bound are unchanged; CPU is timed on runs with no forced collection, since collecting at every checkpoint slows a run.
- **The browser test answers as Pro.** `picture-jpeg.pdf` has 7 pages, past the free cap, so `tests/e2e/engine.spec.ts` routes `/api/entitlement` to a Pro answer, as `cancel.spec.ts` does for its long document. No product seam is added.

## What the cross check settled

A read only cross check on another model (2026-11-24) found sixteen edges the first draft left to the builder; you applied every recommended fix. The reader's rules now name where a scan's data ends and whose fill bytes are whose, keep tables after a scan in place, cut an Adobe segment longer than 12 bytes to 12 (libjpeg reads only those) instead of leaving the picture as stored, rewrite a JFIF header with extra bytes as it rewrites one with a thumbnail, and leave a picture with a repeated JFIF or Adobe segment as stored (libjpeg acts on each, so dropping one could change colours). The strip reads each object once by number through `newIndirect`, treats an indirect `/Filter`, the short filter names and `/F` as limits, and checkpoints after each picture it writes. The JPEG 2000 rules now say how box length forms are kept, that `jp2h` must keep `ihdr` and `colr`, and that the codestream is walked by tile part lengths, never by searching for marker bytes. Task 1 gained stop conditions, and page 6's outcome is stated: a blanked picture is written again as Flate, so its details go with the decode.

Two notes. PDF viewers draw a DCT picture from its pixels and the PDF's own keys, never from EXIF orientation, so dropping EXIF changes nothing a viewer shows. The parser exception reads only bytes MuPDF hands over; every dictionary read stays with MuPDF.

## Measurements owed

Task 1 records here, on MuPDF 1.28.1:
- whether `writeRawStream` through a reference survives the deduplicating write on a grafted document (the resolve quirk, spec 0019, AC-16);
- which filter MuPDF writes a blanked DCT picture with (AC-7);
- whether MuPDF reads an embedded ICC profile for a DCT picture with no `/ColorSpace` (the rule keeps it either way).

Task 8 records the cost and peak figures AC-12 holds.

### Measured at task 1 (2026-11-24, MuPDF 1.28.1)

Every picture below was written by `scripts/lib/jpeg-writer.mjs` or `jp2-writer.mjs`; nothing was read from outside the repository. Each is pinned in `tests/unit/redaction-pictures.test.ts` (*MuPDF 1.28.1, what the strip rests on*), so a release that changes one fails there.

- `writeRawStream` through an unresolved reference on a grafted document holds: `picture-jpeg.pdf`'s page grafted into a new document, its picture's data replaced through `newIndirect`, then written with `WRITE_OPTIONS`, leaves with the new bytes, byte for byte, and its `/Filter /DCTDecode`. A JPX stream added beside it leaves byte for byte with `/Filter /JPXDecode`, so `compress` and `sanitize` touch neither. None of task 1's three stop conditions holds, so the design stands.
- A blanked DCT picture is written again as `/FlateDecode`: a 64 pixel grey JPEG holding EXIF under a ticked address, run with the strip swapped out, leaves as Flate with no marker left (AC-7).
- MuPDF does not read an embedded ICC profile for a DCT picture with no `/ColorSpace`: the same grey and RGB pictures with no `/ColorSpace` render pixel for pixel the same with and without a gamma 3 profile in an `APP2` segment, while with `/ColorSpace` named they render differently from both. The rule keeps the profile either way (AC-2), so nothing changes; a release that starts reading it fails the pin, which then only says the kept profile now matters to drawing.
- The hand built codestream (2 by 2 tiles, no wavelet levels, every packet empty) decodes to an even grey of 128, as AC-13 expects.

### Measured at task 8 (2026-11-24)

On the 50 page cropped scan at 300 pixels per inch (12.4 MB, one 185 KB MuPDF made JPEG a page, each with its own `APP1` of about 64 KB spliced in), in the unit project, the file run alone:

- CPU: the least of three runs with the strip took 1,391 ms against 1,063 ms with the strip and the structure check both swapped out, so about 330 ms added, well inside AC-12's 1 second. The baseline swaps the whole structure check out, since the check fails every picture the strip leaves, so the figure counts the rest of the structure part too.
- Peak: with garbage counted, the same run peaked anywhere from 210 to 395 MB, as V8's collector timing moved, so a 5% bound on that would only measure the collector. `cost.test.ts` instead collects and samples at every checkpoint, the peak of what a run keeps, which is what "lets each buffer go before the next" decides: 38.7 MB with the strip and 38.7 MB without on the first round, 47.9 and 48.0 on the second, the drift between rounds being the process's own and alike for both.
