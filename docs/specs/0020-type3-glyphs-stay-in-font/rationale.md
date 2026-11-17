# 0020. Type 3 glyphs stay inside their font: rationale

The decision record for [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

A Type 3 font is a font whose characters are small drawings written in the PDF itself: each character code maps, through the font's `/Encoding`, to a glyph procedure in `/CharProcs`, and the procedure uses the same drawing instructions a page does. It can draw paths, an inline picture, a form or picture named in a resource dictionary, a pattern, and even text in another font. Colour emoji saved from Chrome, the bitmap fonts of older LaTeX papers and matplotlib's charts all use them.

Nothing in RedactNest sees inside a glyph procedure. MuPDF's drawing callback and its structured text both hand over a Type 3 character as one glyph (measured 2026-11-17: the callback names the font `Type3 (7 0 R)` and gives the character code as the glyph, and never reports what the procedure draws). So detection never lists text drawn inside one, the passes never remove anything inside one, and the self check's character and pixel parts never read one. Spec 0019's resource use (the check that every resource entry is named by some drawing) counts a font's glyph procedures together, drawn or not, so whatever a glyph names is kept and passes.

That is a leak, not a gap that fails safe. MuPDF redacts a figure or picture into a new copy, which the page then draws; the original stays whenever something else still names it. Spec 0019 closed every other way an original could stay (an allowlist below the pages and a reachability check), and recorded this one in its Follow-up, measured on an undrawn glyph. Measured again today, a drawn glyph keeps it too, a picture's unblanked original stays the same way, and a string inside a glyph stays. Each breaks spec 0004's AC-4: a ticked value in a simple encoding must appear nowhere in the decompressed output.

The forces: the owner wants every page claim to hold in every case it covers (spec 0018, AC-5), so the security page's "or in a font character that no text shows" exists only because of this gap; warning and refusal rules lean toward saying too much rather than too little, but real files must keep their outcome where nothing leaks; the engine never edits a content stream (spec 0004, INV-13), and the one scan that reads drawing instructions answers nothing that changes what the rebuild keeps (spec 0019, INV-4); and no real document may be committed or read for a corpus, so how real producers write Type 3 fonts has to be measured from producers that can be driven locally.

## Options considered

### Option 1: Glyphs stay inside their font

Refuse a file when anything a Type 3 font's glyphs draw, drawn or not, shows text, or names a form, picture or tiling pattern that something outside every Type 3 font also reaches. Judged at open and in a run before any pass, from the role walk and the scan; the check holds the text part on the written bytes.

**Pros**:
- Closes all five measured paths: a shared figure through an undrawn, a drawn or an invisibly drawn glyph, a shared picture, and text inside a glyph.
- Chrome's emoji (each glyph names a form only its own font holds, and shares only a graphics state with the page) pass unchanged, measured, and so do glyphs that draw only paths or inline pictures, by the rule itself.
- Refuses only; nothing the rebuild keeps changes, so the gate's every other fixture keeps main's pixels.
- Reuses `unreadable-structure`, its words and its place in the open.

**Cons**:
- The sharing part cannot be seen on the written bytes, so it rests on the refusals before the passes, not on the self check.
- Needs two new walk outputs and a small closure over what glyphs name, about one file of new engine code.
- Can refuse a file where nothing would leak (an entry listed but never drawn).
- A font with no resources of its own, as matplotlib writes, passes only while the scan reads every glyph, since an unreadable one draws with the page's dictionary, which holds fonts.

### Option 2: No figures or text inside glyphs

Refuse any Type 3 font whose glyph procedures name any form or picture, or show text, with no sharing test.

**Pros**:
- The simplest rule to state, build and check, and the check could hold all of it on the written bytes.
- Closes every measured path.

**Cons**:
- Refuses every Chrome or Google Docs file holding a colour emoji, since Chrome draws each emoji glyph through a form in the font's resources (measured). Those files leak nothing today.

### Option 3: Count only drawn glyphs in resource use

Spec 0019's second option: resource use counts only the glyphs some character code in the file draws, and an entry only an undrawn glyph names fails the check.

**Pros**:
- Lives entirely in the self check, on the written bytes.
- Refuses nothing at open.

**Cons**:
- Leaves the drawn case open: a drawn glyph naming the shared form kept `SECRET-42` with the check passing (measured).
- Misses text inside a glyph and a shared picture named by a drawn glyph.
- Needs the drawn character codes per font, from a reader that can tell fonts apart.

### Option 4: Drop the glyphs no text draws

Spec 0019's first option: the rebuild deletes every glyph procedure no character code draws, so `sanitize` drops what only those named. MuPDF's own `subsetFonts()` was the hoped for way.

**Pros**:
- A removal, in the product's spirit, and it also narrows "fonts keep the shapes of removed characters" for Type 3 fonts.

**Cons**:
- Closes only the undrawn case; drawn glyphs and text inside them still leak.
- `subsetFonts()` leaves Type 3 fonts alone (measured), so the engine would decide drawn codes itself and delete keys on that answer, changing what the rebuild keeps from a reading.
- A wrong answer deletes a glyph a page draws, which the check would not notice, since it compares characters, not a glyph's drawing.

## Rationale

The leak is not about undrawn glyphs at all. Today's measurements turned spec 0019's framing over: a drawn glyph, an undrawn one and one drawn as invisible text all kept the original, because the cause is that a glyph names the same object a page draws, and MuPDF can only redact what it can see. That rules out Options 3 and 4 as fixes; each closes one of five paths. What is left is a rule about what a glyph may name and draw, and Options 1 and 2 are the two ways to state it.

Option 2 is the simpler of the two and the only one the check could hold in full, but it trades a leak nobody has seen in a real file for a refusal everybody would: every PDF saved from Chrome or Google Docs with a colour emoji names a form from a glyph. The sharing test is what lets those files through, and it is cheap, because a glyph's own figure is never redacted into a copy (a removed emoji character is removed whole), so nothing can be left behind unless something outside the font draws the same object. Counting drawings only (forms, pictures, tiling patterns) matters for the same reason: Chrome shares one graphics state object between the page and every emoji form, and a graphics state cannot hold an original copy.

The cost of Option 1 is that the self check, which spec 0019 made the gate for every structure rule, cannot see the sharing on the written bytes: by then the page names the redacted copy and only the glyph names the original, which looks exactly like an emoji's own figure. So the sharing part is judged on the bytes a run is about to redact, twice (at open, so the visitor learns before ticking, and again before the trim, as spec 0019 does for its own refusal), and the check holds the part the bytes can show: text below a glyph, which also catches the measured form holding `SECRET-42` once it is left below the glyph. A test pins the shared picture case with the run's judgement skipped, so the gap stays written down in code. The page's claim then rests on a refusal the engine makes on every such file, which spec 0018's AC-5 allows.

Smaller calls, each the engineer's pick on 2026-11-17: text inside a glyph is refused rather than warned about, since nothing can see it and no producer measured writes it; the refusal reuses `unreadable-structure`, whose words already say the file is built in a way RedactNest cannot check; the glyph side is judged by the names glyphs use, not the font's whole resource dictionary, because a font with no dictionary of its own draws with the page's, and any dictionary can hold entries no glyph uses; the other side is judged by the walk's keys, which needs no extra scan in the run and errs toward refusing; a glyph the scan cannot read counts as the worst it could do rather than refusing outright, so an odd inline picture in a bitmap glyph never refuses a paper; and subsetting Type 3 fonts waits for spec 0004's own subsetting revisit.

## Measurements

All on this branch (`feat/type3-glyph`, at eb557c5, the same engine as main's 832e6a7), 2026-11-17, in scratch tests through `redactDocumentWith` and `tests/support/mupdf.ts`, with documents written by `scripts/lib/pdf-writer.mjs` and made up content only. The probes are in the session scratchpad (`t3/t3.scratch.test.ts`, `picture.scratch.test.ts`, `emoji.scratch.test.ts`, `share.scratch.test.ts`, `form.scratch.test.ts`, `gs.scratch.test.ts`, `cross.scratch.test.ts`, `mpl.scratch.test.ts` and `mpl/chart.py`), which a reboot can clear; each document below is simple enough to rebuild from its description.

### A glyph naming the page's figure

One page draws Helvetica text, a form holding `SECRET-42` (ticked), and Type 3 text at 24 pt. The Type 3 font holds two glyphs, `ga` (a filled square) and `gb`, and its own resources name the page's form as `/Fm0`.

| Case | Glyph `gb` | Page's Type 3 text | Run | Output holds `SECRET-42` |
|---|---|---|---|---|
| Undrawn, colour glyph | `1000 0 d0 /Fm0 Do` | `(a) Tj` | made, check passed | yes |
| Drawn, colour glyph | `1000 0 d0 /Fm0 Do` | `(ab) Tj` | made, check passed | yes |
| Drawn, shape glyph | `1000 0 0 0 1000 1000 d1 /Fm0 Do` | `(ab) Tj` | made, check passed | yes |
| Drawn only as invisible text | `1000 0 d0 /Fm0 Do` | `(a) Tj 3 Tr (b) Tj` | made, check passed | yes |
| Text inside the glyph (resources `/F9` Helvetica, no form) | `1000 0 d0 BT /F9 1 Tf (SECRET-42) Tj ET` | `(a) Tj` | made, check passed | yes |
| Control | `1000 0 d0 0 0 10 10 re f` | `(a) Tj` | made, check passed | no |

Structured text of the source page read "Glyph probe line, SECRET-42, ab": one `SECRET-42`, from the page's own draw, never the one inside the glyph, so detection lists one target. The output's structured text read "Glyph probe line, ab" in every case, so the check's character part saw nothing to fail.

### A glyph naming the page's picture

One page draws a 680 by 80 image mask (all bits painting) under the Helvetica line "Sort code 40-11-22 used", with `40-11-22` ticked, beside a Type 3 font whose glyph `gb` is `1000 0 d0 /Im0 Do`, its own resources naming the same picture.

| Case | Run | Pictures in the output |
|---|---|---|
| `gb` undrawn | made, check passed | the blanked copy, and the original byte for byte |
| `gb` drawn | made, check passed | the blanked copy, and the original byte for byte |
| Control, `gb` draws a square | made, check passed | the blanked copy only |

### What MuPDF's readers see

A callback device on the drawn case received, in order: the Helvetica line, the form's `SECRET-42` (from the page's own `/Fm0 Do`), then one `fillText` of two glyphs, font `Type3 (7 0 R)`, glyphs 97 and 98, Unicode `a` and `b`. Nothing from inside `gb`. On the invisible case, glyph 98 arrived through `ignoreText`. So MuPDF names an unnamed Type 3 font after its object and gives the character code as the glyph, enough for a later subsetting feature, and never reports a glyph procedure's drawing.

`subsetFonts()` on the undrawn and drawn documents left `/CharProcs` holding `ga` and `gb`, before and after a `garbage=compact,sanitize` write, and the written file still held `SECRET-42`.

### What Chrome writes

Playwright's Chromium (1.63.0) printed a made up page with seven colour emoji to PDF. The page's fonts: one `Type0` text font and five `Type3` fonts. In each Type 3 font, glyph `g0` (the notdef box, never drawn here) is a `d1` path, and every emoji glyph is `2812 0 d0 1 0 0 1 0 0 cm /Xg… Do`, naming an entry in the font's own `/XObject` resources. Every such entry is a form (seven forms), and the page's own resources name no XObject at all. Two forms read in full draw paths filled through shading patterns (`/PatternType 2`) with one graphics state, `G3`, and hold no text and no picture. `G3` is the same object as the page's own `G3`, and it holds `<< /ca 1 /BM /Normal >>`, with no soft mask. The file opened and a run with `Jane Example` ticked made a file, `sanitized` `document-info`, on today's engine.

So under Option 1 nothing in it is shared (the forms are reached only through their fonts, and a graphics state does not count), and nothing shows text.

### What matplotlib writes

matplotlib 3.11.2 (`pdf.fonttype` 3, its default), installed in a scratch virtual environment, saved a made up line chart whose title reads "Quarterly totals for account 12345678", with a legend "Revenue → Jane Example", a mathtext axis label and a label holding `€`, `Ω` and `∑`. The page's fonts: three `Type3` fonts and nothing else; the page names no XObject. None of the three has a `/Resources` key, so each draws with the page's dictionary. Their 41 glyph procedures are all `d1` followed by path operators; the scan read every one to its end, named nothing in any of them, and found no text operator. Under the rule, nothing is on the glyph side but the procedures themselves, so the chart is clean.

On today's engine the chart opened, a run with nothing ticked made a file, and a run with `Jane` (in the legend) ticked made a file. A run with `12345678` (in the title) ticked refused with `redaction-incomplete`. That fails closed, is older than this spec, and has nothing to do with the glyph rule, which is not built yet; it is a Follow-up for `/debug`.

### A bitmap font with no resources

A page beside a Type 3 font with no `/Resources` key, whose two `d1` glyphs each draw an 8 by 8 inline image mask (`BI /IM true /W 8 /H 8 /BPC 1 /D [1 0] ID … EI`) with the data bytes `FF 45 49 20 54 6A 81 FF`, which hold `EI` and `Tj` on purpose, and a Helvetica line "Bitmap font sample 12345678". The scan read both glyphs to their end and named nothing; the file opened; a run with `12345678` ticked made a file and the output did not hold it.

### Strings in a glyph after the write

Four variants of an undrawn glyph beside a Helvetica line holding `SECRET-42`, ticked: `SECRET-42` in a comment (`% SECRET-42`), as the operand of an unknown operator (`(SECRET-42) Zz`), in an inline picture's dictionary (`/XX (SECRET-42)`), and in a marked content property list (`/Span << /Alt (SECRET-42) >> BDC … EMC`). Each run made a file. The first three outputs did not hold `SECRET-42`: the `sanitize` write rewrites every glyph procedure and drops them. The fourth held it, which is spec 0019's recorded limit for descriptions written inline (warned by `marked-descriptions`, its AC-9). So the four text operators are the only way a glyph keeps text through the write that this spec must catch.

### Annotations after the bake

A page with a visible stamp annotation whose normal appearance is a form (object 7), put through `prepareDocument`: the page's `/Annots` became empty and its resources gained `/XObject << /Annot6 7 0 R >>`, the same object, which a walk from the pages reaches. So a glyph naming an annotation's appearance names something on the other side, and AC-3 (b) refuses it.

### The fixtures and the gate

No committed fixture holds a Type 3 font (`grep -l Type3 tests/fixtures/*.pdf` found none), so the gate's existing rows cannot move.

### The cost of one more walk

Spec 0019 measured one read walk of a page drawing 10,000 forms at 250 ms against a 10,234 ms run, three walks at about 7%, and set AC-11's second budget at 15%. The run's walk before the passes adds about 2.5%; the glyph side is scanned only where a Type 3 font exists.

## What the cross check changed

A read only cross check on another model (2026-11-17) found the rule sound in outline and twelve gaps a build would have guessed at, plus five soundness points; the owner took every recommended fix, and three points were settled by measurement first (*What matplotlib writes*, *A bitmap font with no resources*, *Strings in a glyph after the write*, *Annotations after the bake*).

Two would have broken the build. The first draft had the walk visit an object again when it was first reached below a font and later outside, but a second visit mints a fresh id for every resource dictionary written in place (so `resourceUse` would meet an owner with no units and call every entry unused, a leak on clean files) and pushes null deletions twice (moving `strays`, which `allowlist.test.ts` pins). `outside` is now computed after the loop from recorded edges. And `judgeGlyphs` was given an optional cache of reads keyed by `PDFObject`, which never matches, since MuPDF.js hands out a new wrapper on every `get`; it now scans the glyph side itself.

Three closed paths the first draft missed: a glyph procedure that is also part of a page's `/Contents` (both in role `content`, so no role clash refused it), now caught by putting the glyph's own streams on the glyph side; a form with no resources of its own named from two dictionaries, now read once per stream and dictionary; and a picture's masks chaining past one level, now followed until nothing new is added.

The rest write down what the build would otherwise invent: the run walks from the pages as the open does, since a catalog walk refuses a page tree node with no `/Type`; a walk problem refuses at once, since its units are empty; `Drawer` gains a kind; a shading pattern is never classified, only followed through `/ExtGState /SMask /G`; `glyphRuleOf` is the seam's default; the check's call sits after resource use's leak and before `return use`; `showsText` lives in the scan's `Semantics` so a retry restores it; the gate reads `openKindNow` in all three places, with `NEEDLES` for the controls only; the fixtures keep the two suites that read every fixture; each fixture's exact objects; the change entry's date, since 2026-11-17 is taken; INV-5 reworded to name the one doubt that passes at open; and the Negative bullet about a write merging a form holding text, which cannot happen once such a file is refused before the write, deleted.

The cross check also offered judging the glyph side by keys (everything reached through a font) instead of by names. The owner had chosen names; with the fixes above, names stay sound, and they never refuse a font that lists a shared form it never draws.
