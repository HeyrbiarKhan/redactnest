# 0019. A typed allowlist below the pages

**Date**: 2026-11-15
**Status**: In Progress
**Updated**: 2026-11-15, wording only, no new design and no code (`rationale.md`, *The page lines held to spec 0018's AC-5*). Three page lines would have failed spec 0018's AC-5 once written, so they now hold it. AC-12's lead says RedactNest "looks for" the kinds, where "finds" claimed every value is found. AC-12's "Removed, not covered" card names document info and attachments, each held by the structure check, where "hidden data such as" read as all hidden data while descriptions written into a page (AC-9) and a picture's own details (AC-14) can stay. AC-14's hidden data paragraph names the four things RedactNest strips and never reports, where "it does not report the last four" implied the file's identifier is reported; it no longer names entries a program adds, which the structure item says once. Tasks 12, 13 and 15 follow, and the *Amends* row for spec 0018 gains item 16, the paragraph AC-14 rewrites.

## Summary

A cleaned file could keep anything a kept object pointed to, because the rebuild filtered only the catalog and the pages: a font could point at the original copy of a redacted figure, so a ticked value stayed in the file and passed every check. From now on every object below the pages gets a role from the key that reached it (a font, a picture, a figure, a colour space and so on), keeps only the keys that role needs to draw, and the self check fails any file holding an object, key, string, unused resource or embedded file outside those lists. A file whose shape the rule cannot read is refused at open with a new kind of its own, and a page whose drawing instructions may carry descriptions RedactNest cannot remove (alternate text written inline) gets a warning. The home page, `/tool` and the security page then say only what this holds.

## Amends specs 0001, 0004, 0006, 0007, 0013 and 0018

Applied in place when this spec is built (task 15): each spec names spec 0019 in its `**Updated**` line, and each changed line carries an _Amended by spec 0019_ note.

| Spec | Section | Change |
|---|---|---|
| 0001 | *Decision*, "One PDF parser only" | One named exception: `src/engine/marked.ts` reads a page's drawing instructions read only, to find marked content property lists and the resource names each stream uses. It computes no geometry, edits nothing, and its only outputs are a page finding and those names (INV-4 here). MuPDF stays the only parser and renderer. |
| 0004 | INV-3 | The output carries nothing the rebuild did not choose: allowlists at the trailer, the catalog, every page and every role below them (`ROLES`), a carrier sweep kept as a backstop, and a write that keeps only what a page's drawing instructions use. |
| 0004 | AC-7 | "Anywhere in the output, through any object": none of the listed kinds stays, whatever points at it. |
| 0004 | AC-13, *Structure* | The checks in AC-5 here join the existing ones. |
| 0004 | AC-25 | One exception to "a structural failure is `redaction-incomplete`": a drawing stream in the output that the scan cannot read is `unsupported`, unless another part finds a leak, which outranks it (AC-5 here). |
| 0004 | `ENGINE_ERROR_KINDS` | `unreadable-structure` appended last: the role walk's refusal at open and in a run (AC-3 here). |
| 0004 | *Inventory table*, `attachments` | Also present when any object in the source is an embedded file stream or a file specification holding `/EF` (AC-8 here). |
| 0004 | *State transitions*, the run | rebuild is: graft, cut the catalog and pages to their lists, prune every object below to its role (`pruneToRoles`), sweep carriers. |
| 0004 | *Security model* | "What this feature defends against" adds anything a kept object points to. "What this design does not remove" adds three bullets: descriptions written inline in a page's drawing instructions (warned, AC-9 here); the names and numbers on listed keys, kept as written (a font's name, a spot colour's name, a glyph's name); and the data inside streams kept as the source wrote it (font programs, colour profiles, character maps, picture data, a photo's own details included). |
| 0006 | `PAGE_FINDINGS`, *Page findings*, the open's order | A new warning, `marked-descriptions`, after `off-page-picture` (AC-9 here). The open walks the prepared review copy right after the prepare step and raises its refusal after the empty clip refusal (AC-3 here). AC-29 is unchanged: a picture under no removed item keeps its stored bytes. |
| 0007 | `FAILURE_TEXT` (AC-16) | Words for `unreadable-structure` (AC-3 here), from its kind alone. |
| 0013 | AC-10, AC-11 | The lead, the "Removed, not covered" card and the band's note take AC-12's words here; `HOME_STRIPPED["xmp-metadata"]` is false until the picture feature lands. |
| 0018 | AC-7, *Page changes* items 13, 15, 16 and 17, the Pages list | The lines AC-14 here names. Follow-up items 2 and 3 are answered by this spec (feature 31). |

## Requirements

**User stories**:
- As a visitor redacting a document, I want a value I ticked to be gone from the whole file, so a file that passes the check cannot still hold it somewhere a program can read.
- As a visitor, I want hidden data the cleaned file is said to drop (attachments, comments, metadata in the file's structure) to be dropped wherever it was referenced from, so the "Also stripped" list is true.
- As a visitor, I want to be told before I download when a page holds something RedactNest cannot remove, so I never trust a file it could not clean.
- As the owner, I want every claim on the home page, `/tool` and the security page to hold in every case it covers (spec 0018, AC-5).

**Acceptance criteria**:

- **AC-1**: **Roles and the prune.** After the graft and the catalog and page allowlists, the rebuild walks the new document from the catalog and gives every object it reaches a role, taken from the key and the role of the object that reached it, never from what the object says about itself (INV-1). An indirect object that is not a dictionary or a stream (a colour space array, a `/Widths` array, a palette string, a number) gets a kind label instead (*Role table*). Every key not on its role's list in `ROLES` is deleted, at any depth, from direct and indirect objects alike, so whatever only that key reached is left unreferenced and the write's `garbage=deduplicate` drops it. A null (a missing object) at a dictionary key is deleted; a null inside an array stays, since removing it would shift the positions after it. An indirect number or name is resolved and counts as reached. The walk keeps an explicit work list, visits each indirect object once, and never recurses, so a cycle or a deep nesting cannot stop it. The trailer keeps only `TRAILER_KEYS` (`/Size`, `/Root`); `CATALOG_KEYS` and `PAGE_KEYS` are unchanged. The carrier sweep still runs after the prune, unchanged and never widened (INV-6).

- **AC-2**: **Strings.** Outside streams, the output holds a string only at a place in `STRING_PLACES`: the catalog's `/Lang`, a `CIDSystemInfo`'s `/Registry` and `/Ordering`, the fourth item of an `/Indexed` colour space array (its palette), and a marked content property list's `/ActualText`. Every other string on any object goes with its key, because no other key that holds a string is on any role's list.

- **AC-3**: **Fail closed.** The walk refuses with a new kind, `unreadable-structure`, when a key on its role's list holds a value in a shape the format never gives that key (for example a font's `/Widths` that is a dictionary, or a colour space array naming a family it does not know), or when one object is reached in roles or kinds it cannot satisfy together (it holds a key one of its roles keeps and another drops, or a value that fits one kind's shape and not another's). An object whose keys every one of its roles keeps, an empty dictionary included, is not refused, and the prune deletes only keys none of its roles keeps. The same walk runs read only on the prepared review copy at open, right after the prepare step. At open it walks each page from `findPage(i)`, reading the page's inherited `/Resources`, `/MediaBox`, `/CropBox` and `/Rotate` through `getInheritable`; it never walks the page tree, never follows `/Parent`, and never refuses a node for a missing `/Type`. Its refusal is raised after the `no-readable-text` and empty clip refusals, so those keep their kinds; it names no page and no review exists. A run walks its own rebuilt document again and refuses the same way before anything is written. A resource the format gives no drawing (an XObject that is neither an image nor a form, a pattern whose `/PatternType` is neither 1 nor 2, which MuPDF never draws) is deleted from its resource dictionary, not refused, because nothing on the page is drawn from it. `unreadable-structure` takes its words in `FAILURE_TEXT` from its kind alone: title "RedactNest stopped to be safe", body "Part of this file is built in a way RedactNest can't check safely, so it stopped rather than guess, and made no file.", and `NEW_COPY` as its next step.

- **AC-4**: **The measured cases fail first.** Each case feature 31's row measured is a committed fixture written by `scripts/make-fixture.mjs` (never by MuPDF), with a test that fails on main and passes after (spec 0004, INV-3). Each test reads the output with `tests/support/mupdf.ts` (`decompressedBytes`, `containsInAnyEncoding`, its own object walk), never the engine's readers:
  - `kept-figure.pdf`: `form-xobject.pdf`'s page, page 1's first font carrying a private key that points at the form. With `SECRET-42` ticked, the output's decompressed bytes hold `SECRET-42` in neither string encoding.
  - `kept-picture.pdf`: `images-under.pdf`'s page, the first font's private key pointing at the image mask. With both values ticked, no stream in the output decodes to the original mask's bytes.
  - `kept-annotations.pdf`: a page with a sticky note, its popup and a file attachment annotation, the first font's private key pointing at the page's `/Annots`. With nothing ticked, neither the note's text nor the embedded file's contents is in the output, and `sanitized` holds `annotations` and `attachments`.
  - `kept-catalog.pdf`: a catalog with page labels, viewer preferences holding a private string, an opening URI action and a structure tree whose element has `/Alt`, each reached from the first font's private key. With nothing ticked, none of their strings is in the output.
  - `kept-program-keys.pdf`: pdfTeX's `/PTEX.InfoDict` (an author and a title) and `/PTEX.FileName` (a path) on a form XObject and on an image. With nothing ticked, none of the three strings is in the output.
  - `kept-embedded.pdf`: an embedded file reached through a form XObject's `/Ref`, through a form XObject's `/OPI` and through an image's `/OPI`, one page each. With nothing ticked, no embedded file's contents and no `/EmbeddedFile` or `/Filespec` object is in the output, and `sanitized` holds `attachments`.

- **AC-5**: **The structure check.** The self check's structure part (spec 0004, AC-13) also fails with `redaction-incomplete` when the output: holds a trailer key outside `TRAILER_KEYS`; holds, at any depth, a key not on its role's list, a value outside its key's shape, or a string outside `STRING_PLACES`; holds an object that does not satisfy every role and kind it is reached in (its keys on each role's list, its value in each kind's shape), so two empty dictionaries the write merged into one object pass, as `garbage=deduplicate` does to an emptied property list and graphics state; holds an indirect object the walk from the catalog does not reach; holds an object whose `/Type` is `/EmbeddedFile` or `/Filespec`, or a dictionary holding `/EF`, anywhere, reached or not; or holds a resource entry that the drawing streams owning its resource dictionary never name (*Resource use*). A drawing stream in the output that the scan cannot read to its end is `unsupported`, not `redaction-incomplete`, since nothing was found to leak, unless another part of the check finds a leak, which outranks it; every page is still compared. The existing checks stay: no `/Info` or `/Encrypt`, one revision, the source's page count, the catalog and page allowlists, no carrier key and no `/JS` on any dictionary.

- **AC-6**: **The check fires on its own.** With the pipeline's prune step swapped for one that does nothing (the `Pipeline` seam), every `kept-*.pdf` case fails with `redaction-incomplete` and returns no file, so the check holds the rule even when the rebuild does not. A document built in the test with exactly one fault per case (an off list key on a font, a string on a form, an orphan object, an embedded file stream nothing reaches, a trailer key, a resource its stream never names, a stream reached as both an image and a form) fails `structureIsClean`, which takes the opened `PDFDocument` and the page count as today, and the same document without the fault passes. Two emptied dictionaries merged into one object reached as a property list and a graphics state pass.

- **AC-7**: **Nothing drawn changes, and nothing new is refused.** Every committed fixture that opens and runs on main still opens and runs, with the same outcome, the same `removedByType` and the same `sanitized` (except the `kept-*.pdf` cases, whose `sanitized` AC-4 and AC-8 name). Every page of every fixture's output renders pixel for pixel the same as the same run with the pipeline's prune and structure check both swapped out (the `Pipeline` seam gains `checkStructure` for this, default the real one), which is main's output: once with nothing ticked, and once with each ticked target set the redaction tests already run on that fixture, since a pass makes new figures and pictures the prune also walks. The prune only deletes keys; the passes, `sanitize` and the write are unchanged (INV-7).

- **AC-8**: **Reporting.** The inventory reports `attachments` also when any object in the source is an embedded file stream (`/Type /EmbeddedFile`) or a file specification holding `/EF`, wherever it is referenced from, an orphan nothing reaches included, on purpose: whatever the source held, none of it leaves. Every kind `sanitized` names is absent from the output, which AC-5 holds.

- **AC-9**: **A warning for descriptions.** At open, inspection reads each prepared page's drawing streams (its contents, and every form XObject, tiling pattern and Type 3 glyph procedure it draws, as the walk names them) through `src/engine/marked.ts` (*Scan rules*), and gives the page the warning finding `marked-descriptions` when a marked content property list in those instructions holds a string anywhere inside it that counts. The property list is the dictionary operand of a `BDC` or `DP`, or the entry a name operand names in the owning `/Properties` (which the prune has cut to `/ActualText` and `/MCID`). Every string counts except two. An `/ActualText` value does not count when its marked content sequence draws text before its `EMC` (a `Tj`, `TJ`, `'` or `"`), since the character check reads it there; one around no text counts. A `/Lang` value does not count when it reads as a language tag (`LANG_TAG`: two or three ASCII letters, then any number of groups of a hyphen or an underscore and one to eight ASCII letters or digits, so `en-GB` and `en_US` pass). A drawing stream the scan cannot read to its end also gives the page the warning. The finding's tone is `warning`, so it joins the warning callout, the download warning and the partly redacted name (spec 0006, `isPartly`), and its words are in `src/lib/page-findings.ts`:
  - one: "`{pages}` may have descriptions written into the page, such as alternate text for screen readers. RedactNest can't remove them, so they can stay in the file, even around text you tick."
  - many: "`{pages}` may have descriptions written into the page, such as alternate text for screen readers. RedactNest can't remove them, so they can stay in the file, even around text you tick."

- **AC-10**: **The limit, pinned.** `marked-descriptions.pdf` holds one page per case: an inline `/Span` with `/Alt` and `/E` around a line holding a value (warns); a `DP` point with a private string (warns); an inline span holding only `/ActualText` around text (quiet); an inline `/ActualText` around only a filled shape (warns); a named property list whose `/ActualText` sits around only a filled shape (warns); a span holding only `/MCID` (quiet); `/Lang (en-GB)` and `/Lang (en_US)` (quiet); `/Lang (Jane Smith)` (warns); an inline `/E` inside a form XObject (warns); an artifact holding only names (quiet). A run with the value on the first page ticked still holds the `/Alt` string in its output, and a run with nothing ticked still holds the `/ActualText` around the shape (MuPDF's `sanitize` keeps both), so a MuPDF upgrade that changes either fails the test and the warning is revisited. No committed fixture besides `marked-descriptions.pdf` warns with `marked-descriptions`.

- **AC-11**: **Cost.** In `tests/unit/cost.test.ts`: on the 50 page text heavy document, the open's walk, the rebuild's prune, the check's structure part (the walk, reachability, embedded files and resource use) and the scan together add at most 200 ms of CPU; and on a one page document built in the test drawing 10,000 form XObjects, the same together add at most 15% to the run's CPU. Each is the least of three passes after a warm up, as the open budgets are measured. The existing budgets still pass.

- **AC-12**: **The home page's words** (`src/lib/home-text.ts`), each held to spec 0018's AC-5 rule:
  - `HOME_TEXT.lead`: "RedactNest looks for `{lookedFor("conjunction")}` in your PDF and lets you tick what to remove." "Looks for" says what RedactNest does and claims nothing about what it finds, as the security page's What it finds says it; "finds" with no "can" would claim every value is found, while a value can be missed. The headline and the "Removed, not covered" card carry removal, so the lead no longer says it a second time (spec 0013, INV-11).
  - The "Removed, not covered" card's body: "Ticked text is taken out of the page, and document info and attachments are stripped." Each absolute sits behind a gate every file passes: ticked text by the self check's text part (spec 0004, AC-13), document info by no `/Info` and no trailer key outside `TRAILER_KEYS`, attachments by no embedded file or file specification anywhere (AC-5, AC-8). It names those two kinds and never hidden data as a whole, because descriptions written into a page (AC-9) and a picture's own details (AC-14's last bullet) can stay. The Strips card lists the other kinds.
  - `HOME_STRIPPED["xmp-metadata"]` is `false`, so the Strips card lists Document info, Attachments, Bookmarks, JavaScript, Earlier versions and Page thumbnails under "Whenever a file carries them:", unchanged.
  - `HOME_TEXT.band.strips.note`: "Comments and form fields are flattened into the page: what showed stays, and the comments and fields themselves are removed, with a note's hidden text and any attached file."

- **AC-13**: **`/tool`'s words.** "Also stripped" and `SANITIZED_TEXT` keep their words: every kind the list names is absent from the output (AC-5, AC-8), and XMP inside a picture's own data is never found, so never listed. The review's warning callout shows AC-9's line through `findingLine`, and a file with the finding downloads named partly redacted.

- **AC-14**: **The security page's words** (`src/app/security/page.tsx`), each with its source comment naming this spec's AC, and one `SECURITY_CHANGES` entry dated the day it merges:
  - Removed, not just covered: "It takes each item you ticked out of the text the page draws (its drawing instructions, the part of the file that says what text goes where), then draws the black box where it was." The sentence "The original copy of a figure or picture under a removed item can stay in the file, still holding what you ticked, when another part of the file points to it." becomes: "The original copy of a figure or picture it redacts stays only where a page's drawing instructions still reach it, such as another page where you ticked nothing: the check fails any file holding an object they do not reach, directly or through what they use." (AC-5)
  - The check on every file, the structure item: "Structure: the file holds a single version, and every object in it, and every key on each, comes from a fixed list of what a page needs to draw. Anything else, such as an attached file or entries a program adds to the file's objects for its own use, fails the check." (AC-1, AC-2, AC-5)
  - Hidden data, the paragraph after the picture line: "That list leaves some things out. RedactNest also strips the file's identifier, page labels, viewer preferences and automatic actions that are not scripts, and does not report these four. Links and accessibility tags are stripped too, so links in the cleaned copy no longer work and screen readers read it less well." (AC-1, AC-5; spec 0004, AC-7.) "Strips" sits behind the structure check: the identifier by `TRAILER_KEYS`, page labels, viewer preferences and an opening action by `CATALOG_KEYS`, other automatic actions by the role lists, links by `PAGE_KEYS`, tags by `CATALOG_KEYS` and the role lists. "Does not report these four" is a step that does not exist: `SANITIZED_KINDS` has no kind for any of them (`takeInventory`'s header, `tests/unit/redaction-inventory.test.ts`); links and tags are left out of that clause, since they are reported (as `annotations` and `accessibility-tags`). Entries a program adds for its own use are named once, in the structure item above, so this paragraph leaves them out (spec 0018, AC-5, said once).
  - Notes and attachments: "A sticky note or a file attachment is taken off the page with what it held, the note's text or the attached file, though one that shows as an icon can keep that icon as a mark on the page." (AC-4, AC-5)
  - The Pages list "Some things can stay in the file, or be misjudged" gains: "Descriptions written into a page, such as alternate text for screen readers, can stay in the file, even around text you tick. RedactNest warns about any page that may have them." (AC-9, AC-10)
  - "Details stored inside a picture's own data, such as a photo's camera details, can stay." stays as it is, until the picture feature lands.

## Decision

**Chosen option**: Option 1, a typed allowlist that prunes the grafted document, held by an independent walk in the self check.

MuPDF keeps copying the pages; a walk over a fixed role table then deletes every key a role does not need to draw, refuses what the table cannot read, and the self check walks the written bytes again, adding reachability, embedded files and resource use, so no object outside the lists can leave.

## Rationale

Reasoning, options and every measurement: see [rationale.md](rationale.md).

## Feature design

**Where the code lives**:

| File | What changes |
|---|---|
| `src/engine/allowlist.ts` (new) | `ROLES`, `STRING_PLACES`, `TRAILER_KEYS`; `walkRoles(doc, mode)`: `"prune"` deletes off list keys and nulls at keys, `"read"` only reports. Both return a `RoleWalk`: the first problem (a shape, or an object in roles or kinds it cannot satisfy together) or none; every indirect object reached, with the roles and kinds it was reached in; each page's drawing streams; and the resource owners, one per resource dictionary, each with every drawing stream that draws with it (*Resource use*). At open, `"read"` starts from each page (AC-3). |
| `src/engine/marked.ts` (new) | The read only scan (INV-4, *Scan rules*): `readDrawing(streams, properties)` returns whether a property list holds a counted string, the resource names the streams use, or `"unsure"`. `LANG_TAG`. |
| `src/engine/rebuild.ts` | `pruneToRoles(out)` after `stripToAllowlist`, before `sweepCarriers`; a problem throws `EngineFailure("unreadable-structure")`. |
| `src/engine/redact.ts` | `Pipeline` gains `pruneToRoles` and `checkStructure`, defaults the real ones, so a test can swap them (AC-6, AC-7); `checkOutput` takes the structure check from it. |
| `src/engine/self-check.ts` | `structureIsClean` adds AC-5's checks, through `walkRoles(check, "read")` and `marked.ts`, and answers clean, a leak, or unreadable (`unsupported`, which a leak outranks). |
| `src/engine/open.ts` | `walkRoles(review, "read")` right after `prepareDocument`; its refusal is raised after the empty clip refusal (AC-3). |
| `src/engine/inspect.ts` | `marked-descriptions` from `marked.ts` over the walk's drawing streams (AC-9). |
| `src/engine/inventory.ts` | The `attachments` rule (AC-8). |
| `src/worker/protocol.ts` | `PAGE_FINDINGS` gains `marked-descriptions` after `off-page-picture`; `ENGINE_ERROR_KINDS` gains `unreadable-structure`, appended last. |
| `src/lib/page-findings.ts` | Its tone (`warning`) and words (AC-9). |
| `src/lib/flow-text.ts` | `FAILURE_TEXT["unreadable-structure"]` (AC-3). |
| `src/lib/home-text.ts` | AC-12. |
| `src/app/security/page.tsx`, `src/lib/policy-changes.ts` | AC-14. |
| `scripts/lib/kept-fixtures.mjs` (new), `scripts/make-fixture.mjs` | The seven fixtures (AC-4, AC-10). |

**Role table** (`ROLES`). A role's list is the keys MuPDF needs to draw it, from the PDF 2.0 tables, less every key that carries data instead. Each value has a shape: a name, number or boolean; a number array (nested arrays of numbers and names allowed); a string (only at `STRING_PLACES`); an object of a role; a name or an object of a role; one or an array of; a dictionary whose values are of a role; a colour space (a name, or a `/ICCBased`, `/Indexed`, `/Separation`, `/DeviceN`, `/Pattern`, `/CalRGB`, `/CalGray` or `/Lab` array); or a function (a function dictionary or stream, an array of them, or the names `/Identity` and `/Default`). Every stream role also keeps `/Length`, `/Filter` and `/DecodeParms`. An indirect object that is not a dictionary or a stream is labelled by its shape's kind: `colour space`, `number array`, `function`, `palette`, `name array` or `scalar`. Any number of keys may share one object of the same kind (two fonts sharing one `/Widths` array). An object reached in several roles or kinds must satisfy each of them, or the walk refuses (AC-3) and the check fails (AC-5).

| Role | Reached from | Keeps | Leaves out on purpose |
|---|---|---|---|
| Catalog | the trailer's `/Root` | `CATALOG_KEYS` | unchanged |
| Pages | `/Pages`, `/Kids` (by `/Type`) | `/Type`, `/Kids`, `/Count`, `/Parent`, and the inheritable `/Resources`, `/MediaBox`, `/CropBox`, `/Rotate` (the open reads the source's tree) | everything else |
| Page | `/Kids` (by `/Type`) | `PAGE_KEYS` | unchanged |
| Content | a page's `/Contents`, a Type 3 font's `/CharProcs` | stream keys only | |
| Resources | `/Resources` on a page, form, tiling pattern or Type 3 font | `/Font`, `/XObject`, `/ExtGState`, `/ColorSpace`, `/Pattern`, `/Shading`, `/Properties`, `/ProcSet` | |
| Simple font | `/Font` entries whose `/Subtype` is not `/Type0` or `/Type3` | `/Type`, `/Subtype`, `/BaseFont`, `/FirstChar`, `/LastChar`, `/Widths`, `/FontDescriptor`, `/Encoding`, `/ToUnicode` | `/Name`, private keys |
| Type 3 font | `/Subtype /Type3` | the simple font's keys, `/FontBBox`, `/FontMatrix`, `/CharProcs`, `/Resources` | |
| Type 0 font | `/Subtype /Type0` | `/Type`, `/Subtype`, `/BaseFont`, `/Encoding`, `/DescendantFonts`, `/ToUnicode` | |
| CID font | `/DescendantFonts` | `/Type`, `/Subtype`, `/BaseFont`, `/CIDSystemInfo`, `/FontDescriptor`, `/DW`, `/W`, `/DW2`, `/W2`, `/CIDToGIDMap` | |
| CIDSystemInfo | `/CIDSystemInfo` | `/Registry`, `/Ordering` (strings), `/Supplement` | |
| Font descriptor | `/FontDescriptor` | `/Type`, `/FontName`, `/FontStretch`, `/FontWeight`, `/Flags`, `/FontBBox`, `/ItalicAngle`, `/Ascent`, `/Descent`, `/Leading`, `/CapHeight`, `/XHeight`, `/StemV`, `/StemH`, `/AvgWidth`, `/MaxWidth`, `/MissingWidth`, `/FontFile`, `/FontFile2`, `/FontFile3` | `/FontFamily`, `/CharSet` (strings), `/CIDSet`, `/Style`, `/Lang`, `/FD` (none needed to draw) |
| Font file | `/FontFile`, `/FontFile2`, `/FontFile3` | stream keys, `/Length1`, `/Length2`, `/Length3`, `/Subtype` | `/Metadata` |
| Encoding | a font's `/Encoding` dictionary | `/Type`, `/BaseEncoding`, `/Differences` | |
| Character map | `/ToUnicode`, a Type 0 font's `/Encoding` stream, `/UseCMap` | stream keys, `/Type`, `/CMapName`, `/CIDSystemInfo`, `/WMode`, `/UseCMap` | |
| Image | `/XObject` entries with `/Subtype /Image`, `/SMask`, `/Mask` | stream keys, `/Type`, `/Subtype`, `/Width`, `/Height`, `/ColorSpace`, `/BitsPerComponent`, `/Intent`, `/ImageMask`, `/Mask`, `/Decode`, `/Interpolate`, `/SMask`, `/SMaskInData`, `/Matte` | `/Alternates` (an alternate can be the unblanked original), `/OPI`, `/ID`, `/Name`, `/OC`, `/StructParent`, `/Metadata` |
| Form | `/XObject` entries with `/Subtype /Form`, a soft mask's `/G` | stream keys, `/Type`, `/Subtype`, `/FormType`, `/BBox`, `/Matrix`, `/Resources`, `/Group` | `/Ref`, `/OPI`, `/PieceInfo`, `/LastModified`, `/StructParent`, `/StructParents`, `/OC`, `/Measure`, `/PtData`, `/AF`, `/Name`, `/Metadata` |
| Group | `/Group` | `/Type`, `/S`, `/CS`, `/I`, `/K` | |
| Graphics state | `/ExtGState` entries, a shading pattern's `/ExtGState` | `/Type`, `/LW`, `/LC`, `/LJ`, `/ML`, `/D`, `/RI`, `/OP`, `/op`, `/OPM`, `/Font`, `/BG`, `/BG2`, `/UCR`, `/UCR2`, `/TR`, `/TR2`, `/FL`, `/SM`, `/SA`, `/BM`, `/SMask`, `/CA`, `/ca`, `/AIS`, `/TK`, `/UseBlackPtComp` | `/HT`, `/HTO` (halftones, which MuPDF never draws) |
| Soft mask | a graphics state's `/SMask` dictionary | `/Type`, `/S`, `/G`, `/BC`, `/TR` | |
| Tiling pattern | `/Pattern` entries with `/PatternType 1` | stream keys, `/Type`, `/PatternType`, `/PaintType`, `/TilingType`, `/BBox`, `/XStep`, `/YStep`, `/Resources`, `/Matrix` | |
| Shading pattern | `/PatternType 2` | `/Type`, `/PatternType`, `/Shading`, `/Matrix`, `/ExtGState` | |
| Shading | `/Shading` entries, a shading pattern's `/Shading` | stream keys, `/ShadingType`, `/ColorSpace`, `/Background`, `/BBox`, `/AntiAlias`, `/Coords`, `/Domain`, `/Extend`, `/Function`, `/Matrix`, `/BitsPerCoordinate`, `/BitsPerComponent`, `/BitsPerFlag`, `/Decode`, `/VerticesPerRow` | |
| Function | any function shape | stream keys, `/FunctionType`, `/Domain`, `/Range`, `/Size`, `/BitsPerSample`, `/Order`, `/Encode`, `/Decode`, `/C0`, `/C1`, `/N`, `/Functions`, `/Bounds` | |
| Colour profile | `/ICCBased` | stream keys, `/N`, `/Alternate`, `/Range` | `/Metadata` |
| Calibrated space | `/CalRGB`, `/CalGray`, `/Lab` | `/WhitePoint`, `/BlackPoint`, `/Gamma`, `/Matrix`, `/Range` | |
| DeviceN attributes | a `/DeviceN` array's fifth item | `/Subtype`, `/Colorants`, `/Process` (and its `/ColorSpace`, `/Components`) | `/MixingHints` |
| Property list | `/Properties` entries | `/ActualText` (string), `/MCID` | `/Alt`, `/E`, `/Lang` and everything else |
| Decode parameters | `/DecodeParms` | `/Predictor`, `/Colors`, `/BitsPerComponent`, `/Columns`, `/EarlyChange`, `/K`, `/EndOfLine`, `/EncodedByteAlign`, `/Rows`, `/EndOfBlock`, `/BlackIs1`, `/DamagedRowsBeforeError`, `/ColorTransform`, `/JBIG2Globals` | |
| Plain stream | `/JBIG2Globals`, `/CIDToGIDMap`, an indexed palette stream | stream keys only | |

A pattern whose `/PatternType` is neither 1 nor 2, like an XObject that is neither an image nor a form, is deleted from its resource dictionary (AC-3). A font whose `/Subtype` is anything but `/Type0` or `/Type3` (`/MMType1` included) is a simple font, as MuPDF draws it.

**Resource use** (what the check compares, AC-5). Each resource dictionary is compared with the union of the names every stream that draws with it uses: a page's contents (an array of streams read as one, with white space between) for the page's dictionary, a form's own stream, a tiling pattern's own stream, a Type 3 font's glyph procedures together. A dictionary shared by several pages or forms takes the union of all of them. A form or Type 3 font with no `/Resources` of its own counts toward every dictionary it is drawn with. A name is used by: `Do` (an XObject), `Tf` (a font), `gs` (a graphics state), `sh` (a shading), `cs` and `CS` (a colour space, not a device space or `/Pattern`), `scn` and `SCN` (a pattern), a `BDC` or `DP` naming a property list, and an inline image's `/CS` or `/ColorSpace` naming a colour space. `/DefaultGray`, `/DefaultRGB` and `/DefaultCMYK` count as used, since a device colour uses them without naming them.

**Scan rules** (`marked.ts`, INV-4). It reads the bytes MuPDF decodes (`readStream`), never a raw filtered stream.
- **Tokens**: white space and `%` comments are skipped; `(` starts a literal string (balanced parentheses, `\` escapes the next byte); `<<` starts a dictionary and a lone `<` a hex string; `[` an array; `/` a name, whose `#xx` escapes are decoded before it is compared with a resource key; anything else is a number, a boolean, `null` or an operator. Operands collect until an operator, which clears them.
- **Strings**: a literal string's escapes and a hex string's digits are decoded to bytes; bytes starting with the UTF-16BE mark are read as UTF-16, others as PDFDocEncoding. `LANG_TAG` is tested on that text; a string that cannot be decoded counts.
- **Inline images**: after `BI`, key and value pairs up to `ID` (an inline `/CS` or `/ColorSpace` name is a use), one white space byte, then the data. The data ends at the first `EI` with white space before it and white space, a delimiter or the end after it. If the rest of the stream then cannot be read to its end, the next such `EI` is tried, and so on; when none works, the stream is unsure.
- **Marked content**: `BDC` and `BMC` open a sequence and `EMC` closes it, nested; each open sequence remembers whether a text showing operator (`Tj`, `TJ`, `'`, `"`) ran inside it, for the `/ActualText` rule (AC-9). A `DP` is a point, never a sequence, so an `/ActualText` on a `DP` always counts. A named property list is looked up in the owning `/Properties`.
- **Unsure**: an unbalanced string, array or dictionary, a stray closing delimiter, or an inline image with no workable `EI`. At open the page warns (AC-9); in the check the run fails with `unsupported` unless a leak outranks it (AC-5).

**State transitions**: the open becomes door, open, password, page cap, layers, prepare, the role walk (read), inspect (with the scan), the `no-readable-text` refusal, the empty clip refusal, the role walk's refusal, trim. A run's rebuild becomes graft, `stripToAllowlist`, `pruneToRoles`, `sweepCarriers`, then write and the self check as today.

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| prune, open walk, check walk | an object's role | the key and role of the object that reached it, by `ROLES`; `/Subtype`, `/PatternType` or a tree node's `/Type` only where the table says it decides |
| prune, check | the keys an object may keep | `ROLES[role]` |
| prune, check | where a string may stay | `STRING_PLACES` |
| prune, check | the trailer's keys | `TRAILER_KEYS` |
| prune, open walk, check walk | an indirect non dictionary object's kind | its shape at the key that reached it (*Role table*) |
| open, run | the refusal kind | `unreadable-structure` (AC-3); a failed check is `redaction-incomplete` (spec 0004, AC-25), an output stream the scan cannot read `unsupported` (AC-5) |
| `/tool` | the refusal's words | `FAILURE_TEXT["unreadable-structure"]` (AC-3) |
| check | an unreached object | the object numbers `walkRoles` reached, against `countObjects()` |
| check | an object in two roles | the roles and kinds `walkRoles` recorded for it; it must satisfy each |
| check | an unused resource | `marked.ts`'s names over every stream in the dictionary's owner entry, against the dictionary's keys |
| inspect | `marked-descriptions` on a page | `marked.ts` over the drawing streams `walkRoles` names for that page, with the owning `/Properties` for named lists; `LANG_TAG` |
| run | `sanitized` holding `attachments` | the inventory, AC-8's rule added |
| `/tool` | the warning line | `src/lib/page-findings.ts`, AC-9 |
| `/`, `/security` | the words | AC-12, AC-14 |

**Key invariants**:
- **INV-1**: A role comes from the path that reached an object, never from what the object says about itself. Only the keys the role table names (`/Subtype` on a font or an XObject, `/PatternType`, a tree node's `/Type`) choose between roles.
- **INV-2**: What is off every list an object is reached under is deleted; what is on a list but cannot be read, or kept by one of its roles and dropped by another, is refused. The rule never keeps an unlisted key and never guesses a shape.
- **INV-3**: The check holds every rule the prune applies, on the written bytes, whether or not the prune ran, and adds what only the written file can show (reachability, resource use, embedded files anywhere).
- **INV-4**: `src/engine/marked.ts` is the only code besides MuPDF that reads drawing instructions. It never edits a stream and computes no geometry. Its only outputs are whether a page warns and which names a stream uses, and nothing it answers changes what the rebuild keeps. Any doubt warns at open and fails the check, so a fault in it can add a warning or a refusal, never pass a file the rest of the check would fail.
- **INV-5**: `ROLES`, `STRING_PLACES`, `TRAILER_KEYS` and `LANG_TAG` are engine constants, rules about the file format rather than caps on the visitor, under the exception `src/engine/AGENTS.md` records. No environment variable can change them.
- **INV-6**: `CARRIER_KEYS` is never widened key by key. A key the output needs to keep is a `ROLES` change, reviewed, with a failing fixture as its proof (spec 0004, INV-3).
- **INV-7**: The prune deletes keys and nothing else. It never removes less than main from what a page draws, since the passes, `sanitize` and the write are unchanged.

**Security model**: no new authorisation; the tool stays anonymous. The walk and the scan read document content only inside the worker, hold nothing past the open or the run, and log nothing. A finding carries its kind only, never what or where (spec 0006, INV-1). Telemetry's `pagesWith` counts the new kind on its own, with no change to the catalog or the privacy policy (spec 0016).

**Configuration required**: none.

**Critical test scenarios**:
- Each `kept-*.pdf` case keeps its secret on main and loses it after, with the self check passing, verifies **AC-1**, **AC-2**, **AC-4**.
- The prune skipped: each case fails with `redaction-incomplete`; each single fault document fails `structureIsClean`, verifies **AC-5**, **AC-6**.
- A font whose `/Widths` is a dictionary, and one stream reached as both page contents and a form: refused at open with `unreadable-structure`, before a review, and refused by a run handed the bytes directly; a page tree node with no `/Type` and inherited resources opens and runs; an unknown pattern type is deleted, verifies **AC-3**.
- The pipeline's real prune leaves an emptied property list and graphics state that the write merges into one object; the check passes it, verifies **AC-5**, **AC-6**.
- Every committed fixture: same outcome, same counts, same pixels with the prune swapped out, verifies **AC-7**.
- `kept-embedded.pdf` and `kept-annotations.pdf` report `attachments`, verifies **AC-8**.
- `marked-descriptions.pdf`: the warning on exactly the pages AC-10 lists, the `/Alt` pin, no other fixture warning, the line on `/tool` and the partly redacted name, verifies **AC-9**, **AC-10**, **AC-13**.
- The budgets on 50 dense pages and on 10,000 form XObjects, verifies **AC-11**.
- The home page and security page pins, verifies **AC-12**, **AC-14**.

## Build plan

Skateboard: the thinnest whole that closes the leak comes first (the fixtures, the prune and the check, tasks 1 to 4), then the refusal at open, the reporting, the warning, resource use and the words grow around it.

1. Write `scripts/lib/kept-fixtures.mjs` and the six `kept-*.pdf` fixtures; add tests reading each output with `tests/support/mupdf.ts`, and watch every one fail on main, satisfies **AC-4**
2. Write `src/engine/allowlist.ts`: `ROLES`, `STRING_PLACES`, `TRAILER_KEYS`, and `walkRoles` in both modes returning a `RoleWalk`, with unit tests for role choice, kind labels, every shape, strings by place, nulls at keys and in arrays, an indirect number, a cycle, an object two roles can and cannot share, an unknown XObject subtype and pattern type, and the resource owners (a shared dictionary, a form and a Type 3 font with no resources of their own, a `/Contents` array), satisfies **AC-1**, **AC-2**, **AC-3**
3. Add `pruneToRoles` to `rebuild.ts`, and `pruneToRoles` and `checkStructure` to the `Pipeline` seam in `redact.ts`; the `kept-*.pdf` tests pass, satisfies **AC-1**, **AC-4**
4. Extend `structureIsClean` with the trailer, the role walk (every role an object is reached in), reachability and embedded files; the single fault documents and the prune skipped runs fail, and merged empty dictionaries pass, satisfies **AC-5**, **AC-6**
5. Append `unreadable-structure` to `ENGINE_ERROR_KINDS` with its `FAILURE_TEXT` words; walk each prepared page in `open.ts` from `findPage` with `getInheritable`, and raise the refusal after the empty clip refusal; the refusal tests, a page tree node with no `/Type`, and inherited resources, satisfies **AC-3**
6. Add the `attachments` rule to `inventory.ts` and its rows in `redaction-inventory.test.ts`, an orphan embedded file included, satisfies **AC-8**
7. Add the gate over every committed fixture: same outcome and counts, and the same pixels as the run with `pruneToRoles` and `checkStructure` both swapped out, with nothing ticked and with each ticked target set the redaction tests already use, satisfies **AC-7**
8. Write `src/engine/marked.ts` to *Scan rules* and its unit tests (the measured probes: inline `/Alt` and `/E`, `/ActualText` around text and around only a shape, inline and named, `/MCID` only, the three `/Lang` cases, names only, `DP`, a string holding `BDC` like bytes, a `#xx` name, a hex and a UTF-16 string, an inline image with a false `EI` in its data, an unbalanced string, a form), satisfies **AC-9**
9. Add `marked-descriptions` to `PAGE_FINDINGS`, `inspect.ts`, `FINDING_TONE` and the words; write `marked-descriptions.pdf` (the seventh fixture) and its reading tests and both pins, satisfies **AC-9**, **AC-10**
10. Add resource use to `structureIsClean` through `marked.ts` and `RoleWalk`'s owners, with an unreadable output stream answering `unsupported`; a single fault document with an unused entry fails, and every fixture output passes, satisfies **AC-5**, **AC-6**, **AC-7**
11. Add both budget tests to `cost.test.ts` (50 dense pages; 10,000 form XObjects built in the test), satisfies **AC-11**
12. Change `src/lib/home-text.ts` to AC-12's words: the lead's "looks for", the card's two kinds, `HOME_STRIPPED["xmp-metadata"]` false and the band's note, each changed line with a comment naming the gate behind its absolutes or the step that does not exist. Pin the lead and the card's body word for word in `tests/unit/home-text.test.ts`, and update the home page tests that read them. No brand rerun: the pictures carry only the eyebrow and the headline. Satisfies **AC-12**
13. Change the security page to AC-14's words, each changed paragraph's source comment naming this spec's AC and the gate or missing step behind each absolute (the hidden data paragraph's naming `SANITIZED_KINDS` for the four it does not report), and add the `SECURITY_CHANGES` entry. Pin each changed line in `tests/component/app/security-page.test.tsx`, the hidden data paragraph with the four names and no program entries. Satisfies **AC-14**
14. Confirm `/tool`'s words stand; add component tests that the review shows AC-9's line, the download is named partly redacted, and `unreadable-structure` shows its words, satisfies **AC-3**, **AC-13**
15. Amend specs 0001, 0004, 0006, 0007, 0013 and 0018 in place per *Amends*. Spec 0013's AC-10 lead and "Removed, not covered" line and AC-11's band note take AC-12's words, and spec 0018's *Page changes* items 13, 15, 16 and 17 and its Pages list take AC-14's, each as this spec gives it, so no amended line keeps "finds" without "can", "hidden data such as", or "the last four". Tick spec 0018's Follow-up items 2 and 3, and update feature 31's row; `/sync` writes the `AGENTS.md` lines, satisfies **AC-1** to **AC-14**

## Consequences

**Positive**:
- A ticked value, an unblanked picture, a comment's text, an attachment or a program's private data can no longer ride out of the file on a pointer from a kept object, and the self check holds that on every file.
- "Only what each page draws" stops resting on MuPDF's `sanitize` alone: an upgrade that stopped pruning would fail the check rather than leak.
- The home page's Strips list, `/tool`'s "Also stripped" and the security page's structure lines become claims a gate holds.

**Negative / tradeoffs**:
- A real file with a shape the table cannot read is now refused at open where it ran before. No committed fixture is, but real files were not measured (the owner's scans are never read); `unreadable-structure` arrives in the counts as its own kind to show how often.
- The role table must follow the PDF format: a drawing key it lacks is deleted, and the pixel gate catches that only on the fixtures. A new key is a reviewed `ROLES` change with a fixture.
- `marked.ts` is a second reader of PDF syntax, the one exception to spec 0001's rule. A disagreement with MuPDF can only add a warning or a refusal, but it is code to keep correct.
- The warning names some tagged files partly redacted (an `/ActualText` around a figure warns too), and inline descriptions still stay; the visitor is told, not protected.
- The names and numbers on listed keys leave as written: a font's name, a spot colour's name, a glyph's name. Only keys and strings are held to lists.
- The output drops things some readers use and MuPDF does not: halftones, font family names, `/CIDSet`, `/Alternates`. A file that claimed PDF/A conformance no longer does (the rebuild already dropped the XMP it needs).
- The data inside kept streams leaves as the source wrote it: a photo's own details until the picture feature lands, and a font program's or colour profile's own names.

**Neutral**:
- `CARRIER_KEYS` stays as a backstop the allowlist makes redundant below the pages.
- Telemetry gains the new finding's page count with no catalog change.

## Follow-up

- [x] Enroll "Details inside pictures" as its own feature (split from feature 31, 2026-11-15; enrolled as feature 32): strip APP1 (EXIF, XMP), APP13 (IPTC) and comment segments from DCT pictures and the matching JPEG 2000 boxes without decoding, prove decoded pixels unchanged, amend spec 0006's AC-29 and AC-12 here (set `HOME_STRIPPED["xmp-metadata"]` true again), and drop the security page's picture "can" line.
- [ ] Adopt a MuPDF.js release that exposes marked content (a metatext callback, or a filter that can drop property lists); then `marked-descriptions` can become a removal instead of a warning. AC-10's pin fails first if MuPDF's behaviour changes.
- [ ] After a month of counts (from about 2026-12-08), read `pagesWith["marked-descriptions"]` and the `unreadable-structure` failures, to judge the warning's and the refusal's real rates.
- [ ] `/sync`: `src/engine/AGENTS.md` lines for `allowlist.ts`, `marked.ts`, the prune's place in the pipeline and the new structure checks; root `AGENTS.md`'s engine wall and *Rules* lines for spec 0001's exception and INV-6.
- [ ] Feature 30 keeps the `off-page-picture` words (spec 0018's Follow-up item 4); nothing here changes them.
