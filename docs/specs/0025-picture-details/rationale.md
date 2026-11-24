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
- The home Strips card keeps both kinds off, since three cases can keep a picture's own details; the scope row's "lists XMP metadata again" is dropped.

## What the cross check settled

A read only cross check on another model (2026-11-24) found sixteen edges the first draft left to the builder; you applied every recommended fix. The reader's rules now name where a scan's data ends and whose fill bytes are whose, keep tables after a scan in place, cut an Adobe segment longer than 12 bytes to 12 (libjpeg reads only those) instead of leaving the picture as stored, rewrite a JFIF header with extra bytes as it rewrites one with a thumbnail, and leave a picture with a repeated JFIF or Adobe segment as stored (libjpeg acts on each, so dropping one could change colours). The strip reads each object once by number through `newIndirect`, treats an indirect `/Filter`, the short filter names and `/F` as limits, and checkpoints after each picture it writes. The JPEG 2000 rules now say how box length forms are kept, that `jp2h` must keep `ihdr` and `colr`, and that the codestream is walked by tile part lengths, never by searching for marker bytes. Task 1 gained stop conditions, and page 6's outcome is stated: a blanked picture is written again as Flate, so its details go with the decode.

Two notes. PDF viewers draw a DCT picture from its pixels and the PDF's own keys, never from EXIF orientation, so dropping EXIF changes nothing a viewer shows. The parser exception reads only bytes MuPDF hands over; every dictionary read stays with MuPDF.

## Measurements owed

Task 1 records here, on MuPDF 1.28.1:
- whether `writeRawStream` through a reference survives the deduplicating write on a grafted document (the resolve quirk, spec 0019, AC-16);
- which filter MuPDF writes a blanked DCT picture with (AC-7);
- whether MuPDF reads an embedded ICC profile for a DCT picture with no `/ColorSpace` (the rule keeps it either way).

Task 8 records the cost and peak figures AC-12 holds.
