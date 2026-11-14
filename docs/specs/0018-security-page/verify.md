# Verify: security & how it works page · spec 0018 · updated 2026-11-14

_Steps derived from spec 0018's acceptance criteria, as ratified on 2026-11-14. `/check verify` runs these; `/test` locks the durable ones. Use only the PDFs in `tests/fixtures`._

## UI / manual

- [ ] Visit `/security` → it answers 200, the tab reads "Security · RedactNest", there is one `h1` "Security", the header shows "Try it free", and the footer ends with the licence notice → AC-1
- [ ] On `/`, `/tool` and `/security`, read the footer's Product group → "Redact a PDF", "Security", then "Pricing", each underlined; "Security" opens `/security` in the same tab → AC-2
- [ ] On `/tool`, open `tests/fixtures/text-page.pdf`, untick a row, then follow the footer's "Security" link → the browser's leave warning appears, and dismissing it keeps the work → AC-2
- [ ] On a wide desktop window, scroll `/security` → On this page sits beside the text and stays in view while a middle section scrolls past; on a narrower window, and on the wide one with text at 200%, it sits above the text and scrolls away with the page → AC-3
- [ ] Read "Last updated" → it matches the newest entry under Changes, and each On this page link lands on its own heading, in `SECURITY_SECTIONS` order → AC-3, AC-4
- [ ] Walk AC-5 over every paragraph, list item and the drawing in `src/app/security/page.tsx`, in four checks → AC-5, AC-6:
  1. **Sourced.** Read its source comment, open the named item and confirm it exists and says the thing. The comment names, in this order: the spec's AC or INV where it has one; else a privacy claim (C1 to C16); else a *Security model*, *Consequences* or *Decision* bullet by its opening words; else the dated measurement spec 0018 records. A heading alone fails.
  2. **Safe direction.** For each claim about an outcome (finds, lists, ticks, removes, blanks, refuses, warns, names), either try to break it with the real code, through the PDFs in `tests/fixtures` or plain text through `detect` and `findTerms`, and find it holds in every case it covers, or confirm it is a "can" line. A "can" line the code sometimes gets right is met, not a failure.
  3. **Absolutes.** Each "never", "always", "every", "none", "only" or "is not" sits behind a gate every file passes (the self check, the tool page's content security policy, a refusal the engine makes on every file it judges that way) or names a step that does not exist (no text recognition, no name or address detector, no pattern in a term).
  4. **Said once.** No fact appears twice on the page, and none restates what a page AC-6 names already says; a pointer names the subject, never the fact.
- [ ] Walk spec 0018's *Coverage of earlier specs' asks* row by row → for each earlier spec's ask, the line the table points to is in that section and states the ask at a buyer's level: by kind, with no quoted value, no exact threshold and no list of named cases → AC-5, AC-7
- [ ] Follow every link in the text → Your documents, What we do not do, What we receive when you visit and Counts and error reports on `/privacy`, Checking the result is your job on `/terms`, and the finds and strips band on `/` (from Hidden data, its note on comments, and What it finds), each landing on its heading → AC-6
- [ ] Open `tests/fixtures/metadata.pdf` in `/tool`, press Make a cleaned copy with nothing ticked, download, and open the cleaned file → the sticky note's and the attachment's icons still show near the top right of page one, while the note's words ("Private reviewer comment") and the attached file are gone → AC-7 (measured 2026-11-14 with the real engine: ink inside both icons' areas before and after, and the note's text gone)
- [ ] Look at the drawing under "Removed, not just covered" on a wide window → two panels side by side that look the same; under the first, a copy gives the address, under the second, nothing after "Contact:" → AC-8
- [ ] The drawing at the narrow phone width AC-10 names (320 CSS pixels) and at 200% text → the panels stack, nothing scrolls sideways, and the box stays on the "Contact:" line → AC-8, AC-10
- [ ] The drawing in the accessibility tree → each panel's title, "A copy of the text gives" and the copied line are heard; the drawn pages are not → AC-8
- [ ] The drawing with forced colours on (dark) → the box is solid in the system's text colour, and the copied line keeps an edge → AC-8
- [ ] Read the whole of `main` → no page cap, file size or price written as a number, and no word for the source repository → AC-9
- [ ] Run axe on `/security`, then Tab from the top of `main` → no violations, and every link in the text is underlined and ringed in reading order → AC-10

## Commands

- [ ] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/ui/cover-figure.test.tsx tests/component/app/site-nav.test.tsx tests/unit/policy-pages.test.ts tests/unit/policy-sections.test.ts tests/unit/policy-changes.test.ts` → all pass, the banned outcome phrases, the AC-7 pins and the three verifies' guards among them → AC-1 to AC-9, AC-11
- [ ] `pnpm exec playwright test tests/e2e/legal-pages.spec.ts tests/e2e/shell.spec.ts --project=chromium` → all pass → AC-1 to AC-4, AC-6, AC-8 to AC-10
- [ ] `pnpm typecheck` and `pnpm lint` → clean → AC-11

## Acceptance criteria coverage

- AC-1 … the first step, and both command steps
- AC-2 … the footer steps, `site-nav.test.tsx` and `shell.spec.ts`
- AC-3 … the On this page and Last updated steps, and `legal-pages.spec.ts`
- AC-4 … the Last updated step and `security-page.test.tsx`
- AC-5 … the four check walk, the coverage table walk, and in `security-page.test.tsx` the banned outcome phrases (whole words, any case) and the guards for the three verifies' phrases
- AC-6 … the links step, the walk's fourth check, `security-page.test.tsx` (the exact link set) and `legal-pages.spec.ts` (each link lands)
- AC-7 … the coverage table walk, the sticky note step, and the pins in `security-page.test.tsx`, one per fact on each AC-7 line, each in its section, with the check that no word says memory is wiped or erased
- AC-8 … the four drawing steps, `cover-figure.test.tsx` and `legal-pages.spec.ts`
- AC-9 … the read of `main`, and both test files
- AC-10 … the axe and Tab step, the narrow width and 200% step, and `legal-pages.spec.ts`
- AC-11 … `policy-pages.test.ts`

## Before merge

- The one change entry, "First published." in `SECURITY_CHANGES` (`src/lib/policy-changes.ts`), reads 2026-11-14. If the branch merges on a later day, move it to that day, written as a literal (spec 0018, *Change list*).

## As built (2026-11-14)

- The first build: on `/privacy`, the footer's new link row lets the page scroll a little further at its very end, where On this page rides up with its column and stays wholly in view. So `legal-pages.spec.ts` measures the sticky list at a middle heading, where it sticks near the top as before.
- The rework: the page rewritten by spec 0018's *Page changes*, items 1 to 42. Two sources differed from what the spec named, and the comments name the item that says it: the box as a filled path is spec 0004's *Decision* bullet "Self check method: compare, never sample", and a picture that cannot be decoded counting as not blank is spec 0004's AC-13, not INV-15. Spec 0004's INV-13 is about the content stream, so item 10 reads "never edits a page's drawing instructions itself": the box pass adds to the page through MuPDF.
- After the rework, the full chromium browser project passed against one build (453 tests), and Vitest passed but for two stopwatch cases (`cost.test.ts`, `detect-adversarial.test.ts`) that pass alone, as they do on main under the parallel suite (6,705 of 6,705).
- `legal-pages.spec.ts`'s link landing check now starts each target from a fresh page. With What we do not do linked, two `/privacy` targets come in a row, and the second was a same document hop that a visitor following a link from `/security` never makes.
- After the third verify (e8066d1): the page's words changed where spec 0018's *Page changes* items 1, 2, 4, 7, 10, 11, 13, 15, 17, 18, 20, 22, 25, 26, 29, 30, 32 to 34, 36 and 39 to 41 now carry a dated as built note. The check's text line names only characters wholly inside the visible area and says one crossing the edge can go (measured: `tests/fixtures/trim-text.pdf`'s "Edge", centred inside, is gone after a run with nothing ticked); the fonts line no longer speaks of order; the untickable row, the OCR line, the notes line and the developer tools step say no more than the code does; and phrases no source states are cut. `security-page.test.tsx` pins the new words and guards the third verify's phrases. Spec 0004's "never their order" is owed on feature 30 in the scope.
- After the fifth verify (2026-11-15): AC-5 failed on one line, "none of the hidden data the home page lists is left anywhere in the file", since a picture under no removed item leaves with the source's bytes (spec 0006, AC-29, `tests/unit/cost.test.ts` run again) and the structure check never reads inside one. The fix was one sweep over every absolute on the page: spec 0018's *Page changes* items 9, 11, 13, 15, 16, 22, 31, 34 and *Every comment* carry a dated as built note. The structure line and the band pointer say "the file’s own structure", Hidden data gains the line that details inside a picture's own data can stay, "to white" and "private application data" are cut, the text line goes by where a character lies, and the stop paragraph says a lost engine starts the review over. Every comment names the gate or the missing step behind its absolute. `security-page.test.tsx` pins the new words and guards the old ones. The home page's Strips card is owed on feature 30 in the scope.
