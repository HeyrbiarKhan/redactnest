# 0015. More date forms: rationale

The decision record for [index.md](index.md): the problem, the options weighed, why the chosen ones won, and every measurement. `/develop` builds from `index.md` and does not need this file.

## Context

Spec 0005's date detector reads numeric dates through `isNumericDate` and written dates through three patterns. Its second and third review rounds found forms neither reads, so a date written that way gets no row whatever stands beside it: a written month with separators (`05-Jan-2026`), year first with dots or one digit parts (`2026.09.27`, `2026/9/7`), unseparated (`20260927`), a written date with a two digit year (`27 Sep 26`), spaced separators (`27 / 09 / 2026`), the legal formula (`27th day of September 2026`), German style ordinals (`27. September 2026`) and odd commas and stops (`15 March,2026`, `September, 27 2026`, `Sept.27, 2026`). Exports, UK documents, deeds and contracts write these, and a date of birth in one of them stays in the file with no row.

The forces:

- **The owner's bars.** Extra unticked rows are fine and missed values are not (2026-10-10). The default never removes less than today, and every row today lists keeps its exact end and tick (2026-10-17). A rule is measured through `detect` against main beside phone numbers, dates and digit groups before it lands, never only on random codes (2026-10-19). For this feature the owner set the layouts: each new form beside phone numbers valid and only possible, dates numeric and written with two and four digit years and ISO intervals, Social Security numbers, National Insurance numbers spaced and not, cards and plain digit groups, with and without a glued digit; no digit may lose a row and no row may lose a tick.
- **`isNumericDate` is shared.** The phone detector marks a unit as a date with it (spec 0005, INV-14), so widening it moves digits out of phone rows. Spec 0014's AC-3 built date units in the phone detector and took them out when they took digits from rows main lists.
- **Phone outranks date.** In `detect` a phone row keeps its positions and a date keeps only free pieces; spec 0014's AC-15 makes a rescued phone stretch yield to a date.
- **Linear time** (spec 0005, INV-7, AC-16): the date detector has a 1 second CPU budget on 100,000 adversarial characters.
- **A library was proposed.** The owner asked for chrono-node (MIT, 2.10.2) to be measured as a second reader for these forms only (its misses, its noise, whether it runs in linear time, its bundle size) without swapping out the existing date rules.
- **Carried nits** from the fourth review of feature 12: a marker followed by a digit in another script lists a card unticked but drops a date and a Social Security number; the `DATE_LABELS` words it measured missing; and the `cutAtEnd` asymmetry on a marker before a separator. The owner chose to list the date and the Social Security number in the marker case, to take both date nits, and to leave the OCR marker item (a numeric date with a plain digit marker read into a phone row) for the masking round.

## Options considered

### How the new forms join the date detector

1. **A second scan that only adds, its dates kept out of the rescue's yield** (chosen). Today's scan runs unchanged; a second scan reads today's readers with the widened rules and then the new forms, only where no first scan row stands, and lists a date only when it ends before the next first scan row. `datePasses` returns the two scans apart, and `detect` yields rescued stretches to the first scan's dates only.
   - Pros: every row today's detectors list keeps its exact start, end and tick by construction; measured 0 and 0 in 460,000 strings. `isNumericDate`, the phone detector and `Span` are untouched.
   - Cons: two scans and a rules value threaded through the date functions; a new date beside a first scan row cannot take a character that row holds, so a few new forms that touch a today date are listed as pieces or not at all.
   - How the yield tells the scans apart: the prototype marked second scan spans with a `Span` field, as spec 0014 marks `rescued`, and `detect` stripped it. The cross check proposed `datePasses` instead, with no field to leak to callers of `DETECTORS.date` and no strip step; the same spans reach the same steps, so the measurement holds for either.
2. **New readers inside today's scan**, tried at each start after today's readers fail.
   - Pros: one scan, simpler code.
   - Cons: a new form found at an earlier start swallows the start of a date today lists, and a new form beyond a joiner changes what today's end rule keeps. Measured: 23 strings left a digit with no row and 8 lost a tick, of 230,000 (`Ref 2022/9/31 Oct 11, 1988 - 14 July 1951`: today lists `Oct 11, 1988`; the scan read `31 Oct 11`, a two digit year, and left `1988` with no row).
3. **Widen `isNumericDate`** to the new numeric forms, as INV-14 does for today's.
   - Pros: one predicate for every numeric date, and INV-14 stays whole: no phone window ever holds a numeric date.
   - Cons: the phone detector then marks `2026-9-7`, `2026.09.27` and `20260927` as date units and takes them out of rows main lists. Measured: 194 lost and 161 ticks of 230,000 (`Tel 2026-9-7 0123 ok`: main ticks the phone row `2026-9-7 0123`; this lists the date, unticked, and `0123` with no row; `Ref 20260927 12 x` the same).
4. **The second scan with today's yield**, so a rescued phone stretch also yields to a new date.
   - Pros: `detect` needs no change; a new date always takes its digits from a rescued stretch.
   - Cons: where a new date is shorter than the stretch, AC-15 drops the whole stretch. Measured: 1 lost of 230,000 (`Ref 23 60915 488, 9145 36006 2 1987.12.278`: main lists `1987.12.278` as an unticked rescued phone row; this listed `1987.12.27` and left the `8` with no row).

### chrono-node

1. **Not adopted** (chosen): our own patterns for every form; the evaluation recorded here and chrono-node on the Declined line.
   - Pros: our rules find every form chrono finds bar the codes main rejects on purpose, with exact rows and half its noise, and no new dependency, lint wall or notice.
   - Cons: we maintain the patterns, and a form no one listed stays missed until someone names it.
2. **Adopted as a third pass**, after our rules, over what both leave free.
   - Pros: it only adds rows, so the bar holds; it reads a few ambiguous runs ours do not.
   - Cons: what it adds is mostly codes main rejects after measuring them and rows carrying extra words or times; 13.3 KB gzip more in the worker; a new `redactnest/detect` style lint wall and a third party notice.
3. **Used instead of new patterns.**
   - Pros: no patterns of ours for the new forms.
   - Cons: it finds none of six listed forms and almost none with a glued marker, so the feature's Done when fails.

### The card nit's Social Security half

1. **Keep today's Social Security rule and pin it** (chosen). The date half is built (AC-9); the card is pinned as today.
2. **List the Social Security number with the marker**, the owner's first choice. Measured: 5.8% of strings lost a tick, because the phone detector reads digits of any script and main lists `037 80 85684٣` as a ticked phone row, which this turned into an unticked Social Security row.
3. **List it only where no other detector reads its digits.** Unmeasured; it needs `detect` to tell the Social Security detector about phone rows, a cross kind rule of its own.

### The rules inside the forms

- **A two digit year's end.** The first draft dropped a date when a `:`, a letter, or any separator and a digit followed the year, to keep times and longer numbers out. Beside chrono it missed what chrono found in about 6% of two digit year layouts (`06-MAR-23/07700 859 471`, `17 AUGUST 29: 646 953`, `Jul 20, 59: 617 822 7505`). Narrowed to a digit, a letter, or a `:`, `.` or `,` with a digit right after it, the forms are found in 96.6% to 99.8% of layouts with no glued digit (83% before), the time shapes still list nothing, and `29 JUL 11,1984` lists `JUL 11,1984` rather than `29 JUL 11`. The first pass's own rows already keep `5 May 12/05/2026` safe (the second pass never overlaps `12/05/2026`), which the broad rule was guarding.
- **Spaced separators with two digit years.** Allowed, 98.2% of scores (`won 6 - 7 - 77`) listed a date; with a four digit year, 0%.
- **The lower case word `may` before a two digit year.** Every `N may NN` lists a date (`Rule 8 may 42 apply`). The owner kept one rule for every month: the row is unticked, and `5 may 26` typed in lower case is still found.
- **The label words.** Added to `DATE_LABELS`, the first pass would list label glued dates and change its own joiner state, so it would no longer be today's scan. As a second list read only in the second pass, they cost nothing (0 and 0).
- **Unseparated dates followed by a separator and digits** (`20260927-001`) are dropped, as today's own separator rule drops `2026-09-27-01`: a date stamped serial is a code. Kept without measuring a looser rule, since it mirrors a rule main measured.
- **A marker after `20260927`, after a one or two digit day, or after a two digit year** is never read: a glued digit there is as likely a longer number, as spec 0005 and spec 0014 decided for the shapes today reads.

## Rationale

The owner's bars decide the structure. Every way of putting the new forms inside today's machinery, in the same scan, in `isNumericDate` or in spec 0014's yield, took a digit or a tick from a row main lists in random layouts, because a new form overlaps a date or a phone row today's rules settled. A second pass that reads only where today's date pass listed nothing, and whose dates no other kind yields to, cannot touch any row main lists, and measurement agrees: 0 in 460,000.

chrono-node passes on speed and size but not on what it finds. In the layouts it misses six of the listed forms entirely and most dates with a glued marker; its extra finds are the codes spec 0005 measured and rejects (`report-27-09-2026-v2.pdf`, `REF-05.12.1980`, `2026-09-27-1` in the corpus), and its rows include words and times the visitor would then remove. Our patterns, each a bounded expression on a bounded window, find more, list exact rows, and add half the noise, with no dependency to track.

The noisy forms went in because the owner's rule is that an unticked extra row costs a glance and a missed date can cost a date of birth. The owner chose them with each form's noise in front of them (calendar versions, numbered list items, `N may NN`, spaced sums), and the figures are recorded below so a later round can narrow them from evidence.

## The cross check of 2026-10-27 (another model, read only)

A read only pass on another model found no hole in the design: it traced the guarantee through precedence, the piece rule and the rescue's yield, and agreed the second scan is linear with a pointer that only moves forward. It found fifteen places where `/develop` would have had to choose, and five soundness points; the owner took every recommended fix. The spec now states, as the prototype measured them: one order of readers (AC-1), that a reader whose date runs into a first scan row lists nothing there (AC-1), which readers AC-9 covers (a two digit year with another script's digit after it lists, as measured, so AC-5's wording changed), the `DatePassRules` value, the marker after a year first flush date (`2026-Sep-271`), the same code point for flush separators, AC-4's start and joiner rules, AC-5's apostrophe and four digit precedence, the spaced code case (`Ref 1 / 27 / 09 / 2026` lists an unticked date, pinned and recorded rather than rejected without a measurement), which forms a joiner sees beyond it, the fixture's thirteen lines with their rows and ticks (run through the prototype), the corpus pointer, each flipped pin's place, the real text of INV-14, `datePasses` in place of a `Span` field, a pin for the second scan's joiner, and that each slice merges only on a zero rerun.

## Evidence

### How it was measured

- **Two copies of `src/detect`** in the session scratchpad, main at `d42464b` and a prototype with every new rule behind a switch, loaded side by side through `jiti` with `@` aliased to `src` and `libphonenumber-js` to the repo's copy. `harness.mjs`, `gen.mjs`, `noise.mjs`, `timing.mjs`, `versus.mjs` and `corpus.mjs` are the scratch scripts; nothing here was committed.
- **Layouts** (`gen.mjs`, seed 20261027): each string is a label (none, or one of `Born`, `DOB`, `Date`, `Tel`, `SSN`, `Card`, `NI`, `on`, `Ref`, `Signed`), 0 to 2 neighbours, the form, 0 to 2 neighbours (at least one in all), and a tail (none, ` here`, ` on file`, `.`). Neighbours come from one family per cell: valid phone numbers (US and UK, four written styles, checked `isValid()` by libphonenumber-js `max`), phone numbers only possible (UK area codes with random local digits, possible and not valid), numeric dates (`dd/mm/yyyy`, `dd.mm.yyyy`, `mm-dd-yyyy`, ISO, and two digit years), written dates, ISO intervals (with `/`, with `T` times, with plain times), Social Security numbers (hyphens, spaces, and bare after `SSN`), National Insurance numbers spaced and not (valid prefixes, suffix or none), cards (Visa, Mastercard, American Express; spaced, hyphenated, unbroken; Luhn valid), and one to three plain digit groups. Separators between items: one or two spaces, `, `, `; `, ` - `, `-`, `/`, `: `, ` | `. Every second string glues one ASCII digit after the form; a quarter of neighbours carry one.
- **Columns**, per string, main against the prototype through `detect`: *lost*, a letter or digit main puts in a row and the prototype in none; *tick*, a position in a ticked row of main that is in no ticked row of the prototype (the default removing less); *changed*, a row main lists that the prototype does not list with the same kind, start, end and tick. *Found* is a date row starting where the form starts and ending inside it.
- **Corpus** (`corpus.mjs`): every string literal holding a digit in `tests/unit/detect*.test.ts`, `tests/unit/detection.test.ts` and `scripts/lib/detection-fixtures.mjs`, template literals with their parts joined, NFKC normalised: 1,351 strings.

### The chosen design, final settings (2,000 per form and family, 460,000 strings)

| Form | Lost | Ticks lost | Rows changed | Found | Found, glued digit |
|---|---|---|---|---|---|
| `d-Mon-yyyy` (`-`, `/`, `.`) | 0 | 0 | 0 | 100.0% | 100.0% |
| `dd-MON-yy` | 0 | 0 | 0 | 49.9% | 0.0% |
| `Mon-d-yyyy` | 0 | 0 | 0 | 99.9% | 99.9% |
| `yyyy-Mon-dd` | 0 | 0 | 0 | 99.7% | 99.9% |
| `yyyy.mm.dd` | 0 | 0 | 0 | 95.3% | 96.1% |
| `yyyy/m/d` | 0 | 0 | 0 | 76.3% | 64.4% |
| `yyyy-m-d` | 0 | 0 | 0 | 75.7% | 64.7% |
| `yyyymmdd` | 0 | 0 | 0 | 41.9% | 0.0% |
| `d Mon yy` | 0 | 0 | 0 | 48.3% | 0.0% |
| `Mon d, yy` | 0 | 0 | 0 | 49.9% | 0.1% |
| `d Mon 'yy` | 0 | 0 | 0 | 49.0% | 0.0% |
| `d Month,yyyy` | 0 | 0 | 0 | 96.3% | 96.2% |
| `Month d,yyyy` | 0 | 0 | 0 | 100.0% | 100.0% |
| `dd / mm / yyyy` | 0 | 0 | 0 | 96.4% | 96.4% |
| `yyyy - mm - dd` | 0 | 0 | 0 | 96.4% | 96.7% |
| `dth day of Month yyyy` | 0 | 0 | 0 | 100.0% | 100.0% |
| `d. Month yyyy` | 0 | 0 | 0 | 96.3% | 96.4% |
| `Month, d yyyy` | 0 | 0 | 0 | 99.7% | 99.7% |
| `Mon.d, yyyy` | 0 | 0 | 0 | 100.0% | 100.0% |
| a label word glued (`Due-27/09/2026`) | 0 | 0 | 0 | 96.4% | 97.8% |
| a marker then another script's digit | 0 | 0 | 0 | 84.3% | 82.8% |
| another script's digit after the date | 0 | 0 | 0 | 87.2% | 79.9% |
| a Social Security number, marker, script digit (rule unchanged) | 0 | 0 | 0 | 0.0% | 0.0% |

A glued digit after a two digit year, after `yyyymmdd` or after a one or two digit day is a longer number by design, so those forms are found in about half of all strings and in 84% to 99.8% of those with no glued digit. Where a form is not found otherwise, a phone row holds its digits as on main (17% to 22% of the year first slash and hyphen forms beside phone numbers), or a separator and digits follow it. This run is the prototype with every rule this spec names, AC-5's comma rule included (2026-10-27, 137 s).

### The rejected designs (1,000 per form and family, 230,000 strings each, final settings otherwise)

| Design | Strings with a lost digit | Strings with a lost tick | Where |
|---|---|---|---|
| New readers inside today's scan | 23 | 8 | `dd-MON-yy` 2, `yyyy.mm.dd` 1, `yyyy/m/d` 1 and 1, `d Mon yy` 1 and 5, `d Mon 'yy` 2 and 1, `yyyy - mm - dd` 0 and 1, another script's digit 16 |
| Widen `isNumericDate` | 194 | 161 | `yyyy.mm.dd` 43 and 36, `yyyy-m-d` 86 and 87, `yyyymmdd` 65 and 37, `yyyy/m/d` 0 and 1 |
| The second pass with today's yield | 1 | 0 | `yyyy.mm.dd` |
| The Social Security marker (option 2 above), at 1,000 per cell before it was dropped | 0 | 583 of 10,000 | every family |

Examples: `DOB 04-03-19660 - 2023-05-15-28-APR-55/21.11.69` lost `28` and its tick when a joiner in today's scan was allowed to see a new form beyond it (main lists `05-15-28`, ticked); `Card 28.12.59-1972-01-12-06-JUL-283` the same in the single scan; `on 020 3140 62125; 1987.03.31 (212) 596-87352` with `isNumericDate` widened lost the phone row main lists across `1987.03.31 (212)`.

### Noise (4,000 strings per shape; % with a date row main does not list)

| Shape | Ours | chrono strict |
|---|---|---|
| `Release v2024.1.3 notes` | 0.0% | 0.0% |
| `build 2024.10.1 ok` (calendar version) | 98.0% | 98.0% |
| `Part 1906.01.26 each` (random `NNNN.NN.NN`) | 0.1% | 0.1% |
| `Lot 2069-6-4 out` | 2.1% | 2.1% |
| `see 2010/8/6 below` | 1.5% | 1.5% |
| `No 20860131 paid` (eight random digits) | 0.1% | 0.0% |
| `Order 20171122 paid` (a year and four digits) | 3.6% | 0.0% |
| `on December 12 70 people came` | 100.0% | 100.0% |
| `Rule 8 may 42 apply` | 100.0% | 100.0% |
| `Mon 3 Dec 10:30` | 0.0% | 0.0% |
| `3 December 23.01 start` | 0.0% | 100.0% |
| `Sep 27 10am` | 0.0% | 0.0% |
| `ratio 6 / 9 / 2025 held` | 10.1% | 0.0% |
| `won 6 - 7 - 77 away` | 0.0% | 0.0% |
| `5. July 2030 results` (a numbered list item) | 100.0% | 0.0% |
| French phone numbers, hyphens and spaces | 0.0% | 0.0% |
| `10-89-44 20260728` (sort code and account) | 0.1% | 0.0% |
| a month and year, a day and month, a page range, an ISBN | 0.0% | 0.0% |

Token soup (40,000 strings of 4 to 12 tokens from digits of 1 to 8 places, month words in every case, `day`, `of`, `the`, `this`, `may`, times, separators and prefixes, nothing planted): ours adds a row to 0.53% of strings (213 rows), chrono to 1.29% (518 rows).

The corpus: 9 of 1,351 strings gain a date row with ours: `2026.09.27` and `2026-9-27` (strings `detect-dates.test.ts` gives `isNumericDate`, which still rejects them), `on 1 May 26 we` (AC-5's flipped pin), `05.12.1980١` and `27 September 2026١` (AC-9), `Updated27/09/2026` (AC-8), and `27/09/20261١`, `27 September 20261١`, `12.05.1980.1١` (AC-9, the marker pins after NFKC). chrono gains 50 before its results are limited to text main's rules do not read, and 10 after: among them `on 1 May 26` with `on` in the row, `on 27    September 2026` (four spaces, a pinned miss), `11-2026-09-28` and `10:00-2026-09-28` out of an interval, and `2026-09-27-1` (a build number).

### chrono-node 2.10.2

- **Each listed form alone**, in `Signed … here`, `chrono.strict.parse` with day, month and year all certain: it reads `05-Jan-2026`, `27/Sep/2026`, `27-September-2026`, `27-SEP-26`, `Sep-27-2026`, `2026-Sep-27`, `2026.09.27`, `2026/9/7`, `2026-9-7`, `27 Sep 26`, `Sep 27, 26`, `15 March,2026`, `March 15,2026`, `September, 27 2026` and `Sept.27, 2026`. It misses `20260927`, `27 / 09 / 2026`, `27 . 09 . 2026`, `27 - 09 - 2026`, `2026 - 09 - 27`, `27th day of September 2026` and `Dated this 1st day of May, 2026` (it reads only `September 2026`, with no day), `27. September 2026` and `1. May 2026` (the same), `27.Sep.2026` and `Sep.27.2026` (no day or no year), and `27th Sept '26` (no year).
- **In the layouts** (chrono as the second pass, its results limited to years 1900 to 2099 and to text main's rules do not read; 1,000 per cell): lost 0 and ticks lost 0 on every form. Found, all strings: `d-Mon-yyyy` 29.8%, `dd-MON-yy` 42.1%, `Mon-d-yyyy` 28.3%, `yyyy-Mon-dd` 45.3%, `yyyy.mm.dd` 44.3%, `yyyy/m/d` 52.7%, `yyyy-m-d` 51.4%, `yyyymmdd` 0.0%, `d Mon yy` 42.5%, `Mon d, yy` 42.0%, `d Mon 'yy` 0.0%, `d Month,yyyy` 43.2%, `Month d,yyyy` 42.6%, both spaced 0.0%, legal 0.0%, German 0.0%, `Month, d yyyy` 89.2%, `Mon.d, yyyy` 42.6%, a label word 25.1%, either script digit shape 0.0%. With no glued digit that is 56% to 93% of the forms it reads; with one, 0% to 17% for most (85.6% for `Month, d yyyy`). It reads a written month with dots in no layout (`03.Jul.1989`).
- **What only chrono finds** (`versus.mjs`, 300 per cell, 3,000 per form, final settings): `yyyy.mm.dd` 17 (a National Insurance suffix and a hyphen before it, `MK 38 43 69 D-1984.06.25`), `yyyy/m/d` 93 and `yyyy-m-d` 82 (the own separator rule: `801-666-2504/2035/6/24`, `617-381-0846-2016-4-14`), `Mon d, yy` 3 and `Month, d yyyy` 4 (a number before a month first date: `5 MARCH 25, 52`, `19 December, 16 2015`). Every other form 0. Ours finds the form where chrono does not in 182 to 3,000 strings per form.
- **Linear time** (wall time, mean of three, 100,000 and 400,000 characters): every shape tried runs in at most 140 ms at 100,000 (`3-5 ` repeated) and 506 ms at 400,000, a ratio of 3.4 to 4.4 for four times the input; a run of `1 `, `12 `, `1,`, `1.2.`, `11:`, `on 5 `, `at 10 `, `2026-`, month words, ordinals and letters at 100,000 characters costs at most 83 ms.
- **Bundle** (esbuild 0.25, minified, browser target): `import { strict } from "chrono-node/en"` 46.3 KB, 13.3 KB gzip, 11.9 KB brotli; the root import with only `strict` used, the same after tree shaking; every locale 200.4 KB, 43.7 KB gzip. For scale, `libphonenumber-js/max` bundles to 190.4 KB (48.1 KB gzip) and MuPDF's WebAssembly is 10.4 MB. npm's unpacked size is 2,794,832 bytes (every locale, the sources, CommonJS and ES module builds). No dependencies, `sideEffects: false`, MIT.

### Linear time, ours (CPU ms, best of three, the date detector alone)

| Shape | Main, 100k | Ours, 100k | Ours, 400k |
|---|---|---|---|
| `27-Sep-` repeated | 46 | 125 | 500 |
| `05-Jan-2026 ` repeated | 47 | 110 | 436 |
| `2026.9.` repeated | 62 | 281 | 1,047 |
| `2026.9.7 ` repeated | 47 | 109 | 469 |
| `20260927 ` repeated | 47 | 93 | 437 |
| `20260927` glued | 47 | 125 | 532 |
| `1 / 2 / ` repeated | 31 | 109 | 515 |
| `27 / 09 / 2026 ` repeated | 16 | 79 | 328 |
| `27th day of ` repeated | 47 | 157 | 610 |
| `1. May ` repeated | 31 | 141 | 594 |
| `Sep.27.` repeated | 47 | 93 | 547 |
| `5 may 26 ` repeated | 47 | 93 | 421 |
| `Updated27/09/` repeated | 47 | 187 | 749 |
| `27/09/20261١ ` repeated | 78 | 125 | 469 |
| `12/05/` repeated (today's shape) | 47 | 46 | 218 |
| random digits and separators | 62 | 188 | 765 |
| random soup of date tokens | 46 | 156 | 640 |

At 200,000, 400,000 and 800,000 characters the two slowest shapes take 562, 1,125 and 2,234 ms (`2026.9.`) and 250, 516 and 1,062 ms (`Sep.27.`): doubling the input doubles the time. The prototype joins each window into a string and runs the new patterns one after another; the build may be faster, and AC-16's test holds the budget either way.

### Measured in the build

`/develop` records here the rerun of the table above on the built code (task 11), the corpus check and the built timings.
