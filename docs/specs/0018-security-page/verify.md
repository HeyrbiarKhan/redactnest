# Verify: security & how it works page · spec 0018 · updated 2026-11-14

_Steps derived from spec 0018 acceptance criteria (an assumed spec, owing `/architect` ratification). `/check verify` runs these; `/test` locks the durable ones. Use only the PDFs in `tests/fixtures`._

## UI / manual

- [ ] Visit `/security` → it answers 200, the tab reads "Security · RedactNest", there is one `h1` "Security", the header shows "Try it free", and the footer ends with the licence notice → AC-1
- [ ] On `/`, `/tool` and `/security`, read the footer's Product group → "Redact a PDF", "Security", then "Pricing", each underlined; "Security" opens `/security` in the same tab → AC-2
- [ ] On `/tool`, open `tests/fixtures/text-page.pdf`, untick a row, then follow the footer's "Security" link → the browser's leave warning appears, and dismissing it keeps the work → AC-2
- [ ] At 1280 by 800, scroll `/security` → On this page sits beside the text and stays near the top while a middle section scrolls past; at 900 wide, and at 1280 with 200% text, it sits above the text and scrolls away → AC-3
- [ ] Read "Last updated" → it matches the newest entry under Changes, and each On this page link lands on its own heading, in `SECURITY_SECTIONS` order → AC-3, AC-4
- [ ] Walk each paragraph beside its source comment in `src/app/security/page.tsx` → every claim matches what that spec records: spec 0002's *Security model*, spec 0004's *Security model* and its Follow-up list for this page, spec 0006's, 0008's, 0010's, 0012's and 0016's Follow-ups for this page, spec 0017's *Consequences* → AC-5, AC-7
- [ ] Follow every link in the text → Your documents, What we receive when you visit and Counts and error reports on `/privacy`, Checking the result is your job on `/terms`, and the finds and strips band on `/`, each landing on its heading → AC-6
- [ ] Open `tests/fixtures/metadata.pdf` in `/tool`, press Make a cleaned copy with nothing ticked, download, and open the cleaned file → the sticky note's and the attachment's icons still show near the top right of page one, while the note's words ("Private reviewer comment") and the attached file are gone → AC-7 (measured 2026-11-14 with the real engine: ink inside both icons' areas before and after, and the note's text gone)
- [ ] Look at the drawing under "Removed, not just covered" at 1280 → two panels side by side that look the same; under the first, a copy gives the address, under the second, nothing after "Contact:" → AC-8
- [ ] The drawing at 320 wide and at 200% text → the panels stack, nothing scrolls sideways, and the box stays on the "Contact:" line at 320 → AC-8, AC-10
- [ ] The drawing in the accessibility tree → each panel's title, "A copy of the text gives" and the copied line are heard; the drawn pages are not → AC-8
- [ ] The drawing with forced colours on (dark) → the box is solid in the system's text colour, and the copied line keeps an edge → AC-8
- [ ] Read the whole of `main` → no page cap, file size or price written as a number, and no word for the source repository → AC-9
- [ ] Run axe on `/security`, then Tab from the top of `main` → no violations, and every link in the text is underlined and ringed in reading order → AC-10

## Commands

- [ ] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/ui/cover-figure.test.tsx tests/component/app/site-nav.test.tsx tests/unit/policy-pages.test.ts tests/unit/policy-sections.test.ts tests/unit/policy-changes.test.ts` → all pass → AC-1, AC-2, AC-3 to AC-9, AC-11
- [ ] `pnpm exec playwright test tests/e2e/legal-pages.spec.ts tests/e2e/shell.spec.ts --project=chromium` → all pass → AC-1 to AC-4, AC-6, AC-8 to AC-10
- [ ] `pnpm typecheck` and `pnpm lint` → clean → AC-11

## Acceptance criteria coverage

- AC-1 … the first step, and both command steps
- AC-2 … the footer steps, `site-nav.test.tsx` and `shell.spec.ts`
- AC-3 … the On this page and Last updated steps, and `legal-pages.spec.ts`
- AC-4 … the Last updated step and `security-page.test.tsx`
- AC-5 … the walk of the source comments
- AC-6 … the links step, `security-page.test.tsx` and `legal-pages.spec.ts`
- AC-7 … the walk of the source comments, the sticky note step, and the phrases `security-page.test.tsx` pins
- AC-8 … the four drawing steps, `cover-figure.test.tsx` and `legal-pages.spec.ts`
- AC-9 … the read of `main`, and both test files
- AC-10 … the axe and Tab step, the 320 and 200% step, and `legal-pages.spec.ts`
- AC-11 … `policy-pages.test.ts`

## As built (2026-11-14)

- The full chromium browser project passed against one build (453 tests), and Vitest passed but for three stopwatch cases (`cost.test.ts`, `detect-adversarial.test.ts`) that pass alone (1,576 of 1,576), as they do on main under the parallel suite.
- `legal-pages.spec.ts`'s sticky list check now measures the list at a middle heading: on `/privacy`, the footer's new link row let the page scroll 14 pixels further at its very end, where the list rides up with its column (still wholly in view). Mid page it sticks 24 pixels from the top, as before.
