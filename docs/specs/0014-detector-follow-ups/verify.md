# Verify: Detector follow ups · spec 0014

_Steps derived from spec 0014's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`). The fixtures are `tests/fixtures/detect-*.pdf`, written by `node scripts/make-fixture.mjs`; `detect-markers.pdf` is new here and holds one page. Every row's text is read as the checklist shows it, and every "paste the page's text" step opens the downloaded file in a reader and copies the page.

## UI / manual

- [x] Open `detect-phone.pdf` → the `9346 212 555 0123` line lists `9346 212 555`, ticked, and a second Phone row `0123`, unticked; the `0131 410 5214 020 2977 5777` line lists `0131 410 5214`, ticked, and `020 2977 5777`, unticked, with no digit left outside a row; the card then UK number line (`6293 6608 0005 7382 276 020 7946 0612`, its number unlike any other on the page) lists its card, a Phone row `020`, ticked, and a Phone row `7946 0612`, unticked; every row the file listed before is still there with the same text and the same tick → AC-1, AC-2
- [x] In `detect-phone.pdf`, the `212 918 8665 1119 21 June 2014` line lists a Phone row `212 918 8665`, ticked, a Phone row `1119`, unticked, and a Dates row `21 June 2014` whole → AC-15
- [x] In `detect-phone.pdf`, redact with the default ticks only, download and paste the page's text → every digit the build before this spec removed is gone (`9346 212 555` among them) and the rescued rows' digits remain (`0123`), so the default removed no less than before → AC-2
- [x] In `detect-phone.pdf`, tick the `0123` row as well, redact, download and paste the page's text → none of the line's digits remain, and every other number's row behaved as before → AC-1, AC-7
- [x] Open `detect-markers.pdf` → one row per value line, each with its text without the marker and with the tick AC-6 names; the `27-09-2026` line lists a Dates row and no Phone row; the ordinal lines list `27 September 2026` and `1 of May 2026`; the `H2O` line lists `020 7946 0958`; the two digit marker line, the Arabic Indic marker line, the two gap lines, the all 8 pt line, the Chromium shaped line and the U+00B9 line each list their value; the guard line lists `020 7946 0958`, ticked → AC-4, AC-5, AC-6
- [x] In `detect-markers.pdf`, read each row's context → the text after the value starts at the space or the word after the marker, never at the marker → AC-6
- [x] In `detect-markers.pdf`, tick every row, redact, download and paste the page's text → every value is gone, every marker glyph and every raised ordinal letter is still there, and the run did not refuse; the ordinal rows' boxes are drawn in two pieces with the raised letters between them → AC-7
- [x] In `detect-markers.pdf`, tick only the `27-09-2026` Dates row, redact → the run passes (today's phone row there refuses with the overreach message) → AC-7
- [x] Open `detect-date.pdf`, `detect-us-ssn.pdf` and `detect-uk-nino.pdf` → the new AC-9 lines list `12/05/82` (ticked, after its birth word), `141592653` (unticked) and `WL654321` (unticked), each with the plain digit outside the row; `detect-uk-nino.pdf`'s near miss `AB1234567` now lists `AB123456`, unticked; every row listed before is still there → AC-8, AC-9
- [x] Open the dense document `tests/e2e/cancel.spec.ts` builds, or `detect-dense.pdf` → the open completes within the speed project's line, with the same rows as before → AC-14

## Code and records

- [x] `tests/unit/detect-phone.test.ts` holds every AC-1, AC-2 and AC-3 case by name, and every spec 0005 AC-27 case still passes → AC-1, AC-2, AC-3
- [x] `tests/unit/detect.test.ts` holds every AC-15 case through `detect` and through `DETECTORS.phone`, and pins with `toStrictEqual` that no span `detect` returns carries `rescued` → AC-15
- [x] `tests/unit/detection.test.ts` lists `detect-phone.pdf`'s four rescue lines (`DETECT_PHONE`, `DETECT_PHONE_OTHERS`, `DETECT_PHONE_DATES`) and redacts every row alone and together → AC-1, AC-15
- [x] `tests/unit/detection.test.ts` reads `detect-markers.pdf` and asserts rows, text, ticks, `after` and that no target quad contains a marker's centre; every other detect fixture's expectations are unchanged → AC-6, AC-8
- [x] `tests/unit/redaction-check.test.ts` redacts each `detect-markers.pdf` row alone and together, finds the marker in the output, and still refuses `superscript.pdf` → AC-7
- [x] `src/engine` holds `OFF_LINE_SIZE_MAX` (0.9), `OFF_LINE_SHIFT_MIN` (0.15), `OFF_LINE_STRETCH_MAX` (4), `OFF_LINE_MIN_LINE_GLYPHS` (3) and `SUPERSCRIPT_CODE_POINTS`, each commented as a rule about pages; the code point pin passes; no page or size limit elsewhere → AC-4, AC-5
- [x] The two INV-14 guard comments in `src/detect/phone.ts` and the `covering` comment in `src/engine/find.ts` are present → AC-10
- [x] `.github/workflows/ci.yml` runs `tests/unit/detect-adversarial.test.ts` alone on one worker with the verbose reporter, still read only (`tests/unit/workflows.test.ts` passes), and `rationale.md` holds the figure from the pull request's run as wall time with the runner and date, the National Insurance tolerance's random code figure, and the built code's corpus and flag count reruns → AC-9, AC-11, AC-13
- [x] Spec 0005 carries every amendment *Amends spec 0005* lists and its two met Follow-ups are ticked with their pointers → AC-13
- [x] The Finds columns pin is in `tests/e2e/design-system.spec.ts` and `tests/component/app/home-page.test.tsx`, and spec 0013's Follow-up item is ticked → AC-12
- [x] `tests/unit/detect-adversarial.test.ts` holds a rescue shape within the budget and the parse count pin still passes → AC-14
- [x] `pnpm exec vitest run --project unit tests/unit/detect-adversarial.test.ts -t "exactly as often"` → passes: 2,000 seeded US numbers side by side parse exactly 2,000 times, as before the rescue, so the reach skip holds → AC-1, AC-14
- [x] `node scripts/make-fixture.mjs`, then `git status tests/fixtures` → clean: `detect-markers.pdf` and the four changed detect fixtures are written from the script alone → AC-6, AC-9
