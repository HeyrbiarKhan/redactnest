# 0005. Pattern detection: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and skips this file.

## Context

> ⚠️ Premise note: the scope's done line asks that "every match maps to a target the engine can actually remove". Taken literally, no review time check can promise that. Spec 0004's self check refuses some runs for causes that show only once text is removed: a size change inside a text object next to a match, a zero width combining mark, lines shown with `'` or `"`, a watermark crossing a match, and replacement text wider than a match whose string equals its glyphs. A detector that claimed otherwise would be promising what the engine then breaks. This spec holds the part that can be guaranteed (every unblocked match passes the engine's own target validation, AC-6) and names the rest as limits, which end in a refusal, never a leak.

The engine can remove text but cannot decide what to remove. Until something finds the sensitive values and turns each into a target, the tool page's Redact button only cleans metadata. The visitor is a small business handling HR, legal or healthcare documents, and the promise is real removal with nothing stored. So detection has three jobs at once: find the values, show each with enough of the text around it to judge it, and hand the engine a target it will accept.

The forces are specific. The document's text exists only inside the worker, and only one PDF parser may exist, so detection has to read MuPDF's structured text on the same prepared page the engine redacts (spec 0004, INV-9). The engine checks every target before removing anything: the characters inside its quads must read as its text, no quad may be too slanted, and no image under it may be blanked too far. A target that fails any of these ends the session in `failed`, so a checklist that offers such a row costs the visitor their review. The main thread may see a match's text and a capped context window, and nothing geometric (spec 0002, INV-1, INV-2, INV-9).

A detector runs over whatever a PDF contains, which a hostile or merely odd file controls. A pattern that backtracks can freeze the tab on a crafted page. Detection also shapes trust: a short list with nothing else said reads as "this document is now clean", which is exactly the false impression the product exists to prevent. The audience implied by the planned kinds (US Social Security numbers, UK National Insurance numbers, IBAN for EU customers) and the price in dollars sets which phone formats matter most.

Release 1 builds only email and phone, but release 3 builds five more against this spec, so the approach has to make adding a kind a small, contained change, and each kind's rules have to be written down now rather than invented at build time.

## Options considered

### Option 1: Rule based detectors in a pure `src/detect`, libphonenumber-js for phone (chosen)

One detector per kind, each a pattern or scanner plus the kind's own validator, as pure functions from a block of text to spans, in a new folder with no MuPDF. One engine step builds the page text from MuPDF's characters, calls the detectors, and turns spans into targets. Phone numbers use libphonenumber-js, which carries each country's numbering plan (basis: Google's libphonenumber rules, as ported by libphonenumber-js).

**Pros**:
- Explainable and deterministic: a row matched because it is shaped like an IBAN and its checksum holds.
- Detectors are string functions, testable without the engine, and a new kind touches `src/detect`, a label and a fixture.
- Phone validity comes from maintained metadata rather than a digit length rule we would maintain ourselves.

**Cons**:
- Misses what does not look like the pattern, and names and addresses entirely.
- A new dependency and about 145 KB of metadata in the worker chunk.
- A new folder and lint zone to keep.

### Option 2: The same detectors inside `src/engine`, with a hand written phone pattern

Everything behind the engine wall in one place, and no dependency: phone numbers found as digit runs with separators and a length rule.

**Pros**:
- No new package, no new zone, nothing new in the bundle.
- One folder holds everything that reads a page.

**Cons**:
- A length rule either floods the checklist with order and invoice numbers or misses real formats, and every country's quirks become ours.
- The engine takes on a second job, and a detector's test loads the engine module.

### Option 3: An on device named entity model

A small named entity recognition model (a model that tags words as names, places and so on), for example through transformers.js, run in the worker.

**Pros**:
- Would also catch names and addresses, the largest gap in rule based detection.

**Cons**:
- A download of tens of MB on top of MuPDF, and seconds per page on a modest laptop.
- Probabilistic: it cannot say why something matched, and cannot check an IBAN or a card number.
- Names are not in the scope's seven kinds, so the main benefit buys nothing this release needs.

### Choices the engineer made during the design

| Choice | Picked | Runner up |
|---|---|---|
| Who shows the checklist | feature 6, a thin checklist on `/tool` | detection only, feature 8 shows it |
| Default ticks | the kinds with a strong rule ticked, dates not | nothing ticked |
| Repeated values | one row per occurrence | one row per value, removing every occurrence |
| Matches the engine would refuse | shown, not tickable, with a reason | hidden |
| Phone regions | international plus UK and US national | also the browser's region |
| Line breaks | join lines in a block, plus an email rejoin after `@` or `.` | a single line only |
| Email scope | the common form in any script | ASCII only |
| Dates | full dates listed, dates of birth ticked | full dates listed, all unticked |
| US SSN | separated always, bare only near an SSN word | separated only |
| Cards | Luhn plus a real brand prefix | Luhn only |
| UK NI | HMRC's prefix rules, suffix optional | suffix required |
| Blocked shape | a `blocked` reason on `ReviewMatch` | a separate list on the result |
| A readable page that throws | fail the open as `unsupported` | skip it and warn |
| Very many matches | no cap, measure first | a config cap that refuses |
| Coverage | a standing note | only in the empty state |
| Plausible phone numbers (added after acceptance) | listed, unticked | left out |
| Valid phone numbers written as bare digits (proposed after acceptance, to fix a measured false match) | listed, unticked unless a phone word precedes them | ticked like any valid number |
| Where the three decisions owed from `/develop` are recorded (update of 2026-09-27) | this spec, updated in place | a new spec replacing it |
| How phone candidates are found (update of 2026-09-27) | our own scanner, libphonenumber-js judges each window | `findNumbers`, plus a second pass over runs it found nothing in |
| Phone look alikes (update of 2026-09-27) | the trunk rule plus a shared numeric date rule | excluding named shapes only |
| Phone budget (update of 2026-09-27) | 2 seconds, every grouping kept | a first group rule that keeps 1 second |
| Competing windows in one run (update of 2026-09-27) | valid first, then possible | leftmost longest possible |
| A slash between digit groups (update of 2026-09-27) | separates numbers | glues groups, as first built |
| Phone extensions (update of 2026-09-27) | a fixed marker list, never a comma | the library's own markers |
| Proof of the phone detector's cost (update of 2026-09-27) | a parse count as well as a time budget | a time budget only |
| Where the card neighbour rule is recorded (update of 2026-10-08) | this spec, updated in place | a new spec amending it |
| What counts as one number beside a card (update of 2026-10-08) | whole units: unbroken and hyphen glued digits never cut, space parted groups separate | also unticked rows cut from unbroken runs; or hyphens parting groups like spaces |
| Group sizes in a spaced card (update of 2026-10-08) | first 4 to 6 digits, the rest 3 to 6 | any sizes, as first built |
| Which passing window is the card (update of 2026-10-08) | the longest whose end is clear, else the shortest | the longest; or every passing window merged |
| Tick for a card read from a longer run (update of 2026-10-08) | ticked, like every card | unticked |
| IBAN, SSN and NI beside other digits (update of 2026-10-08) | no rule change, the layouts pinned in tests | the finding recorded only |
| The last group of a spaced card, after the cross check (update of 2026-10-08) | 1 to 6 digits, so payment form layouts are found | 3 to 6, as first approved |
| A number of 4 to 6 digits just before a card (update of 2026-10-08) | a recorded limit | a start side rule, which moves the risk after the card |
| A hyphen or dash before an expiry (update of 2026-10-08) | parts when its far side touches a slash shape | glues, recorded as a limit |
| A short group glued to a slash, `12` of `12/28` (update of 2026-10-08) | ends the run, so long cards before an expiry stay whole | read as a unit, as first written |
| A higher match cutting into a lower one (update of 2026-10-08) | the lower keeps each free stretch as its own row | merged into the higher; or dropped whole, as first built |
| How a date's edges are judged (second update of 2026-10-10) | one general rule: a real date is never dropped for what follows it, with two measured rejections | the review's forms added one by one, a fourth round |
| Which rejections stay (second update of 2026-10-10) | a letter before the date or before its separator; the date's own separator running on with digits | none at all, which lists version numbers and French phone numbers as dates |
| What may stand between two joined dates (second update of 2026-10-10, after the cross check) | only a time, judged by its characters: digits, whitespace, `: . , + @`, hyphens, letters in runs of at most 5, within 40 code points | a grammar of times stepped over after each date (the first draft, which read `-12` as an offset); the ISO `T` form only, as first built |
| A day range with spaces round its dash (second update of 2026-10-10, after the cross check) | one row for the whole range in the month first form only | every written form (the first draft, which swallows a heading number); or the second day's date alone, as before |
| A birth word glued to its date (second update of 2026-10-10, from the cross check) | listed and ticked | dropped, as before; or listed unticked |
| The tick of a date with something glued after it (second update of 2026-10-10) | AC-10's birth word rule, unchanged | unticked whatever stands before it, as a glued National Insurance letter is |
| `TIME_LONGEST` (second update of 2026-10-10) | 40, now the longest stretch between two dates, the cap kept for INV-7 | 20; or no cap, which is quadratic |

## Rationale

Option 1 because it meets each force directly. A detector that is a pure function of a string is the only kind whose behaviour a visitor can be told and a test can pin, and the kinds in scope are defined by their shape and their checksum (basis: ISO 13616 mod 97 for IBAN, ISO/IEC 7812 Luhn for cards, the SSA's randomization rules, HMRC's NI prefix rules). Option 3 answers a question the scope does not ask, at a cost in download and certainty this product cannot afford. Option 2's single saving, no dependency, is the wrong one to take for phone numbers: they are the one kind whose rules differ by country and change over time, and a maintained numbering plan is the boring, proven answer.

Keeping detectors out of `src/engine` follows the codebase's own shape (basis: `AGENTS.md`, folders by capability). The engine reads pages; detectors read strings. The lint rule that only the engine may import `@/detect`, and only `src/detect` may import libphonenumber-js, also keeps the library out of every page's chunk, which matters on a tool route that loads nothing it does not need.

The load bearing call is that detection must never offer a row the engine will refuse. So the checks are not reimplemented: `validateTargets` is split into per target predicates that detection calls too (basis: spec 0004, AC-27 to AC-29). The engine's checks are already decided target by target, so an unblocked match passes validation whatever else is ticked beside it. Quads are built the way `page.search()` builds them, because spec 0004's geometry was designed and measured on those quads (basis: spec 0004, *Standing in for feature 6 in tests*). A blocked match gets no target at all, so the worker's existing refusal of an unknown id covers it with no new path (basis: fail closed).

Detectors scan rather than search where a pattern could backtrack, email above all (basis: OWASP, Regular expression Denial of Service). Each character is normalised on its own (basis: Unicode NFKC normalisation) so a ligature or a fullwidth sign does not hide a value, while the target keeps the raw characters the engine compares. Finally, a clean looking list is the product's most dangerous screen, so a standing note names what was looked for; a visitor who reads "email addresses and phone numbers" will not assume their client's name is gone.

## Evidence: what MuPDF.js 1.28.1 can tell detection about replacement text

Spec 0004 measured replacement text (`/ActualText`, a string a PDF attaches to glyphs so that copying yields it instead) after removal and a `sanitize` write. A span wrapping exactly the match is dropped whole and redacts cleanly. A span wider than the match is kept whole, and the run is refused with `replacement-text`, including when the span's string equals its glyphs ("Replacement text equal to the match: clean"; "wider than the match: kept whole", `actual-text.pdf` pages 1 to 4).

Detection would want to block the wider case before the visitor ticks it. Reading the pinned package's types (`node_modules/mupdf/dist/mupdf.d.ts`, version 1.28.1):

- `DeviceFunctions` offers `fillText`, `ignoreText`, the path, image, clip, mask, group, tile and layer callbacks, and no metatext or structure callback, so a custom device cannot see where a replacement span begins or ends.
- `StructuredTextWalker` offers `beginTextBlock`, `beginLine`, `onChar`, `endLine`, `endTextBlock`, `onImageBlock` and `onVector`. `onChar` gives a character, its origin, font, size, quad, colour and bidi level, and nothing about replacement text.

So the only signal is the difference between the two extraction modes. It catches a span whose string differs from its glyphs, and glyphs behind unrelated replacement text. It cannot see a wider span whose string equals its glyphs. Measured on 2026-09-27 by walking `actual-text.pdf` through MuPDF.js 1.28.1 in both modes: page 1 (a span wrapping exactly the match, which redacts cleanly) and page 2 (a wider span with equal glyphs, which the engine refuses) each give 21 characters, identical in code point, origin, quad, font and size between the two modes. Nothing in the structured text tells the two pages apart. Reading the content stream ourselves would find the span, and is ruled out: it would be a second PDF parser (spec 0004, INV-13). A trial redaction per match at open would find it too, at the cost of a fresh working copy per match, which is seconds per document. The limit is recorded, pinned by a test, and handed upstream.

## Evidence: code points above U+FFFF in MuPDF.js 1.28.1

`StructuredText.walk` builds each character's string as `String.fromCharCode(libmupdf._wasm_stext_char_get_c(ch))` (`dist/mupdf.js`, line 1150). `fromCharCode` keeps only the low 16 bits of its argument, so a code point above U+FFFF comes back as a different character. Measured on 2026-09-27 with a one page PDF whose ToUnicode map gives two glyphs U+1D400 and U+1D800:

| Read | Code points of `xAyBz` |
|---|---|
| `walk` `onChar` | `78 d400 79 d800 7a` |
| `asText()` | `78 1d400 79 1d800 7a` |
| `asJSON()`, the line's `text` | `78 1d400 79 1d800 7a` |

U+1D400 turns into U+D400, a Hangul syllable, and U+1D800 into U+D800, half of a surrogate pair with no partner. `walkCharacters` in `src/engine/characters.ts` reads the walk, so the record, the self check and target validation all see the cut values. They stay consistent with each other, which is why nothing leaks today, but detection built on the same values would show the wrong letter in the checklist (𠮷, U+20BB7, as a Tamil letter) and could split an email at a lone surrogate. `asJSON()` gives each line's `text` whole, in the same order as the walk, so the one reader repairs from it.

## Evidence: libphonenumber-js 1.13.14

Measured on 2026-09-27 against the published package (MIT, with Google's metadata under Apache 2.0; `max` metadata 157 KB and `min` 84 KB before compression):

| Text | `findPhoneNumbersInText` (US) | `findNumbers`, `leniency: "POSSIBLE"` (US) |
|---|---|---|
| `(212) 123 4567` (possible, not valid) | not found | found, `isValid()` false |
| `Order 12345678901` | found, valid | found, valid |
| `INV-2026-000123` | `2026-000123` found, valid | the same |

`findPhoneNumbersInText` returns valid numbers only, so plausible numbers need the `POSSIBLE` finder. `leniency` accepts `POSSIBLE` and `VALID` only, and the package's types do not declare it. Validity is not enough to tick: a bare eleven digit order number and the tail of an invoice code are valid US numbers. Hence the token boundary rule and the written like a phone rule for the tick.

The update below replaces `findNumbers` as the way candidates are found; this table stays as the record of why the first build used it.

## Update of 2026-09-27: how phone numbers are found

`/develop` built slices 1 to 4 and handed back three decisions: the phone detector took 0.6 to 1.4 s on 100,000 adversarial characters against AC-16's one second; ZIP+4 codes and dotted dates came back as possible UK numbers; and a run of phone numbers separated only by single spaces gave no match at all.

### Context

> ⚠️ Premise note: the three read as separate problems (a performance note, a look alike note and a detection gap). Measured, the first and third share one cause, the way `findNumbers` picks candidates, and the gap is wider than reported. It also misses a number with any other digit group beside it through a space (a call log line `12:30 020 7946 0958 3 min`), and in a comma list it reads the comma as an extension, so `020 7946 0958, 020 7946 0321` lists `020 7946 0958, 020` and leaves `7946 0321` in the file. The adversarial worst was also higher than recorded: about 2.1 s over both regions, on `2 ` or `0 ` repeated. A fix for one that leaves the cause in place leaves the others. So this update treats them as one decision about the finder, plus the look alike rules that sit on top of it.

libphonenumber-js's matcher (a port of Google's `PhoneNumberMatcher`) takes a maximal run of digits and phone punctuation, up to 20 digit blocks, as one candidate. When that candidate is not a number, it tries a short list of inner splits, the last of which breaks at a space and keeps only the text after it. A run of spaced numbers therefore splits into pieces too short to be numbers, and nothing is found. Real documents produce such runs often, because the engine joins the lines of a text block with one space: a staff table's phone column, one number per line, arrives as exactly that run. A missed number stays in the file, and the checklist never says so, which is the failure this product exists to prevent.

GB metadata accepts national numbers of 7, 9 and 10 digits, and, read under GB with no requirement for the leading `0`, any bare run of those lengths is possible. That is where `90210-1234`, `123-45-6789`, `555-0123` and bare 7 and 9 digit IDs came from. Dates that start with `0` pass even a trunk rule (`05.12.1980` reads as `0` then 7 digits). In release 3 `PRECEDENCE` puts `phone` above `date`, so such a date of birth would be claimed as an unticked phone number, and a birth word before it would never tick it.

### Options considered

**Option A: our own scanner finds candidates, libphonenumber-js judges each one (chosen).** A linear pass builds runs of digit groups, cuts each run into windows at unit boundaries, and asks the parser about each window whole (`extract: false`), under the one region its prefix selects.
- Pros: numbers side by side are found by construction; the comma is never read as an extension; the look alike rules have a natural home (the reading and the unit); the cost per group is bounded and countable.
- Cons: the candidate grammar becomes code we maintain, and a format the library's matcher handled but ours does not is a new miss.

**Option B: keep `findNumbers`, add a recovery pass** over runs where it found nothing, splitting them into windows as in A.
- Pros: ordinary text keeps exactly today's behaviour.
- Cons: two code paths that can disagree; the adversarial cost stays at about 2.1 s plus the recovery pass; the comma bug still needs its own fix, because `findNumbers` does find something in that run, just the wrong span.

**Option C: treat every line join as a hard break for phone numbers.**
- Pros: one line of code; fixes the one number per line column.
- Cons: loses numbers wrapped across lines (AC-4), and misses every same line case: runs, call logs, a count or time beside a number.

### Rationale

Option A, because it removes the cause instead of patching its symptoms. The library is best at what only it can do (knowing each country's numbering plan, which changes over time) and weakest at deciding where one number ends and the next begins in extracted PDF text, a job it was never tuned for. Splitting the work that way keeps the maintained metadata and puts the boundary decision where we can test it against the text PDFs actually produce. The grammar we now own is small (groups, units, gaps, brackets, a slash, a marker list) and every piece of it is pinned by a test.

A read only cross check on a second model (Sonnet 5) confirmed the reading table against the library and found no simpler design. It found nine places where the finder's text left the builder to guess, the most serious being that "a window grows unit by unit" could be built as judging only the longest window, which misses `020 7946 0958` in `020 7946 0958 2 020 7946 0321`. All nine were closed in *Detectors* the same day: every window length is tried, the unit grammar, the gap whitespace, `(0)` left out of the parsed digits, what each reading row tests, the joint reading lookup, the tick ignoring an extension, the parse count taken after the memo, and flush digits for the one character extension markers.

The look alikes are fixed by two rules with reasons rather than a list of shapes: the trunk rule says how UK numbers are written, and the date rule is the release 3 date detector's own predicate, so the two detectors cannot disagree about what a date is. The engineer kept every grouping of a number and gave the phone detector a 2 second budget rather than add a grouping rule that would keep it under one; the parse count test makes the bound independent of the machine, so neither budget flakes in CI.

### Evidence: `findNumbers` on text PDFs produce

Measured on 2026-09-27 against libphonenumber-js 1.13.14 with `max` metadata, under GB and US, with `leniency: "POSSIBLE"`:

| Text | What `findNumbers` returned (either region) |
|---|---|
| `020 7946 0958 020 7946 0321 020 7946 0123` | nothing |
| `020 7946 0958  020 7946 0321` (two spaces) | nothing |
| `212 555 0123 212 555 0124` | nothing |
| `+44 20 7946 0958 020 7946 0321` | nothing |
| `12:30 020 7946 0958 3 min` | nothing |
| `020 7946 0958 2 020 7946 0321` | nothing |
| `020 7946 0958, 020 7946 0321` | `020 7946 0958, 020` (the comma read as an extension), and nothing for the rest |
| `020 7946 0958 ` repeated to 100,000 characters | nothing (0 of about 7,100 numbers) |
| `020-7946-0958 020-7946-0321`, `(212) 555-0123 (212) 555-0124` | both numbers each (a hyphen or bracket inside each number lets the space split work) |
| `90210-1234`, `123-45-6789`, `555-0123`, `1234567`, `123456789` | each a possible GB number (no leading `0`) |
| `05.12.1980`, `05-12-1980`, `5.12.1980`, `01.02.2003` | each a possible GB number |
| `05/12/1980`, `12.05.1980`, `2026-09-27` | nothing (the matcher's own slash date rule, or no possible length) |

CPU time for one `findNumbers` call on 100,000 characters, per region (GB, then US): `+44 ` repeated 328 and 312 ms; `12 34 56 78 90 ` 203 and 531 ms; `2 ` 1,047 and 1,016 ms; `0 ` 1,016 and 1,047 ms. The detector runs both regions, so the worst is about 2.1 s.

### Evidence: the prototype of Option A

A prototype of this design (outside the repository) was measured the same day on the same machine. One `parsePhoneNumberFromString` call costs 5 to 23 µs; `isValid()` about 1 µs. With windows grown unit by unit up to 18 digits, one parse per window, verdicts kept per block, and the reading table (E.164 ranges for international readings):

- Every number today's `detect-phone.test.ts` finds was found with the same text, including a trunk prefix in brackets and a number before a full stop, and every look alike it rejects was rejected. The prototype computed validity but not the tick rule, which slice 5 leaves unchanged, and did not implement extensions; the marker list is specified from libphonenumber's own extension patterns without the comma and semicolon.
- Every row of the table above that returned nothing now gave each number; the comma list gave both numbers whole; `CA 90210-1234 (212) 555-0123` gave `(212) 555-0123`; `Box 2000 212 555 0123` gave `212 555 0123` under valid first choosing.
- ZIP+4, the Social Security shape, `555-0123`, bare 7 and 9 digit runs, numeric dates with each separator and a leading `0`, and `2012-01-02 08:00` gave nothing. `0113 496 0000` read as Leeds, and `011 44 20 7946 0958` as a US international call.
- Worst CPU time over 21 adversarial shapes: about 0.45 to 0.55 s across runs (random `2dd ddd dddd` groups, which are real looking numbers, each needing its parse), with at most about one parse per digit group in practice against the bound of 10.
- The runner up for the budget, a rule that a national number's first group holds at least three digits, measured 0.36 s at worst, and lost `02 0794 60958` and `0 20 7946 0958`.

libphonenumber-js's `Metadata` gives the national lengths the readings table is written from (`possibleLengths()`: GB 7, 9 and 10; US 10) and the international prefixes (`IDDPrefix()`: GB `00`, US `011`). `isPossible()` alone also accepts a UK number of a `0` and 6 or 8 digits, which are local only lengths (dialled without an area code); the table leaves them out on purpose.

## Update of 2026-10-08: a card beside other digits

`/develop` built feature 12 and reported a silent miss: `4111111111111111 12/28`, a card then its expiry, gave no row and no warning. It asked for a decision for cards, and a check of whether IBAN, Social Security and National Insurance numbers miss the same way.

### Context

The card detector read a run of digit groups joined by single spaces or single hyphens as one candidate, and judged the run whole: 13 to 19 digits, Luhn, a brand prefix, and no digit, or separator then digit, touching either end. The rule existed so a longer number is never cut into a card. But the run had no idea where a card ends, so any digits after a single space joined it, and the whole failed. A card's expiry, a CVV, a date, a second card or a row number one space away made the card vanish.

The line join makes this worse than it looks (AC-4). Lines in one text block join with one space, so a card at the end of a line and an expiry, a phone number or another card on the next line form one run. A probe page drew `4111111111111111` and `12/28` ten ways: separate text objects 0, 1, 2, 3, 6 and 12 points apart, and one `TJ` with kerns of 0, 100, 250 and 500 thousandths of an em. Today's find step listed no card on any of the ten lines. MuPDF's ordinary read gave a space for every gap of 2 points or more, and at 12 points split the two onto separate lines of one block, which the join puts back together with a space. Only gaps of 1 point or less read as touching digits.

Two layouts were worse than a miss. `3782 822463 10005 12/28` (American Express, grouped 4, 6, 5) and `3056 930902 5904 12/28` (Diners Club, 4, 6, 4) were each listed as a phone number cut from the card's first ten digits, the Diners one ticked, so the visitor saw a row and the rest of the card stayed. `4 4111 1111 1111 1111` gave the phone row `4 4111 1111`.

The tension the decision has to hold: favour finding (an extra row costs the visitor a glance, a missed value stays in the file) against never cutting a real longer number into a false card that starts ticked.

### Options considered

For what counts as one number:

**Whole units (chosen).** A unit is an unbroken digit group, or groups glued by single hyphens, and is never cut; units parted by one space are separate, and a card is any window of whole units that passes.
- Pros: fixes every measured layout; an unbroken or hyphenated longer number is never cut, which is where "one number" is certain.
- Cons: a spaced number of 18 to 24 digits that is not a card now lists a false card 2.8% to 8.2% of the time.

**Whole units, plus unticked rows cut from unbroken runs.**
- Pros: would also catch a card drawn touching other digits.
- Cons: long references and barcodes then list unticked card rows; the probe shows a touching layout needs a gap of 1 point or less, which no layout seen uses.

**Hyphens part groups like spaces.**
- Pros: finds `4111-1111-1111-1111-12`.
- Cons: cuts hyphenated codes such as licence keys into false cards, for a layout nobody writes.

For which passing window is the card, measured below:

**The longest whose end is clear, else the shortest (chosen).**
- Pros: never takes a neighbour's digits; a 19 digit card alone is still whole.
- Cons: a 19 digit card with more digits after it on its line keeps its last three digits when its first 16 also pass (10.3% of those). The cross check below narrowed this: before an expiry or a slashed date such a card is now whole.

**The longest that passes**, the phone detector's rule.
- Pros: simplest to state; never leaves a card digit.
- Cons: takes the first group of a spaced phone number or SSN on the next line 3.8% to 5.8% of the time, and AC-3 then drops that number's row whole, so the rest of it stays with no row.

**Every passing window, merged into one row.**
- Pros: leaves no card digit in any layout measured.
- Cons: takes a neighbour's first group 6.1% to 7.4% of the time, so AC-3 would have to change for every kind to keep the cut neighbour's rest as its own row.

### Rationale

Whole units, because "a longer number" is only certain when nothing parts it: an unbroken run, or groups glued by hyphens, is one token on the page and must never be cut. A single space is exactly how cards themselves are grouped, and exactly what the line join leaves, so it cannot mean "one number". Cutting there is the favour finding call, and its cost is visible: a false card shows as a row with its context. The group size rule is a fact about how issuers print cards (4 4 4 4, 4 6 5, 4 6 4, 4 4 4 4 3) and how payment forms group them (fours, with a short last group), and it removes the stray digit cases at no measured cost beyond groupings nobody prints.

The clear end rule picks the residue that does the least harm. Each rule leaves something in a rare layout; the chosen one only ever leaves the last group of an uncommon 17 to 19 digit card with more digits after it, with its first 16 removed and the rest in the row's context, while the longest window rule can leave most of someone's Social Security or phone number with no row at all. On its own it needs no change to AC-3; the overlap fix of the cross check below changes AC-3 for a separate reason. Cards stay ticked: the usual layout is a card then its expiry, and unticking those would leave the card in the file by default, which is the miss being fixed.

IBAN, Social Security and National Insurance numbers already pass, because their own boundary checks reject only a letter or digit glued to the value. They get tests rather than a rule change, so a later edit cannot quietly tighten them the way the card rule was.

### Evidence: the four kinds beside other digits

Measured on 2026-10-08 through the real `detect` (all seven kinds, with precedence), in the scratch tooling the engineer uses for detection (a `jiti` script outside the repository):

| Text | Before this update |
|---|---|
| `4111111111111111 12/28`, `4111 1111 1111 1111 12/28`, `4111-1111-1111-1111 12/28` | nothing |
| `4111111111111111 123`, `4111 1111 1111 1111 123` (CVV) | nothing |
| `4111111111111111 05/12/2026`, `4111111111111111 05.12.2026` | the date only |
| `1 4111 1111 1111 1111`, `03 4111111111111111 12/28` | nothing |
| `4111111111111111 5555555555554444`, the same spaced | nothing |
| `3782 822463 10005 12/28` | phone `3782 822463`, unticked |
| `3056 930902 5904 12/28` | phone `3056 930902`, ticked |
| `5555 5555 5555 4444 03 28` | phone `5555 4444 03`, unticked |
| `4111111111111111\t12/28`, `4111111111111111  12/28` | the card (a tab or two spaces end the run) |
| `GB82 WEST 1234 5698 7654 32 15/03/2026`, `GB82WEST12345698765432 1234`, `BE68 5390 0754 7034 2026`, `12 GB82 WEST 1234 5698 7654 32` | the IBAN, whole |
| `123-45-6789 15/03/2026`, `123 45 6789 1234`, `12 123-45-6789`, `1234 123 45 6789`, `SSN 123456789 1234` | the SSN, whole |
| `AB 12 34 56 C 15/03/2026`, `AB123456C 1234`, `AB123456 1234`, `AB 12 34 56 1234`, `12 AB123456C` | the NI number, whole |

### Evidence: the window rules on random cards

A prototype of each rule, measured on 1,000 random valid cards per layout across six brands (Visa 16, Mastercard, American Express, Discover 16, Diners Club 14, UnionPay 19), each spaced as printed and unbroken, with the group size rule on. *Left* is the share where some card digit had no card row; *taken* the share where a neighbour's digit went into a card row.

| Layout | Before | Longest | Longest clear, else shortest (chosen) | Every window merged |
|---|---|---|---|---|
| card `12/28`, card `03 28`, card date, two cards | left 100% | left 0%, taken 0% | left 1.8% to 2.1%, taken 0% | left 0%, taken 0% |
| card then CVV | left 94% to 95% | left 0%, taken 5.4% | left 1.3%, taken 5.4% | left 0%, taken 6.2% |
| spaced card, UK phone on the next line | left 100% | taken 3.8% | left 1.2%, taken 0% | taken 7.4% |
| spaced card, spaced SSN on the next line | left 100% | taken 5.8% | left 1.7%, taken 0% | taken 6.1% |
| row number or a lone `4`, then the card | left 100% | left 0% | left 0% | left 0% |
| 19 digit UnionPay then `12/28` | left 100% | left 0% | left 10.3% | left 0% |

Every *left* under the chosen rule is a 19 digit UnionPay card (one sample in six) whose first 16 digits also passed; every *taken* of a CVV is harmless. Without the group size rule, a row number joined a card 1.0% of the time and a lone `4` 6.3%, and an unbroken card took a neighbour's first group 4.7% to 6.4%; with it, all three were 0%.

False cards on 10,000 random spaced numbers per shape, any window rule: 2.8% of 16 digit numbers in fours (unchanged, Luhn and a brand by chance), 2.8% at 18 digits (0.8% before), 5.6% at 20 and 22, 8.2% at 24 (0% before).

### Cross check of the amendment

A read only pass on a second model (Sonnet 5.5) checked every example against a literal prototype of the rule and found them right, and the linear time claim sound. It raised seven points; the engineer took the recommended fix for five and asked for a real fix, not a limits line, for two (the hyphen before an expiry, and a false card cutting a real row). Its points, and what became of each:

1. A spaced card ending in a short group, as payment forms print a 13, 17 or 18 digit card, was never found under "the rest 3 to 6": measured 0% of 1,000 each. The last group may now hold 1 to 6 digits; found 100% alone.
2. A 4 to 6 digit number just before a card can take the card's first groups. Recorded as a limit with its measurement; every start side rule tried moves the same risk to after the card.
3. A hyphen or dash glued to an expiry left the card unfound. Fixed by parting such hyphens (below).
4. AC-28 said "only its own characters" while a CVV ending the run may join the card. AC-28 and the decision now say when a group after a card joins it.
5. Step 5's clear end restated as "reaches the run's last unit, with no dot or slash and a digit after it", which is what the longer wording came to; nothing is checked before a window's start, as before.
6. Builder details written down: the span's extent, the 19 digit limit test's layout and how to build its number, the per kind tests against `detect`, the shared `SHAPES`, the fixture order and the `verify.md` rewrite.
7. A false card overlapping a real phone, SSN or NI row dropped that row whole. Fixed by keeping the free part as its own row (below).

### Evidence: parting a hyphen next to an expiry or a date

The same prototype, with a hyphen that parts when the group on its far side touches a slash and a digit, against one that always glues. 1,000 random valid cards per layout, six brands:

| Layout | Found whole, gluing | Found whole, parting |
|---|---|---|
| spaced card `-12/28`, spaced card `–12/28`, unbroken card `-12/28`, unbroken card `–05/12/2026`, hyphenated card `-12/28`, `12/28-` unbroken card | 0% | 100% |
| spaced card `-1228` (no slash) | 0% | 0% |

False cards on 10,000 random hyphenated codes per shape: licence keys `dddd-dddd-dddd-dddd-dddd` and `ddddd-ddddd-ddddd-ddddd`, and `2026-09-27-` then 12 digits, 0% either way (no slash, so every hyphen still glues). Only 16 random digits followed by `-NN/NN` gain false cards (0.8% to 2.8%), which is the shape of a card and its expiry. No detection test string or fixture line changes.

### Evidence: a short group glued to a slash ends the run

With the `12` of `12/28` and the `05` of `05/12/2026` ending the run, a 17 to 19 digit card before an expiry or a slashed date reaches the run's end, so its whole window is taken. 2,000 random cards each: UnionPay 19 spaced 4 4 4 4 3 found whole before ` 12/28` 89.0% before the change and 100% after, before ` 05/12/2026` 89.2% and 100%; Discover 17 (4 4 4 4 1) 85.4% and 100%; Discover 18 (4 4 4 4 2) 86.5% and 100%; a spaced expiry ` 12 28` is unchanged (85% to 89%, the recorded limit); 16 digit cards 100% either way. No detection test string or fixture line changes.

### Evidence: what an overlap leaves

A real value after or before random digit groups, through all seven detectors with the amended card rule; the share of 10,000 cases where some digit of the real value has no row, under each overlap rule:

| Real value and layout | Drop whole | Keep pieces | Merge |
|---|---|---|---|
| spaced SSN after three random groups of four | 2.66% | 0% | 0% |
| spaced SSN before three random groups of four | 3.64% | 0% | 0% |
| spaced SSN after two random groups of five | 1.74% | 0% | 0% |
| dotted date after three random groups of four | 0.29% | 0% | 0% |
| UK number after three random groups of four | 12.21% | 9.81% | 9.81% |
| US number `212 555 0123` after three random groups of four | 40.53% | 39.69% | 39.69% |

Pieces and merging cover the same digits. What both leave on the phone rows is the phone detector's own choice (a valid window starting in the random groups and ending inside the number), present in today's code without any card: one random 4 digit group before `212 555 0123` leaves digits 36.2% of the time. That is a Follow-up in `index.md`, not part of this decision.

On every detection test string and fixture line (566 holding a digit), keeping pieces changes one result: `Call 020 7946 0958@example.com`, which now lists the phone piece `020 7946` beside the email. Merging changes no extent beyond that one, but rewrites the higher row there into the email `020 7946 0958@example.com`. Pieces won because the higher row is never touched: each piece has its own kind and tick, so unticking a false card cannot untick the rest of a real number, and no kind's own reading (the email's line join rule above all) is applied to another kind's characters. The cost is fragment rows, including a piece of a chance reading (`123 45 6789 1234` lists an unticked phone piece `1234`).

### Evidence: the final rule

The complete amended rule (group sizes with a free last group, parting hyphens, the short slash group ending the run, the clear end, pieces on overlap), 1,000 random valid cards per layout, six brands, spaced (unbroken were 0% everywhere):

| Layout | Card digits left | Neighbour digits taken into the card |
|---|---|---|
| card `12/28`, card `05/12/2026`, card `-12/28`, row number or lone `4` then card, card alone | 0% | 0% |
| card `03 28` / `1228` / `05.12.2026` / another card | 1.0% to 1.6% (17 to 19 digit cards only) | 0% |
| card then CVV | 2.6% | 6.1% (the CVV, when the two pass together) |
| card, next line spaced SSN | 1.1% | 0%, and 0% of the SSN's digits left |
| card, next line UK number | 2.0% | 0% (the phone's own choice leaves 11% to 13% of its digits; see the Follow-up) |
| 4 digit number then card | 2.5% | 3.0% |
| 6 digit number then card | 2.0% | 2.0% |

False cards on 10,000 random spaced numbers: 16 digits in fours 2.8%, 18 grouped 4 4 4 4 2 3.6%, 20 in fours 5.4%, 22 grouped 4 4 4 4 4 2 6.3%, 24 in fours 8.1%.

## Update of 2026-10-10: the review's silent misses

The fresh model review of feature 12 ([review](../../reviews/2026-10-10-feat-remaining-detectors.md)) found values dropped with no row and no warning, each confirmed with a scratch run. You asked for all three settled here, leaning on favour finding: an extra row is fine, a missed value is not. The phone detector's "digits before a number" follow up stays for its own run.

### Context

**A card that loses a group.** `cardsIn` took, from each start, the window reaching the run's end when its end was clear, else the shortest window that passed, and resumed after it. A 4 to 6 digit number before a spaced card can make a 16 digit window that passes by chance from the real card's first three groups: `2226 4111 1111 1111 1111` gave `card[2226 4111 1111 1111]`, and the real card's last `1111` stayed in the file beside a ticked row that looked complete. The update of 2026-10-08 recorded this as a limit (2.5%), and recorded a second one from the same choice: a 17 to 19 digit card with more digits after it keeps its last group when its first 16 also pass. The cross check then judged that every rule preferring a later start only moves the risk after the card; the review pointed out that a rule that does not choose between overlapping windows moves it nowhere.

**Two dates joined by a hyphen.** A date is never read out of a longer code: no letter or digit touches either end, nor a separator that touches one, which is what rejects `REF-05.12.1980`. In `01/05/1980-31/05/1980` the first date's end sees a hyphen then a digit, and the second date's start sees a digit then a hyphen, so both are cut and neither is listed. Employment histories, leave records, contracts and CVs write ranges that way. The same rule drops a written day range (`3–5 June 2026`, whose `5 June 2026` starts after a dash with a digit before it; `June 3–5, 2026` matches no form at all) and an ISO range (`2026-09-01/2026-09-30`).

**Values against the next character.** Every release 3 detector but the card and Social Security ones drops a value when a letter or digit touches its end. `2026-09-27T10:00:00Z` gave no date (a test pinned that on purpose), so a date of birth in a system export vanished. `GB82 WEST 1234 5698 7654 32A` gave no IBAN, nor did an IBAN with a superscript footnote marker after it, which NFKC reads as a digit. `AB123456CD` gave no National Insurance number.

### Options considered

For the card:

**Every window that passes, joined where they overlap (chosen).** From each start the longest window that passes; any window that passes and starts inside the row, when it reaches further, carries the row on.
- Pros: no card digit left without a row in any of seventeen layouts; closes both recorded limits; simpler than the clear end rule it replaces.
- Cons: a group after a card joins its row in 0.6% to 8.3% of layouts with digits after it, so a few neighbour digits go with the card.

**Join only the windows of later starts** (the review's suggestion as written).
- Pros: closes the number before a card with less over reach after it (a phone number's area code 3.3%, a Social Security number's first group 2.3%).
- Cons: leaves a 17 to 19 digit card's last group in 1.0% to 1.7% of layouts, the second recorded limit.

**Keep the clear end rule and the limit**, as built on 2026-10-08.
- Pros: a group after a card joins it only when it ends the run.
- Cons: a real card's group is left with no row in 1.0% to 4.0% of layouts, beside a ticked row that looks complete.

For two dates joined by a hyphen:

**A joiner parts two full dates (chosen).** A hyphen, dash or slash at a date's edge does not cut it when a full date lies beyond it.
- Pros: finds both dates in every joined form; changes no other result; a code still cuts, since what lies beyond its separator is a letter or digits that are not a full date.
- Cons: two rows for one range, which the visitor ticks one by one.

**Any hyphen beside digits parts.**
- Pros: one rule, no look beyond the joiner.
- Cons: lists `2026-09-27` out of `2026-09-27-01` and other dated codes, which the boundary rule exists to stop.

**One row for the whole range.**
- Pros: one tick removes the whole period.
- Cons: reads two values as one, couples their ticks, and needs a new shape where two rows already fit.

For the written day range: **one row holding both days (chosen)**, because the first day alone is not a full date; against listing `5 June 2026` alone, which leaves the first day beside a removed date and still finds nothing in `June 3–5, 2026`.

For the ISO time: **`T` or `t` and a digit after a year first date ends it cleanly (chosen)**, the date row alone; against any letter as a clean end, which reads dates out of codes like `05.12.1980a`.

For the IBAN: **a letter or digit may touch its end, never its start (chosen)**, since the length and the check already say where it ends; against leaving it, which drops a real IBAN for one glued character. Ticked as every IBAN is, because the check is what makes one certain.

For the National Insurance number:

**A letter touching its six digits lists it unticked (chosen).**
- Pros: a number glued to a word is listed; nothing unsure is removed by default.
- Cons: product codes shaped two letters, six digits, more letters list unticked rows (55% of random codes of that shape).

**A letter or a digit lists it unticked.**
- Pros: also finds one with a footnote marker after it.
- Cons: lists `on 05 12 1980` (the `on 05 12 19` reads as a spaced number), and every tracking number shaped `AB123456789GB` in 55% of cases.

**Leave it, or only say so in the coverage note.**
- Pros: no new rows.
- Cons: a real number glued to a word is dropped with no row, which is the miss being fixed; a note warns about every document to cover a rare layout.

### Rationale

Each choice is the one that leaves no measured value without a row while removing nothing unsure by default.

The card rule follows from INV-16. The cross check of 2026-10-08 rejected joining every passing window because the neighbour it reached into then lost its row; since the overlap step keeps each cut span's free stretches as pieces, that neighbour keeps the rest of its digits as its own row, ticked as it was. What remains of the cost is over reach: a few neighbour digits removed with a card, visible in the card row's text. Against a card group left in the file beside a row that looks complete, which is the "looks redacted but is not" case, that is the fail safe side. The review's narrower fix leaves the second limit standing for less than half the over reach, so it buys the smaller saving at the price of a known miss. The joined row also retires the clear end rule, so the card grammar loses a rule rather than gaining one.

The date rules keep the boundary rule's purpose, never reading a date out of a longer code, and narrow only where what lies beyond the separator is itself a full date or a time. Looking beyond the joiner is bounded (one date's forms, without that date's own end check), so the detector stays linear. Dates are unticked unless a birth word is near, so an extra row costs a glance; but none of these forms produced an extra row on any test string or fixture line.

The IBAN and National Insurance choices split on the checksum. An IBAN's length and mod 97 check make a glued end safe to read, at a 1 in 97 chance on codes that already look like an IBAN. A National Insurance number has no checksum, so a glued letter makes it uncertain, and an uncertain value is listed unticked, as phone numbers that are possible but not valid already are. A glued digit is left out because the measured cost is high and the layout rare: a footnote marker after a National Insurance number, against tracking numbers and spaced numbers after a two letter word. The start side stays strict for every kind because a value that starts inside a word is how one reads out of the end of a longer code, the case you asked to keep rejecting.

### Evidence: the card rules on random cards

Measured on 2026-10-10 through `detect` in a scratch copy of `src/detect` with each rule as a switch (a `jiti` script outside the repository, mulberry32 random numbers), 1,000 random valid cards per layout across six brands (Visa 16, Mastercard, American Express, Discover 16, Diners Club 14, UnionPay 19), each spaced as printed. *Left*: some card digit had no card row. *Taken*: a neighbour's digit went into a card row. *Neighbour left*: some digit of the phone or Social Security number had no row of any kind.

| Layout | Clear end, else shortest (2026-10-08) | Later starts joined | Every passing window joined (chosen) |
|---|---|---|---|
| card alone, card `12/28`, row number then card, UK number then card | left 0%, taken 0% | left 0%, taken 0% | left 0%, taken 0% |
| card `03 28` | left 1.0%, taken 0% | left 1.0%, taken 0.6% | left 0%, taken 0.6% |
| card `1228` | left 1.0%, taken 0% | left 1.0%, taken 5.9% | left 0%, taken 5.9% |
| card `05.12.2026` | left 1.0%, taken 0% | left 1.0%, taken 0.8% | left 0%, taken 0.8% |
| card then CVV | left 1.6%, taken 6.0% | left 1.6%, taken 6.7% | left 0%, taken 6.7% |
| two cards | left 1.5% | left 1.3% | left 0% |
| card, next line UK number | left 1.0%, taken 0%, neighbour left 9.9% | left 1.0%, taken 3.3%, neighbour left 9.8% | left 0%, taken 7.3%, neighbour left 9.8% |
| card, next line spaced SSN | left 1.7%, taken 0%, neighbour left 0% | left 1.7%, taken 2.3%, neighbour left 0% | left 0%, taken 8.3%, neighbour left 0% |
| card, next line 4 digit reference | left 1.5%, taken 1.9% | left 1.5%, taken 3.9% | left 0%, taken 3.9% |
| 4 digit number then card | left 1.8%, taken 2.2% | left 0%, taken 2.2% | left 0%, taken 2.2% |
| 5 digit number then card | left 1.3%, taken 1.6% | left 0%, taken 1.6% | left 0%, taken 1.6% |
| 6 digit number then card | left 1.6%, taken 1.6% | left 0%, taken 1.6% | left 0%, taken 1.6% |
| two 4 digit groups then card | left 4.0%, taken 4.4% | left 0%, taken 4.4% | left 0%, taken 4.4% |
| spaced SSN then card | left 2.6%, taken 3.0%, neighbour left 0% | left 0%, taken 3.0%, neighbour left 0% | left 0%, taken 3.0%, neighbour left 0% |

The UK number's *neighbour left* is the phone detector's own choice (a valid window starting in the card's last groups), the same under every card rule; it is the phone Follow-up in `index.md`. A 19 digit UnionPay card whose first 16 digits also pass, then ` 12 28`, 2,000 cards: found whole 0% under the 2026-10-08 rule, 2.0% with later starts joined, 100% with every passing window joined.

False cards on 10,000 random spaced numbers per shape are equally common under all three rules (16 digits in fours 2.6%, 18 grouped 4 4 4 4 2 3.4%, 20 in fours 5.2%, 24 in fours 7.5%, 32 in fours 12.5%, 48 in fours 21.2%, 30 in sixes 2.0%). Joining changes only their size: mean digits in a false card row 16.00 to 16.14 at 24 digits in fours, 16.75 to 17.16 at 48, 18.00 to 18.12 at 30 in sixes.

### Evidence: dates, IBANs and National Insurance numbers

The same scratch copy, before and after:

| Text | Before | After |
|---|---|---|
| `01/05/1980-31/05/1980`, `01/05/1980–31/05/1980` | nothing | both dates |
| `05.12.1980-10.12.1980` | nothing | both dates |
| `2026-09-01/2026-09-30`, `2026-09-01-2026-09-30` | nothing | both dates |
| `1 May 2026-31 May 2026` | nothing | both dates |
| `3–5 June 2026`, `3-5 June 2026`, `3rd–5th of June 2026` | nothing | one row, the whole date |
| `June 3–5, 2026`, `June 3-5 2026` | nothing | one row, the whole date |
| `2026-09-27T10:00:00Z`, `1980-05-12T00:00:00+01:00`, `2026-09-27t10:00` | nothing | the date alone |
| `REF-05.12.1980`, `REF-05.12.1980-06.12.1980`, `1/05/12/1980`, `05.12.1980a`, `05.12.1980T10:00`, `2026-09-27Tuesday`, `31-30 June 2026`, `1-32 May 2026` | nothing | nothing |
| `2026-09-27-01`, `05.12.1980.17` | no date (a phone row) | no date (the same phone row) |
| `GB82 WEST 1234 5698 7654 32A`, `GB82WEST12345698765432Bank`, `GB82 WEST 1234 5698 7654 32¹`, `GB82WEST123456987654321234` | nothing | the IBAN, ticked |
| `XGB82WEST12345698765432` | nothing | nothing |
| `AB123456CD`, `AB123456Cname`, `AB123456C7` | nothing | `AB123456C`, unticked |
| `AB 12 34 56 C7` | `AB 12 34 56`, ticked | the same |
| `AB123456Ename` | nothing | `AB123456`, unticked |
| `AB1234567`, `AB1234561`, `AB123456789GB` | nothing | nothing (the accepted miss) |
| `AB 12 34 56 CDate` | `AB 12 34 56`, ticked | the same |

False rows from the glued ends, 100,000 random codes per shape:

| Shape | Before | IBAN end may touch | NI letter glued | NI letter or digit glued |
|---|---|---|---|---|
| country code, 2 digits, 30 random capitals and digits | 0% | 1.02%, ticked | | |
| country code, 2 digits, 20 random digits, then `Bank` | 0% | 0.67%, ticked | | |
| 40 random capitals and digits | 0% | 0% | | |
| 2 letters, 6 digits, 2 letters (a product code) | 0% | | 55.1%, unticked | 55.1%, unticked |
| 2 letters, 6 digits, then `Ltd` | 0% | | 55.1%, unticked | 55.1%, unticked |
| 2 letters, 9 digits, `GB` (a tracking number) | 0% | | 0% | 55.2%, unticked |
| 2 letters, 7 digits | 0% | | 0% | 55.1%, unticked |
| 2 letters, 6 digits (already listed before, ticked) | 55.1% | | 55.1% | 55.1% |

On every detection test string and fixture line (837 holding a digit or a capital), the card rule, the joiner rule and the day range change nothing. The `T` rule changes one result (the pin `2026-09-27T10:00`), the IBAN rule two (`GB82WEST123456987654321`, `GB82WEST12345698765432X`) and the National Insurance rule two (`AB123456E`, `AB123456CX`). Allowing a glued digit as well would have changed four more, among them `on 05 12 1980 we`, which would list `on 05 12 19` as a National Insurance number. The card tests built from constants change in three places: a 19 digit card whose first 16 pass, before ` 12 28` and before `.5` or `/5`, is taken whole, and `4111 1111 1111 1111 003 1234` takes the CVV.

Linear time: on 100,000 characters of a hyphen joined chain of numeric dates, a slash joined chain of ISO dates, a hyphen joined chain of written dates, day ranges, `1-` repeated, ISO dates against `T`, spaced fours, cards end to end, glued IBANs and glued National Insurance numbers, the slowest read by `date`, `card`, `iban` or `uk-nino` took 62 ms of CPU time, against AC-16's 1 second.

### Cross check of the update

A read only pass on a second model (Sonnet 5.5) read the update against the code and probed today's `detect`. You took every recommended fix. Its points, and what became of each:

1. **A written date beside a dash is still dropped in a range across months.** `28 May-3 June 2026`, `5 June–3 July 2026` and `Dec 30-Jan 2, 2026` gave no row, because the first half has no year, so the joiner rule cannot part it. Fixed by applying the separator part of the cut to numeric dates only: a date with a month name is never a code. The options were that rule; a written range form for each pairing of months, which needs more patterns and finds nothing more; or recording the limit.
2. **The second date of an ISO interval with times is dropped.** In `2026-09-01T00:00:00/2026-09-30T23:59:59` the first date ends before its `T`, so nothing ends at the `/`. Fixed by taking a date's end past its time for the joiner rule only, the row staying the date alone.
3. **Two real cards side by side can share one row**, which the update had not measured: 6.8% of random pairs, and always for a card repeated end to end. Recorded under Consequences and pinned with `4242 4242 4242 4242` twice; nothing is left without a row.
4. **The new card fixture line reused `4111 1111 1111 1111`**, which the fixture's first line already holds, so the per target removal count and AC-7's search needle would both see two. The line now uses `2223 4000 0566 5566 5556`, a Visa test card new to the page.
5. **Builder details** the spec left open, now written into *Detectors*: which written forms take a day range, that the day order is not checked and the group does not capture, that the joiner is one character compared with the last listed date's end, what "year first" means for the `T`, how a glued National Insurance letter reads in each spaced and unspaced case, that the grouped IBAN still ends at its country's length, that the card's steps 1 to 4 are unchanged, and each new adversarial shape's text.
6. **Wording**: AC-28's expiry `12 28` can only lend its first group to a card; AC-21's footnote example now says how `¹` reads after NFKC; the date fixture's day range uses an ASCII hyphen, since the unit tests hold the dashes.
7. Not changed: a word glued before an IBAN or a National Insurance number (`IBANGB82WEST12345698765432` gives none) stays a recorded, unmeasured limit, for the reason in *Rationale* above.

Measured on the same scratch copy with both date fixes added:

| Text | Before | After |
|---|---|---|
| `28 May-3 June 2026`, `5 June–3 July 2026`, `Dec 30-Jan 2, 2026` | nothing | `3 June 2026`, `3 July 2026`, `Jan 2, 2026` |
| `REF-27 September 2026`, `27 September 2026-01` | nothing | `27 September 2026` |
| `x27 September 2026`, `27 September 2026AD`, `27 September 20261` | nothing | nothing |
| `2026-09-01T00:00:00/2026-09-30T23:59:59`, the same with `Z` on each, `2026-09-01T00:00:00+01:00/2026-09-30`, `2026-09-01T00:00-2026-09-30` | nothing | both dates, each alone |
| `REF-05.12.1980`, `1/05/12/1980`, `2026-09-27-01` | no date | no date |

Neither fix changes any of the 837 detection test strings and fixture lines beyond the results listed above. On 100,000 characters of written dates joined across months, ISO intervals end to end, times that never end and written dates after a code, the slowest `date` read took 78 ms.

## Update of 2026-10-10, second: the general date boundary rule

The second fresh model review ([review](../../reviews/2026-10-10-feat-remaining-detectors-second.md)) found more dates with no row, all silent misses and all in the family the first update set out to close. You asked for a general rule in place of a third round of forms: a full, real date is never dropped because of what follows it or what it is joined to, at worst listed unticked, with only the rejections that measurement shows are needed, and `TIME_LONGEST` raised to about 40. Favour finding: extra unticked rows are fine, missed values are not.

### Context

The first update kept the old boundary rule, any separator touching a letter or digit cuts a numeric date, and carved exceptions out of it one form at a time: a joiner to another full date, and a `T` time after an ISO date. Each exception was right and each left the next form outside it. The review's list: an interval whose dates carry a plain clock time (`27/09/2026 10:00-28/09/2026 11:00` lists the first date only, because the hyphen after `10:00` is not where the first date ended); an offset without a colon, an hour only offset, a space before `Z` or a zone name before the joiner (each a time the `T` reader did not read to its end); a date of birth followed by a hyphen and a name (`DOB 12/05/1980-Smith` gives no row, a hyphen touching a letter); a spaced month first range (`June 5 - 7, 2026` matches no form); and a day range before a numeric date (`5-7/6/2026`, a hyphen touching a digit). Each is a real date that the rule dropped for what stood beside it.

The rule's purpose was never to drop dates. It was to keep a date from being read out of a longer code (`REF-05.12.1980`, `2026-09-27-01`), and it did that by rejecting far more than those codes. The fix is to name the codes and reject only them.

### Options considered

**One general rule with two measured rejections (chosen).** A date that passes `isRealDate` is listed whatever follows it. It is dropped only for a letter glued to its start or before the separator before it (the reference code shape), or for its own separator running on with digits on either side (the longer number shape). Both rejections are lifted by a joiner with only a time between it and the last listed date, and by a birth word glued to the date.
- Pros: finds every case in the review and every case the rule's shape admits in future; the two rejections each have a measured reason; changes eight of 1,008 test and fixture strings, every one a real date now listed.
- Cons: dated codes of other shapes (`2026-09-27/01`, `2026-09-27-A1`, a date glued to a letter) and dates inside file names and URL paths list unticked rows; a hyphen dated or ISO date after a hyphen is still dropped when what stands between it and the last date is not a time.

**Add the review's forms one by one** (a plain `hh:mm` time, the three offset forms, a zone name, a word after a hyphen, spaces in the month first range, a short group before a slashed date).
- Pros: each is a small change with a narrow effect.
- Cons: the third round of the same work, with a fourth waiting in the next review; every form not yet named stays a silent miss, which is the failure this product exists to prevent.

**No rejection at all**: every real date listed, whatever stands on either side but a glued letter or digit.
- Pros: the simplest rule, nothing to measure.
- Cons: measured on random codes, lists 62% of version numbers (`1.2.3.4` holds the date `1.2.3`), 35% of French phone numbers (`01-02-03-04-05`), 9% of sort codes with a fourth group, 15% to 27% of serials of two digit groups, every `REF-` and `INV-` code and every dated file name; and takes `05/12/1980` out of `1/05/12/1980`.

For what may stand between two joined dates:

**Only a time, judged by its characters (chosen, after the cross check).** The joiner before a date lifts both rejections when the stretch from the last listed date's end to the joiner is empty or looks like a time: at most 40 code points, at least one digit, and nothing but digits, whitespace, `: . , + @`, hyphens and letters in runs of at most five.
- Pros: no grammar of times, so `@ 10:00`, `10h00`, `UTC+1`, `GMT+01:00`, `PM EST` and the next form are all covered; nothing is parsed, so nothing can swallow part of the next date; one bounded read, only at a start whose rejection would fire.
- Cons: a stretch with a six letter word (`10:00 Monday-`) or no digit (` ref INV-`) is not a time, so a hyphen dated or ISO date after it is still dropped; a short word with a digit beside it also counts as a time, so `01/05/1980 2 x-2026-09-28` would list the second date (a real date, so an extra row at worst).

**A grammar of times stepped over after each date** (this update's first draft): a glued `T` or a comma, a gap and an optional `at`; a run of digits and `: . ,`; then `Z`, an offset (`+01:00`, `+0100`, `+01`, hour at most 14) or one to five letters.
- Pros: reads only what a time is.
- Cons: the cross check showed it reads `-12` as an hour offset in `27-09-2026 10:00-12-10-2026`, so the joiner is no longer where the time ends and the second date is dropped, a silent miss of its own; and `@`, `10h00`, `UTC+1` and `PM EST` sat outside it, the fourth round of forms.

**The ISO `T` reader as built**, which the review showed loses the second date in every other form.

For the day range: **spaces in the month first form only (chosen, after the cross check)**, one row for `June 5 - 7, 2026`, where nothing but a day can stand between the month and the dash; day first, `3 - 5 June 2026` keeps listing `5 June 2026`. Against spaces in every form (the first draft), under which `Table 2 - 14 March 2026` and `Item 12 - 5 June 2026` list `2 - 14 March 2026` and `12 - 5 June 2026`, the heading's number removed with the date; and against the second day's date alone month first, which finds nothing in `June 5 - 7, 2026`.

For a birth word glued to its date (from the cross check): **listed and ticked (chosen)**. `DOB27/09/1980`, `DOB-12/05/1980`, `D.O.B.12.05.1980` and `Born-05.12.1980` gave no row, under the glued letter and letter before separator rejections, which were measured against `REF-`, `INV-` and file names only; a birth word is none of those, and a date of birth is the most sensitive date there is. Against dropping it, as before; and against listing it unticked, as a glued National Insurance letter is, which that rule needs only because the number has no checksum.

For the tick: **AC-10's rule unchanged, plus the glued birth word (chosen)**. A birth word before a date ticks it whatever is glued after it (`DOB 12/05/1980-Smith`, `DOB 12/05/1980Smith`), because the word is the signal and the date is real; against unticked whenever something is glued, which would leave the headline case, a date of birth, for the visitor to tick.

For `TIME_LONGEST`: **40 (chosen)**, now the longest stretch between two dates, past any real timestamp (nanoseconds is 18 characters) with room for a gap, a zone and a word; against no cap, which on `2026-09-27T1:2026.09.27T1:…` makes each start read the whole rest (quadratic, INV-7), and against remembering how far the last stretch was read, which is more state for a case no document writes.

### Rationale

The rule is general because the misses were general: each review named a form the exceptions had not reached, and no list of forms ends. The two rejections are kept because each has a measured cost without it, and each is the shape of a code rather than the shape of a date: a letter before the separator is how references are written, and the date's own separator running on is how a longer number of the same shape reads. Everything else beside a date is a word, a time, a different kind of number or a sentence, none of which makes the date less real; listing it costs a glance, and dropping it costs a date of birth. The cross check moved the time rule from a grammar to a character class for the same reason the boundary rule moved from forms to a general rule: a grammar is a list, the list had already missed four forms, and parsing an offset had found a way to be wrong rather than merely incomplete. Judging the stretch by its characters can only ever let a real date be listed, so its one failure mode is an extra unticked row.

### Evidence: the review's cases

Measured on 2026-10-10 through a scratch copy of `src/detect` with each rule as a switch (a `jiti` script outside the repository), before and after, through the `date` detector alone and through `detect`.

| Text | Before | After (`date`) | Through `detect` |
|---|---|---|---|
| `27/09/2026 10:00-28/09/2026 11:00`, `27.09.2026 10:00-28.09.2026 11:00`, `27/09/2026, 10:00-28/09/2026`, `27/09/2026 10-28/09/2026`, `27/09/2026 at 10-28/09/2026` | the first date | both dates | both dates |
| `2026-09-27 10:00-2026-09-28 11:00` | the first date | both dates | `2026-09-27`, then `phone[00-2026-09-28 11]`, unticked |
| `2026-09-27 10-2026-09-28`, `2026-09-27 at 10-2026-09-28`, `2026-09-27 @ 10:00-2026-09-28`, `2026-09-27 10h00-2026-09-28`, `2026-09-27 10:00-11:00-2026-09-28` | the first date | both dates | both dates |
| `27-09-2026 10:00-12-10-2026 11:00` (the cross check's case, which the first draft's offset reader dropped) | the first date | both dates | both dates |
| `2026-09-27T10:00:00+0100-2026-09-28`, `+01-`, ` Z-`, `EST-`, `,123456789012Z-`, `.12345678901234567890Z/` | the first date | both dates | both dates |
| `27 September 2026 10:00-2026-09-28`, `2026-09-27 10:00 pm-2026-09-28`, `2026-09-27 10:00 PM EST-2026-09-28`, `2026-09-27 10:00 UTC+1-2026-09-28`, `2026-09-27 10:00 GMT+01:00-2026-09-28` | the first date | both dates | both dates |
| `2026-09-27 10:00 Monday-2026-09-28`, `2026-09-27 ref INV-2026-09-28`, `01/05/1980 Smith-12/05/1980` | the first date | the first date | the first date |
| `DOB 12/05/1980-Smith`, `born 05.12.1980-London`, `DOB 12/05/1980Smith` | nothing | the date, ticked | the same |
| `DOB27/09/1980`, `DOB-12/05/1980`, `D.O.B.12.05.1980`, `Born-05.12.1980`, `DOB27 September 1980` | nothing | the date, ticked | the same |
| `Reborn27/09/1980` | nothing | nothing | nothing |
| `Mon 27/09/2026-Tue 28/09/2026` | `28/09/2026` | both dates | both dates |
| `June 5 - 7, 2026` | nothing | one row, the whole range | the same |
| `5 - 7 June 2026`, `3 - 5 June 2026`, `Table 2 - 14 March 2026`, `Item 12 - 5 June 2026` | the second day's date | the same (the first draft, spaces in every form, gave the whole: `2 - 14 March 2026`) | the same |
| `5-7/6/2026`, `DOB: 5-7/6/2026` | nothing | `7/6/2026`, unticked then ticked | the same |
| `Fig 3/4/05a` | nothing | `3/4/05`, unticked | the same |
| `Smith-12/05/1980`, `REF05.12.1980`, `REF-05.12.1980`, `INV/12/05/2026`, `example.com/2026/09/27/slug`, `1/05/12/1980`, `x27 September 2026`, `27 September 20261` | nothing | nothing | nothing |
| `2026-09-27-01`, `05.12.1980.17`, `05.12.1980-17` | no date | no date, no date, `05.12.1980` | a phone row each (the first ticked), as before |
| `05.12.1980a`, `05.12.1980T10:00`, `2026-09-27Tuesday`, `27 September 2026AD`, `2026-09-27/01`, `2026-09-27-A1` | nothing | the date, unticked | the same |
| `REF-05.12.1980-06.12.1980` | nothing | `06.12.1980` | the same |
| `2026-09-01.2026-09-30` | nothing | both dates | the same |
| `05.12.1980.10.12.1980` | nothing | nothing | nothing |
| `01/05/1980-31/02/1980`, `01/05/1980-31/05/1980x` | nothing, `01/05/1980` | `01/05/1980`; both dates | the same |

### Evidence: every detection test string and fixture line

Every double quoted and template string in `tests/unit/detect*.test.ts` (the adversarial file aside) and `scripts/lib/detection-fixtures.mjs` that holds a digit or a capital, 1,008 after deduplication, through `detect` before and after. Eight results change under the chosen rule:

| String | Before | After |
|---|---|---|
| `05.12.1980a`, `05.12.1980T10:00`, `2026-09-27Tuesday`, `27 September 2026AD` | nothing | the date, unticked |
| `2026-09-01.2026-09-30` | nothing | both dates |
| `Leave 01/05/1980-31/02/1980 approved` | nothing | `01/05/1980` |
| `REF-05.12.1980-06.12.1980` | nothing | `06.12.1980` |
| `01/05/1980-31/05/1980x` | `01/05/1980` | both dates |

With spaces allowed in the day first range too (the first draft), one more changes: `Course 3 - 5 June 2026 in Leeds` lists `3 - 5 June 2026`. Without the own separator rule, two more: `1/05/12/1980` lists `1/05/12` and `05.12.1980.10.12.1980` lists both dates. Without the letter before rule, two more: `REF-05.12.1980` and the fixture line `Meeting at 12:30 on Tuesday, ref INV-05.12.1980` each list `05.12.1980`. With a glued letter still cutting, only four change (the two joiner cases, the dotted ISO pair and the impossible far date). The birth word exemption changes no string in the corpus (the one it touched, `DOB` then 32 spaces then a date, is a template the extractor had collapsed).

### Evidence: random code shapes

2,000 random samples per shape (mulberry32), each as `Ref <code> here`, through the `date` detector. The figure is how many samples list any date row. Dates inside the shapes are real dates in 1900 to 2099.

| Shape | Before | Chosen | No own separator rule | No letter before rule |
|---|---|---|---|---|
| `YYYY-MM-DD-NN`, `YYYY-MM-DD-NNNN`, `DD.MM.YYYY.NN`, `NN/DD/MM/YYYY`, `NNN-YYYY-MM-DD` | 0% | 0% | 100% | 0% |
| `XXX-DD.MM.YYYY` (`REF-`), `report-DD-MM-YYYY-v2.pdf` | 0% | 0% | 0% | 100% |
| `XXXDD.MM.YYYY` | 0% | 0% | 0% | 0% |
| `YYYY-MM-DD/NN`, `DD.MM.YYYY-NN`, `DD/MM/YYYY-NNN`, `NN-DD/MM/YYYY`, `YYYY-MM-DD-XX`, `YYYY-MM-DD-XX-NN`, `YYYY-MM-DDX`, `DD/MM/YYYYXXX`, `report_YYYY-MM-DD.pdf`, `/YYYY/MM/DD/slug` | 0% | 100% | 100% | 100% |
| version `N.N.N.N` | 0% | 0% | 62.4% | 0% |
| French phone `0N-NN-NN-NN-NN` | 0% | 0% | 34.7% | 0% |
| serial of five two digit groups, hyphens; of eight; of six, dots | 0%, 0.6%, 0% | 0%, 0.6%, 0% | 15.5%, 27.4%, 19.4% | 0%, 0.6%, 0% |
| sort code with a fourth group `NN-NN-NN-NN` | 0% | 0% | 9.3% | 0% |
| serial `NNNN-NN-NN-NNNN`, `NN-NN-NNNN-NN`, `XX-NN-NN-NNNN`, licence key `NNNN-NNNN-NNNN-NNNN`, IP address, UK and US phone numbers with hyphens | 0% | 0% | 0% to 0.9% | 0% to 0.1% |
| ISO timestamp then a word, `DD/MM/YYYY hh:mm-DD/MM/YYYY hh:mm`, `YYYY-MM-DD hh:mm-YYYY-MM-DD` | 100% (the first date) | 100% (both dates) | 100% | 100% |
| numbered heading, a spaced dash, a written date (`Table 7 - 14 March 2026`) | 100% (the date alone) | 100% (the date alone; the first draft gave `7 - 14 March 2026`) | 100% | 100% |

The 0.6% on the eight group serial is the same before and after: its first three groups read as a date with a two digit year, and the joiner rule parts it when the next three do too.

### Evidence: linear time

100,000 characters per shape, every detector, CPU time, with the chosen rule. The slowest `date` read was 78 ms (dated codes `2026-09-27-01-` end to end, and hyphens between single digits); dates with clock times joined by hyphens 63 ms, ISO dates with clock times 47 ms, hyphen dated times 47 ms, basic offsets and zone names 62 and 47 ms, dates glued to letters 47 ms, dates joined to words 63 ms, birth words glued to dates 46 ms, spaced month first ranges 16 ms, day ranges before numeric dates 46 ms, times longer than `TIME_LONGEST` 47 ms, times that never end 31 ms, times then five letters 32 ms, a stretch of short words and digits before each joiner 46 ms, dates glued by commas 46 ms, times with a comma 31 ms. Every detector stayed within its budget on every shape (the slowest of all, every detector together, 219 ms).

### Cross check of the second update

A read only pass on a second model (Sonnet 5.5) read the update against the code, the tests and the review, and probed today's `detect`. Its points, and what became of each:

1. **The joiner exemption was written into the own separator rejection only**, so `EST-`, ` Z-` and `Z/` before a joiner (a letter before the separator) would still drop the second date. Fixed: both exemptions lift both start rejections, said in the Decision, the Detectors block and task 41.
2. **The offset reader swallowed the first group of a hyphen dated second date**: in `27-09-2026 10:00-12-10-2026 11:00` it read `-12` as an hour offset, so the joiner was no longer where the time ended, a silent miss of the first draft's own making. Fixed by dropping the grammar of times for the character class stretch above, which parses nothing; the case is in AC-19 and the scenario.
3. **AC-19 promised rows `detect` does not give** for `2026-09-27 10:00-2026-09-28 11:00` and `05.12.1980-17`, which the phone row covers. AC-19 now says its rows are the `date` detector's and names both end to end results; the phone Follow-up records the cross check's candidate fix (cut a phone unit before a hyphen when a year first date follows it).
4. **A birth word glued to its date was dropped** (`DOB-12/05/1980`, `D.O.B.12.05.1980`, `DOB27/09/1980`, `Born-05.12.1980`). Fixed: the birth word exemption, listed and ticked, in AC-10, AC-19, the Decision and the Detectors block; measured, it changes nothing else.
5. **Details of the time reader a builder would invent** (the gap after a glued `T`, `Z` against the letter rule, the offset alternatives' order, the sign's class, the letter class, the zone after a cut run, spaces per side of the dash, and `WRITTEN_LONGEST` growing by eleven rather than six). The reader is gone; the stretch rule has none of those choices, and the day range now says the spaces are counted per side and the growth is `2 * MAX_GAP`.
6. **Time forms outside the reader** (`@ 10:00`, `UTC+1`, `GMT+01:00`, `10h00`, `10:00 PM EST`). All inside the stretch rule, measured, and in AC-19.
7. **The spaced day first range swallows a heading number** (`Table 2 - 14 March 2026` would list `2 - 14 March 2026`). Fixed: spaces in the month first form only, the day first forms as before, recorded under Consequences with the measurement.
8. **INV-17's last sentence overclaimed**: forms with no pattern (`05-Jan-2026`, `27/Sep/2026`, `2026.09.27`, `20260927`, `27 Sep 26`, `15 March,2026`) are missed whatever the boundary rule says. INV-17 reworded, the forms recorded under Consequences, and a Follow-up added to bring them to `/architect`.
9. **No natural text corpus was measured**, and `example.com/2026/09/27/slug` and `INV/12/05/2026` are dropped (a letter before the slash) while the table's URL shape had nothing before it. Recorded under Consequences; `Fig 3/4/05a` lists `3/4/05`, pinned in the scenario.
10. **INV-7 holds, with one untested shape**: dates glued by commas (`1.1.00,`), where `,` is a time character. Added to task 43 and timed (46 ms).

Task checks: the renames task 42 had missed (the impossible far date and the cut far date tests, whose comments say the first date is cut) are in; the "still finds no date" block is renamed since it now lists dates beside codes; the Updated line no longer counts the bullets; the Consequences cost example now says what is between the time and the hyphen (a six letter word, or no digit). Measured on the same scratch copy with the three fixes added (the stretch rule, the birth word, month first spacing): the review's cases, the kept rejections, the 1,008 strings (eight change) and the random shapes give the results in the tables above, and the adversarial shapes the figures in *Evidence: linear time*.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md`: the engine wall, one PDF parser, folders by capability, logs carry counts only, nothing written to browser storage, every cap from `src/config`.
- Spec [0002](../0002-document-session-privacy-guarantee/index.md): `ReviewMatch`, INV-1, INV-2 and INV-9, the session reducer, AC-14's browser step.
- Spec [0003](../0003-design-system-ui-foundation/index.md): the checklist primitives, AC-9 and AC-10, the contrast contract, and the Follow-up giving feature 6 the label map.
- Spec [0004](../0004-redaction-engine/index.md) and its [rationale](../0004-redaction-engine/rationale.md): AC-27 to AC-29, `EXTRACTION_OPTIONS`, the replacement text measurements, the honest limits, and the Follow-ups for feature 6.
- `node_modules/mupdf/dist/mupdf.d.ts`, MuPDF.js 1.28.1: `DeviceFunctions` and `StructuredTextWalker`.
- `node_modules/mupdf/dist/mupdf.js`, MuPDF.js 1.28.1: `runSearch` (`max_hits = 500`) and the walker's `String.fromCharCode`.
- The measurements of 2026-09-27 above, run on the real engine and the published libphonenumber-js outside the repository.
- The update's measurements of 2026-09-27: `findNumbers` on side by side numbers and look alikes, its time on adversarial text, and the prototype of the new finder, all against the libphonenumber-js 1.13.14 in `node_modules`.
- `node_modules/libphonenumber-js/max/index.d.ts`: `parsePhoneNumberFromString` with its declared `extract` option, and `Metadata` with `numberingPlan.possibleLengths()` and `IDDPrefix()`.
- `tests/unit/detect-adversarial.test.ts` and `verify.md`: where `/develop` recorded the three owed decisions.
- `docs/.agent-cache/research/pattern-detection.md`: the research check of 2026-09-27 behind the links below.
- The update's measurements of 2026-10-08: the four kinds beside other digits through `detect` in `src/detect`, a prototype of each card window rule on random valid cards and random spaced numbers, a probe page read through `openDocumentWith` and `findMatches` in `src/engine` on the MuPDF.js 1.28.1 in `node_modules`, and, after the cross check, the parting hyphen, the short slash group and the three overlap rules on random layouts and on every detection test string and fixture line, all outside the repository.
- `tests/unit/detect.test.ts`'s "drops a lower kind's span whole … never trims it", the test that pinned the overlap rule this update replaces.
- The [review of 2026-10-10](../../reviews/2026-10-10-feat-remaining-detectors.md): its two majors and its first minor, which the update of 2026-10-10 settles.
- The update's measurements of 2026-10-10: each rule as a switch in a scratch copy of `src/detect` at commit `30f269c`, run through `detect` on random cards and layouts, random code shapes, every detection test string and fixture line, and 100,000 character adversarial blocks, all outside the repository.
- `src/detect/date.ts` (`cutFrom`, `numericAt`, `writtenAt`), `iban.ts`, `uk-nino.ts` and `card.ts` (`cardsIn`, `clearAfter`) at commit `30f269c`, and the tests that pinned the old behaviour: `detect-dates.test.ts`'s "a time joined to an ISO date", `detect-iban.test.ts`'s "one character too many, unbroken" and "a letter after", `detect-uk-nino.test.ts`'s "a suffix past D" and "a letter after", and `detect-card.test.ts`'s "choosing where a card ends".
- `src/detect/card.ts`, `iban.ts`, `us-ssn.ts` and `uk-nino.ts` as built by feature 12 (commit `686df40`), and `tests/unit/detect-card.test.ts`'s "never cut from a longer number" block.
- The [second review of 2026-10-10](../../reviews/2026-10-10-feat-remaining-detectors-second.md): its major and its first three minors, which the second update of 2026-10-10 settles.
- The second update's measurements of 2026-10-10: each boundary rule as a switch in a scratch copy of `src/detect` at commit `1a45d46`, run through `detect` on the review's cases, every detection test string and fixture line (1,008), random code shapes and 100,000 character adversarial blocks, all outside the repository.
- `src/detect/date.ts` (`cutFrom`, `numericStartsAt`, `timeEnd`, `TIME_LONGEST`) at commit `1a45d46`, and the tests that pinned the old behaviour in `tests/unit/detect-dates.test.ts`: "a letter after", "a letter after the year", "finds neither date where a dot stands between them", "finds no date where a joiner leads to an impossible one", "reads a range with spaces around its dash as the second day's date", "still finds no date read out of the code" and "parts at a joiner whose far date is then cut on its own".

**Practices & standards**:
- ISO 13616 IBAN, checked by ISO 7064 MOD 97-10.
- ISO/IEC 7812 issuer identification numbers and the Luhn check digit.
- The SSA's Social Security number randomization rules.
- HMRC's National Insurance number prefix and suffix rules.
- OWASP guidance on Regular expression Denial of Service.
- ITU-T E.164: an international number is at most 15 digits, country code included.
- Google libphonenumber's `PhoneNumberMatcher` (candidate pattern, inner match splits, extension patterns), which libphonenumber-js ports.
- The UK numbering plan: national numbers are written with the trunk prefix `0`.
- Unicode NFKC normalisation.
- Fail closed: a check that cannot finish counts against the match.
- ISO 8601 and RFC 3339: a date and a time joined by `T` (RFC 3339 also allows `t`), and an interval written with `/`.

**Links** (web verified in the research check of 2026-09-27):
- libphonenumber-js: https://github.com/catamphetamine/libphonenumber-js
- SWIFT, IBAN (International Bank Account Number) and the IBAN Registry: https://www.swift.com/standards/data-standards/iban-international-bank-account-number
- International Bank Account Number (structure and country lengths): https://en.wikipedia.org/wiki/International_Bank_Account_Number
- Payment card number (issuer prefixes, lengths, Luhn): https://en.wikipedia.org/wiki/Payment_card_number
- SSA, Social Security Number Randomization: https://www.ssa.gov/employer/randomizationfaqs.html
- HMRC National Insurance Manual, NIM39115: https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim39115 (the never allocated prefix list could not be read there; confirming it is a Follow-up)
- OWASP, Regular expression Denial of Service (ReDoS): https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
