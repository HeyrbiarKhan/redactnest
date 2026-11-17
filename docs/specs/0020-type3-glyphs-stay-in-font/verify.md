# Verify: Type 3 glyphs stay inside their font · spec 0020 · updated 2026-11-17
_Steps derived from spec 0020 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use only the committed fixtures in `tests/fixtures`. Never open a PDF from anywhere else on the machine.

## UI / manual
- [x] At `/tool`, choose `glyph-undrawn-form.pdf` → no review appears; the failure reads "RedactNest stopped to be safe" with "Part of this file is built in a way RedactNest can't check safely, so it stopped rather than guess, and made no file." and the start again step → AC-5, AC-11
- [x] Do the same with `glyph-drawn-form.pdf`, `glyph-shared-picture.pdf` and `glyph-text.pdf` → each refused before any review, with the same words → AC-5, AC-8
- [x] Choose `glyph-emoji.pdf` → the review opens with no page warning; Redact with nothing ticked, then Download → a file comes back and opens with both lines drawn → AC-9
- [x] Choose `glyph-bitmap.pdf` → the review opens with no page warning (its glyphs hold the bytes `EI` and `Tj` inside inline pictures, and must still read to their end); Redact with nothing ticked, then Download → a file comes back → AC-9, AC-4
- [x] On a Pro session (the e2e build's fake billing set, or the dev sandbox), add the custom term `Jane Example` to `glyph-emoji.pdf` and `12345678` to `glyph-bitmap.pdf`, tick it, Redact, Download → a file comes back, and the term is gone from its text → AC-9
- [x] Open `/security` → Removed, not just covered ends "such as on another page where you ticked nothing.", with no font character clause; Last updated and the newest change line both read 18 November 2026, or the merge day if it merges later, and that line says the original copy can no longer stay in a font character → AC-11
- [ ] Before merging, if the branch merges after 2026-11-18, move the `SECURITY_CHANGES` entry's date in `src/lib/policy-changes.ts` to the merge day → AC-11

## Commands
- [x] `pnpm exec vitest run tests/unit/redaction-glyphs.test.ts` → all pass: the four refused at open, in a run with nothing ticked and with the ticked set; with the glyph rule skipped, three fail the check with `redaction-incomplete` and `glyph-shared-picture.pdf` keeps its original; the two controls open, run and draw as main → AC-5 to AC-9
- [x] With `src/` checked out from `main` and the new fixtures in place, the same file fails its 15 refusal and check tests → AC-8 (fails first; measured during the build)
- [x] `pnpm exec vitest run tests/unit/glyphs.test.ts` → all pass: every edge of the glyph side, text by `Tf`, by a graphics state's `/Font` and by none, the unreadable glyph both ways, the glyph that is also page contents, the annotation's appearance after the bake → AC-1 to AC-4, AC-9
- [x] `pnpm exec vitest run tests/unit/allowlist.test.ts tests/unit/marked.test.ts` → all pass, every count from before unchanged → AC-1 to AC-3
- [x] `pnpm exec vitest run tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → all pass, the tables checks included (`OPEN_NOW` names only fixtures main read) → AC-10
- [x] `pnpm exec vitest run tests/unit/cost.test.ts` on its own → all 9 pass, both spec 0019 budgets and spec 0006's open budget with the run's extra walk counted → AC-10
- [x] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/unit/policy-changes.test.ts` → all pass → AC-11
- [x] `node scripts/make-fixture.mjs` then `git status tests/fixtures` → nothing changes → AC-8
- [x] `pnpm lint` and `pnpm typecheck` → no errors → AC-1 (no `.resolve()` in `src/engine`)
- [x] `pnpm test:e2e` → passes; no committed fixture holds a Type 3 font, so nothing a browser test opens should change (not run during the build)

## Value sourcing (one step per row)
- [x] Each Type 3 font's glyph procedures and the dictionary they draw with: a font with no resources of its own, naming the page's figure, is refused (`glyphs.test.ts`, "from a font with no resources of its own"); with its own resources holding only a glyph only form, it passes
- [x] The dictionary a form below a glyph draws with: a form with no resources, named from two fonts' dictionaries, is read in each, so the page's picture under the second font is found (`glyphs.test.ts`, "in each font's dictionary")
- [x] Where the walk starts: from the pages at open and in a run, from the catalog in the check; a walk from the pages starts the other side at each page (`allowlist.test.ts`, "starts the other side at each page")
- [x] The names a drawing uses: a name with no entry and a category the dictionary lacks add nothing, without a throw (`glyphs.test.ts`)
- [x] Whether a drawing shows text: each operator counts; the same bytes in a string, an inline picture's data or a comment do not; an operator read past a false `EI` is forgotten (`marked.test.ts`, "shows text")
- [x] What an entry holds, read through its reference: `pnpm lint` passes with its `.resolve()` ban on `src/engine`
- [x] Whether an object is a form, a picture or a tiling pattern: the tiling pattern, the mask chain and the soft mask group cases (`glyphs.test.ts`)
- [x] Object identity: a glyph only picture byte for byte the same as the page's, but a different object, passes (`glyphs.test.ts`, "sharing is by object")
- [x] The other side: an entry a page lists and never draws still counts, and a path through a font's `/CharProcs` or `/Resources` never does (`allowlist.test.ts`, "puts everything a page reaches on the other side")
- [x] The refusal kind: `unreadable-structure` at open and in a run, for all four fixtures (`redaction-glyphs.test.ts`)
- [x] The words: `FAILURE_TEXT["unreadable-structure"]` unchanged, and the component test that the failure shows its words still passes
- [x] The check's text part: with the glyph rule skipped, text below a glyph fails the check (`redaction-glyphs.test.ts`, AC-7)
- [x] The change entry's date: a literal, strictly after 2026-11-17 (`policy-changes.test.ts` holds the order)

## Acceptance-criteria coverage
- AC-1 · glyphs.test.ts edges, allowlist.test.ts glyph units, value sourcing rows 1, 2, 7
- AC-2 · allowlist.test.ts other side tests, value sourcing rows 3, 9
- AC-3 · glyphs.test.ts sharing and text cases, marked.test.ts `showsText`
- AC-4 · glyphs.test.ts unreadable glyph cases, `glyph-bitmap.pdf` opening
- AC-5 · /tool refusals, redaction-glyphs.test.ts open refusals
- AC-6 · redaction-glyphs.test.ts run refusals, glyphs.test.ts run of the glyph that is page contents
- AC-7 · redaction-glyphs.test.ts with the glyph rule skipped
- AC-8 · the four fixtures, failing first on main
- AC-9 · the two controls at /tool and in redaction-glyphs.test.ts, the built documents
- AC-10 · the gate, `OPEN_NOW`, cost.test.ts alone
- AC-11 · /security, security-page.test.tsx, the change entry's date
- AC-12 · specs 0004, 0018 and 0019 amended, feature 31's Done when, feature 30's boxes (read the diffs)
