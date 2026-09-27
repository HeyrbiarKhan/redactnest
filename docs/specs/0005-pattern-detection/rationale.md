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

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md`: the engine wall, one PDF parser, folders by capability, logs carry counts only, nothing written to browser storage, every cap from `src/config`.
- Spec [0002](../0002-document-session-privacy-guarantee/index.md): `ReviewMatch`, INV-1, INV-2 and INV-9, the session reducer, AC-14's browser step.
- Spec [0003](../0003-design-system-ui-foundation/index.md): the checklist primitives, AC-9 and AC-10, the contrast contract, and the Follow-up giving feature 6 the label map.
- Spec [0004](../0004-redaction-engine/index.md) and its [rationale](../0004-redaction-engine/rationale.md): AC-27 to AC-29, `EXTRACTION_OPTIONS`, the replacement text measurements, the honest limits, and the Follow-ups for feature 6.
- `node_modules/mupdf/dist/mupdf.d.ts`, MuPDF.js 1.28.1: `DeviceFunctions` and `StructuredTextWalker`.
- `node_modules/mupdf/dist/mupdf.js`, MuPDF.js 1.28.1: `runSearch` (`max_hits = 500`) and the walker's `String.fromCharCode`.
- The measurements of 2026-09-27 above, run on the real engine and the published libphonenumber-js outside the repository.
- `docs/.agent-cache/research/pattern-detection.md`: the research check of 2026-09-27 behind the links below.

**Practices & standards**:
- ISO 13616 IBAN, checked by ISO 7064 MOD 97-10.
- ISO/IEC 7812 issuer identification numbers and the Luhn check digit.
- The SSA's Social Security number randomization rules.
- HMRC's National Insurance number prefix and suffix rules.
- OWASP guidance on Regular expression Denial of Service.
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
