# 0020. Type 3 glyphs stay inside their font

**Date**: 2026-11-17
**Status**: In Progress

## Summary

A Type 3 font draws each of its characters with a small drawing of its own (a glyph procedure), and nothing in RedactNest can see inside one: MuPDF hands every reader the character as a single letter. So when a glyph procedure names the same figure or picture a page draws, the redaction makes a clean copy for the page while the font keeps the original, ticked value and all, and the self check passes. That happens whether or not any text draws the glyph, and a glyph can also carry the ticked words as text of its own. From now on RedactNest refuses such a file, at open and again in a run before anything is removed, with the existing `unreadable-structure` words. A glyph may draw anything that stays inside its font, so colour emoji from Chrome, matplotlib's charts and fonts made of small pictures open as they do today.

## Amends specs 0004, 0018 and 0019

Applied in place when this spec is built (task 10): each spec names spec 0020 in its `**Updated**` line, and each changed line carries an _Amended by spec 0020_ note.

| Spec | Section | Change |
|---|---|---|
| 0004 | AC-4 | Holds with no Type 3 exception: a ticked value no longer survives through a Type 3 glyph procedure, because a file where one could is refused (AC-5, AC-6 here). No words in AC-4 change. Spec 0019's recorded limit for descriptions written inline in drawing instructions (warned, its AC-9) is unchanged, inside a glyph as anywhere: a glyph's `/Alt` stays (measured), while a comment, an unknown operator's string and an inline picture's dictionary string inside a glyph are gone after the write (measured). |
| 0004 | *Security model*, "What this feature defends against" | Adds a font character whose drawing names the figure or picture that held a ticked value, or carries text of its own. |
| 0004 | *State transitions*, the run | After prepare: the glyph rule, then the trim (AC-6 here). |
| 0019 | AC-4, its "Not among them" bullet | Answered by spec 0020: such a file is now refused, so no fixture of 0019's needs to cover it. |
| 0019 | AC-3, and `unreadable-structure` wherever its causes are listed | A second cause: the glyph rule (AC-3 here), at open and in a run before any pass. Its words are unchanged. |
| 0019 | INV-4, *Scan rules*, `marked.ts`'s header | The scan's outputs add whether a drawing shows text (`showsText`). Nothing it answers changes what the rebuild keeps: the glyph rule refuses, it never deletes. |
| 0019 | *Consequences*, the Type 3 bullet under *Negative*, and its *Follow-up* item "A glyph no text draws" | Answered by spec 0020; the Follow-up item is ticked with a pointer here. |
| 0018 | AC-7 and *Page changes*, the original copy line | The line drops ", or in a font character that no text shows" (AC-11 here). |

## Requirements

**User stories**:
- As a visitor redacting a document, I want a value I ticked to be gone from the whole file even when one of its font characters draws the figure or picture that held it, so a file that passes the check cannot still hold it.
- As a visitor, I want to be told at open, before I tick anything, when a file's font characters draw something RedactNest cannot see into, so I never spend a review on a file it will not clean.
- As a visitor who saves pages from Chrome or Google Docs, I want a file with colour emoji to open and redact as it does today.
- As the owner, I want the security page's original copy line to hold in every case it covers, with no font character exception (spec 0018, AC-5).

**Acceptance criteria**:

- **AC-1**: **The glyph side.** Every Type 3 font the role walk reaches contributes its glyph procedures (every `/CharProcs` entry, whether or not any text draws it) as drawings on the glyph side, read with the dictionary they draw with: the font's own `/Resources`, or, when it has none, each dictionary the walk found the font under. For each drawing on the glyph side, every name the scan reads from it (`DrawingRead.names`) is looked up in that dictionary, and the entry adds to the glyph side what it holds:
  - under `XObject`, the form or picture itself; for a picture, its `/SMask` and its `/Mask` when each is a picture, and theirs in turn, until nothing new is added;
  - under `Pattern`, an entry the walk labels `tiling-pattern` itself; any other pattern adds, when it holds `/ExtGState` whose `/SMask` holds `/G`, that `/G` if the walk labels it `form`. No pattern is classified any other way;
  - under `ExtGState`, its `/SMask`'s `/G` if the walk labels it `form`;
  - under `Font`, `Shading`, `ColorSpace` and `Properties`, nothing.

  Every key is looked up through `hasKey` first, since a missing key comes back as MuPDF's one shared Null, whose `get` throws. The glyph procedures' own streams are on the glyph side, and each form and tiling pattern added is a drawing on the glyph side in turn, read with its own `/Resources`, or the dictionary of the drawing that named it when it has none. A drawing is visited once per stream and dictionary (keyed as `drawingsOf` keys its units), so a form with no resources of its own, named from two dictionaries, is read in each, and a cycle ends. A name with no entry adds nothing, and an entry no glyph side drawing names adds nothing.

- **AC-2**: **The other side.** Every indirect object the role walk reaches from its starting point by a path that never passes through a Type 3 font's `/CharProcs` or `/Resources`. The open and the run walk from the pages (`walkRoles(doc, "read", "pages")`), since a walk from the catalog refuses a page tree node with no `/Type`; the check walks from the catalog, as today. It is judged by keys, not names, so an entry a page lists but never draws still counts. How the walk finds it is under *Data model sketch*.

- **AC-3**: **The rule.** A file breaks the glyph rule when either holds:
  - (a) **text below a glyph**: any drawing on the glyph side holds a text showing operator (`Tj`, `TJ`, `'` or `"`), whatever font is in force, set by `Tf`, by a graphics state's `/Font`, or by none;
  - (b) **a shared drawing**: an object on the glyph side that the role walk reaches as a form, a picture or a tiling pattern (label `form`, `image` or `tiling-pattern`), or the stream of a glyph procedure itself (which a page's `/Contents` could also hold, both in role `content`), is also on the other side.

  A graphics state, shading, shading pattern, function, colour space, font or property list both sides reach is never shared for this rule. Whether any text draws a glyph plays no part (INV-1).

- **AC-4**: **A glyph side drawing the scan cannot read.** When the scan answers `"unsure"` for a drawing on the glyph side, the rule judges it as the worst it could do: it names every entry of the dictionary it draws with (each adds what it holds, as AC-1 says), and it shows text when that dictionary holds a `/Font` entry, or an `/ExtGState` entry holding `/Font`. Each form or tiling pattern it adds is judged on its own read. The same judgement holds in the open, the run and the check (INV-3). The open's `marked-descriptions` warning for an unreadable stream (spec 0019, AC-9) is unchanged.

- **AC-5**: **Refused at open.** The open judges the glyph rule (`judgeGlyphs`) on the prepared review copy, from the open's existing role walk from the pages (a walk with a problem is refused there already), and refuses a file that breaks it with `unreadable-structure`, at the place the role walk's own refusal is raised (after the empty clip refusal, before the trim). No session exists and nothing is detected. The words are `FAILURE_TEXT["unreadable-structure"]`, unchanged. The four fixtures of AC-8 are refused at open; the controls of AC-9 open.

- **AC-6**: **Refused in a run before anything is removed.** A run judges the glyph rule on its prepared working copy, right after `prepareDocument` and before the trim, through a new `Pipeline` seam, `judgeGlyphs`, whose default is `glyphRuleOf` in `src/engine/glyphs.ts`: one read only walk from the pages (`walkRoles(doc, "read", "pages")`), `"problem"` at once when that walk names a problem (its units are then empty, so nothing could be judged), else `judgeGlyphs(walk)`. The run refuses with `unreadable-structure` on any answer but `"clean"`, and on a throw, before any pass removes anything. A test can swap the seam out. A throw while judging at open is `unreadable-structure` too.

- **AC-7**: **The self check holds what the written bytes can show.** The structure part answers `"leak"` (so `redaction-incomplete`) for a written file in which any drawing on the glyph side shows text (AC-3 a), judged by `judgeGlyphs` on the output's role walk, which scans only the glyph side (empty in a file with no Type 3 font, so spec 0019's budget documents pay nothing). It does not judge a shared drawing (AC-3 b) on the written bytes: after the passes the page names MuPDF's redacted copy and the glyph names the original, so no written file shows the sharing, and a write that merges two identical pictures would make a clean file look shared. That part is held by AC-5 and AC-6 on the bytes a run redacts. The call sits in `structureIsClean` after resource use's `"leak"` return and before `return use`, so `"text"` is a leak that outranks `"unreadable"` and `"unused-colour-space"` and never leads to a second write. A glyph side drawing the scan cannot read is judged by AC-4 here too, so it can answer `"text"` rather than resource use's `"unreadable"`; in practice an output never holds one, since the `sanitize` write rewrites every glyph procedure.

- **AC-8**: **The measured cases fail first.** Each case measured on 2026-11-17 (`rationale.md`, *Measurements*) is a committed fixture written by `scripts/make-fixture.mjs` from a new builder, `scripts/lib/glyph-fixtures.mjs` (never by MuPDF), with a test in `tests/unit/redaction-glyphs.test.ts` that fails on main and passes after (spec 0004, INV-3). Each test reads the output with `tests/support/mupdf.ts`, never the engine's readers. Each fixture's exact objects are under *Fixture recipes*:
  - `glyph-undrawn-form.pdf`: a page draws a form holding `SECRET-42` beside a Type 3 font whose second glyph, which no text draws, names the same form. Main makes a file holding `SECRET-42` with `SECRET-42` ticked.
  - `glyph-drawn-form.pdf`: the same page with both glyphs drawn (`(ab) Tj`). Main makes a file holding `SECRET-42`.
  - `glyph-shared-picture.pdf`: a page draws an image mask under the line "Sort code 40-11-22 used", beside a Type 3 font whose undrawn glyph names the same picture in its own resources. With `40-11-22` ticked, main makes a file holding the blanked copy and the original byte for byte.
  - `glyph-text.pdf`: a page shows `SECRET-42` in Helvetica beside a Type 3 font whose undrawn glyph writes `BT /F9 1 Tf (SECRET-42) Tj ET` with `/F9` in its own resources. With `SECRET-42` ticked, main makes a file holding it.

  After: each is refused at open, and in a run with nothing ticked and with its ticked set, with `unreadable-structure`. With `judgeGlyphs` skipped through the seam and the ticked set ticked, `glyph-undrawn-form.pdf`, `glyph-drawn-form.pdf` and `glyph-text.pdf` fail the check with `redaction-incomplete` (text below a glyph, AC-7), and `glyph-shared-picture.pdf` makes a file still holding the original, a test that pins why AC-7 leaves sharing to the refusals.

- **AC-9**: **What still opens.** Each control is a committed fixture from the same builder that opens with no finding it lacked on main, runs with nothing ticked and with its ticked set, makes a file, passes the check, and renders every page as main does:
  - `glyph-emoji.pdf`: Chrome's shape, as measured (`rationale.md`, *What Chrome writes*): an undrawn notdef glyph of paths, a drawn glyph naming a form in the font's own resources that fills through a shading pattern with a graphics state the page also lists and uses, and a drawn glyph naming a picture held only in the font's resources, beside the Helvetica line "Invoice for Jane Example", ticked set `Jane Example`.
  - `glyph-bitmap.pdf`: a bitmap font's shape, in its hardest form for this rule: a Type 3 font with no resources of its own, so it draws with the page's dictionary, whose `d1` glyphs draw an inline image mask whose data holds the bytes `EI` and `Tj`, one drawn and one not, beside the Helvetica line "Bitmap font sample 12345678", ticked set `12345678`. Measured passing today (`rationale.md`, *A bitmap font with no resources*).

  Both fixture sets keep two suites that read every committed fixture whole: the Type 3 text sits on a line of its own, so `tests/unit/detection.test.ts` finds no glyph off its line, and neither control may warn, so `tests/unit/marked.test.ts`'s "only committed fixture that warns" holds (the four AC-8 fixtures are refused at open, so they warn on no page).

  More documents are built in `tests/unit/glyphs.test.ts`, not committed: an undrawn glyph whose procedure the scan cannot read, in a font whose own resources hold no font, opens (with `marked-descriptions`, as today), and the same with `/F9` in those resources is refused (AC-4); a glyph procedure that is also one part of a page's `/Contents` array is refused (AC-3 b); and a glyph naming a visible annotation's normal appearance is refused, since the open's bake makes that appearance the page's own XObject, the same object (measured, `rationale.md`, *Annotations after the bake*).

- **AC-10**: **The gate and the budgets.** Every fixture of AC-8 and AC-9 joins `MAIN_FIXTURES` in `tests/support/redaction-gate.ts`, its open, run and `sanitized` rows read from 5c4e0d7's code (a `git archive` of it, never the current code), with `NEEDLES` for the two controls only, since the four refused fixtures never run there. A new record, `OPEN_NOW`, read with `in` like `RUN_NOW`, holds `unreadable-structure` for the four fixtures of AC-8, and a new `openKindNow(name)`, written like `runKindNow`, replaces every read of `MAIN_OPEN_REFUSALS` (the open test, the early return before the run tests, and the tables check), so a fixture `OPEN_NOW` refuses runs no further gate test, as a main refusal does. A tables test holds that `OPEN_NOW` names only `MAIN_FIXTURES`. If 5c4e0d7's code makes no file for a control, that control takes a `RUN_NOW` row, and "renders as main" means the `MAIN` pipeline. The `MAIN` pipeline swaps `judgeGlyphs` out too. Every other committed fixture keeps its rows: none holds a Type 3 font (measured 2026-11-17). Spec 0019's two budgets in `tests/unit/cost.test.ts` and spec 0006's open budget stand as written and pass with the run's extra walk counted.

- **AC-11**: **The words.** On the security page (`src/app/security/page.tsx`), the original copy line ends "such as on another page where you ticked nothing.", dropping ", or in a font character that no text shows". Its source comment says the "only" now rests on two gates every file passes: the structure check's reachability (spec 0019, AC-5), and the glyph rule's refusal at open and before the passes (this spec, AC-5 and AC-6), with the check failing text below a glyph (AC-7); the paragraph about the measured font character case moves to a pointer to this spec. A `SECURITY_CHANGES` entry in `src/lib/policy-changes.ts` says the original copy of a figure or picture can no longer stay in a font character, dated the day it merges, a literal, 2026-11-18 or later: 2026-11-17 already holds an entry, and the list runs strictly newest first (`tests/unit/policy-changes.test.ts`). The When it stops paragraph is unchanged, since it says "among others". `/tool`'s words are unchanged; the comment above `FAILURE_TEXT["unreadable-structure"]` in `src/lib/flow-text.ts` names this spec's AC-5 and AC-6 beside spec 0019's AC-3. The home page is unchanged (no line of `src/lib/home-text.ts` names a font character).

- **AC-12**: **The amends and the rows.** Specs 0004, 0018 and 0019 are amended in place per *Amends*. Feature 31's Done when drops its Type 3 exception, and feature 30's row ticks the glyph rule, both in `docs/scope/scope.md`.

## Decision

**Chosen option**: Option 1: Glyphs stay inside their font

Refuse any file in which something a Type 3 font's glyphs draw, drawn by text or not, shows text, or names a form, picture or tiling pattern that something outside every Type 3 font also reaches, at open, again in a run before anything is removed, and in the self check for the part the written bytes can show.

## Feature design

**Data model sketch** (no stored data; the engine's in memory additions, all frozen plain data):
- `DrawingRead.showsText: boolean` in `src/engine/marked.ts`: the streams hold a text showing operator (`Tj`, `TJ`, `'`, `"`). Bytes inside a string, an inline image's data or a comment are never an operator, by the lexer's existing rules. It lives in the scan's `Semantics` beside `names`, is copied by `copy()` so `retry()` restores it after a false `EI` (a flag kept outside would stick from bytes read past one and refuse a bitmap font), and is ORed across streams in `readDrawing`'s merge.
- The walk's `Drawer` gains a kind (`form`, `tiling-pattern` or `type3-font`), so a font's drawer is known by its kind, never by `joined` being false.
- `RoleWalk.glyphs: readonly DrawingUnit[]` in `src/engine/allowlist.ts`: one unit per Type 3 font drawer and each dictionary it draws with (its own `/Resources`, else each dictionary in the drawer's `from`), its streams the font's glyph procedures, `joined` false. A font dictionary written in place and found twice gives two drawers and two units; duplicates are allowed.
- `RoleWalk.outside: ReadonlySet<number>`: the indirect object numbers reached by a path that never passes through a Type 3 font's `/CharProcs` or `/Resources` (AC-2). Computed after the walk's loop, never by visiting an object again (a second visit would mint fresh ids for dictionaries written in place, giving `resourceUse` an owner with no units, and push deletions twice, moving `strays`). Each work item carries its nearest indirect ancestor and a `barred` flag, set on items pushed from a `type3-font` visit under `/CharProcs` or `/Resources` and carried through direct containers. Every edge from an ancestor to an indirect object is recorded before `reach` can return early, and `outside` is every indirect object reachable from the starting points over unbarred edges.
- On a walk that names a problem, `glyphs` and `outside` are empty, as `pages` and `owners` are.
- `GlyphVerdict = "clean" | "text" | "shared"`, `judgeGlyphs(walk: RoleWalk): GlyphVerdict` and `glyphRuleOf(doc: PDFDocument): GlyphVerdict | "problem"` in a new file, `src/engine/glyphs.ts`. `judgeGlyphs` scans the glyph side itself through `readDrawing`, in the open, the run and the check alike, and never caches a read by `PDFObject` (MuPDF.js hands out a new wrapper on every `get`). `glyphRuleOf` is the seam's default: a read walk from the pages, `"problem"` if it names one, else `judgeGlyphs`. `"text"` outranks `"shared"`, so the check and the refusals name the same cause first.

**State transitions**:
- The open: door, open, password, page cap, layers, prepare, the role walk, inspect, `no-readable-text`, the empty clip refusal, the role walk's `unreadable-structure` refusal, **the glyph rule's `unreadable-structure` refusal**, trim. Detection follows.
- The run: inventory, prepare, **the glyph rule** (refuse before anything is removed), trim, validate targets, slant, images, record every page, the three passes, rebuild, write, self check (which now also fails text below a glyph); the second write as spec 0019 has it.

**Engine surface** (internal; no endpoint, no message, no stored value):

| Function | File | Inputs | Output | Errors |
|---|---|---|---|---|
| `readDrawing` (changed) | `marked.ts` | streams, owning `/Properties`, `joined` | `DrawingRead` with `showsText`, or `"unsure"` | none (doubt is `"unsure"`) |
| `walkRoles` (changed) | `allowlist.ts` | document, `"read"` or `"prune"`, `"catalog"` or `"pages"` | `RoleWalk` with `glyphs` and `outside` | its `problem`, as today |
| `judgeGlyphs` (new) | `glyphs.ts` | a `RoleWalk` | `GlyphVerdict` | a throw, which callers turn into `unreadable-structure` |
| `glyphRuleOf` (new) | `glyphs.ts` | the prepared working copy | `GlyphVerdict` or `"problem"` | as above |
| `Pipeline.judgeGlyphs` (new seam, default `glyphRuleOf`) | `redact.ts` | the prepared working copy | `GlyphVerdict` or `"problem"` | as above; the run refuses on anything but `"clean"` |
| `structureIsClean` (changed) | `self-check.ts` | output, page count | `StructureVerdict`, `"leak"` on `"text"` | as today |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Glyph rule | each Type 3 font's glyph procedures and the dictionary they draw with | `RoleWalk.glyphs`, built from the walk's `type3-font` drawer (its kind, `glyphProcedures`) and its `own ?? from` dictionaries |
| Glyph rule | the dictionary a form or tiling pattern below a glyph draws with | its own `/Resources` read through `hasKey`, else the dictionary of the glyph side drawing that named it (AC-1) |
| Glyph rule | where the walk starts | `"pages"` at open and in the run, `"catalog"` in the check (AC-2) |
| Glyph rule | the names a drawing uses | `readDrawing(...).names` (spec 0019, *Scan rules*) |
| Glyph rule | whether a drawing shows text | `readDrawing(...).showsText` (new) |
| Glyph rule | what an entry holds | the entry read through its reference (`get`, `isStream`, `isDictionary`), never `.resolve()` (spec 0019, AC-16) |
| Glyph rule | whether an object is a form, a picture or a tiling pattern | `RoleWalk.reached`'s labels (`form`, `image`, `tiling-pattern`) |
| Glyph rule | object identity | `asIndirect()`; every form, picture and tiling pattern is a stream, so always indirect |
| Glyph rule | the other side | `RoleWalk.outside` (new) |
| Open and run refusal | the kind | `unreadable-structure`, existing in `ENGINE_ERROR_KINDS` (spec 0019, AC-3) |
| Open and run refusal | the words | `FAILURE_TEXT["unreadable-structure"]`, unchanged (spec 0007, AC-16) |
| Self check | whether a glyph side drawing shows text | `judgeGlyphs` on the output's `walkRoles(check, "read")`, the walk `structureIsClean` already makes |
| Security page | the change entry's date | the merge day, written as a literal |

**Key invariants**:
- **INV-1**: The rule never depends on whether a glyph is drawn. MuPDF's readers see a glyph as one character either way, and both a drawn and an undrawn glyph kept the original (measured).
- **INV-2**: The rule refuses and nothing else. It never deletes, edits or rewrites a glyph procedure, a resource entry or a content stream (spec 0004, INV-13), and nothing the scan answers changes what the rebuild keeps (spec 0019, INV-4).
- **INV-3**: One function, `judgeGlyphs`, decides the glyph side for the open, the run and the check, so the three never disagree on it.
- **INV-4**: Sharing is by object identity, on drawings only, never by content. A picture byte for byte the same as one a page draws is not an original copy, and a picture under no removed item keeps its stored bytes (spec 0006, AC-29).
- **INV-5**: Doubt leans toward refusing wherever the rule can judge: the other side by keys (AC-2), a glyph side drawing the scan cannot read as its worst (AC-4), a throw or a walk problem as a refusal (AC-6). One judgement passes at open on a guess: an unreadable glyph drawing whose dictionary holds no font is taken to show no text. The `sanitize` write rewrites that procedure, so the check reads it again on the written bytes (AC-7) and fails it if it shows text there.
- **INV-6**: No new failure kind, page finding, word on `/tool`, config value or telemetry field. A refusal carries its kind and nothing derived from the document.

**Security model**: no accounts or roles are involved; the rule runs in the worker on the visitor's copy, and nothing leaves the browser. What it defends against: a ticked value's original figure or picture surviving through a font character (drawn or not), and text written inside a font character that detection, the passes and the check can never see. What it does not change: embedded fonts still keep the shapes of removed characters (spec 0004, *Security model*), emoji glyph drawings included, and names a file chooses can stay as written (spec 0019, AC-14).

**Configuration required**: none. The rule is a rule about the file format, so it lives in `src/engine` with no setting that could switch it off.

**Fixture recipes** (for `scripts/lib/glyph-fixtures.mjs`, written with `stream` and `writePdf` from `pdf-writer.mjs` and the trailer `/Root 1 0 R`, as today's probes were; no `/ToUnicode` anywhere, no date, no randomness):

Shared by the three form fixtures (`glyph-undrawn-form.pdf`, `glyph-drawn-form.pdf`, `glyph-text.pdf`):
1. `<< /Type /Catalog /Pages 2 0 R >>`
2. `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`
3. `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /T3 7 0 R >> /XObject << /Fm0 6 0 R >> >> /Contents 4 0 R >>`
4. contents: `BT /F1 12 Tf 72 700 Td (Glyph probe line) Tj ET q 1 0 0 1 72 500 cm /Fm0 Do Q BT /T3 24 Tf 72 300 Td (a) Tj ET`, with `(ab) Tj` in `glyph-drawn-form.pdf`
5. `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
6. a stream with `/Type /XObject /Subtype /Form /BBox [0 0 300 100] /Resources << /Font << /F1 5 0 R >> >>`, drawing `BT /F1 12 Tf 10 50 Td (SECRET-42) Tj ET`
7. `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /ga 8 0 R /gb 9 0 R >> /Encoding << /Type /Encoding /Differences [97 /ga /gb] >> /FirstChar 97 /LastChar 98 /Widths [1000 1000] /Resources << R >> >>`, where `R` is `/XObject << /Fm0 6 0 R >>`, or `/Font << /F9 5 0 R >>` in `glyph-text.pdf`
8. glyph `ga`: `1000 0 0 0 1000 1000 d1 0 0 1000 1000 re f`
9. glyph `gb`: `1000 0 d0 /Fm0 Do`, or `1000 0 d0 BT /F9 1 Tf (SECRET-42) Tj ET` in `glyph-text.pdf`

Ticked set: `SECRET-42` on page 1 (one target).

`glyph-shared-picture.pdf`: objects 1, 2, 5, 8 as above, and:
- 3: the page with `/Resources << /Font << /F1 5 0 R /T3 7 0 R >> /XObject << /Mask 6 0 R >> >>`
- 4: `q 0.2 0.2 0.8 rg 170 0 0 20 140 624 cm /Mask Do Q BT /F1 12 Tf 150 630 Td (Sort code 40-11-22 used) Tj ET BT /T3 24 Tf 72 300 Td (a) Tj ET`
- 6: a stream with `/Type /XObject /Subtype /Image /Width 680 /Height 80 /ImageMask true /BitsPerComponent 1 /Filter /FlateDecode`, holding 6,800 zero bytes deflated
- 7: the Type 3 font above with `R` = `/XObject << /Im0 6 0 R >>`
- 9: `1000 0 d0 /Im0 Do`

Ticked set: `40-11-22`.

`glyph-emoji.pdf`:
- 1, 2, 5 as above
- 3: the page with `/Resources << /Font << /F1 5 0 R /T3 7 0 R >> /ExtGState << /G3 10 0 R >> >>`
- 4: `/G3 gs BT /F1 12 Tf 72 700 Td (Invoice for Jane Example) Tj ET BT /T3 24 Tf 72 400 Td (ab) Tj ET`
- 7: `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /g0 8 0 R /ga 9 0 R /gb 11 0 R >> /Encoding << /Type /Encoding /Differences [96 /g0 /ga /gb] >> /FirstChar 96 /LastChar 98 /Widths [1000 1000 1000] /Resources << /XObject << /Xa 12 0 R /Xb 13 0 R >> >> >>`
- 8: `1000 0 0 0 1000 1000 d1 0 0 m 0 1000 l 1000 1000 l 1000 0 l h f`
- 9: `1000 0 d0 1 0 0 1 0 0 cm /Xa Do`
- 10: `<< /ca 1 /BM /Normal >>`
- 11: `1000 0 d0 1 0 0 1 0 0 cm /Xb Do`
- 12: a stream with `/Type /XObject /Subtype /Form /BBox [0 0 1000 1000] /Resources << /ExtGState << /G3 10 0 R >> /Pattern << /P1 14 0 R >> >>`, drawing `q 0 0 1000 1000 re W n /G3 gs /Pattern cs /P1 scn 100 100 800 800 re f Q`
- 13: a stream with `/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, holding 192 bytes of `0xF0` deflated
- 14: `<< /Type /Pattern /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1000 1000] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0.9569 0.4706] /C1 [1 0.6902 0.1804] /N 1 >> >> >>`

Ticked set: `Jane Example`.

`glyph-bitmap.pdf`:
- 1, 2, 5 as above
- 3: the page with `/Resources << /Font << /F1 5 0 R /T3 7 0 R >> >>`
- 4: `BT /F1 12 Tf 72 700 Td (Bitmap font sample 12345678) Tj ET BT /T3 24 Tf 72 400 Td (a) Tj ET`
- 7: the Type 3 font of the form fixtures with no `/Resources` key at all
- 8 and 9: each `1000 0 0 0 1000 1000 d1 q 1000 0 0 1000 0 0 cm BI /IM true /W 8 /H 8 /BPC 1 /D [1 0] ID `, then the eight bytes `FF 45 49 20 54 6A 81 FF`, then ` EI Q`

Ticked set: `12345678`.

**Critical test scenarios**:
- Happy path for safety: each AC-8 fixture is refused at open and in a run with `unreadable-structure`, and each failed on main first, verifies **AC-5**, **AC-6**, **AC-8**.
- Chrome and bitmap font shapes: `glyph-emoji.pdf` and `glyph-bitmap.pdf` open, run ticked and unticked, pass the check and render as main, verifies **AC-9**, **AC-10**.
- The check alone: with `judgeGlyphs` skipped, three fixtures fail `redaction-incomplete` and the shared picture one makes a file holding the original, verifies **AC-7**.
- Each edge of the glyph side, in `glyphs.test.ts`: a form, a picture with `/SMask` and `/Mask`, a mask chain (a glyph only picture whose `/SMask`'s `/SMask` is the page's picture is refused), a tiling pattern, a shading pattern written in place whose soft mask group is the page's form (refused), a graphics state's soft mask group, an unused entry (never refuses), a name with no entry, a font with no resources of its own, a form with no resources of its own named from two fonts' dictionaries (read in each), two Type 3 fonts sharing a form (passes), a graphics state the page shares (passes), a glyph procedure that is also part of a page's `/Contents` (refused), a glyph naming an annotation's appearance (refused after the bake), text through `Tf`, through a graphics state's `/Font` and through none, text in a form a glyph draws, a cycle, a missing key read without a throw, verifies **AC-1** to **AC-4**.
- The walk: `outside` by edges, with `strays` and every existing `allowlist.test.ts` count unchanged; a font written in place inside another font's resources and listed by a page gives no owner with no units; a walk with a problem gives empty `glyphs` and `outside`, verifies **AC-2**, **AC-6**.
- The scan: `showsText` for each operator, false for the same bytes inside a string, an inline image's data and a comment, and false again after a retry past a false `EI` whose bytes read as `Tj`, verifies **AC-3**.
- Unreadable glyph: the two built documents, verifies **AC-4**, **AC-9**.
- Words: the security page test pins the new line and the absent clause; the component test that `unreadable-structure` shows its words still passes, verifies **AC-11**.

## Build plan

Skateboard: the thinnest whole that closes the leak comes first (the failing fixtures, the scan's flag, the walk's two fields, the rule and the run's refusal, tasks 1 to 5), then the refusal at open, the check, the gate and the words grow around it.

1. Write `scripts/lib/glyph-fixtures.mjs` to *Fixture recipes* and add it to `scripts/make-fixture.mjs`: the four AC-8 fixtures and the two AC-9 controls. Add `tests/unit/redaction-glyphs.test.ts` reading each output with `tests/support/mupdf.ts`, and watch the four fail on main and the controls pass; rerun the fixture script and commit what changes, satisfies **AC-8**, **AC-9**
2. Add `showsText` to `DrawingRead` in `marked.ts`, kept in `Semantics` and copied by `copy()`, with its unit tests in `tests/unit/marked.test.ts`, and reword the file's header to list the new output, satisfies **AC-3**
3. Give `Drawer` its kind and add `glyphs` and `outside` to `RoleWalk` in `allowlist.ts` (edges with a nearest indirect ancestor and a `barred` flag, `outside` computed after the loop, no object visited again), with the walk tests in *Critical test scenarios*, satisfies **AC-1**, **AC-2**
4. Write `src/engine/glyphs.ts` with `judgeGlyphs` and `glyphRuleOf`, and `tests/unit/glyphs.test.ts` covering every edge in *Critical test scenarios* and the built documents, and map the file in `index.ts`'s header, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**
5. Add `judgeGlyphs` (default `glyphRuleOf`) to the `Pipeline` seam in `redact.ts`, called right after `prepareDocument` and before the trim, refusing with `unreadable-structure` on any answer but `"clean"` and on a throw; the four fixtures now refuse in a run, satisfies **AC-6**, **AC-8**
6. Raise the glyph rule's refusal in `open.ts` from the open's existing walk, right after the role walk's refusal; the four fixtures refuse at open and the controls open, satisfies **AC-5**, **AC-8**, **AC-9**
7. Add the text part to `structureIsClean` in `self-check.ts`, calling `judgeGlyphs` on the walk it already makes, after resource use's `"leak"` return and before `return use`, and answering `"leak"` on `"text"` only; add the seam tests (three fixtures fail `redaction-incomplete`, the shared picture one keeps its original), satisfies **AC-7**, **AC-8**
8. Add the six fixtures to `tests/support/redaction-gate.ts` with rows read from 5c4e0d7's code, `NEEDLES` for the two controls, `OPEN_NOW` with `openKindNow` in all three places and its tables test, and `judgeGlyphs` swapped out of `MAIN`; run `tests/unit/cost.test.ts` alone and confirm both budgets and the open budget pass, satisfies **AC-10**
9. Change the security page's original copy line and its source comment, add the `SECURITY_CHANGES` entry (dated the merge day, 2026-11-18 or later), name this spec in the `flow-text.ts` comment, and update `tests/component/app/security-page.test.tsx`, satisfies **AC-11**
10. Amend specs 0004, 0018 and 0019 per *Amends*; update feature 31's Done when and feature 30's row; `/sync` then writes the `AGENTS.md` lines (the open's and the run's order, `glyphs.ts` in *Files*, the scan's new output, the gate's `OPEN_NOW`), satisfies **AC-12**

## Consequences

**Positive**:
- Spec 0004's AC-4 holds with no exception: a ticked value can no longer leave through a font character, drawn or not, as a shared figure, a shared picture or text written inside a glyph.
- The visitor learns at open, before ticking, with words that already exist, and no new kind, finding, word or telemetry field enters the protocol.
- Chrome and Google Docs emoji and matplotlib's charts keep today's outcome (both measured), and so does any font whose glyphs draw only paths or inline pictures, since such a glyph names nothing and shows no text.
- The security page's original copy line loses its font character clause, and its "only" now rests on gates every file passes.

**Negative / tradeoffs**:
- A file can be refused where nothing would leak: a glyph naming a form or picture a page lists but never draws, a Type 3 font with no resources of its own naming a page's figure the page never draws, or a producer that writes text inside a glyph. None was seen in Chrome or matplotlib, the two producers measured; TeX, Ghostscript and cairo were not installed, and no corpus of real files was read, since none may be committed.
- A font with no resources of its own (matplotlib's three, measured) passes only while the scan reads every glyph: one glyph it cannot read, with the page's dictionary holding fonts, refuses the file (AC-4). Every matplotlib glyph read to its end.
- The check cannot see a shared picture on the written bytes, so that part of the guarantee rests on the refusals at open and before the passes, on the same bytes the run redacts. A test pins the gap so it stays visible.
- `unreadable-structure` now has two causes, and the counts carry kinds only, so spec 0019's month of counts cannot tell a glyph refusal from a role walk refusal.
- The refusal's words stay general ("built in a way RedactNest can't check safely") and do not say "font", so a visitor gets no hint of which part to change.
- A run walks its working copy once more before the passes: about 2.5% of the run on one page drawing 10,000 forms (one walk measured at 250 ms against 10,234 ms).

**Neutral**:
- No migration, no stored data and no setting: one deploy, and one revert undoes it.
- Detection still cannot see inside a font character; files where that could matter are now refused instead of cleaned.
- Spec 0019's `marked-descriptions` warning still reads every glyph procedure and still warns about descriptions inside one.

## Follow-up

- [ ] Drop the glyph procedures no text draws (subsetting Type 3 fonts), with spec 0004's own subsetting revisit, to narrow "embedded fonts keep the shapes of removed characters". Measured for it: MuPDF's drawing callback names an unnamed Type 3 font after its object (`Type3 (7 0 R)`) and gives each glyph as its character code, and `subsetFonts()` left every Type 3 glyph procedure in place.
- [ ] When spec 0019's month of counts is read (from about 2026-12-08), read `unreadable-structure` knowing it now has two causes.
- [ ] Feature 30's other items build from their own specs (0006, 0007, 0013); this spec decides only the glyph rule.
- [x] `/debug`: a made up matplotlib chart (matplotlib 3.11.2, Type 3 by default) refuses a run with `redaction-incomplete` when `12345678` in its title is ticked, on today's engine, while ticking `Jane` in its legend, and ticking nothing, make a file (measured 2026-11-17, `rationale.md`, *What matplotlib writes*). It fails closed and is older than this spec, so it is not part of it; find why before a visitor meets it on a chart. Found 2026-11-18, and it stays refused as a recorded MuPDF limit: the chart's x axis label reaches past the page's bottom, so the trim's pass rewrites the page without its `0 0 Td`, and MuPDF's text pass then carries the removed title value's advance across `ET` and `BT` into the next text object, moving the legend, which the self check refuses. Type 3 fonts play no part; `trim-carry.pdf` pins it in Helvetica (`tests/unit/trim.test.ts`).
- [x] `/sync`: the `src/engine/AGENTS.md` lines in task 10. Done in 55d57ec.

## Rationale

Reasoning, options and measurements: see [rationale.md](rationale.md).
