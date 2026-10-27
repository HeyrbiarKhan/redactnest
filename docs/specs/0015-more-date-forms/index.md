# 0015. More date forms

**Date**: 2026-10-27
**Status**: Proposed

## Summary

The date detector learns the forms it had no pattern for: a written month with separators (`05-Jan-2026`), year first with dots or one digit parts (`2026.09.27`, `2026/9/7`), unseparated (`20260927`), two digit years (`27 Sep 26`), spaced separators (`27 / 09 / 2026`), the legal formula (`27th day of September 2026`), German style ordinals (`27. September 2026`) and odd commas (`15 March,2026`, `Sept.27, 2026`). They are read in a second pass that runs after today's date pass and only adds rows where it found nothing, so every row today's detector lists stays exactly as it is, the phone detector and `isNumericDate` are untouched, and no other kind can lose a digit or a tick. Measured through `detect` against main on 460,000 random layouts, no digit lost its row, no row lost its tick and no row changed. chrono-node was measured as a second reader and is not adopted: it misses six of the sixteen listed forms, adds about twice the noise, and finds nothing our rules miss but codes main rejects on purpose.

## Amends specs 0005 and 0014

Applied in place by the build (task 12).

- **Spec 0005, *Detectors* `date`**: "Four digit years run 1900 to 2099" gains "; spec 0015's written forms also take a two digit year, real in either century". The bullet gains a paragraph: "Spec 0015 adds the forms below in a second pass that reads only where this pass listed nothing (its AC-1): a written month with flush separators, day first, month first or year first (`05-Jan-2026`, `Sep-27-2026`, `2026-Sep-27`); year first with any separator and one or two digit parts (`2026.09.27`, `2026/9/7`); eight digits unseparated (`20260927`); two digit years in the written forms (`27 Sep 26`, `27-SEP-26`, `Sep 27, '26`); spaced numeric separators with a four digit year (`27 / 09 / 2026`); a comma with no space before the year, `day of`, a full stop after the day, a comma after the month, and a day glued to an abbreviation's full stop (`15 March,2026`, `27th day of September 2026`, `27. September 2026`, `September, 27 2026`, `Sept.27, 2026`). The same pass lists a date glued to a word in `ADDED_DATE_LABELS`, and a date followed by a digit in another script, directly or after a marker." The boundary bullet "two or more digits glued to a date's end, a digit in another script, or one digit after a two digit year" gains "(a digit in another script lists the date in spec 0015's second pass, its AC-9)".
- **Spec 0005, AC-19**: `27 September 2026١` moves from the dropped shapes to the listed ones ("lists the date, by spec 0015's AC-9"), and so do `27/09/2026¹١`, `27 September 2026¹١` and `12.05.1980.¹١`; `Updated27/09/2026` lists the date unticked (spec 0015, AC-8). `١05.12.1980`, `Born 12/05/1980¹²` and `05.12.80¹` still drop it.
- **Spec 0005, AC-20** gains: "A marker followed by a digit in another script is outside the row too: `Card 4111 1111 1111 11111١` lists `4111 1111 1111 1111`, unticked (spec 0015, AC-10)."
- **Spec 0005, AC-22** gains: "A marker followed by a digit in another script gives none (`SSN 123-45-67891١`): listing it took a ticked phone row's digits in 5.8% of strings (spec 0015, AC-10)."
- **Spec 0005, INV-14** "A full numeric date is never read as a phone number" gains "in a form `isNumericDate` reads; the forms spec 0015 adds are the date detector's alone, and a phone row may hold one, as on main (spec 0015, AC-13)".
- **Spec 0005, *Consequences***: the line listing the date forms with no pattern says spec 0015 met every listed form and names the variants still missed (this spec's *Consequences*). **Follow-up**: the date forms item is ticked, met by spec 0015.
- **Spec 0014, AC-15**: "yields to every kind after `phone` in `PRECEDENCE`" gains "and, of the date detector's spans, only those its first pass lists (spec 0015, AC-12), so a rescued stretch keeps exactly today's extent beside a new form". **Follow-up**: the item "Feature 25 changes `isNumericDate`" is ticked as not needed (spec 0015 leaves it unchanged, AC-13); the fourth review's nits item is ticked for the `DATE_LABELS` words, the `cutAtEnd` pin and the card marker pin (spec 0015, AC-8, AC-10, AC-11).

## Requirements

**User stories**:
- As a visitor reviewing an export, a UK document, a deed or a contract, I want a date written `05-Jan-1980`, `1980.01.05`, `19800105`, `5 Jan 80`, `5 / 01 / 1980`, `this 5th day of January, 1980` or `5. January 1980` listed like any other, so a date of birth in those forms is not left in the file with no row.
- As a visitor, I want the default never to remove less than it removes today, so a new form can never cost a row or a tick today's detectors list.
- As the maintainer, I want the evaluation of chrono-node recorded with its numbers, so the question of a date library is settled.

**Acceptance criteria**:

- **AC-1**: `datePasses(input)` in `src/detect/date.ts` returns `{ first, added }`. `first` is today's scan exactly, run with `FIRST_PASS` rules (today's labels, today's end rules, a joiner seeing only today's forms beyond it), so every span it lists is today's. `added` is a second scan over the same text with `SECOND_PASS` rules (AC-8, AC-9, and a joiner seeing new forms beyond it as AC-1's last sentence says). The second scan keeps a pointer into `first` that only moves forward; at a start a `first` row holds, it steps to that row's end. At every other start that passes today's start test (`STARTS`, and `gluedAt` read with the pass's labels), it tries these readers in order and the first that reads a date decides: today's numeric reader (`isNumericDate`), today's written reader, AC-3, AC-4, AC-7, then the new written patterns (from a digit: AC-2 day first, AC-2 year first, the day first pattern of AC-5 and AC-6; from a letter: AC-2 month first, the month first pattern of AC-5 and AC-6). The date is listed when it ends at or before the next `first` row's start and stepped over whole; otherwise nothing is listed there and the scan moves one code point on. The joiner rule's last listed end is the end of the last row either scan listed before the start. In the second scan a joiner also parts a date from a full date beyond it read by today's readers, AC-3 or the new written patterns (not AC-4 or AC-7), edges unchecked. `detectDate(input)` returns `first` and `added` together, sorted by start. So `DOB 04-03-19660 - 2023-05-15-28-APR-55/21.11.69` lists `04-03-1966`, `05-15-28` (both ticked) and `21.11.69`, exactly as today, and `Ref 2022/9/31 Oct 11, 1988` lists `Oct 11, 1988`, as today; `Leave 2026-09-01-2026-9-30 ok` lists both dates, and `Leave 2026-09-27 10:00-2026-9-28 ok` lists today's `2026-09-27` and the new `2026-9-28`. A single scan that tried the new forms at each start left a digit with no row in 23 and took a tick in 8 of 230,000 strings, each a new form swallowing the start of a date today lists.
- **AC-2**: A written month with flush separators: a day of one or two digits, a month, and a four digit year, parted by one hyphen (as `HYPHEN` reads one), one slash or one full stop, the same code point both times and no whitespace, in day first, month first or year first order: `05-Jan-2026`, `27/Sep/2026`, `27-September-2026`, `27.Sep.2026`, `27–Sep–2026`, `Sep-27-2026`, `Sep.27.2026`, `2026-Sep-27`, `2026/SEP/27`; `27-Sep–2026`, with two different dashes, is not read. Day first and month first also take a two digit year (AC-5: `27-SEP-26`). The month is a word of 3 to 9 letters `MONTHS` knows, in any case; no ordinal; a real date under `isRealDate`. Its end follows today's written date rule with a four digit year: a letter after it does not drop it, two digits do, and one ASCII digit is a marker outside the row, year first included (`2026-Sep-271` lists `2026-Sep-27`, as AC-3's `2026.09.271` does). A letter glued to its start drops it.
- **AC-3**: Year first with any separator: a four digit year, then a month and a day of one or two digits each, parted by the same separator class twice (`/`, `.`, or a hyphen): `2026.09.27`, `2026/9/7`, `2026-9-7`, `2026.9.7`. Judged by a new predicate in `src/detect/dates.ts`, `isYearFirstDate`, which reads every dash as `-` as `isNumericDate` does, and read by today's numeric reader, so today's numeric edges apply unchanged: a letter before a hyphen or a slash, or its own separator with a digit on either side, drops it (`Lot-2026-9-7`, `801-666-2504/2035/6/24`); a letter glued to it drops it (`v2024.1.3`); a letter before a dot does not; one marker digit after a day read as three digits is outside the row (`2026.09.271` lists `2026.09.27`, `2026.9.71` lists none). Forms `isNumericDate` also reads (`2026-09-27`) are read in the first scan, as today.
- **AC-4**: Unseparated: exactly eight ASCII digits read as year, month and day (`20260927`), judged by a new predicate `isUnseparatedDate` (year 1900 to 2099, a real date); only that order (`27092026` and `09272026` are not read). A digit of any script glued after it drops it, with no marker reading (a ninth digit is as likely a longer number); one glued before it is `gluedAt`'s. Before it: a letter then a hyphen or a slash (`INV-20260927`), or any `separatorClass` character with a digit before it (`12-20260927`, `1.20260927`), drops it, unless a birth word or one of the pass's labels is glued, or the character is a joiner with only a time back to the last date listed, today's exemptions. After it: a `separatorClass` character with a digit after it drops it (`20260927-001`), unless it is a joiner with a full date beyond it, read as AC-1's second scan reads one. A letter after it does not (`20260927T101500Z` lists `20260927`).
- **AC-5**: Two digit years. Today's three written forms (day first, day first with `of`, month first) without a day range, AC-6's joints, and AC-2's day first and month first forms take a year of two digits, real in either century under `isRealDate`; the spaced forms (not the flush ones) also take an apostrophe, `'` or U+2019, right before the two digits with no gap: `27 Sep 26`, `27 September 26`, `27th of Sep, 26`, `27. September 26`, `27th day of September 26`, `15 March,26`, `Sep 27, 26`, `Sep 27 26`, `27-SEP-26`, `27 Sep '26`, `Sept 27th, '26`. Where four digits follow the month or day, they are the year and are never read again as two (`27 September 202612` lists none, as today). After a two digit year, an ASCII digit, a letter, or a `:`, `.` or `,` with a digit right after it drops the date, since it is a longer number, a word, a time or a year beyond it (`Sep 27 10am`, `Mon 27 Sep 10:00`, `27 Sep 10.30`, `Sep 27, 26,000` and `27 Sep 261` list none, and `29 JUL 11,1984` lists `JUL 11,1984`); a digit in another script is AC-9's (`27 Sep 26١` lists `27 Sep 26`); anything else does not drop it, a slash or a hyphen with a digit after included (`06-MAR-23/07700 859 471` and `Jul 20, 59: 617 822 7505` list the date). A glued ASCII digit is never a marker here, as spec 0014 decided for numeric two digit years. The lower case word `may` reads as a month like any other (`Rule 8 may 42 apply` lists `8 may 42`, unticked), by the owner's decision.
- **AC-6**: New joints in the written forms, each with a four digit year or AC-5's two digit year:
  - a comma with 0 to `MAX_GAP` whitespace after it before the year (`15 March,2026`, `March 15,2026`);
  - `day of` between an ordinal day and the month, with 1 to `MAX_GAP` whitespace round each word (`27th day of September 2026`, `1st day of May, 2026`); the row starts at the day, so `Dated this` stays in the file;
  - a full stop after the day, then 1 to `MAX_GAP` whitespace (`27. September 2026`, `1. May 2026`, `27th. September 2026`);
  - month first, a comma right after the month and then 1 to `MAX_GAP` whitespace (`September, 27 2026`), or a day glued to an abbreviation's full stop (`Sept.27, 2026`); a full month name still takes no full stop.
  Their edges follow today's written date rule.
- **AC-7**: Spaced numeric separators: three groups of ASCII digits, each separator one `/`, one `.` or one hyphen with 1 to `MAX_GAP` whitespace on each side, the same class both times, where the first or the last group has four digits and the groups closed up round the first separator are a date under `isNumericDate` or `isYearFirstDate`: `27 / 09 / 2026`, `27 . 09 . 2026`, `27 - 09 - 2026`, `2026 - 09 - 27`. No two digit years (`won 6 - 7 - 77` lists none; allowed, 98.2% of such scores listed a date). A digit of any script after it drops it, except one marker digit after a four digit last group, read as for numeric dates (`27 / 09 / 20261` lists `27 / 09 / 2026`; `27 / 09 / 2026١` lists none). Nothing before it is checked beyond today's start test, so a spaced code lists its last three groups (`Ref 1 / 27 / 09 / 2026` lists `27 / 09 / 2026`, unticked), recorded under *Consequences*.
- **AC-8**: `ADDED_DATE_LABELS` (`created`, `updated`, `modified`, `printed`, `due`, `deadline`, `start`, `starts`, `end`, `ends`, `issue`), in `src/detect/date.ts` and exported from `@/detect` beside `DATE_LABELS`, is read with `DATE_LABELS` in the second scan only (`SECOND_PASS.labels`), exactly as `DATE_LABELS` is read today: a word from either list glued to a date, directly or through one separator, lists it unticked, unless a birth word ticks it. `Created27/09/2026`, `Updated27/09/2026`, `Due-27/09/2026` and `Date of issue27/09/2026` list the date; `Weekend27/09/2026` lists none. `DATE_LABELS` itself is unchanged, so the first scan is today's.
- **AC-9**: In the second scan, for every reader whose end goes through today's end check (today's numeric and written readers, AC-2, AC-3, AC-5, AC-6), a digit in another script never drops a date: one right after it, or right after a footnote marker that follows a four digit year, is outside the row, and the date is listed, ticked under spec 0005's AC-10 (`Born 12/05/1980¹١` lists `12/05/1980`, ticked; `27 September 2026١`, `05.12.1980١`, `27/09/2026¹١`, `12.05.1980.¹١`, `2026.9.7١` and `27 Sep 26١` list the date, unticked; in `27/09/20261١` the marker and the other digit are both outside the row). Only `cutAtEnd`'s digit test and `markerAt`'s next digit test change, and only under `SECOND_PASS`; the own separator test is today's. Two ASCII digits still drop a date (`2026-09-27¹²`), and so does a digit in another script before it (`١05.12.1980`). AC-4's and AC-7's readers keep dropping a date with a digit of any script after it (`20260927١`, `27 / 09 / 2026١`).
- **AC-10**: The card and Social Security nits of the fourth review: `Card 4111 1111 1111 11111١` lists `4111 1111 1111 1111`, unticked, as today, pinned by a new test; the Social Security detector is unchanged, so `SSN 123-45-67891١` lists no Social Security number. Its existing pin in `detect-us-ssn.test.ts` gains the measured reason (on main the phone detector reads that number as a ticked row, since it reads digits of any script, and listing the Social Security number turned its digits unticked in 5.8% of strings), and a new pin in `detect.test.ts` holds the ticked phone row through `detect`.
- **AC-11**: The `cutAtEnd` asymmetry is pinned by new tests as today, with no rule change: the date detector alone lists `27-09-20261-5`, `2026-09-271-5` and `27/09/20261/5` as the date without the marker; through `detect` the first two are ticked phone rows and the third an unticked date. Dropping the date there would take a row main lists.
- **AC-12**: `DETECTORS.date` stays `detectDate`, returning both scans' spans. In `detect`, the date spans are read once through `datePasses(input)`: spec 0014's yield reads the date detector's `first` spans only (with every other lower kind's spans, as today), so a rescued phone stretch keeps exactly today's extent beside a new date, and precedence reads `first` and `added` together. `Span` gains no field. Precedence and the piece rule (spec 0005, INV-16) run unchanged: a new date that a higher kind's row holds in part is listed as its free pieces, or not at all, as any date. With the yield over new dates too, `Ref 23 60915 488, 9145 36006 2 1987.12.278` left its last digit with no row (main lists `1987.12.278` as an unticked rescued phone row).
- **AC-13**: `isNumericDate` and the phone detector are unchanged, so every phone row is today's and spec 0014's AC-3 pins and AC-9 measurement stand as they are. The new numeric forms are judged by `isYearFirstDate` and `isUnseparatedDate`, which only `date.ts` reads; neither is exported from `@/detect`. Adding them to `isNumericDate` instead marked them as date units in phone runs and took digits from phone rows today lists in 194 of 230,000 strings (`Tel 2026-9-7 0123 ok` is a ticked phone row on main; it listed only an unticked date and left `0123` with no row).
- **AC-14**: A date the second scan lists starts unticked unless a birth word ends within `KEYWORD_REACH` before it, or is glued to it, as spec 0005's AC-10 rules for every date (`DOB 27-Sep-1980`, `Born 1980.05.12`, `DOB 19800512` and `born on the 1st day of May, 1980` are ticked).
- **AC-15**: Measured through `detect` against main, on the built code at each slice and again at the end, and recorded in `rationale.md`: random layouts putting each new form and each AC-8 and AC-9 shape beside neighbours from ten families (phone numbers valid and only possible, numeric dates with two and four digit years, written dates, ISO intervals, Social Security numbers, National Insurance numbers spaced and not, cards, plain digit groups), with a glued digit after the form in half of them and after a quarter of the neighbours, at least 2,000 per form and family. In every string: no letter or digit main puts in a row is left without one; no position in a ticked row of main is outside every ticked row; every row main lists is listed with its exact start, end, kind and tick. And of the strings the detection tests and fixtures hold, only the nine `rationale.md`'s *Noise* section names change. Measured on the prototype: 460,000 strings, 0, 0 and 0. A slice merges only when its own rerun is 0, 0 and 0.
- **AC-16**: The date detector stays linear (spec 0005, INV-7, AC-16): each start of the second scan tries a fixed list of readers on bounded windows, the pointer into `first` only moves forward, and `detect-adversarial.test.ts` gains a shape for each new form, a prefix of each cut short, and runs of `ADDED_DATE_LABELS` words glued to dates, each within the date detector's 1 second CPU budget at 100,000 characters. Measured on the prototype: at most 281 ms at 100,000 characters (`2026.9.` repeated), and doubling the input doubles the time.
- **AC-17**: Every new form redacts through the real engine from `detect-date-forms.pdf`, one page in Helvetica 12 pt, written by `scripts/lib/detection-fixtures.mjs` and `scripts/make-fixture.mjs`, one line per row below, the last line wrapped after `of` so the line join reads it. `DETECT_DATE_FORMS` names the date rows and `DETECT_DATE_FORMS_OTHERS` the neighbours' rows, each in reading order as `[text, ticked]`, as `detect-phone.pdf` does; `detection.test.ts` adds the fixture to its table and lists them, and `redaction-check.test.ts` redacts each date alone and all together, the self check passing and every neighbour left.

  | Line | Date rows | Neighbour rows |
  |---|---|---|
  | `Signed 05-Jan-2026 at 020 7946 0958 today` | `05-Jan-2026` unticked | `020 7946 0958` ticked |
  | `DOB 27/Sep/1980 card 4111 1111 1111 1111` | `27/Sep/1980` ticked | `4111 1111 1111 1111` ticked |
  | `Due Sep-27-2026 or 2026-Sep-27 at the latest` | `Sep-27-2026`, `2026-Sep-27` unticked | none |
  | `Export 2026.09.27, 2026/9/7 and 2026-9-7 done` | `2026.09.27`, `2026/9/7`, `2026-9-7` unticked | none |
  | `Batch 20260927 SSN 123-45-6789 on file` | `20260927` unticked | `123-45-6789` ticked |
  | `Seen 27 Sep 26, 27-SEP-26 and Sep 27, '26 here` | `27 Sep 26`, `27-SEP-26`, `Sep 27, '26` unticked | none |
  | `Spaced 27 / 09 / 2026 and 2026 - 09 - 27 here` | `27 / 09 / 2026`, `2026 - 09 - 27` unticked | none |
  | `Dated this 1st day of May, 2026 at noon` | `1st day of May, 2026` unticked | none |
  | `Am 27. September 2026 in Leeds` | `27. September 2026` unticked | none |
  | `On 15 March,2026, September, 27 2026 and Sept.27, 2026` | `15 March,2026`, `September, 27 2026`, `Sept.27, 2026` unticked | none |
  | `Born 1980.05.12 NI AB 12 34 56 C` | `1980.05.12` ticked | `AB 12 34 56 C` ticked |
  | `Created27/09/2026 by 212 555 0123` | `27/09/2026` unticked | `212 555 0123` ticked |
  | `Signed the 2nd day of` / `June, 2026 here` | `2nd day of June, 2026` unticked | none |

  Every other detect fixture lists exactly what it lists today.
- **AC-18**: Specs 0005 and 0014 are amended as *Amends specs 0005 and 0014* lists; `rationale.md` holds every measurement this spec names and the built reruns of AC-15 and AC-16; the header comment of `src/detect/date.ts` describes both scans and the forms; and the pins the change flips are flipped in place with their reason, all in `tests/unit/detect-dates.test.ts`: `on 1 May 26 we` (AC-5, in the forms that list nothing); `Updated27/09/2026` (AC-8, in the list that finds no date); the `it.each` that finds nothing with a digit in another script glued is split, `05.12.1980١` and `27 September 2026١` moving to a test that lists the date and `١05.12.1980` staying; `27 September 2026١` in the list that finds no date moves out of it (AC-9); and of the footnote edges block that finds no date when another digit follows the marker, the numeric, written and dotted stop cases move to a test that lists the date, `2026-09-27¹²` staying (AC-9).

## Decision

**Chosen option**: our own patterns, in a second scan that only adds rows (reasoning and the other options in `rationale.md`).

- **A second scan, not new readers inside today's scan.** A new form read at an earlier start can swallow the start of a date today lists (`31 Oct 11` out of `2022/9/31 Oct 11, 1988` took the year), and a new form beyond a joiner can change what today's end rule keeps. Running today's scan untouched first and reading new forms only over what it leaves free makes "every row today lists keeps its exact start, end and tick" true by construction for dates, and dates are the lowest kind, so no other kind can be touched. Measured: 0 lost and 0 ticks in 460,000 strings, against 23 lost and 8 ticks in 230,000 for the single scan.
- **The new dates stay out of the rescue's yield, with no field on `Span`.** Spec 0014's AC-15 drops a rescued phone stretch a date starts inside; with a new date shorter than the stretch, the stretch's last digits lost their row (1 in 230,000). `detect` reads `datePasses` and yields to `first` only. A `Span` field marking added dates, as spec 0014 marks `rescued`, would work as well, but leaks to any caller of `DETECTORS.date` and needs a strip step.
- **`isNumericDate` unchanged.** The phone detector reads it to mark date units; widening it took digits from ticked phone rows (194 lost, 161 ticks). A new numeric date a phone row holds stays in the phone row, as on main.
- **chrono-node not adopted.** Linear (at most 140 ms at 100,000 characters) and small (13.3 KB gzip for the English strict parser; the 2.8 MB is npm's unpacked size), and it loses nothing as a reader that only adds. But in the layouts with no glued digit it finds 0% of six forms (unseparated, both spaced, the apostrophe year, the legal formula, the German ordinal) and 56% to 93% of the rest, against 84% to 100% for ours, and with a glued marker digit 0% to 17% of most; what it finds that our rules miss is a code main rejects on purpose (`617-381-0846-2016-4-14`, `D-1984.06.25`) or, in 7 of 9,000 strings, an ambiguous run (`5 MARCH 25, 52`); its rows take extra text (`on 1 May 26`, `10:00-2026-09-28`) and wrong years (`3 December 23.01` lists a date every time); and it adds a row to 1.29% of token soup against 0.53%.
- **Narrow end rules, measured.** A two digit year drops a date only before a digit, a letter, or a time or year glued on (`10:00`, `10.30`, `,1984`), since the broader first draft (any colon, or any separator and a digit) missed `06-MAR-23/07700 …` and `Jul 20, 59: 617 …` where chrono found them; spaced separators need a four digit year, since scores read as dates 98.2% of the time with two.
- **Social Security nit not built.** It failed the owner's bar; the date half of the same choice lost nothing and is built (AC-9, AC-10).

**Implementation skills**: none; this is detector code under the project's own rules.

## Rationale

Reasoning, the options weighed and every measurement: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing stored or sent):
- `src/detect/date.ts` gains:
  - `DatePassRules`, a frozen plain value per scan: `labels` (the `WordsAtEnd` built from `DATE_LABELS`, or from it and `ADDED_DATE_LABELS`), `scriptDigitEndsRow` (AC-9) and `newFormsBeyondJoiner` (AC-1). Two constants, `FIRST_PASS` (today's labels, both false) and `SECOND_PASS` (both lists, both true). `gluedAt` and its label test, `cutAtStart`, `cutAtEnd`, `markerAt`, `joinsDate`, `numericAt` and `writtenAt` take the rules as an argument; no module state says which scan is running.
  - `datePasses(input): { readonly first: readonly Span[]; readonly added: readonly Span[] }` (AC-1), read by `detectDate` and by `detect`; not exported from `@/detect`.
  - `ADDED_DATE_LABELS` (exported through `@/detect`), the AC-2 flush patterns, one day first and one month first pattern carrying AC-5's and AC-6's joints, the AC-4 and AC-7 readers, and the window for the new written patterns (`WRITTEN_LONGEST` grown by `day of` and its gaps); every pattern anchored, every quantifier bounded, none nested in another, each constant commented as a rule about how dates are written, not a cap on the visitor.
- `src/detect/dates.ts` gains `isYearFirstDate(text)` (a four digit year, then month and day of one or two digits, one separator class twice, dashes read as `-`, at most `LONGEST` code points) and `isUnseparatedDate(text)` (eight digits), both on `isRealDate`; `isNumericDate` is unchanged and reads neither.
- `Span` is unchanged.

**State transitions**: none.

**API surface** (module functions; no endpoint and no new message):
| Function | Where | Inputs | Outputs | Change |
|---|---|---|---|---|
| `datePasses(input)` | `src/detect/date.ts` | `DetectInput` | `{ first, added }` | new (AC-1 to AC-9, AC-14) |
| `detectDate(input)` | `src/detect/date.ts` | `DetectInput` | `Span[]` | `first` and `added` sorted by start (AC-1) |
| `detect(input)` | `src/detect/index.ts` | `DetectInput` | `Span[]` | AC-12: the yield reads `first` only; precedence reads both |
| `isYearFirstDate`, `isUnseparatedDate` | `src/detect/dates.ts` | `string` | `boolean` | new, read by `date.ts` only (AC-3, AC-4, AC-13) |
| `isNumericDate`, `detectPhone`, `detectUsSsn`, `detectCard` | `src/detect` | as today | as today | unchanged (AC-10, AC-13) |

Nothing new crosses the worker boundary: `ReviewMatch` and the protocol are untouched (spec 0002, INV-2).

**Value sourcing**:
| Action | Value produced or displayed | Source |
|---|---|---|
| First scan | every `first` row, its start, end and tick | today's scan under `FIRST_PASS` (AC-1) |
| Second scan | which starts are tried | every code point no `first` row holds that passes `STARTS` and `gluedAt` under `SECOND_PASS` (AC-1, AC-8) |
| Second scan | the next `first` row's start | a pointer into `first` that only moves forward (AC-1, AC-16) |
| Second scan | which reader decides | the first in AC-1's order that reads a date (AC-1) |
| Second scan | whether that date is listed | its end at or before the next `first` row's start; else nothing at that start (AC-1) |
| Second scan | the joiner rule's last listed end | the end of the last row either scan listed before the start (AC-1) |
| Second scan | which forms a joiner sees beyond it | today's readers, AC-3 and the new written patterns, edges unchecked (AC-1) |
| Read a written date | month number | `MONTHS`, any case (AC-2, AC-5, AC-6) |
| Read any date | whether it is real | `isRealDate` on the year as written: four digits 1900 to 2099, two digits real in either century (AC-2 to AC-7) |
| Read a numeric date | year first, unseparated | `isYearFirstDate`, `isUnseparatedDate` (AC-3, AC-4) |
| Read a two digit year | whether what follows drops it | the code point after it: an ASCII digit, a letter, or `:`, `.` or `,` with a digit after (AC-5); a digit in another script under AC-9 |
| Read a spaced date | the closed up text judged | the three groups joined by the first separator, read by `isNumericDate` or `isYearFirstDate`, the first or last group four digits (AC-7) |
| Read a label | the words | `rules.labels`: `DATE_LABELS` in the first scan, it and `ADDED_DATE_LABELS` in the second (AC-8) |
| Read an end | whether a digit in another script ends the row | `rules.scriptDigitEndsRow` in `cutAtEnd` and `markerAt` (AC-9) |
| List a date | its tick | `wordBefore` with `BIRTH_WORDS` at its start, as today (AC-14) |
| Resolve kinds | which date spans a rescued stretch yields to | `datePasses(input).first` (AC-12) |
| Resolve kinds | which date spans precedence reads | `first` and `added` together (AC-12) |

**Key invariants**:
- **INV-1**: The first scan is today's, so every date row today lists is listed with its exact start, end and tick, and the second scan lists only dates over positions no first scan row holds (AC-1).
- **INV-2**: Through `detect`, every row today lists, of any kind, keeps its start, end, kind and tick: dates are the lowest kind, a second scan date never enters spec 0014's yield (AC-12), and the phone detector and `isNumericDate` are unchanged (AC-13). So no digit loses its row and the default never removes less than today.
- **INV-3**: Every second scan rule is measured through `detect` against main before it lands, and its figures go in `rationale.md` (AC-15); a rule whose cost is not recorded is not built.
- **INV-4**: Linear (AC-16): a fixed list of readers on bounded windows at each start, and a pointer into `first` that only moves forward.

**Security model**: unchanged. The detectors run inside the worker on text that never leaves it; nothing new is logged, stored or sent.

**Configuration required**: none.

**Critical test scenarios**:
- Two scans (unit, `detect-dates.test.ts`): AC-1's examples list exactly the rows it names, today's rows written as literals; a reader whose date runs into a `first` row lists nothing there (`2022/9/31 Oct 11, 1988`); the second scan's joiner parts a date from a new form beyond it and lifts a start rejection with only a time between (`Leave 2026-09-01-2026-9-30 ok`, `Leave 2026-09-27 10:00-2026-9-28 ok`). Verifies **AC-1**.
- Forms (unit, `detect-dates.test.ts`): every form AC-2 to AC-7 names lists exactly that row; each named near miss lists none (`27-Sep–2026`, `v2024.1.3`, `Lot-2026-9-7`, `INV-20260927`, `12-20260927`, `20260927-001`, `Sep 27 10am`, `Mon 27 Sep 10:00`, `27 Sep 10.30`, `Sep 27, 26,000`, `27 Sep 261`, `won 6 - 7 - 77`, `27 / 09 / 2026١`); each marker case lists the date without the marker or lists none as named; `Ref 1 / 27 / 09 / 2026` lists `27 / 09 / 2026`, unticked. Verifies **AC-2** to **AC-7**.
- Labels and scripts (unit): AC-8's and AC-9's cases, the `ADDED_DATE_LABELS` pin beside the unchanged `DATE_LABELS` pin, and AC-18's flipped pins with their reason. Verifies **AC-8**, **AC-9**, **AC-18**.
- Nits (unit, `detect-card.test.ts`, `detect-us-ssn.test.ts`, `detect.test.ts`): AC-10's card pin and the Social Security pin's reason, and the ticked phone row through `detect`; AC-11's three strings through `DETECTORS.date` and through `detect`. Verifies **AC-10**, **AC-11**.
- Through `detect` (unit, `detect.test.ts`): AC-12's rescue case lists today's rows, and `DETECTORS.phone` and `datePasses` show why; AC-13's `Tel 2026-9-7 0123 ok` and `Ref 20260927 12 x` list today's ticked phone rows; spans `detect` returns hold only `kind`, `start`, `end` and `tickedByDefault` (`toStrictEqual`); a birth word ticks a new form (AC-14). Verifies **AC-12**, **AC-13**, **AC-14**.
- Measured (scratch, recorded): AC-15's layouts on the built code, with the three columns, at each slice and at the end, and the corpus. Verifies **AC-15**.
- Budget (unit, `detect-adversarial.test.ts`): AC-16's shapes within the date budget. Verifies **AC-16**.
- Engine (unit, `detection.test.ts`, `redaction-check.test.ts`): `detect-date-forms.pdf` rows, ticks and redaction; every other fixture unchanged. Verifies **AC-17**.

## Build plan

Skateboard: the forms deeds, contracts and UK documents use most, on the second scan that makes them safe, are the thinnest usable whole and ship first; the numeric forms, the two digit years and the edge rules each grow it. Each slice leaves `pnpm test` green, reruns AC-15's measurement for what it adds, and merges only when that rerun is 0, 0 and 0.

**Slice 1: the two scans and the written forms**
1. In `src/detect/date.ts`, `DatePassRules`, `FIRST_PASS`, `SECOND_PASS`, and the rules threaded through today's functions; `datePasses` with today's scan as `first` and the second scan of AC-1 reading today's readers, AC-2's flush forms and AC-6's joints, four digit years only; `detectDate` returning both. Comment why the second scan exists and why its dates stay out of the yield (INV-1, INV-2). Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-14**.
2. In `src/detect/index.ts`, `detect` reads `datePasses` once, yields rescued stretches to `first` only and runs precedence over both; amend the `PRECEDENCE` comment. Satisfies **AC-12**.
3. Tests for slice 1's ACs in `detect-dates.test.ts` and `detect.test.ts`; adversarial shapes for the flush and joint forms. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-12**, **AC-14**, **AC-16**.
4. `detect-date-forms.pdf` with slice 1's lines of AC-17's table, `DETECT_DATE_FORMS` and `DETECT_DATE_FORMS_OTHERS`, the engine tests, regenerate. Satisfies **AC-17** (in part).

**Slice 2: the numeric forms**
5. In `src/detect/dates.ts`, `isYearFirstDate` and `isUnseparatedDate`; in `date.ts`, the second scan reads AC-3 through today's numeric reader with the new predicate, then AC-4's and AC-7's readers. `isNumericDate` untouched. Satisfies **AC-3**, **AC-4**, **AC-7**, **AC-13**.
6. Tests for each form and near miss, AC-13's phone cases through `detect`, adversarial shapes, fixture lines. Satisfies **AC-3**, **AC-4**, **AC-7**, **AC-13**, **AC-16**, **AC-17**.

**Slice 3: two digit years**
7. In `date.ts`, AC-5's two digit year in the day first, month first and flush day first and month first readings, the apostrophe, and its end rule. Satisfies **AC-5**.
8. Tests (flip `on 1 May 26 we`), adversarial shapes, fixture lines. Satisfies **AC-5**, **AC-16**, **AC-17**, **AC-18**.

**Slice 4: the edge rules and the nits**
9. `ADDED_DATE_LABELS` read under `SECOND_PASS` (AC-8); the other script rules of AC-9 in `cutAtEnd` and `markerAt` under `SECOND_PASS`. Satisfies **AC-8**, **AC-9**.
10. Tests: AC-8 and AC-9 cases, the `ADDED_DATE_LABELS` pin, the flipped pins of AC-18; AC-10's card and Social Security pins; AC-11's pins. Satisfies **AC-8** to **AC-11**, **AC-18**.

**Slice 5: measurement and bookkeeping**
11. Rerun AC-15's measurement on the built code (all forms, the ten families, at least 2,000 per cell, the three columns) and the corpus, and the AC-16 timings; record both in `rationale.md` under *Measured in the build*. Satisfies **AC-15**, **AC-16**.
12. Apply *Amends specs 0005 and 0014* in place, update the header comment of `src/detect/date.ts`, and tick the met Follow-ups. Satisfies **AC-18**.

## Consequences

**Positive**:
- Every form spec 0005's Follow-up listed is found: in the layouts, with no glued digit, 96% to 100% of each written form, 96.6% to 99.8% of two digit years, 96% of spaced dates, 84% of unseparated dates, and 87% to 95% of year first ones, the rest being digits a phone row holds as on main or a separator and digits after the date.
- No row any detector lists today changes, so the default removes exactly what it removes today, plus any new date a birth word ticks.
- The phone detector, `isNumericDate`, `Span` and every fixture but the new one are untouched.

**Negative / tradeoffs**:
- New unticked rows on near misses (measured, 4,000 strings each): 98% of calendar versions (`build 2024.10.1`), 100% of a number, `may` and a two digit number (`Rule 8 may 42 apply`) and of a month, a day and a two digit count (`on December 12 70 people`), 100% of a numbered list item that opens with a month and year (`5. July 2030 results`), 10.1% of `ratio 6 / 9 / 2025`, 3.6% of a year and four digits (`Order 20171122`), 2.1% of `Lot 2069-6-4`, 1.5% of `see 2010/8/6`, 0.1% of eight random digits; a spaced code lists its last three groups (`Ref 1 / 27 / 09 / 2026`). Token soup gains a row in 0.53% of strings. Each row costs a glance; the owner saw these figures when choosing the forms.
- A new date a higher kind's row holds in part is listed as its free pieces, which may be a few digits with no meaning as a date; kept, since each piece holds digits main leaves with no row.
- A new numeric date a phone row holds stays in the phone row (as on main): in the layouts 17% to 22% of `2026/9/7` and `2026-9-7` beside phone numbers. Masking (spec 0014's Follow-up) would give them back.
- A two digit year with a glued ASCII digit, `20260927` with one, and a year first date whose day has one or two digits with one are never found: a glued digit there is as likely a longer number.
- The date detector does more work: at most 281 ms at 100,000 characters on the prototype against 62 ms for today's, within its 1 second budget.
- Two label lists, and a rules value threaded through the date functions.
- Still missed, each a variant no list named: `A.D.` or `in the year` before the year, number words (`twenty-seventh day`), a day range in a new form (`3-5 Jan-2026`), a written year first date with spaces (`2026 Sep 27`), uneven spacing round a separator (`27/09 /2026`), an ordinal in a flush form (`1st-May-2026`), mixed dashes in a flush form (`27-Sep–2026`), a space before a comma (`15 March ,2026`), and a number right before a month first date, which reads as a day first two digit year (`19 December, 16 2015` lists `19 December, 16`, `5 MARCH 25, 52` lists `5 MARCH 25`).

**Neutral**:
- chrono-node is declined; root `AGENTS.md`'s Declined line should say so (Follow-up).
- A Social Security number with a marker and another script's digit stays a recorded difference from dates and cards.

## Follow-up

- [ ] Record for root `AGENTS.md` (owned by `/sync`): chrono-node on the `Declined:` line (2026-10-27, spec 0015: it misses six listed forms and adds about twice the noise; linear and 13.3 KB gzip), and the second scan rule in the detector wall's bullet (a new date form is read in `datePasses`'s second scan and never through `isNumericDate`).
- [ ] Masking (spec 0014's first Follow-up) would also give a new numeric date back the digits a phone row holds; measure the new forms with it when it is designed.
- [ ] The variants *Consequences* lists as still missed: bring to `/architect` if a review or a visitor meets one, measured through `detect` against main like this spec.
- [ ] The noise figures come from synthetic shapes and token soup; a natural text corpus (made up content only) would tighten them, the two digit year and numbered list figures first.
