# Verify: Pattern detection · spec 0005 · updated 2026-10-10

_Steps derived from spec 0005's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development. The fixtures are `tests/fixtures/detect-*.pdf`, written by `node scripts/make-fixture.mjs`; every one is within the free cap of 3 pages. Context is 40 characters either side unless a step says otherwise.

Built: slices 1 to 5 of the build plan, and feature 12's tasks 23 to 28 (the five release 3 detectors, steps under *Feature 12* below). The phone detector's budget is 2 s (AC-16); its worst on the build machine is about 0.5 s of CPU on 100,000 characters (random groups of one to three digits), and its parses are counted, not only timed.

## UI / manual

- [x] Open `detect-email.pdf` → the info note reads "RedactNest looked for email addresses and phone numbers. Anything else, such as names and addresses, stays in the file." above one "Email addresses" group of 12 rows, every one ticked → AC-1, AC-3, AC-14
- [x] In that group → `jane.doe@example.com` is two rows, `support@example.net` has no `mailto:`, `sales@example.org` has no full stop, the fullwidth address reads `info@example.com`, the ligature address reads `finance@example.com`, and the Greek, Cyrillic and Hebrew addresses are there, in page order then reading order → AC-1, AC-3
- [x] Each row → its page ("Page 2"), and up to 40 characters either side with runs of spaces collapsed; the Greek row's context starts "Ελλάδα: " and never shows page 1's text → AC-5, INV-6
- [x] Open `detect-phone.pdf` → a "Phone numbers" group: `020 7946 0958`, `+44 20 7946 0958`, `(212) 555-0123`, `1-800-555-0199`, `00 44 20 7946 0012`, `020 7946 0321 ext. 123`, `12345678902` (after `Tel:`) and the wrapped `020 7946 0777` ticked; `(212) 123 4567` and `12345678901` unticked; no row for `INV-2026-000123`, the dates, the postcodes or the ZIP codes → AC-2, AC-4, AC-10 _(Since feature 12 the dates list in their own Dates group, never as phone numbers: see Feature 12.)_
- [x] Further down that group → the column `020 7946 0100` to `020 7946 0104` as five rows, `020 7946 0200`, `0201` and `0202` from the "Desk" line as three rows, `020 7946 0300`, `0301` and `0302` from the comma and semicolon list as three rows, `020 7946 0400` from the call log line with neither `30` nor `3` in it, and `(212) 555-0142` whole, all ticked; no row for `90210-1234` or `05.12.1980`, and no row holds a digit of another number → AC-2, AC-27, INV-13, INV-14 _(Since feature 12 `05.12.1980` is a row in the Dates group.)_
- [x] In `detect-phone.pdf`, leave every row ticked, redact, download, and paste the page's text → each of those numbers is gone, while `12:30`, `3 min`, `CA 90210-1234` and `Born 05.12.1980` are still there, and each number's black box covers it alone → AC-6, AC-27 _(Since feature 12 the three dates are ticked after "Born", so untick the Dates group first for this step to read as written.)_
- [x] Open `detect-blocked.pdf` → `slanted@example.com`, `image@example.com`, `dave@example.com` and `hidden@example.com` each listed with a disabled checkbox and its reason line (steep angle, image, replacement text, replacement text); clicking one changes nothing; `plain@example.com` is ticked; `gave@example.com` never gets a row → AC-8, AC-9, AC-13
- [x] In `detect-blocked.pdf`, tick only `wide@example.com` (page 3) and press **Redact** → the run fails with the replacement text message and offers no file (the recorded limit, never a leak) → AC-9
- [x] Open `detect-wraps.pdf` → `jane.doe@example.com` and `sales@example.org` listed with no space in them, `smith@example.com` listed without "Bob.", nothing from page 2 → AC-4
- [x] Open `kerning.pdf` → the info note, then "Nothing found to remove" and "RedactNest found no email addresses or phone numbers. Redact still makes a cleaned copy, with metadata and hidden content removed." → AC-14 _(The helper's wording changed with spec 0007, and since feature 12 its list names all seven kinds.)_
- [x] Open `detect-email.pdf`, untick `sales@example.org`, redact, download, open the file in two readers and paste each page's text → every ticked address is gone, `sales@example.org` is still there, and the words around each removed address read as before → AC-6, AC-13
- [x] Keyboard only → Tab goes Choose a PDF, the group summary, each checkbox that is not blocked, Redact, Start over, each with a visible ring; Space ticks and unticks; Enter and Space on a summary close and open the group → AC-13
- [x] Press **Redact** on a document with matches → every checkbox is disabled until the run ends → AC-13
- [x] Screen reader (NVDA or VoiceOver) → a row reads as the address, "checkbox, checked", then "Page 1" and the context line; a blocked row adds its reason; a group reads its label and "12 email addresses"; the list is not read out as it appears → AC-13
- [x] Forced colours (Windows High Contrast) → every checkbox is the system's own control, disabled ones look disabled, the highlighted match uses the system highlight → AC-13
- [x] At 320 CSS pixels wide → the longest address wraps inside its row and the page never scrolls sideways → AC-13
- [x] Devtools Network and Application while opening and redacting `detect-email.pdf` → no request carries any address or context, and nothing is written to any store → AC-15
- [x] Open a long text heavy document (for example the dense one `tests/e2e/cancel.spec.ts` builds) and choose a second file while "Looking for sensitive details" shows → the second opens, the first never appears → AC-11

## The steps other specs left for feature 6 (AC-18)

Each is ticked in its own spec's `verify.md` as well as here.

- [x] Spec 0002: with a tick changed, choose a second file → asked first; yes replaces the session, no keeps it → its AC-1
- [x] Spec 0002: with a tick changed, close the tab → the browser's leave warning → its AC-13
- [x] Spec 0002: from complete, change one tick, run again and download a second time without the file picker → the second file matches the new ticks → its AC-14
- [x] Spec 0004: a ticked match leaves a box no wider than the match and no taller than its line, and pasting the page's text shows the match gone and its neighbours present → its AC-4, AC-6
- [x] Spec 0004: in single spaced text, the lines above and below a ticked match read exactly as before (use a document with an address in single spaced lines) → its AC-4, AC-6
- [x] **(after feature 7, spec 0006 AC-30)** Spec 0004: on a real OCRmyPDF scan, a ticked match with descenders leaves no ink around or below its box → its AC-5, AC-13 _(Run on 2026-09-29 on simulated scans, not printed ones; see spec 0006 `verify.md`, AC-30.)_
- [x] Spec 0004: two ticks, then one unticked and run again → the unticked match is in plain text → its AC-11
- [x] **(after feature 7, spec 0006 AC-30)** Spec 0004: on a scan fed about a degree crooked, a match redacts and a long line is shown blocked `slanted-text` during review → its AC-28, AC-29 _(Run on 2026-09-29 on simulated scans, not printed ones; see spec 0006 `verify.md`, AC-30.)_
- [x] Spec 0003: Enter and Space on a group summary close and open it; a long unbroken address wraps inside its row; the checkbox falls back to the native control in forced colours; a row reads as the match, then "Page N" and the context line; a compact count badge reads with its noun → its review vocabulary checks

## Value sourcing

- [x] `matches[].id` → open the same file twice: the rows are the same, and the worker test "mints a fresh id for every match, and new ones for the next document" passes → minted with `crypto.randomUUID()` in the worker
- [x] `matches[].type`, target `kind` → each address sits in "Email addresses" and each number in "Phone numbers", and a run's `removedByType` counts them by kind (worker and engine tests) → the span's `kind`
- [x] `matches[].page` → `detect-email.pdf`'s rows read Page 1, 2 and 3 as the file lays them out → the page index read, plus one
- [x] `matches[].text` → the fullwidth address shows as `info@example.com`, a wrapped address shows without a space → the NFKC page text, a rejoined join left out
- [x] `matches[].before`, `.after` → build with `NEXT_PUBLIC_MATCH_CONTEXT_CHARS=10` and reopen: context shortens to 10 characters either side; with `0`, the rows show the match alone → `contextChars` from the open request
- [x] `matches[].tickedByDefault` → email ticked; phone ticked only when valid and written like a number; blocked never ticked → AC-10
- [x] `matches[].blocked` → `detect-blocked.pdf` gives each reason in AC-8's order → the find step's checks through the shared predicates
- [x] Target `page`, `quads` → after a run, each black box sits on its match's own line, one box per line for a wrapped value → characters grouped by line along the line's direction
- [x] Target `start`, `end` → not read by anything yet (feature 13); nothing to see
- [x] Target `text` → the fullwidth address and the address holding U+20BB7 (`detect-unicode.pdf`) both redact → the raw code points, which validation compares
- [x] Detector constants → a UK national number and a US national number are both found; `0113 496 0000` reads as a UK number and `011 44 20 7946 0958` as an international call, both ticked; `Tel:` 32 characters before a bare number ticks it, 33 does not; `detect-phone.test.ts`'s `PHONE_READINGS` block (an 18 digit window, 10 parses a start, no start with two readings at one count) and its extension block (each marker in `EXTENSION_MARKERS`) pass → `PHONE_REGIONS`, `PHONE_READINGS`, `MAX_WINDOW_DIGITS`, `MAX_PARSES_PER_GROUP`, `EXTENSION_MARKERS`, `KEYWORD_REACH`, `PHONE_WORDS`
- [x] A phone match's possible and valid verdicts → `(212) 123 4567` is listed unticked (possible, not valid), `12345678901` unticked until `Tel:` sits before it, and both pins in `detect-phone.test.ts` pass (`2121234567` possible and not valid under `US`; GB lengths 7, 9 and 10 with `00`, US 10 with `011`) → `parsePhoneNumberFromString` from `libphonenumber-js/max`, under the region `PHONE_READINGS` picks, with `extract: false`
- [x] Group icon, label, noun → an envelope and "Email addresses", a handset and "Phone numbers", with "email address(es)" and "phone number(s)" in the count → `DETECTOR_LABELS`
- [x] Group count → equals the rows in the group → derived from the matches
- [x] Row checked → follows every tick change → `session.ticked`
- [x] Row disabled → blocked rows always, every row while redacting → `match.blocked`, `session.state`
- [x] Blocked reason line → matches `BLOCKED_REASON_TEXT` word for word → `src/lib/detectors.ts`
- [x] Coverage note and empty state lists → "email addresses and phone numbers", "email addresses or phone numbers" → `DETECTOR_KINDS` through `Intl.ListFormat` _(Seven kinds since feature 12: see Feature 12.)_
- [x] `detecting` phase text → "Looking for sensitive details" shows while a long document opens → `PHASE_TEXT.detecting`
- [x] Redact targets → only ticked, unblocked ids reach the worker, and a hand made `redact` naming a blocked id is `unsupported` (worker test) → the worker's `targets` map
- [x] `DetectionCounts` → `tests/unit/detectors.test.ts` passes → `detectionCounts(session.matches)`

## Commands

- [x] `pnpm test` → all pass, including `detect-email`, `detect-phone`, `detect-dates`, `detect`, `detect-adversarial`, `detection`, `detectors`, `engine-worker`, `engine-wall` and `session` → AC-1 to AC-17, AC-25 to AC-27
- [x] `pnpm typecheck` → passes, with the `PRECEDENCE` gate in `detect.test.ts` and the `DetectionCounts` gate in `loggable.test.ts` → AC-15, AC-24
- [x] `pnpm lint` → passes; `engine-wall.test.ts` proves the `@/detect`, `libphonenumber-js` and `search()` bans and the detect zone → AC-17, INV-5, INV-8, INV-11
- [x] `pnpm test:e2e` → all pass: the review states in `design-system.spec.ts`, `review.spec.ts`, the detected run in `privacy.spec.ts`, and the detection replacement in `cancel.spec.ts` → AC-11, AC-13, AC-15, AC-18
- [x] `node scripts/make-fixture.mjs && git status tests/fixtures` → nothing changes

## Acceptance-criteria coverage

- AC-1 · email rows in `detect-email.pdf`; `detect-email.test.ts`, `detection.test.ts`
- AC-2 · phone rows and look alikes, ZIP+4 and the dotted date included; `detect-phone.test.ts`, `detect-dates.test.ts`
- AC-3 · one row per occurrence, group order; `detect.test.ts`, `review-checklist.test.tsx`
- AC-4 · `detect-wraps.pdf`, the wrapped phone number; rejoin tests
- AC-5 · context steps, `contextChars` 10 and 0
- AC-6 · untick and redact; "every unblocked match redacts" in `detection.test.ts`
- AC-7 · quads against `search()` in `detection.test.ts`
- AC-8 · `detect-blocked.pdf`; session and worker guards
- AC-9 · `dave@`, `hidden@`, and the pinned `wide@` and `es@` limit
- AC-10 · phone ticks, `Tel:` reach
- AC-11 · replacement while detecting, in the worker and the browser
- AC-12 · `detection.test.ts` "reading pages"
- AC-13 · keyboard, screen reader, forced colours, 320px; `design-system.spec.ts`
- AC-14 · the info note and `kerning.pdf`'s empty state
- AC-15 · devtools step; `privacy.spec.ts`; `loggable.test.ts`
- AC-16 · `detect-adversarial.test.ts`: a budget for each detector (1 s email, 2 s phone), linear growth for both, and the phone parse count against `MAX_PARSES_PER_GROUP`
- AC-17 · `engine-wall.test.ts`
- AC-18 · the section above
- AC-25 · `detect-many.pdf`: 600 rows, all redacted; the 500 quad guard
- AC-26 · `detect-unicode.pdf`, and the pin on MuPDF.js's walker
- AC-27 · the side by side rows in `detect-phone.pdf` and their run; `detect-phone.test.ts` "numbers side by side"; each number's own quads in `detection.test.ts`

## Feature 12: the release 3 detectors · added 2026-10-08

_Steps derived from AC-19 to AC-24, AC-10's release 3 ticks, and the Value sourcing rows feature 12 fills. Same setup as above: a production build, the fixtures from `node scripts/make-fixture.mjs`, each within the free cap._

_The update of 2026-10-10 (tasks 35 to 40, the review's silent misses) added rows to four fixtures, so the steps for them were rewritten and run again. The second update of 2026-10-10 (tasks 41 to 44, the general date boundary rule) adds nine rows to `detect-date.pdf`, so its three steps and the redact step are rewritten and open again for `/check verify`._

### UI / manual

- [ ] Open `detect-date.pdf` → the info note reads "RedactNest looked for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers. Anything else, such as names and addresses, stays in the file.", above one "Dates" group (calendar icon) of 24 rows → AC-14, AC-24
- [ ] In that group → ticked: `05.12.1980` (after "Date of birth"), `12th of Sept. 1985` (after "DOB"), `1 May 1990` (after "Born"), `1980-05-12` (after "DOB", its time left out), `12/05/1980` (after "DOB", the `-Smith` left out) and `14.02.1991` (glued to "D.O.B.", which is left out); unticked: `27 September 2026`, `March 3, 2027`, `2026-09-27`, `09/30/2026`, `01/05/2026` and `31/05/2026` (two rows, joined by a hyphen), `3-5 June 2026` (one row for the range), `3 June 2026` (from "28 May-3 June 2026"), `2026-09-01` and `2026-09-30` (the interval, each date without its time), `27/09/2026` and `28/09/2026` (the shift, each without its time), `June 5 - 7, 2026` (one row, spaces and all), `7/6/2026` (from "5-7/6/2026"), `2026-10-05` and `2026-10-06` (the logged interval, the offset and the zone name left out), `03.11.2026` (the `a` left out) and the wrapped `27 September 2026`; no phone row anywhere in the file → AC-19, AC-10, INV-17
- [ ] Still in that file → no row for `2019`, `September 2026`, `27 September` on its own, `12:30`, `INV-05.12.1980`, `31.02.1980`, `31 April 2026`, `28 May` on its own, `5-` on its own, or any time → AC-19
- [x] Open `detect-card.pdf` → one "Card numbers" group (card icon) of 15 rows, all ticked: `4111 1111 1111 1111`, `5555-5555-5555-4444`, `378282246310005`, `6011 1111 1111 1117`, `5105105105105100` (before its expiry), `3714 496353 98431` and `3056 930902 5904` (each before its expiry), `3530 1113 3330 0000` (after the row number `1`), `6011000990139424` and `3566002020360505` (side by side), `6200-0000-0000-0005` (before its expiry), `4222 2222 2222 2` (typed against its expiry with an en dash), `3400 0000 0005 123` (a chance card), `2223 4000 0566 5566 5556` (one row for a chance window and the Visa card it overlaps) and the wrapped `4012 8888 8888 1881`; one "US Social Security numbers" group of 1 row, ticked: `45 6789`, the rest of the number the chance card cuts into; no phone row at all; no row for `4111 1111 1111 1112` (Luhn), `1234 5678 9012 3456` (no brand), or the two references `411111111111111112` and `4111-1111-1111-1111-12` → AC-20, AC-28, AC-3, AC-10, INV-15
- [x] In `detect-card.pdf`, leave every row ticked, redact, download and paste the page's text → every card and `45 6789` are gone, `2223` with them, `12/28` is still on each of its five lines, and both references are still there whole → AC-28, AC-6, INV-15
- [x] Open `detect-iban.pdf` → one "Bank account numbers (IBAN)" group (bank icon) of 6 rows, all ticked: the UK, German and French IBANs, `IE29 AIBK 9311 5212 3456 78` (the footnote style `1` after it left out), `ES9121000418450200051332` (without the `EUR` glued to it) and the wrapped Dutch one; no row for the typo `…33`, the `XX` country or the lower case one, and no phone row from the digits inside an IBAN → AC-21, AC-10, AC-3, INV-17
- [x] Open `detect-us-ssn.pdf` → one "US Social Security numbers" group (ID card icon) of 4 rows, all ticked: `123-45-6789`, `234 56 7890`, `345678901` (after "Social Security number:") and the wrapped `567 89 0123`; no row for `456789012` (no SSN word), `666-12-3456`, `900-12-3456` or `123-45-0000` → AC-22, AC-10
- [x] Open `detect-uk-nino.pdf` → one "UK National Insurance numbers" group (ID card icon) of 5 rows: ticked `AB 12 34 56 C`, `ce123456d`, `PX123456` and the wrapped `JK 65 43 21 B`; unticked `KL123456B` (glued to "signed"); no row for `QQ 12 34 56 C`, `GB 12 34 56 A`, `TN123456B`, `DA123456A` or `AB1234567` → AC-23, AC-10, INV-17
- [ ] In each of those five files, leave every row as it opened, redact, download and paste the page's text → each ticked value is gone, each unticked one and each near miss is still there, and each wrapped value has a box on both of its lines; in `detect-date.pdf` the times (`T00:00:00Z` twice, `T23:59:59Z`, `10:00`, `11:00`, `T10:00:00+0100`, `T09:00:00EST`), `28 May`, `5-` and the `a` after where `03.11.2026` was are still there, `Smith` is still there beside the box where `12/05/1980` was and `D.O.B.` beside the box where `14.02.1991` was, and in `detect-iban.pdf` the `1` before "above" and `EUR`. Then in `detect-uk-nino.pdf`, tick `KL123456B` and run again → `KL123456B` is gone and "signed" is still there → AC-6, AC-4, AC-7
- [x] Open `detect-phone.pdf` → the "Phone numbers" group exactly as in the steps above, and a "Dates" group holding `12/05/1980`, `2026-09-27` and `05.12.1980`, all ticked (each within reach of "Born"); no phone row holds a date → INV-14, AC-10
- [x] Open `sample-agreement.pdf` → the all clear line, four email addresses and three phone numbers, all seven ticked, and no Dates group → spec 0013, AC-12
- [x] Open a long document and watch the phase line → "Looking for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers…" → AC-14, spec 0007 AC-4
- [x] Open `/` → the lead names the seven kinds; the Finds card lists all seven, each with its checklist icon; at 1280 and 1080 pixels both cards show two columns and stand the same height, at 960 both are one column, and at 320 nothing scrolls sideways → spec 0013, AC-11, AC-13
- [x] Open `kerning.pdf` → the empty state's helper reads "RedactNest found no email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers or National Insurance numbers. Make a cleaned copy to remove metadata and hidden content." → AC-14

### Value sourcing

- [x] `matches[].type`, target `kind` → each new kind's rows sit in its own group, and a run's `removedByType` counts them by kind → the span's `kind`
- [x] `matches[].tickedByDefault` for `date` → `DOB` 32 characters before a date ticks it, 33 does not, and "Reborn" never does (`detect-dates.test.ts`) → AC-10, `BIRTH_WORDS`, `KEYWORD_REACH`
- [x] A bare nine digit SSN → listed with `SSN` 32 characters before it, not with 33, and never with no SSN word (`detect-us-ssn.test.ts`) → `SSN_WORDS`, `KEYWORD_REACH`
- [x] Detector constants → `detect-card.test.ts` finds a number at both ends of every prefix range at every length in `CARD_BRANDS` and pins the table; `detect-iban.test.ts` pins the IBAN sample (GB 22, DE 22, FR 27, NL 18, ES 24, IT 27, IE 22) and 89 countries; `detect-uk-nino.test.ts` pins `NI_PREFIX_RULES` and refuses every letter and pair in it; `detect-dates.test.ts` reads all 24 spellings in `MONTHS` → `CARD_BRANDS`, `IBAN_LENGTHS`, `NI_PREFIX_RULES`, `MONTHS`
- [x] Group icon, label, noun → a calendar and "Dates", a card and "Card numbers", a bank and "Bank account numbers (IBAN)", an ID card and "US Social Security numbers", an ID card and "UK National Insurance numbers", each count with its own noun ("3 dates", "1 IBAN") → `DETECTOR_LABELS`
- [x] Coverage note and empty state lists → the seven nouns in `DETECTOR_KINDS` order, "and" in the note, "or" in the empty state, with no comma before the last → `DETECTOR_KINDS` through `Intl.ListFormat("en-GB")`

### Commands

- [x] `pnpm exec vitest run --project unit tests/unit/detect-dates.test.ts tests/unit/detect-card.test.ts tests/unit/detect-iban.test.ts tests/unit/detect-us-ssn.test.ts tests/unit/detect-uk-nino.test.ts tests/unit/detect.test.ts tests/unit/detection.test.ts` → all pass → AC-3, AC-4, AC-6, AC-7, AC-19 to AC-23, INV-14
- [x] `pnpm exec vitest run --project unit tests/unit/detect-adversarial.test.ts`, alone → every detector on every shape within its budget (1 s for each release 3 detector) and linear → AC-16, INV-7
- [x] In those runs (update of 2026-10-10) → `detect-card.test.ts` "overlapping card windows share one row" (400 seeded layouts, no card digit outside a card row), `detect-dates.test.ts` "date ranges and times", `detect-iban.test.ts` and `detect-uk-nino.test.ts` "glued to what follows it", `detection.test.ts` "the review's silent misses", and the twelve new adversarial shapes each within budget → AC-16, AC-19, AC-21, AC-23, AC-28, INV-15, INV-17
- [ ] In those runs (second update of 2026-10-10) → `detect-dates.test.ts` "the general date boundary rule" (every interval form, the words and letters after a date, the birth word glued, the spaced month first range, and each kept rejection by name), the flipped pins in its other blocks, `detection.test.ts`'s date rows for the seven new lines, and the fifteen new adversarial shapes each within budget → AC-16, AC-19, AC-10, INV-7, INV-17
- [x] `pnpm typecheck` → passes; deleting any new kind from `DETECTORS`, `PRECEDENCE`, `DETECTOR_LABELS` or the adversarial `BUDGET_MS` fails it → AC-24, INV-9
- [x] `pnpm test:e2e` → all pass, the home band's columns and the sample agreement included → spec 0013, AC-11, AC-12
- [x] `node scripts/make-fixture.mjs && git status tests/fixtures` → nothing changes

### Acceptance-criteria coverage (feature 12)

- AC-19 · the Dates rows and near misses in `detect-date.pdf`, the ranges, times, words after a date and kept rejections among them; `detect-dates.test.ts`, "date ranges and times" and "the general date boundary rule" included
- AC-20 · `detect-card.pdf`; `detect-card.test.ts`, every brand range and length
- AC-28 · the card rows and their run in `detect-card.pdf`; `detect-card.test.ts` "a card beside other digits", the hyphen, group size and card end blocks; each kind's "beside other digits" block in `detect-iban.test.ts`, `detect-us-ssn.test.ts` and `detect-uk-nino.test.ts`, and through `detect` in `detect.test.ts`; each card's own quads in `detection.test.ts`
- AC-3, INV-16 · the Social Security piece in `detect-card.pdf`; `detect.test.ts` "resolving overlaps"
- AC-21 · `detect-iban.pdf`, the two glued IBANs among them; `detect-iban.test.ts`, "an IBAN glued to what follows it" included
- AC-22 · `detect-us-ssn.pdf`; `detect-us-ssn.test.ts`
- AC-23 · `detect-uk-nino.pdf`, the glued number among them; `detect-uk-nino.test.ts`, "a National Insurance number glued to what follows it" included
- INV-15, INV-17 (update of 2026-10-10) · the new rows in four fixtures and `detection.test.ts` "the review's silent misses"; `detect-card.test.ts` "overlapping card windows share one row"
- INV-17 (second update of 2026-10-10) · the nine new rows in `detect-date.pdf` and `detect-dates.test.ts` "the general date boundary rule"
- AC-24 · the typecheck step, the labels and coverage note steps
- AC-10 (release 3) · the tick steps for dates and the four kinds that start ticked
- AC-6, AC-4, AC-7 · the redact step; `detection.test.ts` for each new fixture: every unblocked match alone and together, a quad per line for the wrapped value, `search()`'s quads for the first
- AC-16 · the adversarial command
