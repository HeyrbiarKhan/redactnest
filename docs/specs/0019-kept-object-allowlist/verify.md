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
- [ ] Read `/` → the lead, the "Removed, not covered" card, the Strips card's list (no XMP metadata) and the band's note read as AC-12 gives them → AC-12
- [ ] Read `/security` → the five changed lines read as AC-14 gives them, "Last updated" is the merge day, and the Changes list has the new entry first → AC-14
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
