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
- `src/detect/card.ts`, `iban.ts`, `us-ssn.ts` and `uk-nino.ts` as built by feature 12 (commit `686df40`), and `tests/unit/detect-card.test.ts`'s "never cut from a longer number" block.

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

**Links** (web verified in the research check of 2026-09-27):
- libphonenumber-js: https://github.com/catamphetamine/libphonenumber-js
- SWIFT, IBAN (International Bank Account Number) and the IBAN Registry: https://www.swift.com/standards/data-standards/iban-international-bank-account-number
- International Bank Account Number (structure and country lengths): https://en.wikipedia.org/wiki/International_Bank_Account_Number
- Payment card number (issuer prefixes, lengths, Luhn): https://en.wikipedia.org/wiki/Payment_card_number
- SSA, Social Security Number Randomization: https://www.ssa.gov/employer/randomizationfaqs.html
- HMRC National Insurance Manual, NIM39115: https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim39115 (the never allocated prefix list could not be read there; confirming it is a Follow-up)
- OWASP, Regular expression Denial of Service (ReDoS): https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
