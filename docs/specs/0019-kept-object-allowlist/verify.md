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
