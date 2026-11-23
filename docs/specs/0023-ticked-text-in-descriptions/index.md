# 0023. Fail a run whose descriptions keep ticked text

**Date**: 2026-11-23
**Status**: Accepted
**Updated**: 2026-11-23, as built, wording only, no new decision. AC-2 and AC-3 said a Type 3 font with no `/Resources` is read in `resourcelessUse`; the walk reads it under the resource dictionary it inherits, the page's, and the test pins that, reaching `resourcelessUse` through a page with no resource dictionary instead. The *Amends* table adds spec 0019's INV-4, whose list of what the scan answers now includes `describesTicked`. *Follow-up* points at the older refusal of a page with no `/Resources`, now in the scope's Deferred list.

## Summary

A PDF can write words about its drawing into the page itself: replacement text (`/ActualText`, the words copy and paste gives instead of the glyphs drawn) and descriptions for screen readers (`/Alt`, `/E`). `/debug` measured that when a span holding a ticked word also draws something besides the word (a shape, a highlight, a clip, a form), MuPDF removes the word's glyphs but keeps the span, so the ticked word stays in the cleaned file and the self check passes. From now on the self check reads every such description string still in the output, joined in the order each drawing writes them so a word split across two spans is still caught, and fails the run with `replacement-text` when they hold a ticked text, the same way spec 0021 already holds the catalog's `/Lang`, `/Registry` and `/Ordering`. Nothing changes at open, and a file with nothing ticked runs exactly as today. Replacement text over glyphs that are still drawn is left to the character check, so a row the list shows as blocked never refuses a run that ticked another place with the same words.

## Amends specs 0001, 0004, 0007, 0019 and 0021

Applied in place when this spec is built (task 6): each spec names spec 0023 in its `**Updated**` line, and each changed line carries an _Amended by spec 0023_ note.

| Spec | Section | Change |
|---|---|---|
| 0001 | The one named exception to "one PDF parser", as specs 0019, 0020 and 0022 amend it | `marked.ts` also answers whether a description string in a drawing holds a ticked text, when the self check hands it the ticked list. It still edits nothing, and the answer only fails a run (AC-1). |
| 0004 | AC-13 (the self check's structure part), AC-25 (the order of kinds), *Security model* (the bullet on descriptions written inline, from spec 0019) | The structure part answers `"ticked-description"` when a description string in the output holds a ticked text, and `checkOutput` fails the run with `replacement-text`, ranked after `redaction-incomplete` and before `unsupported` (AC-2). The descriptions bullet adds: a run refuses when one holds a ticked text (AC-2). |
| 0007 | AC-16 (words for every kind) | `replacement-text`'s body covers a description for screen readers as well as replacement text (AC-5). |
| 0019 | *Scan rules* (marked content), INV-4 (what the scan answers), AC-5 (`StructureVerdict`'s order), *Resource use* | The scan takes the ticked list and answers `describesTicked` (AC-1), so INV-4's list of what the scan answers adds it. Like the rest, the answer only fails a run and never changes what the rebuild keeps. Resource use passes the list to every read, and the structure part answers `"ticked-description"`, ranked after `"unreadable"` and before `"leak"`, so it never leads to a second write (AC-2). AC-9 and AC-10 are unchanged (AC-6). |
| 0021 | AC-4's bullet "`/ActualText` is outside this check", *Follow-up* | `/ActualText` and every other description string are held by spec 0023's check, inside the structure part (AC-2). The measure item is ticked, with a pointer here. |

## Requirements

**User stories**:
- As a visitor, I want a run that leaves a word I ticked anywhere in the cleaned file to stop rather than hand me a copy that looks clean, so a passing check always means my ticked words are gone.
- As a visitor, I want a file whose descriptions hold none of my ticked words to clean exactly as it does today, warnings included.
- As a visitor, when a run stops for this reason, I want words that tell me what kind of hidden text held my item and what to try next.

**Acceptance criteria**:

- **AC-1**: **The comparison, in the scan.** `readDrawing` and `scanContent` in `marked.ts` take a fourth argument, `ticked: readonly string[]` (the run's folded ticked texts, `foldTicked`), defaulting to empty, and `DrawingRead` gains `describesTicked: boolean`. With an empty list nothing is decoded or compared and `describesTicked` is false, so every caller that passes none (the open's `inspect.ts`, `glyphs.ts`) answers exactly as today. With a list, the scan collects every **description string** it settles, and `describesTicked` is true when they hold a ticked text (the joined fold below). The description strings are:
  - Every string anywhere inside a property list written inline as the dictionary operand of a `BDC` or a `DP`, nested arrays and dictionaries included, walked with a list and never recursion, as `holdsString` walks: `/Alt`, `/E`, `/Lang` (a language tag or not, as spec 0021 holds the catalog's `/Lang`), private keys, all of them. These are settled at the `BDC` or `DP`. There is one exception: on a `BDC`, a **top level** `/ActualText` whose value is a string waits for its sequence (next bullet). An `/ActualText` written as an array or a dictionary, or a key named `ActualText` nested under another key, is an ordinary string place and is settled at once.
  - The top level string `/ActualText` of a `BDC`, inline or in a property list named in the owning `/Properties`, settled at its `EMC` (or the end of the stream, for a sequence never closed): it counts when its sequence drew no text. "Drew text" means a text showing operator (`Tj`, `TJ`, `'`, `"`) in this stream inside the sequence or a sequence nested in it, the same rule spec 0019's AC-9 uses for its warning. Text a form draws when the span invokes it with `Do` does not count as drawn, on purpose: counting it would reopen the measured form leak (AC-3, page 4). The cost is a false refusal that fails safe (*Consequences*).
  - The `/ActualText` of a `DP`, inline or named, settled at the `DP`, always, since a point is never a sequence.
  - For a named list, only its `/ActualText` is read. The prune cuts a named list to `/ActualText` and `/MCID`, and any other key there already fails the role walk as a leak. A drawing read with `properties` `null` (one with no resource dictionary) names no list.

  **The joined fold.** Each settled string is decoded with `decodeTextString` and folded with `foldPlaceText` (spec 0021's fold: lowercase, NFKD, letters and digits only). The folds are joined, with nothing between them, in the order the scan settles them, one join per call of `scanContent` (so per drawing, and per glyph procedure for a read with `joined` false). `describesTicked` is true when the join contains any ticked fold (containment, as `holdsTicked` does). A string inside the join holding a ticked text is caught, and so is a ticked text split across strings, such as `/ActualText (Jane)` and `/ActualText (Smith)` in two spans that each also draw a shape. A string that cannot be decoded makes `describesTicked` true at once (INV-6). `ADOBE_COLLECTIONS` plays no part: it names the format's own values at a `CIDSystemInfo`, never words in a description.

  **The scan's records.** `Sequence.actualText` becomes the pending string's bytes, or `null` (a `BMC`, a list with no top level string `/ActualText`, or none at all). `readInlineList` and `readNamedList` hand back, beside what they answer today, the strings to settle now and the pending `/ActualText` bytes. The join and `describesTicked` live in the scan's `Semantics` and are copied by `copy()`, like `showsText`, so a retry past a false `EI` forgets a string read from a picture's data. Byte arrays are never changed after they are read, so `copy()`'s shallow copy may share them. The answer is a boolean. No decoded text leaves the scan (INV-3).

- **AC-2**: **The check.** `StructureCheck` takes a third argument, the folded ticked list, and `structureIsClean(check, sourcePageCount, ticked = [])` passes it to every `readDrawing` that `resourceUse` and `resourcelessUse` make. Those two read every drawing the walk reaches: each page's contents and every form XObject, tiling pattern and Type 3 glyph procedure it draws. A drawing with a resource dictionary is read under its owner in `walk.owners` (a form with no `/Resources` of its own sits under the dictionary it inherits, as the walk already records). A Type 3 font's glyph procedures are one unit with `joined` false, so each procedure is read, and joined, on its own: under the font's owner when the font has `/Resources`, else under the dictionary it inherits, the page's, as a form with none is. `resourcelessUse` reads only the drawings the walk reaches with no resource dictionary at all, such as a page with none. _As built, 2026-11-23: this said a font with no `/Resources` is read in `resourcelessUse`; the test pins that it is read under the page's owner._ A read with `describesTicked` makes the structure part answer `"ticked-description"`. In `resourceUse` that is a flag of its own, beside `unreadable`, `lostPicture` and `unusedColourSpace`. It is still set when another drawing of the same owner reads `"unsure"` (the `continue` there skips only the unsure read), and it is tested before `unreadable` when the function answers. An early `"leak"` return still wins. `resourcelessUse`'s answer gains `"ticked-description"` on the same terms, and `structureIsClean`'s closing `worseOf` ranks the two answers by `VERDICT_RANK`. `VERDICT_RANK` becomes `clean`, `unused-colour-space`, `lost-picture`, `unreadable`, `ticked-description`, `leak`. `checkOutput` passes the `tickedTexts` it already holds (spec 0021). On `"ticked-description"` it never answers `"rewrite"`, still compares every page, and answers by this order: a character outside the visible area, or a ticked leak on a page, is `redaction-incomplete`; then `"ticked-description"` is `replacement-text`; then an unreadable stream or a lost picture is `unsupported`; then a page's replaced text is `replacement-text`; then overreach is `redaction-overreach`. `checkOutput` keeps the hit in a flag of its own (`described`), beside `leaked`, `escaped`, `replaced`, `overreached` and `unreadable`. The structure verdicts are exclusive, so `unreadable` stays false when the verdict is the hit. With nothing ticked the list is empty, so the answer cannot arise. `tickedAtStringPlace` (spec 0021, AC-4) is unchanged and still runs right after the structure part, outside the seam. Its hit returns `redaction-incomplete` at once, so it outranks this one. A structure `"leak"` returns before both.

- **AC-3**: **The measured leaks close.** A new fixture, `marked-ticked.pdf` (in `scripts/lib/kept-fixtures.mjs`), Helvetica, one page per case. `MARKED_TICKED_TEXT` is a record keyed by page, holding a distinct made up name for each page; no name, and no folded name, appears on any other page or inside another page's name. So ticking "a page's name" means the targets `findTargets` (`tests/support/targets.ts`) finds for that page's name, which lie on that page only, and the run's folded list holds that name alone. Page 9's name is two words written in two spans, and page 10's name appears twice on its own page (once drawn, once in replacement text); neither repeats elsewhere. The property lists are built as `/debug` measured them:
  1. an inline `/Span << /ActualText (name) >> BDC` around the name's glyphs and a filled shape outside the name's box;
  2. the same, with a highlight wider than the name's box drawn inside the span;
  3. the same, with only a clip (`re W n`) inside the span besides the glyphs;
  4. the same, with a form XObject drawn inside the span;
  5. a property list named in `/Properties`, its `/ActualText` holding the name, around the name's glyphs and a filled shape;
  6. the name drawn plainly, beside an inline `/Figure << /Alt (A photo of name) >> BDC` around a shape;
  7. the name drawn plainly, beside a `DP` whose inline list holds `/ActualText (name)`;
  8. a control: an inline `/Span << /ActualText (name) >>` around exactly the name's glyphs;
  9. a name split across two spans, as Word style files write replacement text a word at a time: `/Span << /ActualText (first) >>` around the first word's glyphs and a filled shape, then `/Span << /ActualText (second) >>` around the second word's glyphs and a filled shape;
  10. a name drawn plainly, beside a `/Span << /ActualText (the same name) >>` whose only drawing is `Do` of a form that draws other text (the form text case, *Consequences*).

  Ticking a page's name fails pages 1 to 7 and page 9 (both words ticked as one name) with `replacement-text` and makes no file. On today's code each makes a file whose decompressed bytes still hold the name, or both words for page 9 (`containsInAnyEncoding`), so those tests fail first. Page 8 ticked makes a file without the name (MuPDF drops the span). Page 10 ticked fails with `replacement-text`: the recorded false refusal, which fails safe and is pinned so a change to it shows. With nothing ticked, the file is made and opens with the warnings it gives today: pages 6, 7 and 10 warn with `marked-descriptions` (page 10's `/ActualText` sits round no text drawn in its own stream), and pages 1 to 5, 8 and 9 do not.

  **Page 7 is measured first.** Spec 0019's AC-10 pins that MuPDF keeps an inline `/Alt` round a shape, but nothing pins that it keeps a `DP` beside drawn text after a run. Task 1 measures it on today's code. If the run drops the `DP`, page 7 makes a clean file when ticked, becomes a control, and this AC and `rationale.md` record the measurement. The rule is unchanged either way.

  The same rule holds in a form XObject, a tiling pattern and a Type 3 glyph procedure, on documents built in the test: an inline `/Alt` holding a ticked name around a shape fails the run with `replacement-text`, and the same document with nothing ticked makes a file. The glyph procedure draws only shapes, so the glyph rule (spec 0020) passes it. It is read per procedure (`joined` false), under the font's owner when the font has `/Resources`, else under the page's owner, the dictionary it inherits. The test builds one font with resources and one without and pins where each is read. It reaches `resourcelessUse` through a second page with no resource dictionary, holding only an inline `/Alt` with the ticked name, read on the source, since a run on such a page already refuses with nothing ticked (*Follow-up*). _As built, 2026-11-23: this said the two fonts reach both reads._

- **AC-4**: **The blocked row passes, a shown limit.** A second fixture, `marked-blocked.pdf`, one page: a line drawing a name plainly, and a second line where an inline `/Span << /ActualText (the same name) >>` sits over other glyphs (`/debug`'s measured blocked shape). The find step lists the second place as a blocked row (`replacement-text`, spec 0005), so it cannot be ticked. Ticking the plain row makes a file. The span's `/ActualText` still holds the name in the output, and the check passes, because that span still draws glyphs, so the character check reads its replacement text as page text, expected as an unticked place. This is the one recorded limit here: unticked text the list showed as blocked can stay, as spec 0019 says unticked text can. Against it, page 6 of `marked-ticked.pdf` is the contrast case: a description around no text holding the ticked name refuses (AC-3). The plain row and the span holding the same name is this fixture's whole point: unlike `marked-ticked.pdf`, the name repeats on purpose, and the span is never compared because it still draws glyphs.

- **AC-5**: **The words.** `FAILURE_TEXT["replacement-text"]` in `src/lib/flow-text.ts` keeps its title ("A ticked item can't be removed safely") and its next step. Its body becomes: "It sits inside hidden text written into the file, such as replacement text (the words copy and paste gives instead of what's drawn) or a description for screen readers, which can't be removed safely. RedactNest made no file." The words come from the kind alone (spec 0007, AC-16): no page, no item, nothing from the document. The tests that hold the words (`tests/unit/flow-text.test.ts`, `tests/component/tool-client.test.tsx`, wherever they pin this body) change with it. The blocked row's note in `src/lib/detectors.ts` is unchanged.

- **AC-6**: **Nothing else changes.** The open passes no list, so every page's findings are unchanged and no new warning exists. `marked-descriptions.pdf` warns on the same pages, and spec 0019's AC-10 pin still holds: its ticked `jane.doe@example.com` folds to `janedoeexamplecom`, which "Alternate text naming Jane Doe" does not contain, so the `/Alt` stays and the run makes a file. Every committed fixture keeps its gate row (`tests/support/redaction-gate.ts`). The two new fixtures take their main rows from 5c4e0d7's code, and `NEEDLES` ticks only `marked-ticked.pdf`'s page 8 name and `marked-blocked.pdf`'s plain row, both of which make a file as on main. Neither fixture needs an `OPEN_NOW` or `RUN_NOW` row: both open as main does, and with nothing ticked both make a file as main does. The refusals of pages 1 to 7, 9 and 10 are held in the unit test, as spec 0021 holds `kept-cid-strings.pdf`'s. There is no new `EngineErrorKind`, no protocol, telemetry or privacy policy change, and no config. `/tool`'s `marked-descriptions` line and the security page keep their words: "can stay in the file, even around text you tick" stays true for a description that does not hold the ticked text. The budgets in `tests/unit/cost.test.ts` pass unchanged, run alone.

- **AC-7**: **The amends.** Specs 0001, 0004, 0007, 0019 and 0021 take this spec's *Amends* table, each with an `**Updated**` line and an _Amended by spec 0023_ note. Spec 0021's measure item in *Follow-up* is ticked with a pointer here. The security page's sections on descriptions and the self check are read again against the built code (root `AGENTS.md`, the security page rule), and change only if a line now claims more than the code does.

## Decision

**Chosen option**: Option 1, the self check compares. The scan that already reads every drawing for resource use also holds each description string against the run's folded ticked texts, and a hit fails the run with `replacement-text`.

One rule closes the measured `/ActualText` leak and the same miss for an inline `/Alt`, `/E` or `DP`. It edits no content stream (spec 0004, INV-13), refuses only files that actually keep a ticked text, and leaves the open and every run with nothing ticked as they are today.

## Rationale

Reasoning, the measurements and the options: see [rationale.md](rationale.md).

## Feature design

**Where the code lives**:

| File | Change |
|---|---|
| `src/engine/marked.ts` | `scanContent` and `readDrawing` take `ticked`; `Sequence.actualText` becomes the pending bytes or `null`; `Semantics` gains the join and `describesTicked`, copied by `copy()`; `operate` settles strings at `BDC` (every string but a pending top level string `/ActualText`), at `DP` (every string), at `EMC` and at the stream's end (a pending `/ActualText` whose sequence drew no text), appending each fold to the join and testing it; `readInlineList` and `readNamedList` hand back the strings to settle now and the pending bytes; `DrawingRead` gains `describesTicked`, ORed across reads like `showsText` (AC-1). |
| `src/engine/self-check.ts` | `StructureCheck` and `structureIsClean` take `ticked`; `resourceUse` keeps a `described` flag tested before `unreadable`, and `resourcelessUse` gains the answer; `VERDICT_RANK` and `StructureVerdict` gain `"ticked-description"`; `checkOutput` passes `tickedTexts` to `checkStructure`, keeps a `described` flag, skips `"rewrite"` on it and ranks it as AC-2 orders (AC-2). |
| `src/engine/redact.ts` | Nothing new: the folded list already reaches `checkOutput`, on both writes. `PIPELINE.checkStructure` stays `structureIsClean`. |
| `src/lib/flow-text.ts` | `replacement-text`'s body (AC-5). |
| `scripts/lib/kept-fixtures.mjs`, `scripts/make-fixture.mjs` | `marked-ticked.pdf` and `marked-blocked.pdf` with `MARKED_TICKED_TEXT` (AC-3, AC-4). |
| `tests/unit/marked.test.ts` | The scan's cases (AC-1). |
| `tests/unit/redaction-kept.test.ts` | The fixtures' runs, the places, the order of kinds, and no second write (AC-2 to AC-4). |
| `tests/support/redaction-gate.ts` | The two fixtures' main rows and `NEEDLES` (AC-6). |

**State transitions**: none new. The run's order is unchanged: the comparison happens inside the self check's structure part, on the first write's bytes and, if a second write runs, on its bytes too. A hit outranks `unused-colour-space`, so it never leads to a second write.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| The check | The ticked texts, folded | `foldTicked` over every target's `text` in `redact.ts`, once per run, already handed to `checkOutput` (spec 0021, AC-4) |
| The scan | Each description string | The written output's decoded drawing streams: inline lists from the `BDC` or `DP` operand; named lists from the owner's `/Properties`, which `resourceUse` already passes (`resourcelessUse` passes `null`, so a drawing with no resources has no named lists) |
| The scan | Whether a sequence draws text | `Sequence.drew`, set by a text showing operator inside it or a nested sequence (spec 0019, AC-9) |
| The scan | A string's text | `decodeTextString` in `allowlist.ts` (UTF-16BE after `FE FF`, else PDFDocEncoding; undecodable counts as a hit) |
| The scan | Whether they hold a ticked text | The join of every settled string's `foldPlaceText`, in the order settled, one join per `scanContent` call, tested for containment of any ticked fold (AC-1) |
| The scan | When a pending `/ActualText` is settled | Its sequence's `EMC`, or the end of the stream; a `DP`'s at once (AC-1) |
| The check | The kind | `checkOutput`'s order (AC-2): `replacement-text` |
| `/tool` | The refusal's words | `FAILURE_TEXT["replacement-text"]`, by the kind alone (AC-5) |
| The find step | The blocked row | Unchanged: the replacement text block (spec 0005) |

**Key invariants**:
- **INV-1**: One fold, one list. The scan folds with `foldPlaceText` and compares against the folded list that the rebuild and spec 0021's check also use, so no two parts of a run read a ticked text differently.
- **INV-2**: The scan stays read only. Its new answer only fails a run. It changes nothing the rebuild keeps, and no content stream is edited (spec 0004, INV-13; spec 0001's exception).
- **INV-3**: No document text leaves the scan. `describesTicked` is a boolean, and the folds and decoded strings live only for the length of the run, inside the worker, as the character record does. Nothing is logged, counted or sent.
- **INV-4**: Replacement text over glyphs drawn in its own stream is never compared. The character check reads it as page text, so a row the list shows as blocked never refuses a run that ticked another place with the same words (AC-4). The one exception fails safe: replacement text whose only text is drawn by a form it invokes is compared (AC-1, AC-3 page 10).
- **INV-5**: Nothing ticked, nothing changes. With an empty list the scan decodes nothing, and every open and every run with nothing ticked answers as today.
- **INV-6**: Fail closed. A description string that cannot be decoded counts as a hit, and a drawing the scan cannot read is `unsupported` unless a leak or a hit outranks it.

**Security model**: no new authorisation; the tool stays anonymous. Nothing new crosses the worker boundary: the refusal is an existing kind. No telemetry, privacy policy or content security policy change.

**Configuration required**: none.

**Critical test scenarios**:
- The scan, in `marked.test.ts`: an inline `/ActualText` around text only (no hit), around text and a shape where the text holds the ticked word (no hit in the scan, since text is drawn; in a run the character check catches the word while its glyphs stay, and the scan catches it once MuPDF removes them, as pages 1 to 4 show), around only a shape (hit); a named list around only a shape (hit) and around text (no hit); a `DP` inline and named (hit); a sequence never closed (hit); nested sequences, text in the inner one (no hit for the outer `/ActualText`); an `/ActualText` written as an array of strings, and a key named `ActualText` nested under another key, each around text (hit, settled at once); `/Alt`, `/E` and a private key nested in an array (hit); `/Lang (en-GB)` with `GB` ticked (hit); a UTF-16 and a hex string (hit); a string that cannot be decoded (hit); two spans `(Jane)` and `(Smith)` round shapes with `Jane Smith` ticked (hit, by the join), and the same two in two separate drawings (no hit, one join per call); a span round only `Do` of a form holding text (hit, the recorded false refusal); a ticked word only inside an inline picture's data before a false `EI` (no hit after the retry); the empty list (false everywhere, `describes` unchanged). Verifies **AC-1**.
- The fixtures' runs: pages 1 to 7, 9 and 10 each refuse with `replacement-text` and make no file, pages 1 to 7 and 9 failing first on today's code (page 7 as measured in task 1); page 8 ticked and nothing ticked each make a file. Verifies **AC-3**.
- The places: a form, a tiling pattern and a Type 3 glyph procedure each holding an inline `/Alt` with the ticked name refuse; nothing ticked makes a file. A font with no `/Resources` is read under the page's owner, and a page with no resource dictionary answers `"ticked-description"` through `resourcelessUse`. Verifies **AC-2**, **AC-3**.
- The order of kinds, with `checkOutput` on bytes built in the test: a hit beside an unused colour space entry answers `replacement-text` and never calls `rewrite` (a counting `rewrite`); a hit beside an unreadable stream, in the same owner and in another, answers `replacement-text`; a hit beside a ticked leak on a page answers `redaction-incomplete`; a hit beside a ticked text at a string place (spec 0021) answers `redaction-incomplete`; a hit with nothing ticked cannot arise (empty list). Verifies **AC-2**.
- The blocked row: `marked-blocked.pdf` with the plain row ticked makes a file whose output still holds the name in the span's `/ActualText`, read with `tests/support/mupdf.ts`. Verifies **AC-4**.
- The words: `flow-text.test.ts` and `tool-client.test.tsx` read the new body for a run refused with `replacement-text`. Verifies **AC-5**.
- Unchanged: the gate's four parts, `marked-descriptions.pdf`'s warnings and AC-10 pin, and `cost.test.ts` alone. Verifies **AC-6**.

## Build plan

Skateboard: the thinnest whole first is the measured leak closed end to end (a failing fixture, the scan, the check), then the edges, the words and the amends.

1. [x] Add `marked-ticked.pdf` (ten pages, a distinct name per page) and `marked-blocked.pdf` to `kept-fixtures.mjs` with `MARKED_TICKED_TEXT`, run `node scripts/make-fixture.mjs`, measure page 7's `DP` on today's code (AC-3), and write the fixtures' run tests in `redaction-kept.test.ts`, failing first: pages 1 to 7 and 9 ticked make a file holding the name today. Satisfies **AC-3**, **AC-4**.
2. [x] The scan: `ticked` on `scanContent` and `readDrawing`, the pending `/ActualText` on `Sequence`, the join and `describesTicked` in `Semantics` and `copy()`, the settling at `BDC`, `DP`, `EMC` and the stream's end, and every scan case in `marked.test.ts`. Satisfies **AC-1**.
3. [x] The check: `ticked` through `StructureCheck`, `structureIsClean`, `resourceUse` (its `described` flag before `unreadable`) and `resourcelessUse`; `"ticked-description"` in `StructureVerdict` and `VERDICT_RANK`; `checkOutput`'s `described` flag, its order and no `"rewrite"`; the fixtures' refusals now pass, then the places (form, tiling pattern, Type 3 glyph with and without `/Resources`) and the order of kinds tests. Satisfies **AC-2**, **AC-3**.
4. [x] The edges: the blocked row test, the gate's two main rows (read from 5c4e0d7's code, never the current code) and `NEEDLES`, `marked-descriptions.pdf`'s warnings and pin unchanged, and `cost.test.ts` run alone. Satisfies **AC-4**, **AC-6**.
5. [x] The words: `replacement-text`'s body in `flow-text.ts` and the tests that pin it. Satisfies **AC-5**.
6. [x] The close: specs 0001, 0004, 0007, 0019 and 0021 amended per the *Amends* table, spec 0021's Follow-up item ticked, and the security page's descriptions and self check sections read again against the code. Satisfies **AC-7**.

## Consequences

**Positive**:
- A ticked text no longer stays in an `/ActualText`, `/Alt`, `/E` or any other string in a marked content property list with the check passing, so spec 0004's AC-4 holds there too. This closes the measured leak and the older inline `/Alt` case with one rule.
- It costs nothing on a run with nothing ticked, and little with something ticked: the structure part already reads every drawing once, and only description strings are decoded and folded.
- No new kind, no new warning, no protocol change: the refusal reuses `replacement-text`, whose next step already fits.

**Negative / tradeoffs**:
- A file with such a span cannot have that word cleaned: every run that ticks it refuses after the visitor ticks, with no warning at open and no row named. The visitor finds it by unticking one group at a time, as the words say. Rare, as far as anything measured shows, and it fails safe.
- Containment on folded text can refuse a run that would have been clean: any short ticked value found inside an unrelated description refuses. That includes a custom term (two characters is the minimum, `TERM_MIN_CHARS`), such as `Li` inside "Lithium", a ticked year or run of digits inside `/Alt (Photo 2024)`, and a `/Lang` tag such as `en-GB` when `GB` is ticked. The join adds a few more, where the end of one description and the start of the next happen to spell a ticked fold. That is the same tradeoff spec 0021 took at the string places, accepted because it fails safe.
- Replacement text whose only text is drawn by a form it invokes (`Do` inside the span) is compared, though the character check would read it. Ticking the same words elsewhere then refuses the run (AC-3, page 10). Counting form text as drawn would reopen the measured form leak, so this false refusal is kept on purpose, and that page already warns at open.
- The comparison sits behind the `checkStructure` seam, unlike spec 0021's string place check. A test that swaps the structure check (the gate's `MAIN`) skips it. That is wanted for the gate's pixel comparison, but it means the worker's default is the only place it runs.
- A description written as a name rather than a string (`/Alt /JaneSmith`) is never compared, as the scan never counts names (spec 0019, AC-9). A ticked word matching such a name stays, as one matching a font's name already does (spec 0021, AC-4). This is the only place in a drawing the check does not read.
- The join is per drawing. A ticked text split across descriptions in two different drawings (one half on the page, the other in a form) is not caught. No measured file writes replacement text that way.

**Neutral**:
- `replacement-text` now covers two causes, so its count in telemetry can no longer tell a blocked replacement text from a ticked description. That is the same tradeoff spec 0020 took with `unreadable-structure`.
- Two new committed fixtures, and the scan's `Sequence` holds a few bytes per open sequence during the check.
- `src/engine/AGENTS.md`'s `marked.ts` and self check lines go stale with this build. Updating them is `/sync`'s job after the build, not this spec's.

## Follow-up

- [x] `/develop engine and code follow ups` builds this spec's six tasks, then `/check verify engine and code follow ups` covers it with spec 0022's still owed verify. Built and verified 2026-11-23.
- [ ] If a MuPDF release starts dropping a marked content sequence's property list when its glyphs go, spec 0019's AC-10 pin fails first. Read this rule again then. It stays correct, but it may never fire.
- [ ] A page with no `/Resources` at all, not inherited either, refuses every run with `redaction-incomplete`, even with nothing ticked, a blank page included. It is older than this spec (measured on main at 0ee7571 too) and fails safe. It is recorded in `docs/scope/scope.md`'s Deferred list, for `/debug` to find why before anyone decides.
