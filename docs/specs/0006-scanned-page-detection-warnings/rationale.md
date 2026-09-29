# 0006. Scanned page detection and warnings: rationale

The decision record for [spec 0006](index.md). `/develop` builds from `index.md` and skips this file.

## Context

RedactNest finds sensitive text by reading a page's text layer. Where there is no text layer, or where the text a viewer sees is not the text in the file, detection is blind, and a run hands back a file named `-redacted.pdf` that may still hold everything the visitor meant to remove. That is the one failure the product exists to prevent.

Before this spec the engine produced one boolean per page, `pagesWithText`, true when extraction returned any non whitespace character. The tool showed "N of M have a text layer" and nothing else. Four gaps sat behind that boolean:

- A scanned page with a digital page number or Bates stamp counts as having text, so a whole stamped scan gets no warning.
- A font with no character map extracts as U+FFFD, which counts as text but matches nothing.
- Text a viewer never shows still extracts and still ships: under a box drawn on top (a fake redaction the visitor may have received), the same colour as the page, invisible without being OCR, clipped away, or tiny.
- Text outside the crop box is dropped by the default read that detection uses, but kept by the rebuild and the `sanitize` write, so it reaches the output untouched (measured below).

Spec 0004 left three Follow-ups to this feature (text a viewer does not show, the document with no text layer, the crooked scan), and specs 0004 and 0005 left two manual checks that need a real OCRmyPDF scan. The engine is GA: its pipeline order is fixed and every change to what it removes needs a failing fixture as its proof. Real documents can never be committed to the public repository.

The forces: the privacy promise (nothing leaves the device, and only closed kinds cross the worker boundary), the self check's rule that nothing leaves unless it is proved, warning fatigue on a tool for small businesses, and the cost of every extra read at the 50 page paid cap.

## Options considered

### Option 1: keep the text flag, warn on pages without text

Keep `pagesWithText`, warn on each false page at open and download, and refuse a document where every page is false.

**Pros**:
- Smallest change; no new engine step, no new shape across the boundary.
- Exactly the scope's original wording.

**Cons**:
- A stamped scan, an unmapped font, a fake redaction and text outside the crop box all stay silent.
- The refusal misses the commonest scan in legal work, the Bates stamped one.

### Option 2: a per page reading from one drawing order pass, plus a trim of the visible area (chosen)

Read each prepared page once through MuPDF's callback `Device` and the ordinary structured text read, give it closed findings, refuse a document with nothing readable, and remove everything outside the visible area on both copies with a step that proves itself.

**Pros**:
- Names every blind spot the conversation found, including the fake redaction, with no pixel decoding.
- Draw order is what makes "covered" and "hidden" decidable at all; structured text has no order between text and fills.
- Closes the crop box leak for good rather than warning about it.

**Cons**:
- Heuristic thresholds that will misfire sometimes and need measuring.
- A new step in a GA pipeline, with a new refusal.
- More work at every open.

### Option 3: render and compare

Render each page, then judge blind spots from pixels: ink with no text over it, text with no ink under it.

**Pros**:
- Sees exactly what a viewer sees, whatever made it (curved covers, soft masks, spot colours).

**Cons**:
- A raster per page, and a second one per comparison, at the 50 page cap.
- Still needs the text layer to say what is text, and still cannot remove anything outside the crop box.
- Ink thresholds are harder to reason about than drawing rules, and anti aliasing makes them fuzzy.

### Option 4: refuse any document with any blind page

Treat every blind spot as a refusal.

**Pros**:
- No file ever leaves with an unchecked page.

**Cons**:
- Refuses most real documents: any photo, any logo sized picture, any print PDF with a slug line.
- Offers the visitor nothing for the typed pages they could have redacted.

## Rationale

Option 2 is the only one that answers the four gaps in *Context* without refusing ordinary documents. The draw order pass is the load bearing choice: a fake redaction is text followed by an opaque fill over it, and white on white is text drawn over a fill of its own colour, and neither is visible to structured text, which flattens order away. MuPDF.js 1.28.1 exposes that pass as a plain callback object, so it costs no new library and no pixel decoding.

The engineer chose to remove, not warn about, content outside the visible area, because it is never shown and has no reason to stay in a redacted file, and to prefer removing a straddling glyph over refusing, since cropped OCR scans are common. That puts the trim in the engine. Placing it beside `prepareDocument` on both copies, rather than as a fourth pass, keeps spec 0004's INV-9 (detection and redaction read the same page) and keeps the self check's record honest; making the trim prove itself on the spot covers the one thing a record taken after it cannot see, which is visible text the trim moved or lost. Pictures outside the visible area were later taken out of the trim's reach, once blanking them was measured on a real sized scan (*What the build sent back*).

Warnings rather than refusals for the partial blind spots follow from the product's own shape: the visitor can still redact the typed pages, the file name carries the caveat, and the warning is repeated where they download. Only the case with nothing readable becomes a refusal, and the stamped scan counts as nothing readable by the engineer's choice, because that is the scan the scope's refusal was written for.

## Decisions taken in the design conversation

Each was asked with a recommended pick; the engineer's answer is recorded, with the runner up.

- **Pictures with little text over them are flagged** (a picture of at least 5% of the page with under 5% of it under text). Runner up: only pages with no text at all.
- **Unreadable fonts are flagged** by a run of three U+FFFD. Runner up: leave them out.
- **OCR pages get a quiet note**, never a warning. Runner up: nothing.
- **Blank pages stay quiet.** Runner up: warn like a scan.
- **A document with nothing readable is refused at open.** Runner up: open without Redact.
- **The download repeat is a warning beside Download, no extra click.** Runner up: a tick box before Download.
- **The file is named `-partly-redacted.pdf` when any page carries a warning** (the engineer's pick over the recommended plain name). OCR notes, blank pages and removed off page content never change it.
- **One advice line** suggests OCR first. Runner up: pages only.
- **The crooked scan line appears only when a scan match is blocked `slanted-text`.** Runner up: always on OCR pages.
- **A page that throws while inspected fails the open.** Runner up: today's rule.
- **An all clear line** shows when nothing is flagged. Runner up: nothing.
- **Findings per page, as a set.** Runner up: one kind per page.
- **The outcome counts pages per finding.** Runner up: one count.
- **A page mostly made of bare picture counts as a scan for the refusal.** Runner up: refuse only when no page holds a readable character.
- **Covered text, hidden text and text outside the crop box are in scope** (the engineer added them from spec 0004's Follow-up, which this conversation had missed at first).
- **Rows on concealed text are marked.** Runner up: page level only.
- **Content outside the visible area is removed in every run**, straddling glyphs whole, with a note and the plain name (the engineer's own design, over the recommended warning). _Narrowed 2026-09-29 to text and drawn shapes; pictures there are kept and named (below)._
- **Pictures across the edge are blanked within 1 pt, else kept and warned about.** Runner up: refuse the run. _Superseded 2026-09-29: every picture reaching outside is kept whole and warned about (*What the build sent back*)._
- **Real scans are made locally** from a printed fixture and kept out of git. Runner up: a public domain scan.
- **No References section.**

## What the cross check changed (2026-09-28)

An independent read only review on another model found gaps a builder would have had to fill. The engineer took every recommended fix:

- The glyph box comes from the matched extracted character's quad, because MuPDF.js's `Font` gives no ascent or descent to a device callback.
- Device callback objects are freed in the callback (INV-10), verified in `dist/mupdf.js`: `Path`, `Text`, `StrokeState` and `ColorSpace` are wrapped with a kept reference, `Image` and `Shade` without one.
- The trim reads its own page (triggers from a `clip=no` read, placements from its own device pass), because spec 0004's image code reads clipped structured text and cannot see an image wholly outside the page; the self check's outside pixel rule gets its own setting, `IMAGE_CHECK_OPTIONS`. _(The outside pixel rule and `IMAGE_CHECK_OPTIONS` were retired on 2026-09-29, with pixel blanking.)_
- Both new self check rules are `redaction-incomplete` whatever is ticked. The reviewer called the off page character rule redundant; it is kept, because a trim that silently did nothing leaves the text in the record and the output alike, and only this rule sees it.
- `openDocumentWith` becomes async and cancellable, because it was synchronous with no cancel hook.
- Only glyphs centred inside the visible area are judged as covered or hidden; image footprints are cut to the clip in force; covers are axis aligned rectangles by a stated test; a plain group passes a cover through; colour is judged by colour space type with every paint counted; clip only text is hidden only when nothing fills it.
- `blank` ignores a white background rectangle (Word, Chrome); `scanned` with no text needs pictures over half the page; readable excludes control and private use characters; a stamp is under 40 readable characters, so a slide deck with full bleed photos opens as `bare-picture` instead of being refused.
- Invisible text with an image under or over it is machine read, whichever order the producer drew them in (ABBYY writes the text first).
- The trim proves text only at open; pixels are proved once, on the output. `edge-text` is kept for failures on lines crossing the edge, `unsupported` for the rest. Output size and peak memory of a cropped scan are measured at the cap. _(Pixel proving was retired on 2026-09-29, with pixel blanking; the measurement is in *What the build sent back*.)_
- Spec 0004's INV-9 and INV-11 are reworded; INV-1 keeps its letter.

Two of the reviewer's concerns were measured rather than assumed; both results are below.

## What the build sent back (2026-09-29)

`/develop` built slices 1 to 4 and returned three questions: the peak memory of a cropped scan (AC-29, which blocks shipping), text a clip hides wholly, and a set of wording corrections. Each was measured here with MuPDF.js 1.28.1 in the unit project, with probe tests written to the repository for the run and deleted after it.

### Pictures outside the visible area: kept and named

The build measured a 50 page cropped scan whose pages all shared one synthetic grey image (32 KB in all): MuPDF's heap went from 23 MB to 59 MB over an open and a run, and the output grew 1.57 times. A shared image is decoded once and cached, and a synthetic image compresses far better than a real one, so both figures understate a real scan. Measured again on scans shaped like real ones: 50 pages at 300 pixels per inch (2550 by 3300 pixels), a distinct JPEG per page at quality 75 (about 400 KB a page, 20 MB grey and 23 MB colour, under the 25 MB cap), an invisible OCR text layer on each page so the open is not refused, cropped half an inch on each side. The heap is MuPDF's WebAssembly memory, which only grows, so each figure is the peak so far, each measured in a fresh engine.

| 50 page scan, 300 dpi | Heap after the open | Peak over a run alone | Run CPU | Output against source |
|---|---|---|---|---|
| grey, not cropped (the trim does nothing) | 46 MB | 86 MB | 2.3 s | 0.99 times |
| grey, cropped (blanked) | 615 MB | 814 MB | 33 s | 4.78 times |
| colour, cropped (blanked) | the open failed, `unsupported` | 1,804 MB | 80 s | 6.17 times |
| grey, cropped, MuPDF's store emptied after every page | 464 MB | 1,241 MB (after an open) | 33 s | 4.78 times |

Five page versions put the growth at about 19 MB a page at open and 15 MB a page in a run for grey, and about 45 MB a page at open for colour. Two causes, both in MuPDF rather than in the engine: `applyRedactions` with `REDACT_IMAGE_PIXELS` decodes the image and writes it back as Flate (every blanked page image in the output was `/FlateDecode`, about 1.95 MB grey and 2.87 MB colour, where the source's was a 400 KB `/DCTDecode`), and the rewritten images stay in the document until it is destroyed, so they add up page by page. Emptying MuPDF's cache after each page barely moved the peak, so the cache is not the cause. The build's reading ("decoded twice, blank then check") was right as far as it went; the rewrite and the pile up are the larger part.

Options weighed, with the engineer's choice:

- **Keep and name every picture reaching outside (chosen).** The trim never decodes a picture: text and drawn shapes outside still go, and the page gets `off-page-picture` and the partly name. A cropped scan costs what it would uncropped. Con: a cropped scan is named, not cleaned, so content cropped out of a picture on purpose stays in the file.
- **Blank within a budget, in runs only.** Skip blanking at open (nothing the open reads looks at pixels outside the visible area), and blank in a run only while the crossing pictures' decoded size across the document stays under a budget of about one colour or three grey pages; past it, keep and name them all. Con: those pages still grow five to six times, the budget competes with spec 0004's padded pass for the same memory, and a document's treatment would flip with its size.
- **Keep as built, raise the budget.** Con: not viable as measured, since a colour cropped scan at the cap cannot open.

A picture reaching outside the visible area is one more picture blind spot, and every other one (`scanned`, `bare-picture`) is answered with a warning and the partly name, not a repair. Keeping pixel work out of the trim also keeps spec 0004's padded pass the only thing in a run that rewrites images, which matters because it has the same cost:

| 50 page grey scan, not cropped | Peak over an open and a run | Run CPU | Output against source |
|---|---|---|---|
| one ticked match on every page (spec 0004's padded pass) | 917 MB | 34 s | 4.88 times |

That is spec 0004's open Follow-up on the pixel pass's peak, now with a number, and it goes back to `/architect` on its own (index Follow-up). AC-29's old yardstick, "spec 0004's four copies of the document", was the wrong measure here: it counts a document's own bytes, and against the build's 32 KB file any decoded image looked like a breach while the real problem, hundreds of MB, stayed hidden. AC-29 now pins that the trim rewrites no image and compares each peak with the same scan uncropped.

### The cropped scan after slice 4b: the same memory as uncropped

`/develop` measured AC-29's peaks once slice 4b was built (2026-09-29), with a scratch probe run once and deleted. The scan: 50 US Letter pages at 300 pixels per inch (2550 by 3300 pixels), a different JPEG per page made by MuPDF at quality 75 (about 430 KB grey and 500 KB colour, files of 21.9 MB and 25.1 MB), an invisible text layer on each page and a header line in its top margin, cropped half an inch on every side or not at all. The cropped header puts every cropped page through the trim's text pass, and every cropped page's scan reaches outside. Each figure is MuPDF's WebAssembly memory in a fresh engine, which starts at 23 MB and only grows.

| 50 page scan, 300 dpi | Heap after the open | Peak over a run alone | Run CPU | Output against source |
|---|---|---|---|---|
| grey, not cropped | 60 MB | 105 MB | 1.1 s | 0.99 times |
| grey, cropped | 60 MB | 105 MB | 1.6 s | 0.99 times |
| colour, not cropped | 66 MB | 115 MB | 1.1 s | 0.99 times |
| colour, cropped | 66 MB | 115 MB | 1.5 s | 0.99 times |

Cropped scans used the same memory as uncropped, 0% above against AC-29's 5% limit, so nothing returns here. The trim adds 0.3 to 0.5 s of CPU across the 50 pages, at open and in a run. This scan is not the one in the table above (it adds a header line to every page, and MuPDF made its JPEGs), so read each cropped row against its own uncropped twin, not against the earlier figures.

### Text a clip hides wholly: named as hidden text

Four one page probes, each with a visible line and an email a clip hides wholly, opened, read for matches, and run with nothing ticked:

| The email is hidden by | Ordinary read | `clip=no` read | Findings | Rows | In the output, read with `clip=no` |
|---|---|---|---|---|---|
| a 10 pt rectangle clip elsewhere on the page | absent | present | none | none | present |
| a form XObject whose `/BBox` is 10 pt square | absent | present | none | none | present |
| a clip made by clip only text (render mode 7) elsewhere | absent | present | `hidden-text`, from the clip only glyph, not the email | none | present |
| a clip straddling the email (for comparison) | the part inside | present | `hidden-text` | none (the part read is not an email) | present |

So text a clip hides wholly shipped with no warning: the ordinary read drops it, the inspection judged only glyphs it could match to that read (AC-9), detection never saw it, and the self check's unclipped record carried it into the output exactly as the source had it, which is a pass. The drawing pass does report each such glyph, with the clip it is under (the rectangle case came through with its clip's bounds), so naming it costs no extra read.

Options weighed: **name it as hidden text (chosen)**; name it and list its matches, which needs detection to read unclipped text (a change to what specs 0004 and 0005 fixed) and a tick that removes whatever visible text it overlaps, such as the next cell under a spreadsheet cell's overflow, which the self check then refuses; or remove it like off page content, which is not open, since a Redact area over a clipped glyph takes every visible glyph it touches and the engine never edits a content stream itself (spec 0004, INV-13).

### Text under an empty clip: refused at open

The same probe with the email under `0 0 0 0 re W n` opened with no finding, and every run failed `unsupported`. The drawing pass did report the glyph, under a clip of `[0, 792, 0, 792]`. Traced: the email survives `prepareDocument` and a plain save, and is gone after any save with `sanitize` (the engine's `WRITE_OPTIONS`), so the self check sees text nobody ticked go missing. It fails closed, but only after the visitor has reviewed. The engineer chose to refuse at open, as AC-11 does for a page that throws (runner up: warn at open and fail at Redact). Whether `sanitize` also drops text under a zero width clip, nested clips that do not meet, or a clip whose path is empty is left to the build's pins, and the rule covers what is both reported and dropped. (Settled after slice 4b: all four are, below.)

### What the cross check changed (2026-09-29)

An independent read only review on another model checked these changes against the built code. The engineer took every recommended fix:

- **The empty clip needed a definition.** The drawing reader held three shapes for "no area" (a zero area rectangle, a private sentinel for nested clips that miss, and MuPDF's inverted empty rectangle, which it treated as unbounded and so dropped). AC-11 now defines it, the reader reports it as its own state, and the refusal is recorded per page and applied after AC-10, so a scan with nothing readable keeps its `no-readable-text` advice. One fixture file per case, since an open stops at its first refusal.
- **The clipped away rule skips whitespace**, since extraction does not report a character for every drawn space, and judges filled, stroked and invisible glyphs, whose records now carry their clip.
- **A picture counts as reaching outside only past 1 pt** (`PICTURE_REACH_MIN`): an uncropped A4 scan placed at 595.28 pt on a 595 pt page would otherwise be named partly for a sliver. Images drawn while a soft mask is defined are not pictures, as in the inspection.
- **A cropped OCR scan may be refused rather than named.** Tesseract writes a `Tf` and a `Tz` for each word inside one text object, and spec 0004 records that MuPDF moves kept text after removed glyphs across such a change, so a crop through OCR lines may fail the trim's proof with `edge-text`. This predates today's decisions (slice 4 built it), but it would break their promise, so slice 4b pins it first and stops for `/architect` if it refuses.
- Smaller: the `off-page-picture` copy fits a picture wholly outside the page; `picturesKept` becomes `pictureOutside`; task 20 names every reader of the retired names; the new fixture pages live in `trim-edge.pdf`; the cost test reads raw image streams and the heap figures come from a scratch script; the amends missed in specs 0002 and 0004 are applied; filled form fields that overflow their box join spreadsheets as a likely source of `hidden-text`.

### Wording brought in line with the build (no behaviour change)

- **Callback objects.** AC-9 said `Image` and `Shade` arrive without a kept reference. The build found `Image`'s constructor keeps one, so an image is destroyed like a path; `Shade` has none yet is registered for collection, and a collected wrapper frees a shading MuPDF still uses (the next page run crashed), so it is disowned; the text walker's `Font` is MuPDF.js's own and left alone. `device.test.ts` pins all three.
- **MuPDF's own crop clip.** MuPDF.js 1.28.1 runs a cropped page inside a clip to its crop box, opened before any content. Counted as the clip in force, it would cut every picture to the visible area, and the trim could never see a cropped scan's margins. The drawing reader leaves it out (a clip opened before anything is drawn, at no depth, whose bounds equal the visible area within 0.01 pt), pinned in `trim.test.ts`. AC-4 now defines the clip in force with that exception.
- **The amends** to specs 0002, 0003, 0004 and 0005 are applied in place.

After slice 4b, four more, each read from the built code:

- **Whitespace and the clip rules (AC-7).** The spec said only the clipped away rule skips whitespace. The existing rule for text whose centre lies outside the clip in force skips it too, because a cell's trailing spaces run past its clip and hide nothing. Neither clip rule judges a space.
- **Only path clips count as empty (AC-11).** The build's pins answered the question left open above: a zero area rectangle, a zero width one, two nested rectangles that do not meet and a clip whose path is empty are all reported by the drawing pass and dropped by `sanitize`, and those four are what the refusal covers. Only `clipPath` can make the clip in force count as empty. Text clips, stroke clips, image masks and soft masks still cut the clip in force as before, and never trigger the refusal.
- **"The same bytes" for a picture (AC-15, AC-29).** It holds only for an image stored with a filter. The engine's `compress` write deflates an image stored with none on every run, cropped or not, so that image keeps its pixels but not its bytes; the stretched colour band in `trim-kept.pdf` is stored compressed for this reason.
- **Images are compared by content, not name.** MuPDF's content filter renames the image resources of a page it rewrites (`/Photo` becomes `/Im1`) and keeps the stream, so the tests compare each page's images by filter and a digest of the raw stream (`pageImages` in `tests/support/mupdf.ts`).

### The constants: every starting value held

No fixture needed a different value. Each constant, and the fixture pages that hold it from both sides:

| Constant | Value | Holds because |
|---|---|---|
| `READING_GRID` | 64 a side | every share the fixtures test sits well clear of its threshold at this spacing (the nearest: an ID card at 7.7% of the page against 5%) |
| `PICTURE_MIN_SHARE` | 0.05 | the ID card (7.7%) and the photo (a fifth of the page) are pictures; the 40 pt logo and the headshot clipped to a 120 pt frame (3%) are not |
| `TEXT_OVER_PICTURE_MAX` | 0.05 | the ID card and the photo are bare; a scan under a full OCR layer, in either order, is not |
| `SCAN_MIN_SHARE` | 0.5 | a full page image, a stencil scan and the stamped scans are `scanned`; the photo at a fifth of the page is not |
| `STAMP_MAX_CHARS` | 40 | a Bates number and "Signed John Smith" (15 readable characters) over a scan are stamps (`scanned`); a 45 character sentence over one, and each slide's title and bullets, are not |
| `UNREADABLE_RUN` | 3 | the unmapped and private use pages are `unreadable-text`; one unmapped bullet among typed text is nothing |
| `COVER_MIN_OVERLAP` | 0.8 | boxes drawn over whole lines cover; a strikethrough bar and an underline, each over a slice of the glyph, do not |
| `HIDDEN_CONTRAST_MAX` | 1.1 | white on white (1.0) is hidden; white on a dark box is not; pale spot colour text is not judged |
| `TINY_TEXT_MAX` | 1 pt | text half a point tall is hidden; the fixtures' ordinary body text and headings are not |

Slice 5's real scans may still move one; if they do, the measurement comes back here.

### Judgement calls accepted

None conflicts with the spec, so each is recorded as built:

- **The outcome card sits after the checklist**, in its own polite live region present from the moment a document is open, so the download warning it ends with is directly above Download (AC-22) and the outcome is still heard once. The region above keeps to the phase line and the opened document (spec 0003, AC-12).
- **Page lists use `Intl.ListFormat("en-GB")`**, which writes "Pages 1, 3 to 9 and 12" as the spec's own examples do; `"en"` would add a comma before "and".
- **The cancel browser test's document holds a typed sentence on every page.** Each of its pages was a large picture with fewer than 40 readable characters, which now reads as a stamped scan, and a document of nothing else is refused at open; the sentence keeps the run the test cancels, and the pictures are still named as bare.

## Evidence

### Text outside the crop box survives the write (measured 2026-09-28)

A one page PDF made with MuPDF.js 1.28.1: media box 612 by 792, crop box set to the top half (`[0 400 612 792]`), one line inside the crop box, one line inside the media box but below the crop box holding `hidden@example.com`, and one line below the media box.

| Read | Result |
|---|---|
| `page.getBounds()` | `[0, 0, 612, 392]` (the crop box, in page space) |
| default structured text (what detection reads) | `inside the crop box` only |
| `clip=no` | all three lines, `hidden@example.com` included |
| saved with the engine's `WRITE_OPTIONS` (`garbage=deduplicate,compress,sanitize`), reopened, `clip=no` | all three lines |

So detection never offers the off crop email, and the output still carries it. Nothing in the rebuild removes it: `PAGE_KEYS` keeps `/MediaBox`, `/CropBox` and `/Contents`, and `sanitize` filters resources, not position. The script lived in the session scratchpad and is not committed.

### MuPDF redacts outside the page (measured 2026-09-28)

The same page, with four more lines: one left of the page (x = -300), and three placed so their extracted quad (Helvetica 12 pt: 12.90 above the baseline, 3.59 below) ends 1.5, 0.5 and 0.1 pt inside the bottom crop edge, plus one straddling it. Four `Redact` annotations set with `setQuadPoints` covered everything outside `page.getBounds()` out to ±2000 pt, applied with `applyRedactions(false, REDACT_IMAGE_NONE, REDACT_LINE_ART_NONE, REDACT_TEXT_REMOVE)`.

| Read (`clip=no`) | Words |
|---|---|
| before | `inside well away offcrop hidden@example.com belowmedia leftofpage edge15 edge05 edge01 straddle` |
| after, same page object | `inside well away edge15 edge05 edge01` |
| after, page loaded afresh | the same |
| after the `sanitize` write, reopened | the same |

So MuPDF applies Redact areas that lie outside the crop box, below the media box and left of the page; a straddling line goes whole; and lines ending as little as 0.1 pt inside the edge are kept.

### No removal box past the extracted quad at the edges (measured 2026-09-28)

A crop box of PDF `[0 100 500 700]`, with lines whose extracted quad top sits 0.5 and 0.1 pt below the top edge, and single `W` glyphs whose extracted quad ends 0.5 and 0.1 pt left of the right edge, in Helvetica, Courier and Times at 12 pt (quads 12.90, 11.18 and 12.64 pt above the baseline). After the same four strips were applied, every one of those glyphs survived, in all three fonts. MuPDF's text removal box did not reach past the extracted quad at the top, bottom or right edge for these fonts; slice 4 pins it at 0 and 0.5 pt, with embedded Carlito added.
