# Review, feat/remaining-detectors, 2026-10-10

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 42 files, branch vs main
**Verdict**: Changes requested

## Summary
This branch adds the date, card, IBAN, US SSN and UK NINO detectors, widens `DETECTOR_KINDS` to seven, and changes the overlap step so a cut span keeps its free stretches as pieces. The code is tidy, linear, well commented and walled correctly. I found two real silent misses, both confirmed with a scratch run. One is a card that loses its last group. The other is a pair of dates that vanish when joined by a hyphen. The piece step in `src/detect/index.ts` is correct as written. The DETECTOR_KINDS change is safe. The product shot warning is noise.

## Major
### 🟠 A number before a spaced card can swallow the card's first three groups, `src/detect/card.ts:253`
**Problem**: `cardsIn` takes the shortest window that passes, starting at the earliest unit. A 4 to 6 digit number in front of a spaced card can make a false 16 digit window that passes Luhn and a brand prefix. That window takes the first three groups of the real card, and the last group stays in the file with no row.
**Failing input (confirmed)**: `2226 4111 1111 1111 1111` gives one card row `2226 4111 1111 1111`. The real card's last `1111` has no row. I ran every 4 digit number from 1000 to 9999 before `4111 1111 1111 1111`: 269 of 9000 (about 3%) lose the card this way, for example `2226`, `2234`, `2259` and `2309`. Spec 0005 (Consequences, the line "A 4 to 6 digit number right before a spaced card") records this at 2.5% and accepts it, saying that preferring a later start only moves the risk to the other side.
**Why it matters**: A card with its last four digits left visible, and a ticked row that looks like a full card, is the "looks redacted but is not" case. The accepted trade off is real, but a fix exists that moves the risk nowhere.
**Suggested fix**: Do not choose between overlapping candidates. When the chosen window overlaps a later start whose window also passes, emit one span that covers the union of both. Over redacting a neighbouring number is the fail safe side, and nothing is left behind. A cheaper option is to keep the overlapping window as a piece through the overlap step instead of dropping it.

### 🟠 Two dates joined by a hyphen both vanish, `src/detect/date.ts:173` and `src/detect/date.ts:194`
**Problem**: `cutFrom` treats a separator whose far neighbour is a letter or digit as part of a longer code. In `01/05/1980-31/05/1980` the first date's end sees `-` followed by `3`, so it is cut. The second date's start sees `-` preceded by `0`, so it is cut too. Neither is listed and there is no warning.
**Failing input (confirmed)**: `01/05/1980-31/05/1980` gives no rows. `05.12.1980-10.12.1980` gives none. With spaces around the hyphen both are found. Date ranges in contracts, employment histories and CVs are written both ways.
**Why it matters**: Dates are unticked unless a birth word is near, so the checklist is how the visitor finds them. A date nobody lists is a date nobody can choose to remove, and the coverage note says dates are looked for. Spec 0005 describes cutting from a longer code (`REF-05.12.1980`), and the tests pin that, but nothing pins a range.
**Suggested fix**: Let a hyphen between two complete dates part them rather than glue. For example, in `cutFrom`, do not call a separator a cut when what follows it reads as a full date of its own (the same test `numericAt` already makes), and mirror it on the start side. Keep `REF-05.12.1980` rejected. Add a test for `01/05/1980-31/05/1980`.

## Minor
### 🟡 A date with a time, or a value glued to the next word, is dropped whole, `src/detect/date.ts:221`, `src/detect/iban.ts:166`, `src/detect/uk-nino.ts:83`
**Problem**: Every letter or digit boundary drops the value rather than listing it. `2026-09-27T10:00:00Z` and `DOB 1980-05-12T00:00` give no date (the test at `tests/unit/detect-dates.test.ts:180` pins this on purpose). `GB82 WEST 1234 5698 7654 32A` gives no IBAN. A superscript footnote marker after an IBAN becomes a digit under NFKC and also kills it. `AB123456CD` gives no NINO.
**Why it matters**: This is the right call against false positives in codes, but it is a silent miss for text extraction that runs words together. The project leans fail safe. For the ISO datetime case a date of birth can disappear.
**Suggested fix**: For an IBAN, whose checksum and length are strict, allow a letter or digit to touch the end. For ISO dates, accept a `T` plus time after the date as a boundary. Or say in the coverage note that values glued to text are skipped.

### 🟡 A card followed by a full date makes a phone piece and a partial date, `src/detect/index.ts:103`
**Problem**: `5500 0000 0000 0004 05/12/2026` gives `card`, `phone[05]` and `date[/12/2026]`. The date's day is taken by the phone piece and the date row starts with a slash. This is the same cause as the known "123-45-6789 15/03/2026" case, but a card followed by a date is a more common layout.
**Suggested fix**: Fold into the phone follow up (spec 0005 Follow up).

### 🟡 No test for a span cut in the middle, leaving a piece each side, `tests/unit/detect.test.ts`
**Problem**: INV-16 is tested for a cut at one end only. I read `freeStretches` for the middle case and it is correct: it walks the span, skips claimed positions, trims only whitespace, drops stretches with no letter or digit, and claims what it keeps. Nothing is lost and no piece is emitted wrongly. But no test holds that.
**Suggested fix**: Add a unit case where a higher kind sits inside a lower span with text on both sides (two pieces, each trimmed, ticks inherited), and one where the higher kind covers the whole span (no piece).

## Nits
- ⚪ `src/detect/index.ts:143`, the piece check uses `points.slice(...).some(...)`, which allocates per stretch. Fine at this size.
- ⚪ `src/detect/uk-nino.ts:79`, `AB123456 A cat` takes the lone `A` as a suffix and removes one extra letter. Fail safe, noted for the record.
- ⚪ `src/detect/card.ts:154`, the card detector checks only digit neighbours, so `ORD4111111111111111` is a card but the other detectors reject a letter neighbour. Fail safe, but the comment could say so.

## Checks you asked for
- **Card window choice**: A wrong earlier window can hide part of a real card (first Major). A longer digit run does not hide one: `1234 4111 1111 1111 1111 9999`, two cards side by side, and a card with a trailing CVV or expiry were all found correctly. The whole run rule and the clear end rule behaved as documented.
- **Overlap step (INV-16)**: No lower match is dropped unless every one of its positions is claimed. No piece loses characters other than edge whitespace and stretches with no letter or digit. Pieces never overlap, because each kept piece is claimed before the next is read. The only odd output is a piece that starts with punctuation (`/12/2026`), which is the known phone case.
- **Boundaries**: SSN (digit neighbours only), NINO, IBAN and date are covered above. Newline joins are one space by construction, so a value across a line break is found.
- **DETECTOR_KINDS**: The order is the checklist group order and the coverage note order. Nothing persists by position. `DETECTORS` and `DETECTOR_LABELS` are records over the kind, so typecheck holds them. `LoggablePayload` takes `DetectorKind` as a union, so it needs no change. I found no runtime validation of kinds on the worker boundary that could reject the new ones, and the checklist groups by `DETECTOR_KINDS.flatMap`, which now includes all seven, so no group can go unshown. `PRECEDENCE` is a separate list from `DETECTOR_KINDS`, tied only by `tests/unit/detect.test.ts`, so keep that test.
- **Product shot warning on "/"**: Noise, not a defect. The page renders `loading="eager"` with `fetchPriority="high"`, and Next hoists that into a `<link rel="preload" as="image">` in the head. In the built HTML the hint carries the same `imageSrcSet` and `imageSizes` (`(min-width: 64rem) 40rem, calc(100vw - 2rem)`) as the `<img>`, so at a fixed width the browser picks the same file for both. The warning appears when the window is resized between the hint and the image being parsed, because the two then pick different widths (for example 384 and 640). The image code in `src/app/page.tsx` did not change in this branch. No action needed.
- **Known, not re-raised**: the phone detector losing digits when digit groups come before it, `123-45-6789 15/03/2026` splitting into a phone row and a date row, and `4111  1111  1111  1111` giving no card.

## Strengths
- Each detector says why it is linear, names its spec invariant, and keeps its constants in `src/detect` as pattern rules.
- The piece step is simple, correct, and keeps the "nothing a detector found loses its row" promise for every cut case I tried.
- Strong test pinning of near misses (card group edges, bare SSN rules, IBAN lengths, NINO prefixes) and a Consequences section that measures the known risks.

## Test coverage
Strong for each detector, with unit tests, fixtures and engine tests. Gaps: no test for a cut in the middle (INV-16), none for an unspaced date range, and none pinning a number before a spaced card that makes a false window (the spec measures it but no test holds the outcome).
