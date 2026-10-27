# Verify: More date forms · spec 0015

_Steps derived from spec 0015's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`). The fixtures are `tests/fixtures/detect-*.pdf`, written by `node scripts/make-fixture.mjs`; `detect-date-forms.pdf` is new here and holds one page. Every row's text is read as the checklist shows it, and every "paste the page's text" step opens the downloaded file in a reader and copies the page.

## UI / manual

- [ ] Open `detect-date-forms.pdf` → each line lists the Dates rows AC-17's table names, with their text and tick: the flush forms (`05-Jan-2026`, `27/Sep/1980`, `Sep-27-2026`, `2026-Sep-27`), year first and unseparated (`2026.09.27`, `2026/9/7`, `2026-9-7`, `20260927`, `1980.05.12`), two digit years (`27 Sep 26`, `27-SEP-26`, `Sep 27, '26`), spaced separators (`27 / 09 / 2026`, `2026 - 09 - 27`), the legal formula (`1st day of May, 2026`, with `Dated this` left out of the row, and the wrapped `2nd day of June, 2026`), the German ordinal (`27. September 2026`), the comma forms (`15 March,2026`, `September, 27 2026`, `Sept.27, 2026`) and the glued label (`27/09/2026` after `Created`); each neighbour keeps the row and tick it has on main → AC-2 to AC-8, AC-17
- [ ] In `detect-date-forms.pdf`, the line with a birth word before a new form lists that date ticked, and every other new form starts unticked → AC-14
- [ ] In `detect-date-forms.pdf`, tick every Dates row, redact, download and paste the page's text → every date is gone, every neighbour's text and every word outside a row (`Dated this`) is still there, and the run did not refuse → AC-17
- [ ] In `detect-date-forms.pdf`, redact with the default ticks only, download and paste the page's text → only the birth word date among the new forms is gone, and every neighbour main ticks is gone as on main → AC-14, AC-17
- [ ] Open `detect-date.pdf`, `detect-phone.pdf`, `detect-markers.pdf`, `detect-card.pdf`, `detect-us-ssn.pdf` and `detect-uk-nino.pdf` → each lists exactly the rows and ticks it lists on main → AC-1, AC-12, AC-13, AC-17

## Code and records

- [ ] `git diff main -- src/detect/phone.ts src/detect/us-ssn.ts src/detect/card.ts` → empty; `git diff main -- src/detect/dates.ts` adds `isYearFirstDate` and `isUnseparatedDate` and leaves `isNumericDate` as it is → AC-10, AC-13
- [ ] `tests/unit/detect-dates.test.ts` holds every form and near miss AC-2 to AC-7 names, the AC-1 cases with today's rows as literals, the `ADDED_DATE_LABELS` pin beside the unchanged `DATE_LABELS` pin, AC-8's and AC-9's cases, and the pins AC-18 flips, each with its reason → AC-1 to AC-9, AC-18
- [ ] `tests/unit/detect.test.ts` holds AC-12's rescue case and AC-13's phone cases with main's rows as literals, AC-11's three strings through `detect`, and pins with `toStrictEqual` that every span `detect` returns holds only `kind`, `start`, `end` and `tickedByDefault`; `git diff main -- src/detect/types.ts` is empty → AC-11, AC-12, AC-13
- [ ] `tests/unit/detect-card.test.ts` lists `Card 4111 1111 1111 11111١` as `4111 1111 1111 1111`, unticked; `tests/unit/detect-us-ssn.test.ts` finds nothing in `SSN 123-45-67891١`, its comment giving the 5.8% → AC-10
- [ ] `pnpm exec vitest run tests/unit/detect-adversarial.test.ts` alone → passes, with a shape for each new form, each cut short, and glued label words, the date detector within its budget → AC-16
- [ ] `tests/unit/detection.test.ts` and `tests/unit/redaction-check.test.ts` read and redact `detect-date-forms.pdf` → AC-17
- [ ] `rationale.md` holds the built rerun of the layouts (every form, ten families, at least 2,000 per cell, 0 lost, 0 ticks lost, 0 rows changed), the corpus check and the built timings → AC-15, AC-16
- [ ] Spec 0005's *Detectors* `date`, AC-19, AC-20, AC-22, INV-14, *Consequences* and *Follow-up*, and spec 0014's AC-15 and *Follow-up*, read as spec 0015's *Amends* list says → AC-18
