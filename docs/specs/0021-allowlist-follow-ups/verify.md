# Verify: allowlist follow ups · spec 0021 · updated 2026-11-21
_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use only the committed fixtures in `tests/fixtures`. Never open a PDF from anywhere else on the machine.

## UI / manual
- [ ] At `/tool`, choose `kept-lang.pdf` → the review opens; tick `Quinn Harlow`, Redact, Download → a file comes back; read it with a scratch script through `tests/support/mupdf.ts` → its catalog holds no `/Lang`, and `Quinn Harlow` is in neither string encoding of its decompressed bytes → AC-1, AC-5
- [ ] Choose `kept-cid-strings.pdf` → no review appears; the failure reads "RedactNest stopped to be safe" with "Part of this file is built in a way RedactNest can't check safely, so it stopped rather than guess, and made no file." and the start again step → AC-3, AC-5
- [ ] Choose `metadata.pdf`, Redact with nothing ticked, Download → the file's catalog still holds `/Lang (en-GB)` → AC-1
- [ ] Choose `marked-descriptions.pdf` → the same pages warn as before (spec 0019, AC-10), with the same words → AC-2, AC-9
- [ ] Choose `colour-icc-bare.pdf`, Redact with nothing ticked, Download → a file comes back (it takes the second write) → AC-8
- [ ] Open `/` and `/security` → no word has changed → AC-9

## Commands
- [ ] `pnpm exec vitest run tests/unit/redaction-kept.test.ts` → all pass: `kept-lang.pdf` ticked and not, `kept-cid-strings.pdf` refused at open and in a run, the catalog `/Lang` cases built in the test (`en-GB` with `GB` ticked left out), the `ACME12345` run refused when ticked, the string place check's five pairs, the indexed base pin, the drawn shape cases, the positive second write document and the five colour fixtures → AC-1, AC-3 to AC-5, AC-7, AC-8
- [ ] With `src/` checked out from `main` and the two new fixtures in place, the same file fails the `kept-lang.pdf`, `kept-cid-strings.pdf` and ticked text tests → AC-5 (fails first; measured during the build)
- [ ] `pnpm exec vitest run tests/unit/allowlist.test.ts tests/unit/marked.test.ts` → all pass: string places by `text`, the token's edges (16 passes, 17 refuses, empty passes; a leading digit, hyphen, underscore, space and UTF-16 refuse; every Adobe value passes; through a font, a character map and an indirect string), `foldPlaceText` and `holdsTicked`, the `LANG_TAG` table with its three pinned short names, `/Lang (Amy-Jones)` counting, AC-6's recipe reading at 16 and unsure at 17, the indexed base names → AC-2 to AC-4, AC-6, AC-7
- [ ] `pnpm exec vitest run tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → all pass, both fixtures listed, `kept-cid-strings.pdf` in `OPEN_NOW` → AC-5, AC-9
- [ ] `pnpm exec vitest run tests/unit/cost.test.ts` on its own → all pass: AC-6's 1 MB recipe within 2,000 ms, both spec 0019 budgets and spec 0006's open budget → AC-6, AC-9
- [ ] `pnpm exec vitest run tests/unit/redaction.test.ts` → all pass, `metadata.pdf`'s `/Lang (en-GB)` kept → AC-1
- [ ] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/app/home-page.test.tsx tests/unit/home-text.test.ts` → all pass with no test changed → AC-9
- [ ] `node scripts/make-fixture.mjs` then `git status tests/fixtures` → nothing changes, and no `detect-*.pdf` changed in the branch → AC-5
- [ ] `pnpm lint` and `pnpm typecheck` → no errors → AC-1 to AC-9

## Value sourcing (one step per row)
- [ ] The folded ticked texts come from `foldPlaceText` over every target's `text`, once per run, and the rebuild and the check get the same list → AC-1, AC-4
- [ ] Whether the catalog keeps `/Lang` comes from `readsAsLanguageTag` and `holdsTicked` on the source's bytes, in `graftPages` → AC-1
- [ ] Whether a string fits its place comes from that place's `text` in `STRING_PLACES`, the same function in the walk, the rebuild and the scan → AC-1 to AC-3
- [ ] The refusal for a bad `/Registry` or `/Ordering` is the walk's `"shape"`, so `unreadable-structure`, with `FAILURE_TEXT`'s words unchanged → AC-3
- [ ] A ticked text at a string place is `holdsTicked` over the catalog's `/Lang` and every `/Registry` and `/Ordering` not in `ADOBE_COLLECTIONS`, run in `checkOutput` before `"rewrite"`, so `redaction-incomplete` → AC-4
- [ ] The retries left come from `INLINE_END_RETRIES` and the count in `retry` → AC-6
- [ ] The colour space an inline picture names comes from its `/CS` or `/ColorSpace`, a name or an indexed array's second item → AC-7
- [ ] Whether the second write kept what the first drew comes from `drawnShape` of both bytes over the stream roles `ROLES` names, and `sameDrawnShape` with `BELOW_COLOUR_ROLES` (colour profiles only) → AC-8

## As built (2026-11-21, /develop tasks 1 to 12)
- [ ] `tests/support/redaction-gate.ts` has no `NEEDLES` row for `kept-cid-strings.pdf`: the gate's own table check ("tick only fixtures that open and run") forbids a ticked set for a fixture in `OPEN_NOW`, as for spec 0020's refused glyph fixtures. Its ticked run's refusal is held in `redaction-kept.test.ts` instead ("refuses a run handed its bytes with the name ticked") → AC-5
- [ ] In `redaction-kept.test.ts`, "fails beside an unused colour space entry and never writes twice" puts the square on a second page nobody ticks: a ticked page's contents go through MuPDF's filter in the pass, which drops the unused entry before the write. Expect the structure verdicts `["unused-colour-space"]`, `redaction-incomplete`, and no second write → AC-4
- [ ] A string at the catalog's `/Lang`, a `/Registry` or an `/Ordering` that cannot be decoded (a UTF-16 string of odd length) fails `checkOutput` closed whenever anything is ticked (`placeHoldsTicked` in `self-check.ts`); the walk refuses such a string first, so only a swapped structure check meets it → AC-4, INV-3
- [ ] `decodeTextString` in `allowlist.ts` reads true PDFDocEncoding (bytes 0x18 to 0x1F and 0x80 to 0xA0 differ from Latin 1), so a byte string holding `Ł` (0x95) or the fi ligature (0x93) folds as the ticked text does; `allowlist.test.ts` pins it → AC-1, AC-4
- [ ] The retry count measured on every committed fixture: no drawing stream takes a single retry, sources (815 drawings) or nothing ticked outputs (`rationale.md`, *The scan's retries*); the 1 MB recipe takes about 635 ms a pass → AC-6

## Acceptance-criteria coverage
| AC | Covered by |
|---|---|
| AC-1 | UI steps 1 and 3; `redaction-kept.test.ts`, `redaction.test.ts`; value sourcing rows 1 to 3 |
| AC-2 | UI step 4; `marked.test.ts` |
| AC-3 | UI step 2; `allowlist.test.ts`, `redaction-kept.test.ts`; value sourcing row 4 |
| AC-4 | `redaction-kept.test.ts`, `allowlist.test.ts`; value sourcing rows 1 and 5 |
| AC-5 | UI steps 1 and 2; `redaction-kept.test.ts` and its fails first run; the gate; `make-fixture.mjs` |
| AC-6 | `marked.test.ts`, `cost.test.ts`; value sourcing row 6 |
| AC-7 | `marked.test.ts`, the pin in `redaction-kept.test.ts`; value sourcing row 7 |
| AC-8 | UI step 5; `redaction-kept.test.ts`; value sourcing row 8 |
| AC-9 | UI steps 4 and 6; the gate, `cost.test.ts`, the page tests, lint and typecheck |
