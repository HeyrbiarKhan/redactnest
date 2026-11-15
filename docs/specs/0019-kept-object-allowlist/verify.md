# Verify: leaks through kept objects · spec 0019 · 2026-11-15

_Steps derived from spec 0019's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Use only the PDFs in `tests/fixtures`, and documents built in a test or a scratch script. Never open a PDF from anywhere else on this computer._

## Engine, by script

Run each from a scratch test that loads the real engine (`redactDocumentWith`, `openDocumentWith`) and reads outputs with `tests/support/mupdf.ts`, never the engine's own readers.

- [ ] Each `kept-*.pdf` case as AC-4 lists it, on this branch → the self check passes, the needle is in none of the output's decompressed bytes in either string encoding, and `kept-picture.pdf`'s output has no stream decoding to the original mask → AC-1, AC-2, AC-4
- [ ] The same cases checked out on main (`git stash` or a worktree) → each keeps its needle, which shows the fixtures fail first → AC-4
- [ ] Replay feature 31's in memory recipes on `form-xobject.pdf`, `images-under.pdf` and `metadata.pdf` (a private key on page 1's first font pointing at the form, the mask, `/Annots`, the catalog extras; pdfTeX's keys; `/Ref` and `/OPI` embedded files) → nothing kept, as `rationale.md` records for the prototype → AC-1, AC-4
- [ ] Try to break the rule with keys nobody listed: a private key holding a string on a font descriptor, a colour profile, a graphics state, a shading and a function; an `/Alternates` image on a picture under a ticked value; a private array of references on a page's resources dictionary → each key and what only it reached is gone, and the run passes → AC-1, AC-2
- [ ] Hand the run bytes with a font whose `/Widths` is a dictionary, and with one stream reached as both page contents and a form → refused with `unreadable-structure`; the same bytes through `openDocumentWith` → refused at open with `unreadable-structure`, no review; a page tree node with no `/Type` and resources inherited from the tree → opens and runs → AC-3
- [ ] A document whose prune empties a property list and a graphics state → the write merges them into one object, and the check passes it → AC-5
- [ ] An `/ActualText` around only a filled shape, inline and named → the page warns at open, and a run with nothing ticked keeps the string (the pin) → AC-9, AC-10
- [ ] Run every committed fixture with nothing ticked, on main and on this branch → same outcome, same `removedByType`, same `sanitized` (bar the `kept-*.pdf` cases), and every page renders the same → AC-7
- [ ] Open `marked-descriptions.pdf` → `marked-descriptions` on exactly the pages AC-10 lists; open every other committed fixture → none carries it → AC-9, AC-10

## UI / manual

- [ ] On `/tool`, open `tests/fixtures/marked-descriptions.pdf` → the warning callout shows AC-9's line naming the warned pages; tick the value on its first page and press Redact 1 item → the download is named partly redacted, and the warning before download names the finding → AC-9, AC-13
- [ ] On `/tool`, open `tests/fixtures/kept-embedded.pdf` and `kept-annotations.pdf`, make a cleaned copy with nothing ticked → "Also stripped" names attachments (and annotations on the second); download each and read it with a scratch script → no embedded file, no note text → AC-8, AC-13
- [ ] Read `/` → the lead, the "Removed, not covered" card, the band's heading, its first card's title and closing line, the Strips card's list (no XMP metadata) and the band's note read as AC-12 gives them, and no other "finds" or "found" on the page makes a claim → AC-12
- [ ] Read `/security` → the five changed lines and the heading What it looks for (its address still ending `#what-it-finds`) read as AC-14 gives them, no other "finds" or "found" on the page makes a claim, "Last updated" is the merge day, and the Changes list has the new entry first → AC-14
- [ ] Walk spec 0018's AC-5 over every line AC-12 and AC-14 change (sourced, safe direction, absolutes behind a gate, said once), opening each source the comment names → AC-12, AC-14
- [ ] Run axe on `/tool` with `marked-descriptions.pdf` open, and on `/` → no violations → AC-9, AC-12

## Commands

- [ ] `pnpm exec vitest run tests/unit/redaction-kept.test.ts tests/unit/allowlist.test.ts tests/unit/marked.test.ts tests/unit/redaction-check.test.ts tests/unit/redaction-inventory.test.ts tests/unit/reading.test.ts tests/unit/fixtures.test.ts` → all pass → AC-1 to AC-10
- [ ] `pnpm exec vitest run tests/unit/cost.test.ts`, alone → all pass: under 200 ms on 50 dense pages, and under 15% of the run on 10,000 form XObjects → AC-11
- [ ] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/app/home-page.test.tsx tests/unit/page-findings.test.ts tests/component/tool-client.test.tsx` → all pass → AC-9, AC-12 to AC-14
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` → clean → all
- [ ] `node scripts/make-fixture.mjs`, then `git status tests/fixtures` → clean → AC-4, AC-10

## Acceptance criteria coverage

- AC-1, AC-2 … the `kept-*.pdf` steps, the break attempts, `allowlist.test.ts`
- AC-3 … the refusal step, `allowlist.test.ts`, the open's refusal tests
- AC-4 … the fixture steps on both branches, `redaction-kept.test.ts`
- AC-5, AC-6 … `redaction-check.test.ts` (each single fault document, the prune skipped)
- AC-7 … the every fixture step and its gate test
- AC-8 … the `/tool` attachments step, `redaction-inventory.test.ts`
- AC-9, AC-10 … the scan steps, the `/tool` warning step, `marked.test.ts`, `reading.test.ts`
- AC-11 … `cost.test.ts`
- AC-12 … the `/` read and the AC-5 walk
- AC-13 … the `/tool` steps, `tool-client.test.tsx`
- AC-14 … the `/security` read and the AC-5 walk
- AC-15 … the fourth pass's colour steps, `redaction-kept.test.ts`
- AC-16 … the shared fixture steps, the pin, the lint step, `engine-wall.test.ts`
- AC-17 … the fourth pass's fixture steps on both branches, `fixtures.test.ts`

## Fourth pass (added by /architect, 2026-11-15)

_Steps for AC-15 to AC-17 and the sentences they add to AC-5, AC-7 and AC-11. Same rules: only `tests/fixtures` and documents built in a test or a scratch script._

### Engine, by script

- [ ] Run each of `colour-icc-alternate.pdf`, `colour-icc-bare.pdf`, `colour-calrgb.pdf`, `colour-calgray.pdf` and `colour-inline.pdf` with nothing ticked → a file is made; every page renders as the run with the prune, the structure check and `rewrite` swapped out; no resource dictionary in the output holds a `/ColorSpace` entry → AC-15, AC-17
- [ ] The same five through a pipeline whose `rewrite` returns its input → each fails with `redaction-incomplete`, which is what this branch did before the change → AC-15, AC-17
- [ ] The same five checked out on main → each makes a file, with the entry still in its resources, which is why the gate rows say they run → AC-7, AC-17
- [ ] `colour-loaded.pdf` through a pipeline whose `rewrite` throws → a file is made, and every page's entry is still there and still named → AC-15, AC-17
- [ ] Try to make the second write pass something: an output that keeps an unused colour space entry through both writes, one beside an unreadable drawing stream, one beside an off list key, one beside an unused font → `redaction-incomplete`, `unsupported` with no second write, `redaction-incomplete` with no second write, `redaction-incomplete` with no second write → AC-5, AC-15, INV-8
- [ ] Count how often the second write runs over the whole unit suite and the gate (a scratch log in `rewrite`) → never, outside the colour fixtures → AC-7, AC-15
- [ ] Count `checkStructure` calls with a counting stub → once on a clean run, twice when the first answer is `unused-colour-space`, once on a leak and on an unreadable stream → AC-15
- [ ] On a document built in a scratch test with the unreadable profile beside a picture: a `rewrite` that throws → `redaction-incomplete`; a `rewrite` that writes the picture's data empty → `unsupported`; the real `rewrite` → a file, with the same forms and picture lengths in both outputs → AC-15, INV-8
- [ ] Over `metadata.pdf` and every `kept-*.pdf`, count what `forEachDictionary` visits → more than nothing, and as many dictionaries as `everyDictionary` in `tests/support/mupdf.ts` finds → AC-16
- [ ] Run `shared-pictures.pdf` with nothing ticked and with the first page's line ticked, and `shared-forms.pdf` with nothing ticked → a file each time, every picture's stored bytes equal to the source's, every form's text there, every page with nothing ticked drawn as the source draws it; on main the pictures come out blank and the forms run refuses with `unsupported` → AC-16, AC-17
- [ ] Open `shared-pictures.pdf` from bytes in a scratch test, resolve every stream, write with `WRITE_OPTIONS` → its pictures leave with no data; write it without the resolve → they keep it (the pin) → AC-16
- [ ] Add a `.resolve()` call to any file in `src/engine` → `pnpm lint` fails with the ban's message; the same call in a scratch file under `tests/` → no lint error → AC-16

### Commands

- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-kept.test.ts tests/unit/redaction.test.ts tests/unit/redaction-check.test.ts tests/unit/engine-wall.test.ts` → all pass → AC-5, AC-15 to AC-17
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → all pass, the eight new fixtures included, `shared-forms.pdf` the one run outcome changed on purpose → AC-7
- [ ] `pnpm exec vitest run --project unit tests/unit/cost.test.ts`, alone → both allowlist budgets pass, and both budget documents run through a `rewrite` that throws → AC-11
- [ ] `node scripts/make-fixture.mjs`, then `git status tests/fixtures` → clean → AC-17

## As built (added by /develop, 2026-11-15)

_What the build added for verify to run. Behaviour only; the figures live in the test output._

### Commands

- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → every committed fixture opens as main's code opened it, runs with nothing ticked to main's outcome and `sanitized` (only `kept-embedded.pdf` gains `attachments`), and every page of every output, nothing ticked and each ticked set the suites use, renders the same as the run with the prune and the structure check swapped out. Main's rows are frozen literals read from 5c4e0d7's code in `tests/support/redaction-gate.ts` → AC-7
- [ ] `pnpm exec vitest run --project unit tests/unit/cost.test.ts`, alone (it is a stopwatch, and the 10,000 form case takes minutes) → the allowlist's work stays under 200 ms on the 50 page document and under 15% of a run on 10,000 forms, and the open budgets, which now count the walk and the scan, still pass → AC-11
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-kept.test.ts tests/unit/allowlist.test.ts tests/unit/marked.test.ts` → the six cases, the check with the prune skipped, one fault per document, resource use, the refusal, the scan's probes and `marked-descriptions.pdf`'s pins → AC-1 to AC-6, AC-8 to AC-10
- [ ] `pnpm exec vitest run --project component tests/component/tool-client.test.tsx -t "descriptions written|says plainly"` → the warning line at open and above Download, the partly redacted name, and `unreadable-structure`'s words → AC-3, AC-13

### Value sourcing, one step per row

- [ ] An object's role: a stream with `/Type /Font` reached as `/XObject` with `/Subtype /Image` is walked as an image, never a font → *Value sourcing*, role
- [ ] The keys an object may keep: a private key on a font is deleted by the prune and fails the check when the prune is skipped → `ROLES`
- [ ] Where a string may stay: on a named property list, `/ActualText` stays and `/Alt` goes; a string at a listed key that is not a string place is refused → `STRING_PLACES`
- [ ] The trailer's keys: an output trailer holding `/ID` fails the check → `TRAILER_KEYS`
- [ ] An indirect non dictionary's kind: one array reached as a font's `/Widths` and as a colour space is refused → *Role table*, kinds
- [ ] The refusal kind: a shape the walk cannot read refuses at open and in a run with `unreadable-structure`; an unreadable output stream fails a run with `unsupported` unless a glyph that survived outranks it with `redaction-incomplete` → AC-3, AC-5
- [ ] An unreached object: an object nothing reaches, an embedded file stream included, fails the check → AC-5
- [ ] An object in two roles: one stream reached as page contents and as a form is refused; one empty dictionary reached as a property list and a graphics state passes → AC-3, AC-5
- [ ] An unused resource: a font entry no drawing names fails the check; `/DefaultRGB` passes unnamed → *Resource use*
- [ ] `marked-descriptions` on a page: the scan reads the page's contents and every form, tiling pattern and Type 3 glyph procedure the walk names, with the owning `/Properties`; `/Lang (en-GB)` is quiet and `/Lang (Jane Smith)` warns → AC-9, `LANG_TAG`
- [ ] `sanitized` holding `attachments`: an embedded file stream or a file specification holding `/EF` that nothing reaches is reported → AC-8

### Found while building

- [ ] MuPDF 1.28.1: in the rebuilt document, a stream the carrier sweep resolves loses its data when the deduplicating write merges an object that stream's own dictionary points to. Two identical pdfTeX info dictionaries on a form and an image made a run with nothing ticked fail `unsupported` (the form's text was gone). The prune reads only through references, so it never triggers this; the sweep, unchanged, still can. Open on main too.

## As built: the words (added by /develop, 2026-11-15)

_Tasks 12 to 15. Five lines changed from the words AC-12 and AC-14 first gave, each recorded as built in `index.md`: AC-12's closing line and three of AC-14's lines read wider than their gates under spec 0018's AC-5 and were narrowed, and the Notes and attachments line restated the band's note, so by spec 0018's AC-6 it links that note and keeps only the security page's own words. After the verify, `/debug` narrowed the closing line again and two more lines to selectable text (the "Removed, not covered" card, and the security page's text item), since the self check's text part never reads a scan's ink. Read `/` and `/security` against those as built notes._

### UI / manual

- [ ] Read `/` → the lead "RedactNest looks for … in your PDF and lets you tick what to remove.", the card "Selectable text you tick is taken out of the page, and document info and attachments are stripped.", the heading "What RedactNest looks for and strips", the first card titled "Looks for" and closing on "No selectable text wholly inside a page's visible area is removed unless you tick it.", the Strips card's six kinds (no XMP metadata) and its note naming "a note's hidden text and any attached file" → AC-12
- [ ] On `/tool`, open `tests/fixtures/trim-text.pdf` and make a cleaned copy with nothing ticked; read the download with a scratch script → its "Edge", which crosses the visible edge, is gone, which is why the closing line says "wholly inside a page's visible area" → AC-12, as built
- [ ] At 1280 pixels, look at the band → the Strips card holds six rows (three a column) beside seven, both cards stand the same height, and the pair still reads as one; judge whether the shorter list needs a design change → AC-12
- [ ] Build the fixture script's OCR scan (`ocrPage` in `scripts/lib/redaction-fixtures.mjs`) in a scratch copy with its lines 14.4 pt apart, tick "Quigley" and read the output → ink of the line above is blanked, the run passes and every other word of the text layer stays, which is why the closing line, the card and the security page's text item say "selectable"; at 18 pt nothing beside the word is blanked → AC-12, AC-14, as built
- [ ] Read `/security` → the check's text item opening "Selectable text, spaces aside:", item 8's "out of the text the page draws", the original copy line ending "a figure or picture they do not reach, directly or through what they use", the structure item's "almost all of it what a page needs to draw", Hidden data's four unreported kinds, Notes and attachments linking the band's note ("how comments and form fields are flattened, and what goes with them") and saying only that a note or attachment is taken off the page and the icon can stay, the descriptions line ending "warns about each page where it finds some", and the heading What it looks for at `#what-it-finds` → AC-14, as built
- [ ] Read `/security`'s "Last updated" and Changes → the new entry is first, dated 16 November 2026, the earliest day it can merge (2026-11-15 is First published, and no two entries share a day); move it to the real merge day if that is later → AC-14
- [ ] Walk spec 0018's AC-5 over each changed line on both pages, opening each source its comment names → each absolute sits behind a gate every file passes or a step that does not exist → AC-12, AC-14

### Commands

- [ ] `pnpm exec vitest run tests/unit/home-text.test.ts tests/component/app/home-page.test.tsx tests/component/app/security-page.test.tsx tests/unit/policy-changes.test.ts` → all pass, the narrowed lines pinned word for word and their wider readings held off the page → AC-12, AC-14
- [ ] `pnpm exec playwright test --project=chromium tests/e2e/design-system.spec.ts tests/e2e/legal-pages.spec.ts -g "home|security"` → all pass: the band's heading and titles, six strips split three and three, equal card heights, axe, 320 pixels and doubled text, and every `/security` check → AC-12, AC-14
- [ ] `pnpm exec vitest run --project component tests/component/tool-client.test.tsx -t "descriptions written|says plainly"` → `/tool`'s words stand: AC-9's warning line, the partly redacted name and `unreadable-structure`'s words → AC-3, AC-13

### Value sourcing, the words

- [ ] The closing line's reach: `whollyInside` in `src/engine/trim.ts` lets a character that crosses the visible edge by any amount go, and the self check compares against the page after the trim → "wholly inside a page's visible area" is the gate's reach (spec 0004, AC-13; spec 0006, AC-16)
- [ ] "Selectable": `comparePage` in `src/engine/characters.ts` compares the characters MuPDF's structured text gives, and the padded pass blanks pictures over `paddedArea` (`TARGET_PADDING_RATIO` of the quad's height above and below) → the text part never reads a scan's ink, so the closing line, the card and the text item each say "selectable" (spec 0004, AC-13 and its *Decision* bullet "Padded area")
- [ ] "Almost all of it what a page needs to draw": read `ROLES`, `CATALOG_KEYS` and `STRING_PLACES` → the keys kept that no page needs to draw are the catalog's `/Lang`, a property list's `/ActualText` and `/MCID`, and a resource dictionary's `/Properties` and `/ProcSet`
- [ ] "A figure or picture they do not reach": every figure or picture in an output is reached through a resource entry a drawing stream names, or through what that uses (a soft mask's group, an image's mask), and an unreached one fails the check → AC-5
- [ ] "Warns about each page where it finds some": an inline property list whose `/Alt` is written as a name stays quiet (`holdsString` in `src/engine/marked.ts` counts strings only) → the line claims no more than the scan → AC-9
- [ ] Said once: follow the Notes and attachments link → it lands on the band, whose note names a note's hidden text and any attached file; the security page names neither (spec 0018, AC-6). `prepareDocument` deletes unseen annotations and bakes the rest (`doc.bake(true, true)`), so what a note's appearance draws is page text and stays, which is why the band says "hidden" → spec 0004, AC-22

## As built: the fourth pass (added by /develop, 2026-11-15)

_Steps the build added beside the architect's fourth pass steps above. Same rules: only `tests/fixtures` and documents built in a test or a scratch script._

### Each guard fires on its own

- [ ] In a scratch copy of `src/engine/redact.ts`, skip the `sameDrawnShape` comparison, then run "fails with unsupported when the second write changes what a page draws" → the run makes a file, so the drawn shape is what catches a picture written empty → AC-15, INV-8
- [ ] In a scratch copy of `src/engine/objects.ts`, send each numbered object through `walkDirect(doc.newIndirect(num), visit)` → the `forEachDictionary` count tests and "makes a file when the sweep alone strips every carrier" fail, so the top level visit is what keeps the sweep, the inventory and the carrier check reading → AC-16
- [ ] Write an unbalanced string into a page's contents, a form, a tiling pattern and a Type 3 glyph procedure beside the unreadable profile, and run each → every one makes a file through the second write, since `sanitize` rewrites all four kinds; that is why the run level "beside an unreadable drawing" test uses a structure stub over the real verdict → AC-5, AC-15
- [ ] Cancel at the checkpoint before the second write (an `isCancelled` that turns true once the structure check has answered) → `RunCancelled`, and `rewrite` is never called → AC-15

### Value sourcing, the fourth pass

- [ ] Whether to write twice: a counting `checkStructure` over the real one on `colour-calgray.pdf` → `["unused-colour-space", "clean"]` and one `rewrite` call; on `text-page.pdf` → one call and no `rewrite` → AC-5, AC-15
- [ ] The bytes that cross after a second write: read `rewriteOutput` in `src/engine/rebuild.ts` → it calls `Document.openDocument`, `asPDF`, `saveToBuffer(WRITE_OPTIONS)`, `takeOutput` and `destroy`, nothing else; the run returns the second bytes, and the second `checkOutput` is called with `mayRewrite` clear → INV-8
- [ ] Whether the second write kept every form and picture: `drawnShape` on both outputs of a colour fixture → the same form count and the same sorted image stored lengths → AC-15
- [ ] An unused colour space entry: `structureIsClean` on a document built in a test with an unused `/ColorSpace` entry alone → `unused-colour-space`; beside an unused font in a later owner → `leak`; beside an unsure drawing in another owner → `unreadable`; beside an off list key → `leak` → AC-5
- [ ] Every numbered object: `grep -rn "resolve(" src/engine` → only comments; add `ref.resolve()` or `ref["resolve"]()` to a file in `src/engine` → `pnpm lint` fails with the ban's message → AC-16, INV-9

### Commands

- [ ] `pnpm test` → everything passes but, on this machine, possibly a stopwatch in `tests/unit/cost.test.ts`; then `pnpm exec vitest run tests/unit/cost.test.ts` alone → all nine pass, "writes neither budget document a second time" among them → AC-11
