# 0022. Refuse an inline picture the write would lose

**Date**: 2026-11-22
**Status**: Accepted
**Updated**: 2026-11-22, as built, by `/architect`, wording only, no new decision (`rationale.md`, *What the build corrected in the text*): AC-1's case of `/ImageMask true` beside `/IM false` now says what task 8's second measurements showed. MuPDF draws neither the picture nor the rest of the stream only with short data, as task 8 first wrote it; with data that fills the picture, the write throws. It is lost either way, so the rule is unchanged, and AC-6's pin names both rows as built. AC-6 also records that the pin's and the ticked runs' documents write their indexed resources by full names (`[/Indexed /DeviceRGB ...]`), because the role walk refuses a resource written with the inline short forms.
**Updated**: 2026-11-22, by `/architect`, from task 8's measurements (`rationale.md`, *What task 8's measurements changed*): MuPDF 1.28.1 reads an inline picture's short key first, `/CS` before `/ColorSpace` and `/IM` before `/ImageMask`, in either order, the reverse of what AC-1 said. AC-1's rule, definitions and examples, AC-4's changed picture, AC-5's body (it drops "or changed", your call), AC-6's scan cases and pin, the value sourcing, task 8 and the consequences follow. The rule now refuses a device `/ColorSpace` beside a `/CS` that is neither a device space nor a name, which it let through, and stops refusing `/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside an indexed `/ColorSpace`, and `/ImageMask false` beside `/IM true`, which the write keeps. A second cross check then settled `null` and repeated keys, named a `/CS` name with no resource entry as the one under refusal (INV-4), narrowed what the check can see (AC-4, INV-3), and added the pin rows and ticked runs the build measures (AC-6).

## Summary

MuPDF 1.28.1, the engine RedactNest cleans with, cannot write back some inline pictures (small pictures stored inside a page's drawing instructions rather than as objects of their own). When such a picture's colours are described by anything other than a plain device colour space or a resource name written under `/CS`, the writer prints an empty colour space name, the picture stops drawing, and the check passes, because nothing was ticked there. From now on RedactNest refuses such a file at open with a new reason, `inline-picture`. A run asks the same question before it removes anything, and the self check fails any output that still loses one. Nothing in MuPDF.js offers a way round the write without RedactNest editing drawing instructions itself, which the engine never does, so until a MuPDF release writes these pictures, such a file cannot be redacted.

## Amends specs 0001, 0004, 0006, 0007, 0019 and 0021

Applied in place when this spec is built (task 11): each spec names spec 0022 in its `**Updated**` line, and each changed line carries an _Amended by spec 0022_ note.

| Spec | Section | Change |
|---|---|---|
| 0001 | The one named exception to "one PDF parser", as specs 0019 and 0020 amend it | `marked.ts` also answers whether an inline picture would be lost and which colour space names inline pictures write under `/CS`. It still edits nothing, and its answers only refuse or fail, never change what the rebuild keeps (AC-1). |
| 0004 | *State transitions* (the run's order), AC-13 (the self check's structure part), the `ENGINE_ERROR_KINDS` row | The inline picture rule runs after the glyph rule and before the trim (AC-3). The structure part fails an output that loses an inline picture, as `unsupported` (AC-4). `inline-picture` is appended last (AC-5). |
| 0006 | *State transitions* (the open's order), *Page findings* (what inspection keeps past a page) | The refusal comes after the glyph rule's and before the trim (AC-2). `losesPicture` is kept per page beside `emptyClip`, never a finding, and dropped with the review document (AC-2). |
| 0007 | AC-16 (words for every kind) | `inline-picture` takes its words from its kind alone (AC-5). |
| 0019 | *Scan rules* "Inline images", INV-4, *Resource use*, AC-5 (`StructureVerdict`'s order) | The scan reads the mask, both colour space keys and the name the writer will print (AC-1). Resource use answers `"lost-picture"`, ranked after `"unreadable"` and before `"unused-colour-space"`, so it never leads to a second write (AC-4). |
| 0021 | *Follow-up* | The lost inline picture item is designed here, and the owed test is AC-8 here. |

## Requirements

**User stories**:
- As a visitor, I want to hear before I review, not after I download, when a picture in my file would not survive cleaning, so I never keep a copy that quietly lacks part of what my file showed.
- As a visitor, I want a file whose pictures all come through to open and clean exactly as it does today.
- As the owner, I want the counts to show how often real files meet this refusal, so the rule can be weighed again with evidence when MuPDF changes.

**Acceptance criteria**:

- **AC-1**: **The rule, in the scan.** In `inlineImage` (`marked.ts`), once the dictionary is read to its `ID`, the picture counts as **lost** when any of these holds:
  - Its `/Filter` or `/F` names `/JPXDecode`, alone or in an array. MuPDF throws on an inline JPX picture through `pdf_is_jpx_image` (`/Filter` only), and a JPX filter under `/F` makes the write throw (measured), so neither is ever written. This holds for a mask too.
  - It is not a mask, and the colour space MuPDF loads for it is missing. MuPDF loads `/CS` when that key is present, else `/ColorSpace`.
  - It is not a mask, the loaded space is not a device space, and `/CS` does not hold a name that is not empty. The writer prints the value of `/CS` whenever `/CS` is a direct name, and the empty name otherwise (`parse_inline_image`). Since MuPDF loads `/CS` first, a name that is not empty under `/CS` is always the loaded space, so it is written under its own name, whatever `/ColorSpace` says. Any other loaded space that is not a device space is written under the empty name, or not written at all (AC-6's pin lists which).

  **The key order.** MuPDF reads both pairs through `pdf_dict_geta`, which in 1.28.1 looks the short name up first ("abbreviated names take precedence", as PDF 2.0 asks), and task 8 measured both pairs, each in both orders in the dictionary, to match (`rationale.md`). So `/ColorSpace` matters only when `/CS` is absent, and `/ImageMask` only when `/IM` is absent. The scan must not depend on which key comes first in the bytes. The pin holds this order (AC-6), so a release that changes it fails a test.

  The definitions it uses:
  - **A device space** is a name in `INLINE_DEVICE_SPACES`, or an array whose first item is such a name or `/CalCMYK`, of any length. MuPDF loads such an array as its device space and ignores the rest (`pdf_load_colorspace_imp`), and the writer then prints `/CS/G`, `/CS/RGB` or `/CS/CMYK`.
  - **A mask** is a picture where the value MuPDF reads for the mask is the keyword `true`. MuPDF reads `/IM` when that key is present, else `/ImageMask`.
  - Any present value that is not a device space counts as not one: an array of any other family (`[]` and `[/Pattern]` among them), a name other than a device name, a number, a string, a dictionary or `null`. Under `/CS`, a name that is not empty is still kept by the rule above. Any of the rest, as the loaded space, MuPDF either loads as a space the writer cannot print, or throws while loading, so the picture is never written.
  - **Present** means the key is written, whatever its value. So `/CS null` is a present `/CS` that is not a device space, and `/IM null` or `/IM 0` is a present `/IM` that is not `true`. MuPDF may read `null` as absent. If it does, `/CS null` beside a device `/ColorSpace`, and `/IM null` beside `/ImageMask true`, are refused although the write keeps them; if it does not, the scan matches it exactly. Either way this can only refuse more, never miss (INV-4), so it is not measured.
  - **A repeated key**: the last one written counts. The scan's `dictionaryOf` keeps the last, and MuPDF's dictionary is expected to as well, a later key replacing an earlier one. If MuPDF kept the first, `/CS [/I /RGB 3 <...>]` then `/CS /RGB` would be a miss, so the pin measures both orders (AC-6).

  So these count as lost:
  - `[/I /RGB 3 <...>]` and `[/Indexed /DeviceRGB 3 <...>]`, under `/CS`, or under `/ColorSpace` with no `/CS`.
  - `[/I /Cs1 1 <...>]`, which MuPDF never draws, though other readers do, and the write keeps nothing of it (spec 0021, AC-7).
  - Inline `/CalRGB`, `/Lab`, `/Separation` and `/DeviceN` arrays, on the same terms.
  - `/ColorSpace /Cs1` and `/ColorSpace 3`, each with no `/CS`.
  - `/CS [/I /RGB 3 <...>]` beside `/ColorSpace /DeviceRGB`, in either order: MuPDF loads the indexed `/CS` and writes the empty name, whatever `/ColorSpace` says. The first version of this rule let it through, and on a page with a target the check cannot see it (AC-4).
  - A picture that is not a mask and has no colour space at all, `/ImageMask true` beside `/IM false` among them, in either order (`/IM` says it is not a mask). When its data fills the picture, MuPDF draws it as gray in the source and the writer throws (measured). With short data, as task 8 first wrote `/ImageMask true` beside `/IM false` (two bytes at 8 bits, half what a 2 by 2 picture holds), MuPDF reads past `EI` and draws neither the picture nor the rest of the stream, in the source or the output (measured). It is lost either way.
  - An inline JPX picture.
  - `/CS/`, the empty name, which is what MuPDF writes for a lost one, alone or beside a device `/ColorSpace` in either order: MuPDF loads the empty name from `/CS` and cannot.

  These never count:
  - a mask with no JPX filter, read from `/IM` first, so `/ImageMask false` beside `/IM true` is a mask;
  - `/CS` holding any name that is not empty (device or resource), whatever `/ColorSpace` says: `/CS /Cs1` alone, beside `/ColorSpace /Cs1` or beside `/ColorSpace /Cs2`; `/CS /RGB` beside `/ColorSpace [/I /RGB 3 <...>]`; and `/CS /G` beside `/ColorSpace /Cs1`;
  - `[/DeviceRGB]`, `[/RGB]` and `[/CalCMYK << >>]` under `/CS`, or under `/ColorSpace` with no `/CS`;
  - `/ColorSpace /DeviceRGB` with no `/CS`.

  A few rare pictures count as lost although MuPDF's write keeps them, because the scan does not look a resource up or follow the drawing state:
  - a `/ColorSpace` name, with no `/CS`, whose resource holds a device space;
  - `/ColorSpace /Pattern` with no `/CS`, which MuPDF loads as gray and writes as `/CS/G` (measured);
  - a picture under a clip with no area, which the filter drops in the source's drawing and the output alike.

  Each refuses rather than passes (INV-4).

  One case the scan keeps although the write drops it: a `/CS` name that is not a device name and has no entry in the drawing's `/ColorSpace` resources, for example `/CS /Cs9` with no `/Cs9`. MuPDF cannot load it, so it draws nothing for it in the source, and the write leaves no `BI` (by the source; the pin measures it, AC-6). The scan does not look resources up, and the name points at nothing, so the copy shows what MuPDF showed of the source. This is the rule's one under refusal (INV-4).

  The lexer change: `Value` gains `{ is: "true" }`, made only inside `inlineImage` for the keyword `true`, so the mask test can read it. `scanContent`'s operands and property lists keep reading `true`, `false` and `null` as scalars, unchanged.

  `DrawingRead` gains two fields:
  - `losesPicture`: true when any inline picture in the drawing counts.
  - `inlineSpaces`: every name that is not empty and not in `INLINE_DEVICE_SPACES` that an inline picture's `/CS` holds directly. These are the names the writer prints as `/CS/Name`, and the check's missing entry arm reads them (AC-4).

  Both live in the scan's `Semantics` and are copied by `copy()`, so a retry past a false `EI` forgets a picture read from another picture's data (spec 0020's lesson with `showsText`). `readDrawing` ORs `losesPicture` and joins `inlineSpaces` across the parts it reads apart. A drawing the scan answers `"unsure"` has no reading here; it keeps its `marked-descriptions` warning and is not refused by this rule (your call).

- **AC-2**: **The open refuses.**
  - `inspectPages` answers, for each page, `losesPicture`: true when any drawing the open's role walk names for that page has `losesPicture`. That covers the page's contents and every form, tiling pattern and Type 3 glyph procedure it draws.
  - `describesAnything` stops at its first hit (`some`), so it is replaced by one full pass over the page's drawings, `readPageDrawings`, which answers `{ describes, losesPicture }`. It reads every drawing once. An `"unsure"` drawing sets `describes` (today's warning) and adds no lost picture, and the pass carries on to the rest.
  - `inspectOne` attaches `losesPicture` to the `PageInspection` it returns, beside the `marked-descriptions` branch. It is a field beside `emptyClip`, never a page finding, and it is dropped with the review document.
  - In `open.ts`, after the glyph rule's refusal and before the trim, `inspections.some(({ losesPicture }) => losesPicture)` throws `EngineFailure("inline-picture")`. It is the last of the open's refusals, so a file refused today keeps its kind and its advice. It names no page.
  - Each of AC-6's four fixtures is refused here, before a review exists. No session exists for a refused file.

- **AC-3**: **The run refuses before anything is removed.**
  - A new `src/engine/inline.ts` holds two functions. `judgeInlinePictures(walk)` is pure: it takes a role walk, as `judgeGlyphs` does, and answers `"lost"` when the scan finds `losesPicture` on any drawing unit in `walk.pages`, else `"kept"`. `inlineRuleOf(doc)` is the seam default: a read walk from the pages (`walkRoles(doc, "read", "pages")`), `"problem"` when the walk names one, else `judgeInlinePictures(walk)`. `InlineVerdict` is `"kept" | "lost"`. Taking a walk keeps a later shared walk a drop in (below).
  - `Pipeline` gains `judgeInlinePictures: (pdf: PDFDocument) => InlineVerdict | "problem"`, with `inlineRuleOf` as its default in `PIPELINE`.
  - In `redact.ts` the step runs right after the glyph rule's refusal and its `await checkpoint()`, and is followed by one of its own, so a cancel during the scan is heard before the trim:
    - `"lost"` is `inline-picture`.
    - `"problem"` is `unreadable-structure`, which the glyph rule's own walk answers first on the same document, so it is reached only through a swapped seam.
    - A throw is `unsupported`, as a throw while the open reads a page is.
  - So a run handed such bytes directly, with no open, refuses before any pass. The worker only ever runs the default.
  - Cost: one more read walk and one scan of every drawing per run. Both spec 0019 budgets and spec 0006's open budget in `tests/unit/cost.test.ts` must pass with their thresholds unchanged. If one fails, the build shares one walk between the glyph rule and this rule (the `judgeGlyphs` seam then takes the walk, a reviewed change), never a looser budget.

- **AC-4**: **The check's backstop.**
  - In `resourceUse` (`self-check.ts`), an owner loses a picture when a read of any of its drawings has `losesPicture`, or holds a name in `inlineSpaces` that is not a key of the owner's `/ColorSpace` dictionary.
  - `resourceUse` sees only drawings that have a resource dictionary, because `ownersOf` (`allowlist.ts`) makes no owner for a page or drawer with none. So `structureIsClean` also reads every unit in `walk.pages` whose `resources` is null, and only those, so nothing is read twice. Such a drawing loses a picture when its read has `losesPicture` or any name in `inlineSpaces`, since it has no entry to name. An `"unsure"` read there makes the answer `"unreadable"`, as it does in an owner.
  - `StructureVerdict` gains `"lost-picture"`. `resourceUse` answers `"leak"` first as today, then `"unreadable"`, then `"lost-picture"`, then `"unused-colour-space"`, then `"clean"`.
  - `checkOutput` treats `"lost-picture"` as it treats `"unreadable"`: every page is still compared, a leak a page finds outranks it (`redaction-incomplete`), and otherwise the run fails with `unsupported`. The kind is `unsupported`, not `inline-picture`, because the check only meets this when the scan of the source missed, so it cannot say why.
  - `"lost-picture"` never answers `"rewrite"`. A second write is a second filter pass, which drops a `/CS/` picture whole, and the check could then no longer see the loss.
  - On MuPDF 1.28.1 the output shows the loss as `/CS/` only on a page with nothing ticked. On a page with a target, the redaction pass and the write are two filter passes, so the picture leaves whole and nothing in the bytes shows it (measured, `rationale.md`). There the open's and the run's refusals hold the rule alone, and a test pins that limit (AC-6).
  - Some lost pictures leave no trace even on a page with nothing ticked: the first write drops the rows AC-6's pin lists under *No `BI` left* whole, and MuPDF draws none of them in the source either. A row under *The write throws* makes no file at all. For these the check has nothing to find, and only the refusals hold them.

- **AC-5**: **The kind and its words.**
  - `inline-picture` is appended last to `ENGINE_ERROR_KINDS` in `src/worker/protocol.ts`, with a comment naming this spec.
  - `FAILURE_TEXT["inline-picture"]` in `src/lib/flow-text.ts`, from the kind alone:
    - title "A picture in this PDF can't come through cleanly"
    - body "One of its pictures stores its colours in a way RedactNest's cleaning can't write back, so it stopped rather than hand back a copy with that picture missing, and made no file." Every picture the rule counts would go missing; none is written changed, since MuPDF loads and prints the same `/CS` (AC-1). The first draft said "missing or changed" (your call, 2026-11-22).
    - next `NEW_COPY` ("Printing it to a new PDF from your PDF app, then opening that copy here, may help."), unchanged
  - The next step suggests and never promises (your call): nothing has measured whether printing gives a file this rule accepts. A comment above the entry says so.
  - The same words serve the open and a run. Telemetry counts the kind through the failure event's existing `kind: EngineErrorKind` field, with no change in `src/telemetry` (spec 0016).
  - No word changes on `/`, `/security`, `/privacy` or `/terms`. The security page's open refusal line already says "among others" (your call).

- **AC-6**: **The cases fail first.**
  - Four committed fixtures, written by `scripts/make-fixture.mjs` through a new `scripts/lib/inline-fixtures.mjs` (never by MuPDF). Each is one page of 612 by 792 points with one line of Helvetica at 72, 700, size 18, so the page reads and no earlier refusal takes it. The picture is a 2 by 2 inline picture, `/BPC 8`, `/CS [/I /RGB 3 <FF0000 00FF00 0000FF FFFF00>]`, indexes 0 to 3, drawn 100 points square at 72, 500.
    - `inline-indexed.pdf`: the picture is in the page's contents.
    - `inline-indexed-form.pdf`: the picture is in a form XObject the page draws once.
    - `inline-indexed-pattern.pdf`: the picture is in a tiling pattern whose cell is the picture, painting a 100 point square.
    - `inline-indexed-glyph.pdf`: the picture is in a coloured (`d0`) Type 3 glyph, built as follows.
      - The font: `/FontMatrix [0.001 0 0 0.001 0 0]`, `/FontBBox [0 0 1000 1000]`, one glyph `/pic` at code 65 (`/Encoding << /Differences [65 /pic] >>`, `/FirstChar 65`, `/LastChar 65`, `/Widths [1000]`), and no ToUnicode.
      - The glyph procedure: `1000 0 d0 q 1000 0 0 1000 0 0 cm BI ... EI Q`.
      - The page shows it once, in a text object of its own at 72, 500, size 100, so the glyph is the 100 point picture, alone on its line, and `detection.test.ts`'s off line rule holds.
      - It shows no text and shares nothing, so spec 0020's glyph rule judges it clean.
      - Task 7 first opens it on today's code and records that no earlier refusal takes it and what extraction reads. If something earlier refuses it, the build changes the recipe, never the rule.
  - Each is refused at open with `inline-picture`. Today each opens, so each test fails first.
  - Before writing the rule, the build measures each fixture on today's code, nothing ticked: does the source draw the picture, and does the output still draw it, with its inline dictionary as written? It records the answers in `rationale.md`. The rule applies in all four places whatever the answer (your call). A place where the write keeps the picture goes to the Follow-up below, never to a narrower rule in the build.
  - All four join the gate (spec 0019, AC-7): each goes in `MAIN_FIXTURES` in sorted order, and in `OPEN_NOW` as `inline-picture`, with the header comment updated. A fixture in `OPEN_NOW` runs no further gate test (`openKindNow`), so no main run or `sanitized` row is read for it, and it has no `NEEDLES` row (the gate forbids a ticked set for a fixture refused at open). `MAIN` does not swap `judgeInlinePictures`: no gated fixture that runs holds a picture this rule counts.
  - `marked.test.ts`'s walk over every committed fixture treats a refused open as nothing to read, so it skips these four. Their scan is held by the cases on bytes below.
  - Scan cases in `marked.test.ts`, on bytes: every case AC-1 lists, both ways, and every case with two keys in both orders, so the scan cannot lean on which key comes first. That includes:
    - `/ImageMask false` beside `/IM true` with no colour space (kept: MuPDF reads `/IM`), `/ImageMask true` beside `/IM false` with no colour space (lost), and `/IM true` beside an indexed array (kept);
    - a mask with `/Filter /JPXDecode` (lost), and `/F [/AHx /JPXDecode]` (lost);
    - `/CS [/I /RGB 3 <...>]` beside `/ColorSpace /DeviceRGB` (lost, the case the first rule let through), and `/CS /RGB` beside `/ColorSpace [/I /RGB 3 <...>]` (kept);
    - `/CS /Cs1` beside `/ColorSpace /Cs1` (kept), beside `/ColorSpace /Cs2` (kept), and `/CS /G` beside `/ColorSpace /Cs1` (kept);
    - `[/RGB]`, `[/DeviceRGB 7]` and `[/CalCMYK << >>]` (kept), and `/ColorSpace 3` (lost);
    - `/CS/` beside `/ColorSpace /DeviceRGB` (lost), and `/CS [/RGB]` beside `/ColorSpace [/I /RGB 3 <...>]` (kept);
    - `/CS []` and `/CS [/Pattern]` (lost);
    - `/IM 0` beside `/ImageMask true`, with `/CS /RGB` (kept, as a device picture) and with no colour space (lost);
    - `/CS null` beside `/ColorSpace /DeviceRGB` (lost), and `/IM null` beside `/ImageMask true` with no colour space (lost);
    - a repeated `/CS`: `/CS /RGB` then `/CS [/I /RGB 3 <...>]` (lost), and the reverse (kept);
    - `/CS /Cs9` alone (kept: the scan looks no resource up).
  - `inlineSpaces` holds `Cs1` for `/CS /Cs1`, whatever `/ColorSpace` says, and nothing for `/CS /RGB` or `/CS/`.
  - A false `EI` inside one picture's data, followed by bytes that read as a lost picture's dictionary and then the real end, gives `losesPicture` false.
  - The lost cases fail first.
  - The run, in a new `tests/unit/redaction-inline.test.ts`:
    - `redactDocumentWith` handed `inline-indexed.pdf`'s bytes with nothing ticked refuses with `inline-picture`, and a counting text pass is never called.
    - A `judgeInlinePictures` that throws gives `unsupported`, and one answering `"problem"` gives `unreadable-structure`.
    - The three spellings this rule stopped refusing, on a page with a target: on documents like the pin's (their indexed resources written by full names, as the pin's are, below), holding `/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside `/ColorSpace [/I /RGB 3 <...>]`, or `/ImageMask false` beside `/IM true`, a run with a text line ticked away from the picture makes a file that passes the check and still draws the picture as the source does, read with `tests/support/mupdf.ts`. That measures that two filter passes keep what one pass keeps. If one does not, the build stops and takes it to `/architect`.
  - The backstop, with `judgeInlinePictures` swapped for one answering `"kept"`:
    - `inline-indexed.pdf` with nothing ticked fails with `unsupported` and makes no file. Today it makes a file with the picture gone, so this fails first.
    - With its text line ticked, it makes a file that passes the check and draws no picture, which the test reads with `tests/support/mupdf.ts`. That pins AC-4's limit and why the refusals exist.
    - `structureIsClean` on bytes built in the test answers `"lost-picture"` for an inline `/CS/`, and for `/CS /Cs9` with no `/Cs9` entry; it answers `"clean"` for `/CS /Cs1` with its entry. It also answers `"lost-picture"` for a `/CS/` in the contents of a page with no `/Resources` at all, and for `/CS /Cs1` there, which `resourceUse` alone never reads.
    - With an unused colour space entry beside a `/CS/`, it answers `"lost-picture"`, and `checkOutput` never calls `rewrite` (a counting `rewrite`).
  - The MuPDF pin, on documents built in the test as task 8 built them (`rationale.md`, *Task 8's measurements*: a Helvetica line before and after one 2 by 2 picture, `/Cs1`, `/Cs2` and `/Cs3` in the resources), with one change: `/Cs1` and `/Cs2` take their full names, `[/Indexed /DeviceRGB 3 <...>]`, where task 8 wrote the inline short forms, `[/I /RGB 3 <...>]`. The role walk reads a colour space family only by its full name (the format allows the short forms only in an inline picture), so it refuses a resource written that way as a shape, and an open or a run on such a document stops with `unreadable-structure` before the inline picture rule asks. MuPDF alone accepts either spelling, and both name the same spaces. MuPDF 1.28.1 opens each case and saves it with `WRITE_OPTIONS`, and the test holds what the write did, row by row:
    - **Written as `/CS/`** (lost): `[/I /RGB 3 <...>]` and `[/Indexed /DeviceRGB 3 <...>]`; the inline CalRGB, Lab, Separation and DeviceN arrays; `/ColorSpace /Cs1`, with its entry dropped; and `/CS [/I /RGB 3 <...>]` beside `/ColorSpace /DeviceRGB`.
    - **No `BI` left, the text after it kept** (lost): `[/I /Cs3 1 <...>]`, `/CS/`, `/ColorSpace 3`, and `/Filter /JPXDecode` or `[/JPXDecode]`, a mask too.
    - **No `BI` left and the text after it dropped** (lost): `/ImageMask true` beside `/IM false`, with no colour space and task 8's short data (two bytes at 8 bits), so MuPDF reads past `EI`. Each order, named as short data in the test.
    - **The write throws** (lost): no colour space and not a mask; `/ImageMask true` beside `/IM false` with data that fills the picture, each order; `/F /JPXDecode`; and `/F [/AHx /JPXDecode]`.
    - **Kept, written as**: `/CS/RGB`, `/CS/G` and `/CS/CMYK` for the device names; `/CS/RGB` for `[/DeviceRGB]`, `[/RGB]` and `[/DeviceRGB 7]` under `/CS`, and for `/ColorSpace /DeviceRGB` and `/ColorSpace [/RGB]`; `/CS/CMYK` for `[/CalCMYK << >>]`; `/CS/Cs1` with its entry for `/CS /Cs1` alone, beside `/ColorSpace /Cs1` and beside `/ColorSpace /Cs2`; `/CS/Cs2` with its entry for `/CS /Cs2` beside an indexed `/ColorSpace`; `/CS/RGB` for `/CS /RGB` beside an indexed `/ColorSpace`; `/CS/G` for `/CS /G` beside `/ColorSpace /Cs1`; `/IM true` for `/IM true`, alone or beside an indexed `/CS`, and for `/ImageMask false` beside `/IM true`; and `/CS/G` for `/ColorSpace /Pattern`, which the rule refuses (AC-1's rare cases), so the pin shows that over refusal too.
    - **Measured in the build, then pinned** (not in task 8's tables): `/CS /Cs9` with no `/Cs9` entry (expected: no `BI`, the text after it kept); `/CS/` beside `/ColorSpace /DeviceRGB`, in both orders (expected: no `BI`, as `/CS/` alone); and a repeated `/CS`, `/CS /RGB` then `/CS [/I /RGB 3 <...>]` and the reverse (expected: the last one counts, so `/CS/` and `/CS/RGB`). The build records each in `rationale.md`. A row that differs from its expectation goes to `/architect` before it is pinned.
    - Every case with two keys runs in both orders. Those rows are the key order's tripwire: a release that reads the long key first fails them, and AC-1 then goes back to `/architect`.
    - The indexed case over a device base is the upgrade tripwire: a release carrying upstream's a9e17fa86c writes `/CS[/I/RGB ...]`, fails the pin, and the rule then narrows by a reviewed change (Follow-up).

- **AC-7**: **Nothing else changes.**
  - Every committed fixture keeps the open and run outcome, `removedByType`, `sanitized` and pixels the gate holds, except the four new ones in `OPEN_NOW`. No committed fixture holds an inline picture this rule counts: their inline pictures are `/CS /G`, `/IM true` and `/CS /CS0`.
  - No committed fixture newly warns with `marked-descriptions`.
  - Existing tests that run a run on a picture this rule counts swap `judgeInlinePictures` for one answering `"kept"`, since they pin MuPDF's behaviour, not the rule. Today that is the named indexed base pin in `redaction-kept.test.ts` (*MuPDF and an inline picture over a named indexed base*, its `redactDocumentWith` on `[/I /Cs1 ...]`). The build searches the tests for any other.
  - Both spec 0019 budgets and spec 0006's open budget pass, thresholds unchanged (AC-3).
  - No word changes anywhere but the new kind's words.

- **AC-8**: **Spec 0021's owed test.** This build writes it, as feature 30's row asks; it is a test only, with no code change. `checkOutput` runs on bytes built in the test, with a structure check that answers clean. `/Ordering <FEFF00650E>` with any text ticked fails with `redaction-incomplete`, and with nothing ticked it passes. It pins spec 0021's AC-4 as built: a string place the check cannot decode fails it whenever anything is ticked.

## Decision

**Chosen option**: Option 1, refuse: one scan rule decides, the open and the run refuse with a new kind, and the self check fails what slips past.

Refuse at open, and again in a run before anything is removed, any file with an inline picture that MuPDF 1.28.1's write would lose, judged by the exact rule its loader and writer follow, short key first. The self check fails an output that still holds one, as `unsupported`. Runner up: a page warning that lets the run make a file without the picture, which keeps such files usable but hands back a copy missing content nobody ticked.

## Rationale

The reasoning, the options, every per point runner up, MuPDF's source lines and the measurements are in [rationale.md](rationale.md).

## Feature design

**Where the code lives**:

| File | What changes |
|---|---|
| `src/engine/marked.ts` | `Value` gains `{ is: "true" }`, made only in `inlineImage`. `inlineImage` reads the mask, the JPX filter, both keys (the short one first) and the printed name, and answers whether the picture counts (AC-1). `Semantics` gains `losesPicture` and `inlineSpaces`, copied by `copy()`. `DrawingRead` gains both, and `readDrawing` joins them. The header's list of outputs adds them. |
| `src/engine/inline.ts` (new) | `InlineVerdict`, the pure `judgeInlinePictures(walk)` and the seam default `inlineRuleOf(doc)` (AC-3). It is mapped in `index.ts`'s header. |
| `src/engine/inspect.ts` | `readPageDrawings` replaces `describesAnything`, one full pass answering `describes` and `losesPicture`; `PageInspection.losesPicture`, attached in `inspectOne` (AC-2). |
| `src/engine/open.ts` | The refusal after the glyph rule's, before the trim (AC-2). |
| `src/engine/redact.ts` | `Pipeline.judgeInlinePictures`, its default in `PIPELINE`, and the step after `refuseBrokenGlyphs`, followed by a checkpoint (AC-3). |
| `src/engine/self-check.ts` | `StructureVerdict`'s `"lost-picture"`, its arm in `resourceUse`, the read of `walk.pages` units with no resources in `structureIsClean`, and its handling in `checkOutput` (AC-4). |
| `src/worker/protocol.ts`, `src/lib/flow-text.ts` | The kind and its words (AC-5). |
| `scripts/lib/inline-fixtures.mjs` (new), `scripts/make-fixture.mjs` | The four fixtures (AC-6). The glyph fixture reuses the Type 3 recipe in `glyph-fixtures.mjs` where it can. |
| `tests/support/redaction-gate.ts` | The four rows and `OPEN_NOW` (AC-6, AC-7). |
| `tests/unit/marked.test.ts`, `redaction-inline.test.ts` (new), `protocol.test.ts`, `flow-text.test.ts`, `redaction-kept.test.ts` | The cases under *Critical test scenarios*. In `redaction-kept.test.ts`, the named indexed base pin swaps `judgeInlinePictures` (AC-7), and spec 0021's owed test (AC-8). |

**State transitions**:
- The open: door, open, password, page cap, layers, prepare, role walk, inspect, `no-readable-text`, the empty clip, the role walk's refusal, the glyph rule's refusal, **the inline picture refusal**, trim.
- The run: inventory, prepare, the glyph rule, **the inline picture rule**, trim, then as today.
- In the check: the structure part's verdicts rank leak, unreadable, **lost picture**, unused colour space, clean. A lost picture is never offered the second write.

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| scan | whether a picture is a mask | `/IM` when present, else `/ImageMask`, read as the keyword `true` |
| scan | whether a picture is JPX | `/Filter` or `/F` naming `/JPXDecode`, alone or in an array |
| scan | the space MuPDF loads | `/CS` when present, else `/ColorSpace` |
| scan | the name the writer prints | `/CS` whenever it is a direct name, else the empty name; so a name that is not empty under `/CS` always names the loaded space |
| scan | what a device space is | a name in `INLINE_DEVICE_SPACES`, or an array whose first item is such a name or `/CalCMYK` |
| open | whether a page loses a picture | `losesPicture` over the page's drawings in `roles.pages`, from `readPageDrawings`' one pass |
| run | whether the working copy loses a picture | `Pipeline.judgeInlinePictures`, by default `inlineRuleOf`: a read walk from the pages, then `judgeInlinePictures(walk)` over every unit |
| check | whether the output loses a picture | `resourceUse`: `losesPicture`, or an `inlineSpaces` name missing from its owner's `/ColorSpace`; and each `walk.pages` unit with no resources: `losesPicture`, or any `inlineSpaces` name |
| open, run | the refusal | `inline-picture` |
| check | the failure | `unsupported`, unless a page finds a leak (`redaction-incomplete`) |
| `/tool` | the refusal's words | `FAILURE_TEXT["inline-picture"]`, from the kind alone |
| telemetry | the count | the failure event's existing `kind` field |

**Key invariants**:
- **INV-1**: One rule decides for the open, the run and the check: the `losesPicture` reading in `marked.ts`, the one named place that reads drawing instructions (spec 0001, as specs 0019 and 0020 amend it). So the open, the run and the check never disagree on a source, and the rule refuses or fails, never edits.
- **INV-2**: The engine never edits a content stream or rewrites a picture to get round MuPDF's write (spec 0004, INV-13). What the write cannot carry is refused.
- **INV-3**: No inline picture leaves the file through this write with the check passing, apart from a `/CS` name with no resource entry (INV-4). It is refused at open, or refused in a run before anything is removed. The check is a backstop only where the output still shows the loss (`/CS/`, or a `/CS` name with no entry), on a page with nothing ticked. On a page with a target, and for a picture the first write drops whole, only the two refusals hold it (AC-4).
- **INV-4**: The rule leans to refusing. A mask with no JPX filter is the only inline picture with no colour space it lets through. A spelling it cannot prove the writer keeps counts as lost, including a resource it does not look up, a drawing state it does not follow and a key whose value is `null`. Two exceptions: a drawing the scan cannot read, which keeps today's warning (your call); and a `/CS` name with no resource entry, whose colours the file never defines and which MuPDF draws nothing for in the source, so the scan keeps it although the write drops it (AC-1).
- **INV-5**: The refusal carries its kind and nothing else: no page, no picture, nothing from the document (spec 0004's failure rule).

**Security model**: no new authorisation; the tool stays anonymous. Nothing new crosses the worker boundary but a kind. `PageInspection.losesPicture` is a flag, dropped with the review document like `emptyClip`. Telemetry gains a count of one more kind, from a closed list, with no catalog or privacy policy change (spec 0016). `/tool`'s content security policy is unchanged.

**Configuration required**: none.

**Critical test scenarios**:
- The scan, on bytes: every lost and kept case in AC-1, each case with two keys in both orders, the two mask cases, `inlineSpaces`, and the retry case. The lost cases fail first, the case the first rule let through among them. Verifies **AC-1**.
- The four fixtures, each refused at open with `inline-picture` and failing first, with each place's measurement recorded. Verifies **AC-2**, **AC-6**.
- A run handed `inline-indexed.pdf`'s bytes refuses with `inline-picture` before any pass. The seam's throw gives `unsupported`, and its `"problem"` gives `unreadable-structure`. The three spellings the corrected rule keeps, run with a text line ticked, still draw their picture. Verifies **AC-3**, **AC-4**.
- With the run's rule skipped: nothing ticked fails with `unsupported` (fails first); the line ticked makes a file with no picture (the limit's pin). `structureIsClean` on `/CS/` and on a missing entry; a lost picture beside an unused entry never calls `rewrite`. Verifies **AC-4**.
- `ENGINE_ERROR_KINDS` ends with `inline-picture`, and its words read as AC-5 gives them, at open and as a run's refusal. Verifies **AC-5**.
- The MuPDF pin on the measured table, row by row, with the two key rows as the key order's tripwire and the indexed device base case as the upgrade tripwire. Verifies **AC-1**, **AC-6**.
- The gate with the four rows in `OPEN_NOW`, `cost.test.ts` run alone with its budgets unchanged, lint, typecheck, and the page tests unchanged. Verifies **AC-7**.
- `/Ordering <FEFF00650E>` through `checkOutput`. Verifies **AC-8**.

## Build plan

Skateboard, as the scope asks. The page contents case goes first as a thin whole (its fixture failing, the kind and its words, the scan rule, the open's refusal). Then the run's refusal and the check's backstop grow around it, then the other three places, the pin and the gate.

1. [x] Add `scripts/lib/inline-fixtures.mjs` with `inline-indexed.pdf` and wire it into `make-fixture.mjs`. Measure it on today's code with nothing ticked and record the result in `rationale.md`. Write its open test expecting `inline-picture` and watch it fail. Satisfies **AC-6**.
2. [x] Append `inline-picture` to `ENGINE_ERROR_KINDS`, add its words to `FAILURE_TEXT`, and update `protocol.test.ts`, `flow-text.test.ts` and any component test that walks the kinds. Satisfies **AC-5**.
3. [x] In `marked.ts`, add `{ is: "true" }` inside `inlineImage`, give `inlineImage` the rule, and add `losesPicture` and `inlineSpaces` to `Semantics`, `copy()` and `DrawingRead`. Write the scan cases in `marked.test.ts`, the lost ones failing first. Satisfies **AC-1**. (Built to the first key order, long key first; task 8 corrects it.)
4. [x] Replace `describesAnything` with `readPageDrawings`, attach `PageInspection.losesPicture` in `inspectOne`, and add the refusal in `open.ts` after the glyph rule's. `inline-indexed.pdf`'s open test passes, and `marked-descriptions.pdf` warns as before. Satisfies **AC-2**.
5. [x] Add `src/engine/inline.ts`, `Pipeline.judgeInlinePictures` with its default, and the step after `refuseBrokenGlyphs` with its checkpoint, with the run cases in `redaction-inline.test.ts`. Swap the seam in the named indexed base pin and any other run on a counted picture. Satisfies **AC-3**, **AC-7**.
6. [x] Add `"lost-picture"` to `StructureVerdict`, its arm in `resourceUse`, the read of resourceless units in `structureIsClean`, and its handling in `checkOutput`. Add the backstop cases (the nothing ticked run failing first, the ticked limit pinned), the `structureIsClean` cases (a page with no `/Resources` among them) and the `rewrite` case. Satisfies **AC-4**.
7. [x] Add `inline-indexed-form.pdf`, `inline-indexed-pattern.pdf` and `inline-indexed-glyph.pdf`. Measure each place on today's code and record it in `rationale.md`. Write their open tests, failing first, then passing. Satisfies **AC-2**, **AC-6**.
8. [x] Correct the scan to AC-1's key order, then write the pin. The measurements are done (`rationale.md`, *Task 8's measurements*).
   - In `losesPicture` (`marked.ts`), read the mask from `/IM` first and the loaded space from `/CS` first, and keep a picture that is not a mask when the loaded space is a device space or `/CS` is a name that is not empty. Update its comment, and every comment and test title that says "lose or change", to say "lose".
   - In `marked.test.ts`, move `/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside an indexed `/ColorSpace` and `/ImageMask false` beside `/IM true` to the kept list, and `/CS [/I /RGB 3 <...>]` beside `/ColorSpace /DeviceRGB` to the lost list. Add the rest of AC-6's cases and run every two key case in both orders. Watch the moved lost case fail first.
   - Drop "or changed" from `FAILURE_TEXT["inline-picture"]`'s body, in `flow-text.ts`, `flow-text.test.ts` and `tool-client.test.tsx` (AC-5).
   - Search the tests again for a run on a picture the corrected rule now counts, and swap its seam (AC-7).
   - Measure the rows AC-6 marks *Measured in the build*, and record them in `rationale.md`. A row that differs from its expectation stops the build for `/architect`.
   - Write the MuPDF pin row by row, as AC-6 lists it, and the ticked runs on the three spellings in `redaction-inline.test.ts`. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
9. [x] Add the four fixtures to the gate (`MAIN_FIXTURES` and `OPEN_NOW`, no main rows needed). On the corrected rule, run the gate, `cost.test.ts` on its own (if a budget fails, share the walk as AC-3 says), `pnpm lint`, `pnpm typecheck`, and the page tests. Satisfies **AC-7**.
10. [x] Write spec 0021's owed test in `redaction-kept.test.ts`. Satisfies **AC-8**.
11. [x] Amend specs 0001, 0004, 0006, 0007, 0019 and 0021 per *Amends*. Tick feature 30's design step for this item. `/sync` writes the `AGENTS.md` lines (Follow-up). Satisfies **AC-1** to **AC-8**.

## Consequences

**Positive**:
- A cleaned copy no longer lacks an unticked inline picture with the check passing. The visitor hears at open, before reviewing, with a reason that names a picture.
- The rule follows MuPDF's own loader and writer, in the key order measured on 1.28.1, so it refuses nothing the write carries, apart from the few rare cases AC-1 lists.
- The self check now notices a lost inline picture that the output still shows as `/CS/` or a missing entry, on a page with nothing ticked, should the scan ever miss one.
- The counts show how often real files meet the refusal, apart from every other kind.

**Negative / tradeoffs**:
- A file with even one such picture cannot be redacted at all, though only that picture was at risk and nothing would leak. Ghostscript writes small pictures inline (spec 0021's note), so a palette logo in its output may meet this. How often real files do was not measured, and no real document may be committed.
- A picture written with an indexed space over a named resource is refused although MuPDF never draws it. Other readers do draw it, and the write keeps nothing of it.
- A few rare files are refused that the write would carry (AC-1): a `/ColorSpace` name whose resource holds a device space, `/ColorSpace /Pattern`, and a picture under a clip with no area. For those, and for the named indexed base above, the refusal's words ("missing") say more than is true.
- When the check's backstop fires, the visitor reads `unsupported`'s words, which name other causes (text it can't rewrite, content near an edge). That is accepted, because the check reaches this only when the scan missed.
- The rule rests on a detail of MuPDF's lookup, the short key first, for every picture that holds both keys. The pin's two key rows catch a release that changes it, but AC-1 must then be redone, not just the pin.
- A run does one more read walk and scan of every drawing, which adds time to every run, refused or not.
- On a page with a target, the check cannot see a lost inline picture (it leaves whole), and on any page it cannot see one the first write drops whole. Only the refusals hold those cases, so a fault in the scan there would pass silently. The pin in AC-6 makes that limit visible.
- A `/CS` name with no resource entry passes the scan, and the write drops its picture. The file never defines its colours and MuPDF draws nothing for it in the source, so the copy matches what MuPDF showed, but whatever another reader guessed for it is gone.
- A `null` value counts as present, so `/CS null` beside a device `/ColorSpace`, and `/IM null` beside `/ImageMask true`, may be refused although MuPDF keeps them.
- The next step, printing to a new PDF, is unmeasured. Printing may write the picture inline again.
- A drawing the scan cannot read is not refused by this rule, so a lost picture inside one, on a page with a target, can still leave the file. It warns at open as today.

**Neutral**:
- A new kind joins `ENGINE_ERROR_KINDS`, and four fixtures join `OPEN_NOW`.
- `DrawingRead` grows two fields, and `StructureVerdict` one.
- Upstream's master fix (a9e17fa86c) covers only the indexed case and throws on the other arrays, so an upgrade narrows this rule but never removes it.

## Follow-up

- [ ] When a MuPDF release carries a9e17fa86c (the pin fails), narrow the rule: an indexed space over a device base written inline then comes through. The other arrays and `/ColorSpace /Name` stay refused, since master throws on them, which would fail a run after ticking. This is a reviewed change with the new pin as its proof, and `scripts/legal/mupdf.txt` is redone for that version (spec 0009).
- [ ] Add the other cases to the upstream MuPDF report spec 0004 keeps, beside spec 0021's indexed case: CalRGB, Lab, Separation and DeviceN written inline, and `/ColorSpace /Name` with no `/CS`, none of which master's fix writes.
- [ ] When reading the first month of counts (from about 2026-12-08), look at `inline-picture`. If real files meet it often, bring the warning option back to `/architect` with the numbers.
- [ ] If task 1 or task 7 measures a place where MuPDF's write keeps the picture, bring that measurement to `/architect` to narrow the rule there. The rule keeps refusing until then.
- [x] `/sync`: in `src/engine/AGENTS.md`, `marked.ts`'s two new outputs, `inline.ts`, the open's and the run's orders, the check's verdict order, and the MuPDF quirk line rewritten from "No test pins it yet" to the pin and this rule, with the short key order (`/CS` before `/ColorSpace`, `/IM` before `/ImageMask`) and its two key rows. Under *Tests* there, that a document built for a run writes a resource colour space by its full names, since the role walk refuses the inline short forms (AC-6). In the root `AGENTS.md`, the `marked.ts` exception line gains its new answer. Done in 407fe2a.
- [x] Next in feature 30, separate from this spec: measure a ticked word inside an `/ActualText` span. Measured; closed by spec 0023.
