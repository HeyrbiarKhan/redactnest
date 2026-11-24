# 0025. Strip the details stored inside a kept picture

**Date**: 2026-11-24
**Status**: Proposed

## Summary

A JPEG or JPEG 2000 picture can carry its own details inside its data: a camera's make and settings, sometimes a location, XMP, IPTC captions, comments, a small thumbnail of the original, even a second picture appended after the end. Today a picture under no removed item leaves with exactly the bytes the source stored, so all of that rides along into the cleaned copy. From now on every run reads each such picture's container (the list of tagged segments or boxes around the compressed picture data, never the picture data itself) and keeps only the parts a viewer needs to draw it, then the self check holds the same rule on the written bytes. A picture RedactNest cannot read this way keeps its stored bytes, and the security page says when that can happen.

## Amends specs 0001, 0004, 0006, 0007, 0019 and 0021

Applied in place when this spec is built (task 10): each spec names spec 0025 in its `**Updated**` line, and each changed line carries an _Amended by spec 0025_ note.

| Spec | Section | Change |
|---|---|---|
| 0001 | The named exception to "one PDF parser", as specs 0019, 0020, 0022 and 0023 amend it | A second named exception: `src/engine/picture-reader.ts` reads a JPEG's marker segments and a JPEG 2000 file's boxes and codestream marker segments, bytes in and byte ranges out. It reads no PDF syntax, never decodes compressed picture data, and computes no pixel (INV-1). |
| 0004 | *State transitions* (the run's order), AC-13 (the self check's structure part), the `SANITIZED_KINDS` list | The rebuild strips picture details after `sweepCarriers` and before the write, with a checkpoint after it (AC-6). The structure part fails an output whose readable picture still holds a part to drop, as a leak (AC-8). `picture-details` is appended last to `SANITIZED_KINDS` (AC-9). |
| 0006 | AC-29 (the cost test's "same bytes") | A page image keeps its filter and its stored bytes less what this spec drops; a picture holding nothing to drop keeps every byte, and the cost test's MuPDF made JPEGs are asserted to be such pictures (AC-12). |
| 0007 | AC-16 (words for every kind) | `picture-details` takes its words from its kind alone: "Picture details" (AC-9). |
| 0019 | AC-12 (`HOME_STRIPPED`), AC-13 (`/tool`'s words), AC-14's last bullet (the security page's picture line) | `HOME_STRIPPED` stays false for `xmp-metadata` and is false for `picture-details`, for the reason in AC-11. "Also stripped" now names a picture's XMP and details when a run strips them, each meaning absent from every picture RedactNest reads (AC-9). The security page's picture line is replaced (AC-11). |
| 0021 | INV-6 (format constants live in `src/engine`) | `JPEG_KEPT_MARKERS`, `JP2_KEPT_BOXES`, `JP2_HEADER_BOXES`, `XMP_APP1_IDS` and `XMP_UUID` join them: rules about a file format, not caps on the visitor (INV-7). |

## Requirements

**User stories**:
- As a visitor cleaning a PDF that holds photos, I want a photo's own camera details, location, captions and comments taken out of the copy I download, so that redacting the page doesn't hand over where and how the photo was taken.
- As a visitor, I want the photos to look exactly as they did, so that cleaning never damages the document.
- As the owner, I want RedactNest's pages to claim only what every file's check holds, so that the limits stay honest.

**Acceptance criteria**:

- **AC-1**: **Which pictures are read.** In every run, after the rebuild's `sweepCarriers`, a read role walk of the rebuilt document (`walkRoles(out, "read")`) names every indirect object reached in the `image` role: a picture a page, form, tiling pattern or Type 3 glyph draws, a soft mask (`/SMask`) and an explicit mask (`/Mask`). The strip takes the keys of `walk.reached` whose roles include `image`, so each object is read once however many places draw it, and reads each through `doc.newIndirect(num)`, as `forEachDictionary` does. A walk that names a problem fails the run with `unreadable-structure`; an object in the role that is not a stream is skipped. Each picture whose `/Filter` is a direct `/DCTDecode` or `/JPXDecode` name, or a direct array of one such name, is read by the picture reader from its raw stored bytes (`readRawStream()` through its reference). Every other picture keeps its stored bytes untouched: any other filter, a chain of filters such as `[/FlateDecode /DCTDecode]`, an indirect `/Filter`, the short names `/DCT` and `/JPX` (inline picture names, not stream names), a stream with `/F` (data in an external file), and an inline picture written inside a page's drawing instructions. `/DecodeParms` (its `/ColorTransform` included) is never read or touched. The role comes from the walk, never from the object's own `/Subtype` (spec 0019, INV-1).

- **AC-2**: **The JPEG rule (an allowlist).** The reader walks a DCT picture's marker segments from its start of image marker (`FF D8`). The output is the source with whole segments cut out, every kept byte in its original order, and keeps only:
  - the start of image (`D8`) and end of image (`D9`) markers;
  - every frame header (`SOF`: `C0` to `C3`, `C5` to `C7`, `C9` to `CB`, `CD` to `CF`), Huffman table (`C4`), arithmetic conditioning (`CC`), quantisation table (`DB`), restart interval (`DD`), number of lines (`DC`), hierarchical progression (`DE`) and expand reference (`DF`) segment, in place wherever it sits, after a scan included;
  - every scan header (`DA`) with the compressed data after it. The data ends at the first `FF xx` where `xx` is not `00` (a stuffed byte), not `D0` to `D7` (a restart marker) and not `FF`; stuffed bytes and restart markers stay inside the data;
  - the first `APP14` segment whose payload starts `Adobe` (it tells the decoder how the colours were transformed): whole when its payload is exactly 12 bytes (segment length 14); when longer, written again as its first 12 payload bytes with segment length 14, since libjpeg reads only those;
  - the first `APP0` segment whose payload starts `JFIF\0`, in place wherever it sits: whole when its thumbnail width and height are both 0 and its segment length is 16; otherwise (a thumbnail, or bytes past the 14 the header needs) written again as its first 14 payload bytes with the thumbnail width and height set to 0 and the segment length set to 16, so the thumbnail and any extra bytes go and the version, units and pixel density stay;
  - when the picture's dictionary has no `/ColorSpace` key (a `null` value counts as no key, as `hasKey` in `objects.ts` reads it), every `APP2` segment whose payload starts `ICC_PROFILE\0` (the embedded colour profile, which a decoder may use when the PDF names no colour space). A soft mask written with no `/ColorSpace` keeps its profile too, which is harmless.

  Fill bytes (`FF` runs before a marker) belong to the marker after them: kept before a kept marker, cut before a dropped one. Everything else is dropped: every other `APPn` segment (`APP1` EXIF, XMP and extended XMP, `APP2` multi picture and FlashPix data, `APP13` Photoshop and IPTC, every maker's own segment), every `APP0` that is not JFIF (a JFXX thumbnail among them), every `APP2` ICC profile when the dictionary has `/ColorSpace`, every comment (`FE`), every reserved marker (`C8`, `F0` to `FD`), and every byte after the end of image marker unless those bytes are all PDF whitespace (`00`, `09`, `0A`, `0C`, `0D`, `20`), which are kept as stored and never reported. A missing end of image marker is read as fine: the data ends inside the last scan, and the output ends there too.

- **AC-3**: **The JPEG 2000 rule (an allowlist).** A JPX picture that starts with the JP2 signature box (`00 00 00 0C 6A 50 20 20 0D 0A 87 0A`) is read as boxes. It keeps, in their original order, the signature box (`jP  `), the file type box (`ftyp`, whole, its compatibility list included), the reader requirements box (`rreq`, whole), the header box (`jp2h`) holding only its image header (`ihdr`), bits per component (`bpcc`), colour specification (`colr`, its ICC profile included, since JPEG 2000 can carry its own colours), palette (`pclr`), component mapping (`cmap`) and channel definition (`cdef`) boxes, and the codestream box (`jp2c`). Every other box is dropped at either level (`xml `, `uuid`, `uinf`, `jp2i`, `res ` inside `jp2h`, `asoc`, `lbl `, and any other), and so is every box after `jp2c` that is not on the list. A kept box is copied byte for byte in whatever length form it has. The reader writes the `jp2h` and `jp2c` box headers anew when their contents shrink, keeping each box's length form (four byte length, or the eight byte extended length when the source used it); a `jp2c` of length 0 (running to the end) keeps length 0. A picture that starts with the codestream's start marker and its size segment (`FF 4F FF 51`) is read as a bare codestream.

  In the codestream, the main header runs from `SIZ` to the first tile part marker (`FF 90`), read segment by segment by each segment's length; markers `FF 30` to `FF 3F` carry no length. The reader drops every comment segment (`COM`, `FF 64`) there and keeps every other main header segment, `TLM` and `PLM` included (they hold tile part and packet lengths, which do not change). It then hops from tile part to tile part by each `SOT` segment's tile part length (`Psot`), never by searching for marker bytes, keeps every tile part byte for byte, and expects the end of codestream marker (`FF D9`) where the hops end. A tile part length of 0 (running to the end) is read only on the last tile part, whose data must end with `FF D9`, PDF whitespace after it aside. Every byte after the end of codestream marker is dropped unless they are all PDF whitespace.

- **AC-4**: **A picture the reader cannot read keeps its stored bytes.** The reader answers `as-stored`, and the picture's object is left untouched, never refused, never reported, when: a DCT picture does not start with `FF D8`; a segment length is below 2 or runs past the data; a byte other than `FF` stands where a marker should be, after a segment or after scan data; a second start of image marker appears outside a segment; no frame header or no scan header comes before the end; an end of image marker comes before any scan; a JFIF `APP0` is shorter than 16 bytes, or an `APP14` starting `Adobe` has a payload shorter than 12; or a second JFIF `APP0` or a second Adobe `APP14` appears (libjpeg acts on each one it reads, so dropping a repeat could change the colours). A JPX picture starts with neither form above; a box length is below its header size or runs past the data; a box of length 0 (to the end) is not the last box, or sits inside `jp2h`; the file holds other than one `jp2h` and one `jp2c`, `jp2c` comes before `jp2h`, or a box on the kept list comes after `jp2c`; `jp2h` keeps no `ihdr` or no `colr`; the codestream does not start `FF 4F FF 51`; the main header holds a marker outside JPEG 2000 Part 1's list, or a segment that runs past the data; a tile part's length runs past the codestream, a length of 0 is not on the last tile part, or the hops do not end at `FF D9`; or any tile part header holds a comment segment (cutting it would change that tile part's length field). These cases and the ones AC-1 leaves out (a chain, an inline picture) are the recorded limits AC-11's words name.

- **AC-5**: **A picture with nothing to drop is left alone.** When the reader finds nothing to drop, the object is never written: no `writeRawStream`, so a typical scanner's JPEG (a thumbnail free JFIF header and the decoding segments) keeps every byte and costs one read.

- **AC-6**: **The strip and its guard.** `stripPictureDetails(out)` in `src/engine/rebuild.ts` runs in the rebuild after `sweepCarriers` and before the write, as `Pipeline.stripPictureDetails` (its default `stripPictureDetails`), with a checkpoint (`checkpoint` in `failure.ts`) after each picture it writes, so a cancel lands within one picture. For each picture the reader would change, it builds the new bytes, then reads them again with the same reader before writing them, and requires:
  - the new bytes read with nothing to drop;
  - for a DCT picture, every kept segment but the JFIF `APP0` and the Adobe `APP14`, and every scan's compressed data, equal, byte for byte and in source order, to the source's (`decodingParts`); a kept JFIF `APP0` equal to the source's first 14 payload bytes with the thumbnail width and height set to 0, and a kept Adobe `APP14` equal to the source's first 12 payload bytes;
  - for a JPX picture, the `ihdr`, `bpcc`, `colr`, `pclr`, `cmap` and `cdef` boxes, the codestream's `SIZ` segment, and every byte from its first tile part to its end of codestream marker equal, byte for byte, to the source's.

  It then writes them with `writeRawStream` through the picture's reference, changing no dictionary key itself (MuPDF sets `/Length`). Any failed requirement, or a throw from MuPDF while reading or writing a picture, fails the run with `unsupported`: a fault in RedactNest's own reader, never a document's. A crafted file that trips such a fault refuses every run on it, after review; that is accepted rather than adding a dry run of the reader at open, since a correct reader answers `clean`, `strip` or `as-stored` for any bytes and tests hold it there. A run strips whether or not anything is ticked.

- **AC-7**: **Pictures a pass wrote again.** The strip reads the rebuilt document, so a picture the padded pass blanked faces the same rule as every other picture. MuPDF writes a blanked picture again as Flate (spec 0006, INV-6), so its details go with the decode and the strip leaves it alone: `picture-jpeg.pdf` page 6 proves the pass path leaves no detail either. Task 1 pins that filter on MuPDF 1.28.1.

- **AC-8**: **The self check holds the rule on the written bytes.** `structureIsClean` reads, on the walk it already makes, every object reached in the `image` role whose `/Filter` is a sole `/DCTDecode` or `/JPXDecode`, with the same reader. A picture the reader would still change answers `"leak"`, so the run fails with `redaction-incomplete`, ranked with every other leak and never leading to the second write. A picture the reader answers `as-stored` passes. It reads `/ColorSpace` on the written picture with the same `hasKey`; the second write changes no picture's dictionary or bytes, and the drawn shape (spec 0021, AC-8) already fails one whose stored length changes. It runs on the second write's bytes too. It sits inside `structureIsClean`, so a test that skips the strip (`Pipeline.stripPictureDetails` swapped for one that changes nothing) fails every fixture picture holding a detail with `redaction-incomplete`.

- **AC-9**: **What the visitor and the counts hear.** The strip hands back which kinds it dropped, and the run adds them to `sanitized` in `SANITIZED_KINDS` order beside the inventory's:
  - `xmp-metadata` when it dropped an `APP1` whose payload starts `http://ns.adobe.com/xap/1.0/\0` or `http://ns.adobe.com/xmp/extension/\0`, or a `uuid` box whose first 16 bytes are XMP's (`BE 7A CF CB 97 A9 42 E8 9C 71 99 94 91 E3 AF AC`);
  - `picture-details`, a new kind appended last to `SANITIZED_KINDS`, when it dropped anything else: any other segment or box, a JFIF thumbnail, a codestream comment, or bytes after an end marker that are not all whitespace.

  `SANITIZED_TEXT["picture-details"]` is "Picture details", so `/tool`'s "Also stripped" line names it. Telemetry carries it as one more value of `stripped`, a kind from a closed list. Nothing says which picture, how many, or what a part held.

- **AC-10**: **The details are gone and the pictures unchanged** (the proof, in tests). On the new fixtures (AC-13):
  - no stored stream of any output holds any of the fixture's marker strings (the EXIF camera make, the GPS tag, the XMP packet, the IPTC caption, each comment, the thumbnail's bytes, the appended picture, the JP2 boxes' text), read with `tests/support/mupdf.ts`, which reads raw streams with its own code;
  - every page renders pixel for pixel the same with the strip on and with it swapped out, and every changed picture decodes to the same pixels as its source;
  - each JPX output's bytes from its first tile part to its end of codestream marker equal the source's, byte for byte (your addition, 2026-11-24);
  - each picture AC-4 or AC-1 leaves as stored keeps its marker bytes, the run passes, and it adds no kind to `sanitized`.

  The redaction gate's `MAIN` swaps the strip out too, so every committed fixture renders pixel for pixel the same with and without it.

- **AC-11**: **The pages' words.**
  - The security page's line "Details stored inside a picture's own data, such as a photo's camera details, can stay." becomes: "Details stored inside a JPEG or JPEG 2000 picture's own data, such as a photo's camera details, location, captions and comments, are taken out of every such picture RedactNest can read. They can stay in a picture written inside a page's drawing instructions, one stored under more than one kind of compression, or one whose structure it can't read to its end. A colour profile the picture needs to draw its colours stays." Its source comment names this spec's AC-2, AC-3, AC-4 and AC-8, and `SECURITY_CHANGES` gains one entry dated the day it merges. It passes the banned phrase list in `tests/support/claim-phrases.ts` as is.
  - `HOME_STRIPPED["xmp-metadata"]` stays false and `HOME_STRIPPED["picture-details"]` is false, so the Strips card is unchanged: under "Whenever a file carries them:" neither would hold, since the three cases above can keep a picture's own XMP and details (your call, 2026-11-24). The comment above `HOME_STRIPPED` says so and names this spec.
  - No search page changes: spec 0024's claim register keeps metadata off them.

- **AC-12**: **Cost.** On spec 0006's 50 page, 300 pixels per inch scan built inside `tests/unit/cost.test.ts`, with one JPEG per page and an `APP1` of about 64 KB spliced into every JPEG so every picture is rewritten, the strip and its self check add at most 1 second of CPU time to a run in the unit project, against the same run with the strip swapped out, and the run's peak heap stays within 5% of that run's. The strip reads and writes one picture at a time and lets each buffer go before the next. The existing run over the scan's MuPDF made JPEGs asserts each picture keeps every byte (AC-5), which is spec 0006's AC-29 as amended. Spec 0019's budgets in `cost.test.ts` (50 dense pages, one page drawing 10,000 forms) still hold with the extra read walk. Run the file alone.

- **AC-13**: **Fixtures built from code.** `scripts/make-fixture.mjs` writes every JPEG and JPEG 2000 picture from code: no real photo is committed, none is made by MuPDF, and nothing reads a PDF or a picture from outside the repository.
  - `scripts/lib/jpeg-writer.mjs`: a baseline JPEG encoder (colour conversion, forward DCT, quantisation, the standard Huffman tables), writing a small patterned picture in grey or in colour, colour as one interleaved scan or as three scans of one component each, and handing back its segments so a fixture can place a detail segment anywhere, between scans included.
  - `scripts/lib/jp2-writer.mjs`: a JPEG 2000 codestream written by hand, 2 by 2 tiles, no wavelet levels, every packet empty, so it decodes to an even grey picture; plus the JP2 boxes around it.
  - `scripts/lib/picture-fixtures.mjs` writes `picture-jpeg.pdf`, `picture-jpx.pdf` and `picture-kept.pdf` (pages in *Fixtures* below), each page with a readable line of text so the open reads it.

- **AC-14**: **In a real browser.** `tests/e2e/engine.spec.ts` opens `picture-jpeg.pdf`, ticks its ticked line, makes and downloads the file, finds none of the fixture's marker strings in the downloaded bytes' raw streams, and sees "Picture details" in the result card's "Also stripped" line.

## Decision

**Chosen option**: Option 1, an allowlist reader of the picture's container, run in the rebuild and held by the self check.

Every kept DCT and JPX picture keeps only the segments and boxes a decoder needs; the reader never decodes the compressed data, so pixels and compression stay exactly as stored; a picture it cannot read keeps its bytes as a recorded limit.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Where the code lives**:
- `src/engine/picture-reader.ts` (new): pure functions over bytes, importing nothing. `readJpeg(bytes, hasColourSpace)` and `readJpx(bytes)` answer a `PictureRead`: `{ kind: "clean" }`, `{ kind: "strip", parts, dropped }` (`parts` the byte ranges and rewritten headers that form the new bytes, `dropped` a set over `"xmp" | "other"`), or `{ kind: "as-stored" }`. `joinParts(bytes, parts)` builds the new bytes. `decodingParts(bytes, kind)` hands back what AC-6's guard compares. The constants `JPEG_KEPT_MARKERS`, `JP2_KEPT_BOXES`, `JP2_HEADER_BOXES`, `XMP_APP1_IDS`, `XMP_UUID` and `PDF_WHITESPACE` live here, each commented as a rule about the file format (INV-7). Spec 0001's second named exception (INV-1).
- `src/engine/rebuild.ts`: `stripPictureDetails(out): PictureReport` (`{ xmp: boolean; details: boolean }`), and `pictureFilter(ref)` (the sole filter name, or null), shared with the self check.
- `src/engine/redact.ts`: `Pipeline.stripPictureDetails`, the call after `sweepCarriers`, the checkpoint, and the merge into `sanitized`.
- `src/engine/self-check.ts`: the picture read inside `structureIsClean` (AC-8).
- `src/worker/protocol.ts` (`SANITIZED_KINDS`), `src/lib/flow-text.ts` (`SANITIZED_TEXT`), `src/lib/home-text.ts` (`HOME_STRIPPED` and its comment), `src/app/security/page.tsx` and its change list. Telemetry follows from the kind list, with no other change.

**Data model**: no persistence. The only new values are `PictureRead` and `PictureReport` above, held for one run, and one closed kind.

**State transitions** (the run, spec 0004 as specs 0006, 0019, 0020 and 0022 amend it): ... rebuild (graft, `stripToAllowlist`, `pruneToRoles`, `sweepCarriers`, **`stripPictureDetails`**, checkpoint), write, self check, and on `unused-colour-space` alone the second write and its whole check. The open is unchanged: the review copy is never stripped and never leaves.

**Fixtures** (AC-13). Each page draws its picture beside a line of text; marker strings are plain ASCII the tests search for.

| Fixture | Page | What it holds | Expected |
|---|---|---|---|
| `picture-jpeg.pdf` | 1 | Grey JPEG: thumbnail free JFIF, `APP1` EXIF (make, GPS), `APP1` XMP, `APP13` IPTC, a comment, a second JPEG after the end marker | Every detail gone; JFIF kept; `xmp-metadata` and `picture-details` |
| | 2 | Colour JPEG in three scans, `APP14` Adobe, an `APP1` and a comment between scans | Between scan parts gone; Adobe kept |
| | 3 | Colour JPEG with `/ColorSpace /DeviceRGB`: JFIF with a thumbnail, a JFXX thumbnail, `APP2` ICC, `APP2` multi picture data | Thumbnail cut from JFIF; JFXX, ICC and multi picture gone |
| | 4 | Colour JPEG with no `/ColorSpace`: `APP2` ICC, `APP1` EXIF | ICC kept; EXIF gone |
| | 5 | A JPEG with EXIF as one picture's `/SMask`, and another drawn inside a form XObject | Both stripped |
| | 6 | A JPEG with EXIF under the ticked line | Blanked and written again as Flate; no detail left; the strip does not read it (AC-7) |
| | 7 | Control: thumbnail free JFIF only, whitespace after the end marker | Every byte kept; nothing reported |
| `picture-jpx.pdf` | 1 | JP2: `jp2h` with `res `, `xml `, XMP `uuid`, EXIF `uuid`, `jp2i`, a main header comment, bytes after the end of codestream, a box after `jp2c` | All gone; `res ` gone, `jp2h` length rewritten; tile parts byte for byte |
| | 2 | Bare codestream with a main header comment | Comment gone |
| | 3 | JP2 whose `jp2c` has length 0 (to the end) | Read and stripped |
| `picture-kept.pdf` | 1 | `[/FlateDecode /DCTDecode]` JPEG with EXIF | As stored (AC-1) |
| | 2 | JPEG with EXIF and two Adobe `APP14` segments | As stored (AC-4) |
| | 3 | Inline DCT picture with an `APP1` | As stored (AC-1) |
| | 4 | JP2 with a comment in a tile part header | As stored (AC-4) |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| strip | which objects are pictures | a read role walk of the rebuilt document, objects reached in role `image` (AC-1) |
| strip | the filter | the object's `/Filter` through its reference: a name, or an array of one name (`pictureFilter`) |
| strip | whether ICC stays | the picture dictionary's `/ColorSpace` key, present or not (`hasKey` in `objects.ts`) |
| strip | the stored bytes | `readRawStream()` through the reference, copied out of MuPDF's heap before the buffer is destroyed |
| strip | what stays | `JPEG_KEPT_MARKERS`, the Adobe and JFIF forms, `JP2_KEPT_BOXES`, `JP2_HEADER_BOXES` (AC-2, AC-3) |
| strip | a rewritten JFIF header | the source's first 14 payload bytes, thumbnail size set to 0, length 16 (AC-2) |
| strip | a rewritten Adobe header | the source's first 12 payload bytes, length 14 (AC-2) |
| strip | a rewritten box header | the kept contents' total length plus the header, in the source's length form (AC-3) |
| strip | the guard's comparison | `decodingParts` of the source and of the new bytes (AC-6) |
| run | `sanitized` | the inventory's kinds, plus `xmp-metadata` from `report.xmp` and `picture-details` from `report.details`, in `SANITIZED_KINDS` order (AC-9) |
| self check | the verdict | the same reader on the written bytes' pictures; any `strip` answer is `"leak"` (AC-8) |
| result card | "Picture details" | `SANITIZED_TEXT["picture-details"]` (AC-9) |
| security page | the picture line | AC-11's words, written in `page.tsx` |

**Key invariants**:
- **INV-1**: The reader reads a picture's container only: marker segments and their lengths, boxes and their lengths, codestream marker segments and tile part lengths. It never decodes compressed picture data, never computes a pixel, and reads no PDF syntax. The output is the source with whole parts cut, every kept byte in its order, except the rewritten JFIF and Adobe headers and box headers AC-2 and AC-3 name.
- **INV-2**: One reader decides for the strip, the strip's guard and the self check, so they never disagree.
- **INV-3**: A picture is found by its role in the walk, never by what it says about itself, and read and written only through its reference: no `.resolve()` (spec 0019, AC-16, INV-9).
- **INV-4**: The strip changes no dictionary key itself and never changes a filter or decode parameter; only the stream's data, and MuPDF's `/Length` with it.
- **INV-5**: Nothing about a picture crosses the worker boundary but the two kinds. No count, no page, no part's contents.
- **INV-6**: A picture read as `as-stored` is never refused, never reported and never written: its limit is AC-11's words.
- **INV-7**: The kept lists are rules about the file formats, never config; changing one is a reviewed change with a failing fixture as its proof.
- **INV-8**: Every fixture picture is built from code by the fixture script, never by MuPDF and never from a real photo; no step of this feature, its tests or its verify opens a PDF or picture from outside the repository.

**Security model**: no new authorisation; the tool stays anonymous. Document bytes stay in the worker. The reader is pure and holds nothing past a picture. Telemetry gains one value of a closed kind list, with no catalog or privacy policy change (spec 0016). `/tool`'s content security policy is unchanged.

**Configuration required**: none.

**Critical test scenarios**:
- The reader alone, on bytes built in the test: every kept and dropped marker, fill bytes, stuffed bytes and restart markers inside a scan, a missing end marker, whitespace and other tails, the JFIF thumbnail cut, the ICC branch, each `as-stored` case, extended and zero box lengths, nested `jp2h` pruning, main header and tile part comments, verifies **AC-2**, **AC-3**, **AC-4**.
- `picture-jpeg.pdf` and `picture-jpx.pdf`: markers gone, pixels equal, kinds reported, tile parts byte for byte, verifies **AC-1**, **AC-2**, **AC-3**, **AC-9**, **AC-10**.
- The control page and `picture-kept.pdf`: bytes kept, no kind, the run passes, verifies **AC-4**, **AC-5**, **AC-10**.
- The guard: a seam that corrupts one kept byte fails the run with `unsupported`, verifies **AC-6**.
- The check with the strip skipped: `redaction-incomplete` on each fixture picture holding a detail; with nothing to strip, the run passes, verifies **AC-8**.
- The gate with `MAIN` swapping the strip: every fixture pixel for pixel, verifies **AC-10**.
- The cost budget and spec 0019's budgets, run alone, verifies **AC-12**.
- In a real browser: download free of markers, "Picture details" shown, verifies **AC-14**.

## Build plan

Skateboard: the thinnest whole first, one JPEG with an EXIF segment taken out end to end and held by the check, then the rest of the JPEG rule, then JPEG 2000, then words and cost.

1. **Pins first.** Write `scripts/lib/jpeg-writer.mjs` and `picture-jpeg.pdf` page 1 only; run `node scripts/make-fixture.mjs` and commit. In `tests/unit/redaction-pictures.test.ts`, the failing test: a run's output still holds page 1's EXIF make. Pin on MuPDF 1.28.1: `writeRawStream` through a reference on a grafted document, written with `WRITE_OPTIONS`, keeps the new data and the `/Filter`; which filter MuPDF writes a blanked DCT picture with (AC-7); whether MuPDF reads an embedded ICC profile for a DCT picture with no `/ColorSpace` (recorded in `rationale.md`; the rule keeps the profile either way); that `compress` and `sanitize` in `WRITE_OPTIONS` leave a DCT and a JPX stream's bytes alone. Stop and take the measurement to `/architect` if `readRawStream` or `writeRawStream` does not work through an unresolved reference, if the deduplicating write loses or changes the new data, or if the write touches a DCT or JPX stream: the design rests on all three. Satisfies **AC-7**, **AC-13**.
2. **The JPEG reader.** `src/engine/picture-reader.ts` with `readJpeg`, `joinParts` and `decodingParts`, and `tests/unit/picture-reader.test.ts` on bytes built in the test. Satisfies **AC-2**, **AC-4**, **AC-5**.
3. **The thin whole.** `stripPictureDetails` and `pictureFilter` in `rebuild.ts`, `Pipeline.stripPictureDetails`, the checkpoint, the guard, `picture-details` appended to `SANITIZED_KINDS` with its words, the merge into `sanitized`. Page 1's test passes, and the result reports both kinds. Satisfies **AC-1**, **AC-5**, **AC-6**, **AC-9**.
4. **The check.** The picture read in `structureIsClean`, `"leak"` on a `strip` answer; the test with the strip skipped. Satisfies **AC-8**.
5. **The rest of the JPEG fixtures.** `picture-jpeg.pdf` pages 2 to 7 and `picture-kept.pdf` pages 1 to 3, with their tests (markers, decoded pixels, render equality, kinds, as stored). Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-7**, **AC-10**, **AC-13**.
6. **JPEG 2000.** `scripts/lib/jp2-writer.mjs`, `readJpx`, `picture-jpx.pdf`, `picture-kept.pdf` page 4, the reader tests and the tile part byte comparison. Satisfies **AC-3**, **AC-4**, **AC-10**, **AC-13**.
7. **The gate.** First confirm no committed fixture before this spec holds a DCT or JPX picture (the scope row says none does), so no existing row's `sanitized` changes. `MAIN` swaps the strip out; the three new fixtures' main rows read from 5c4e0d7's code (a `git archive` of it, never the current code), their `RUN_NOW` rows for the new `sanitized`, and their ticked sets in `NEEDLES`. Satisfies **AC-10**.
8. **Cost.** In `cost.test.ts`: the spliced `APP1` run against the strip swapped out (CPU and peak), the MuPDF made JPEGs keeping every byte, spec 0019's budgets with the extra walk. Satisfies **AC-12**.
9. **In a real browser.** The `tests/e2e/engine.spec.ts` case. Satisfies **AC-14**.
10. **Words and amends.** The security page line, its source comment and `SECURITY_CHANGES` entry; the `HOME_STRIPPED` comment; the flow text and home text tests; specs 0001, 0004, 0006, 0007, 0019 and 0021 amended in place as the table at the top says. Read the security page's matching section again against what was built. Satisfies **AC-9**, **AC-11**, **AC-12**.

## Consequences

**Positive**:
- A photo's camera details, location, captions, comments, thumbnails and appended pictures leave the cleaned copy for every JPEG and JPEG 2000 picture RedactNest reads, with or without a tick.
- Pixels and compression are exactly the source's, so no file grows and no picture loses quality; spec 0006's no decode rule holds.
- The allowlist drops a detail nobody thought to list, as the rest of the rebuild does.

**Negative / tradeoffs**:
- A second piece of code that reads a file format beside MuPDF (spec 0001's exception widens). It is small, pure and tested on bytes, but a bug in it can fail a run with `unsupported` until fixed.
- Three cases keep their details (inline, chained, unreadable), and the home page cannot list XMP metadata or picture details as stripped "whenever a file carries them". The scope row's "lists XMP metadata again" is dropped.
- A picture with no `/ColorSpace` keeps its ICC profile, whose description can name a device.
- JPX extension boxes (layers, compositing, labels) are dropped by the allowlist; a JPX picture that needed one to draw in some viewer would draw differently there. MuPDF and the fixtures show nothing changes, and JPX extension files inside PDFs are rare.
- Every run reads the raw bytes of every DCT and JPX picture twice (strip and check), a copy each, within AC-12's budget.
- A crafted picture that trips a bug in the reader refuses every run on that file after review, with no warning at open (AC-6).
- A picture with a repeated JFIF or Adobe segment keeps its details, a fourth narrow limit inside "can't read its structure".

**Neutral**:
- `SANITIZED_KINDS` grows by one, last, so earlier kinds keep their order and telemetry's other values are unchanged.
- The gate's main rows for the new fixtures are read from 5c4e0d7's code, as for every new fixture.

## Follow-up

- [ ] Spec 0024's waiting "remove metadata from a PDF" search page stays a call for after this ships, with the search pages' counts in hand (scope, Deferred).
- [ ] If inline pictures with details turn up in practice, a later spec can weigh refusing them (spec 0022's scan reading an inline DCT picture's segments); this spec leaves them a recorded limit.
- [ ] `/sync` adds `picture-reader.ts`, the strip's place in the run's order and the reader's rule to `src/engine/AGENTS.md`, and the second named parser exception to root `AGENTS.md`.
