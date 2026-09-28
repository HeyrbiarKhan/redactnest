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

The engineer chose to remove, not warn about, content outside the visible area, because it is never shown and has no reason to stay in a redacted file, and to prefer removing a straddling glyph over refusing, since cropped OCR scans are common. That puts the trim in the engine. Placing it beside `prepareDocument` on both copies, rather than as a fourth pass, keeps spec 0004's INV-9 (detection and redaction read the same page) and keeps the self check's record honest; making the trim prove itself on the spot covers the one thing a record taken after it cannot see, which is visible text the trim moved or lost.

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
- **Content outside the visible area is removed in every run**, straddling glyphs whole, with a note and the plain name (the engineer's own design, over the recommended warning).
- **Pictures across the edge are blanked within 1 pt, else kept and warned about.** Runner up: refuse the run.
- **Real scans are made locally** from a printed fixture and kept out of git. Runner up: a public domain scan.
- **No References section.**

## What the cross check changed (2026-09-28)

An independent read only review on another model found gaps a builder would have had to fill. The engineer took every recommended fix:

- The glyph box comes from the matched extracted character's quad, because MuPDF.js's `Font` gives no ascent or descent to a device callback.
- Device callback objects are freed in the callback (INV-10), verified in `dist/mupdf.js`: `Path`, `Text`, `StrokeState` and `ColorSpace` are wrapped with a kept reference, `Image` and `Shade` without one.
- The trim reads its own page (triggers from a `clip=no` read, placements from its own device pass), because spec 0004's image code reads clipped structured text and cannot see an image wholly outside the page; the self check's outside pixel rule gets its own setting, `IMAGE_CHECK_OPTIONS`.
- Both new self check rules are `redaction-incomplete` whatever is ticked. The reviewer called the off page character rule redundant; it is kept, because a trim that silently did nothing leaves the text in the record and the output alike, and only this rule sees it.
- `openDocumentWith` becomes async and cancellable, because it was synchronous with no cancel hook.
- Only glyphs centred inside the visible area are judged as covered or hidden; image footprints are cut to the clip in force; covers are axis aligned rectangles by a stated test; a plain group passes a cover through; colour is judged by colour space type with every paint counted; clip only text is hidden only when nothing fills it.
- `blank` ignores a white background rectangle (Word, Chrome); `scanned` with no text needs pictures over half the page; readable excludes control and private use characters; a stamp is under 40 readable characters, so a slide deck with full bleed photos opens as `bare-picture` instead of being refused.
- Invisible text with an image under or over it is machine read, whichever order the producer drew them in (ABBYY writes the text first).
- The trim proves text only at open; pixels are proved once, on the output. `edge-text` is kept for failures on lines crossing the edge, `unsupported` for the rest. Output size and peak memory of a cropped scan are measured at the cap.
- Spec 0004's INV-9 and INV-11 are reworded; INV-1 keeps its letter.

Two of the reviewer's concerns were measured rather than assumed; both results are below.

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
