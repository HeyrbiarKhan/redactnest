# 0005. Pattern detection

**Date**: 2026-09-27
**Status**: Proposed

## Summary

RedactNest finds sensitive values in a document with small rule based detectors (a pattern for each kind plus its own check, such as the Luhn checksum for card numbers), run inside the worker on the same prepared page the engine redacts. Each find becomes one row in a checklist on `/tool`, with the text around it, so the visitor can judge it and decide what to remove. A row the engine could not remove safely is still shown, but it cannot be ticked and says why. Release 1 builds email addresses and phone numbers; this spec defines all seven kinds, so release 3 (feature 12) builds the other five straight from it.

## Amends specs 0002, 0003 and 0004

- **Spec 0002.** `ReviewMatch` gains one field, `blocked`, and the session reducer refuses to tick a blocked match. `DetectorKind`'s members are decided here, as 0002 asked. `LoggablePayload` gains `DetectionCounts`.
- **Spec 0003.** Feature 6, not feature 8, first places `Checkbox`, `ChecklistGroup`, `ChecklistItem` and `EmptyState` on `/tool`, as a thin checklist, and extends `design-system.spec.ts` to the review state. `Checkbox` gains `disabled` and `ChecklistItem` gains `blockedReason`. Feature 8 still owns the final layout, select all and the summary panel. The kind to label, icon and noun map is owned here, as 0003 asked.
- **Spec 0004.** The three checks inside `validateTargets` are split into predicates that answer per target, so detection and redaction ask the same questions and cannot disagree (INV-3). `validateTargets` keeps its behaviour and its order of kinds. `walkCharacters` in `src/engine/characters.ts` becomes the one character reader for detection too, and learns to repair code points above U+FFFF, which MuPDF.js 1.28.1's walker cuts to 16 bits (AC-26); for every other character the record, the check and validation see exactly what they saw before. Its Follow-ups addressed to feature 6 (`kind` and `text` on every target, both extraction modes, marking slanted and image matches) are met by this spec.

## Requirements

**User stories**:
- As a visitor reviewing a document, I want every email address and phone number it contains listed with the text around it, so I can decide what to remove without reading every page again.
- As a visitor, I want nothing removed unless its box is ticked, and to see and change every tick before I press Redact.
- As a visitor, I want to be told when something was found but cannot be removed safely, so I never believe a value is gone when it is still in the file.
- As a visitor, I want to know what RedactNest looked for, so a short list does not read as a complete redaction.

**Acceptance criteria** (release 1, feature 6):

- **AC-1**: On every page with a text layer, detection finds each email address in the common form (rules under *Detectors*), in any script. Text after a `mailto:` prefix is found without the prefix, and a sentence's closing full stop is not part of the match. Each is one match of type `email`, ticked by default.
- **AC-2**: Detection finds each phone number that libphonenumber-js, with its `max` metadata, finds as at least possible (the right length for its region) under `PHONE_REGIONS`, written internationally (a `+` or `00` and a country code) or in UK or US national format. A candidate joined to a longer run of letters and digits (the `2026-000123` inside `INV-2026-000123`) is not a match. Dates, postcodes and ZIP codes are not matched. Each is one match of type `phone`, ticked by default only under AC-10's phone rule.
- **AC-3**: Every occurrence is its own match, even when the same value repeats. `findMatches` returns matches by page, then in reading order. The checklist groups them by kind in `DETECTOR_KINDS` order and keeps that order inside each group. Where two kinds' spans overlap, only the higher kind in `PRECEDENCE` is kept, so no character on a page belongs to two matches.
- **AC-4**: Lines in the same text block join with one space, so a value that wraps onto the next line of its block is found, with one quad per line. A line that ends right after `@` or `.` is also tried joined to the next with no space, and that join is kept only when the joined text passes the email rules and does not swallow an email the unjoined text already holds. No match crosses from one text block to another. Other wraps (a break mid word, a hyphenated break) are not found, which is a recorded limit.
- **AC-5**: Each match carries `before` and `after`: up to `contextChars` code points either side, from its own page's text in reading order, NFKC normalised (so a ligature reads as its letters), with runs of whitespace collapsed to one space. `contextChars` of 0 gives empty strings. Context never comes from another page.
- **AC-6**: Every match that is not blocked has a worker private target whose `kind` is the match's `type` and whose `text` is the match's raw extracted characters (spec 0004's contract, which refuses a target without them), and that target passes spec 0004's target validation (its AC-27 to AC-29) on its own and together with every other unblocked match in the document. Ticking any set of unblocked matches and pressing Redact never fails with `unsupported`, `slanted-text`, or the `redaction-overreach` of 0004's AC-29, and the ticked text is absent from the output. The self check can still refuse a run for the causes 0004 records as honest limits, which no review time check can see (listed under *Consequences*).
- **AC-7**: On left to right text, a match's quads equal the quads MuPDF's `page.search()` returns for the same text at the same place, corner by corner, within `POSITION_TOLERANCE`. On text whose extraction order runs against its visual order, a match's target passes validation and redacts (AC-6).
- **AC-8**: A match the engine would refuse is listed, and blocked with the first reason that applies, checked in this order: `unsound-outline` (a quad or its padded area is unsound, or the characters inside its quads do not read as its text, which is 0004's AC-27), `replacement-text` (AC-9), `slanted-text` (any quad `isTooSlanted`), `image-overreach` (an image under it alone would be blanked past `BOUNDS_REACH_RATIO`). A blocked match has no target, starts unticked, and cannot be ticked, and a `redact` naming its id fails with `unsupported`.
- **AC-9**: Detection reads every page in both `EXTRACTION_OPTIONS` modes. A match found in ordinary mode is blocked `replacement-text` when the characters whose centres lie inside its quads, in extraction order, NFKC normalised and with whitespace removed, spell a different string with replacement text ignored than in ordinary mode. A match found only with replacement text ignored (glyphs drawn behind unrelated replacement text) is listed, blocked `replacement-text`. No match is ever skipped because it touches replacement text: it is listed, blocked or not. A match inside a replacement span that is wider than the match, and whose string equals its glyphs, cannot be told apart through MuPDF.js 1.28.1 (measured: both modes give the same characters, origins, quads, font and size as for a span wrapping exactly the match, which redacts cleanly), so it is listed unblocked and stays with the engine's refusal (recorded limit).
- **AC-10**: `email` starts ticked; so do `card`, `iban`, `us-ssn` and `uk-nino` in release 3. A `phone` starts ticked only when it is valid (`isValid()`) and written like a phone number: with a `+` or `00` country prefix, with a space, hyphen, dot or parentheses inside it, or after a phone word (`phone`, `tel`, `telephone`, `mobile`, `mob`, `cell`, `fax`, `call`, any case, a whole word) that ends within `KEYWORD_REACH` characters before it in the same block. A plausible number that is not valid, and a valid number written as bare digits with no phone word before it (the order number `12345678901`), start unticked. A `date` starts unticked unless a birth word ends within `KEYWORD_REACH` characters before it in the same block. A blocked match always starts unticked.
- **AC-11**: Detection runs inside `open`, after `inspecting`, and reports the `detecting` phase. It reads one page at a time, and after each of a page's three reads (ordinary mode, replacement text ignored, the image pass) it yields a macrotask and checks for a cancel, so a cancel or a replacement open is noticed within one read. A cancelled open posts nothing and keeps nothing.
- **AC-12**: A page that reported a text layer and throws while detection reads it fails the open with `unsupported`. A page without a text layer is not read by detection at all.
- **AC-13**: While reviewing, redacting and complete, `/tool` shows one `ChecklistGroup` per kind that has at least one match (icon, label, and a count with its noun), and one `ChecklistItem` per match, in AC-3's order, with its checkbox bound to the session's tick set. Toggling a row dispatches `tick-toggled`. Every checkbox is disabled while a run is under way. A blocked row shows a disabled checkbox and its reason line, and the reason joins the row's accessible description. The checklist sits outside the polite live region. The review state is keyboard reachable with visible focus, and passes axe in a real browser, forced colours included (WCAG 2.2 AA).
- **AC-14**: An info callout always sits above the checklist, naming what was looked for (built from `DETECTOR_KINDS`) and saying that anything else, such as names and addresses, stays in the file. With no matches at all, an `EmptyState` says nothing was found and that Redact still makes a cleaned copy.
- **AC-15**: No network request, browser store or log carries a match's text, its context or anything a detector produced. `src/detect` has no console, network or storage call. The only document strings that cross the boundary are `text`, `before` and `after` (0002, INV-1). `DetectionCounts` (counts by kind and by blocked reason, nothing else) is a `LoggablePayload`, held by the type gate in `tests/unit/loggable.test.ts`.
- **AC-16**: Every detector runs in time linear in its input. A 100,000 character adversarial block for each detector (long runs of name characters with no `@`, digit runs with separators, repeated partial dates) finishes within 1 second in the unit project. No pattern nests a quantifier inside another, or repeats alternatives that can match the same text. This bounds the detectors' own time on a string; the time MuPDF takes to read a page is measured in Follow-up, not bounded here.
- **AC-17**: Only `src/detect` imports `libphonenumber-js`, and only `src/engine` imports `@/detect`, enforced by lint in every zone, `import()` and `typeof import` included. So the library ships in the worker's chunk and never in a page's.
- **AC-18**: This feature closes every browser step other specs left marked **(after feature 6)**, and `/check verify` for feature 6 runs each one and ticks it in its own `verify.md`:
  - spec 0002: with a tick changed, choosing a second file asks first, and accepting replaces the session while declining keeps it (its AC-1); with a tick changed, closing the tab brings the browser's leave warning (its AC-13); from `complete`, changing one tick, running again and downloading a second time without the file picker gives a file that matches the new ticks (its AC-14);
  - spec 0004: a ticked match leaves a box no wider than the match and no taller than its line, and pasting the page's text shows the match gone and its neighbours present (its AC-4, AC-6); in single spaced text, the lines above and below read exactly as before (its AC-4, AC-6); on a real OCRmyPDF scan, a ticked match with descenders leaves no ink around or below its box (its AC-5, AC-13); two ticks, then one unticked and run again, shows the unticked match in plain text (its AC-11); on a scan fed about a degree crooked, a name redacts and a long line is shown blocked `slanted-text` during review (its AC-28, AC-29);
  - spec 0003's review vocabulary checks, which waited for the checklist primitives to be placed on a page: Enter and Space on a group summary close and open it, a long unbroken email wraps inside its row, the checkbox falls back to the native control in forced colours, a screen reader reads a row as the match then "Page N" and the context line, and a compact count badge reads as "2 items".
- **AC-25**: Detection never calls MuPDF's `search()`. It walks every character of every page, so the 500 quad cap in MuPDF.js 1.28.1's search (`max_hits` in `runSearch`, which drops the rest without saying so) can never drop a match. A page holding 600 email addresses gives 600 matches. Wherever a test compares against `search()` (AC-7, the `findTargets` helper), it fails when `search()` returns 500 quads, since that answer may be cut short.
- **AC-26**: No character is lost or changed between the page and a match. Detection reads characters through the same reader as target validation, the character record and the self check (`walkCharacters`). That reader returns every code point whole, including letters above U+FFFF, which MuPDF.js 1.28.1's walker cuts to their low 16 bits (measured: U+1D400 comes back as U+D400, a different letter, and U+1D800 as U+D800, a lone surrogate; U+20BB7 and U+2D800 follow the same arithmetic, to U+0BB7 and U+D800). An email whose local part holds U+20BB7 (𠮷, a character used in Japanese names) and U+2D800 is found with those letters in its `text`, redacts, and passes the self check. Every pattern uses the `u` flag and steps by code point, never by UTF-16 unit.

**Acceptance criteria** (release 3, built by feature 12 against this spec):

- **AC-19**: `date` finds a full date (day, month and year together) in the forms under *Detectors*, and nothing shorter. It follows AC-10's tick rule.
- **AC-20**: `card` finds 13 to 19 digits that pass Luhn and start with a real issuer prefix at a length that issuer uses.
- **AC-21**: `iban` finds an IBAN whose country code, length and ISO 13616 check (mod 97 equals 1) are all right.
- **AC-22**: `us-ssn` finds a separated Social Security number that the SSA could issue, and a bare nine digit one only near an SSN word.
- **AC-23**: `uk-nino` finds a National Insurance number under HMRC's prefix rules, with the suffix optional.
- **AC-24**: Each new kind joins `DETECTOR_KINDS`, `PRECEDENCE`, the detector registry, `DETECTOR_LABELS` and the coverage note, and a kind missing from any of them fails `pnpm typecheck`.

## Decision

**Chosen option**: Option 1: rule based detectors in a pure `src/detect` folder, with libphonenumber-js for phone numbers, called by one find step in the engine.

Detection is a set of pure functions from text to spans, one per kind with its own validator, living in a new capability folder with no MuPDF in it. A new engine step reads each prepared page's characters in both extraction modes, hands each text block to the detectors, turns every span into quads with the same geometry `page.search()` gives, and blocks any match the engine's own target validation would refuse.

Decided within it (the runner up in brackets):

- **libphonenumber-js 1.13.14 with `max` metadata**, imported as `libphonenumber-js/max`. Candidates come from `findNumbers(text, { defaultCountry, v2: true, leniency: "POSSIBLE" })`, because `findPhoneNumbersInText` returns valid numbers only and would hide the plausible ones AC-10 lists unticked (measured: `(212) 123 4567` is possible but not valid, and only the `POSSIBLE` finder returns it). `leniency` works but is missing from the package's types, so the detector passes it through a small declared options type, never `any`, and a test pins that a possible only number still comes back, so an upgrade that drops the option fails a test. Validity then comes from `isValid()`, which checks digits only with `max` metadata. The worker already carries the MuPDF WebAssembly binary, so the 157 KB of `max` metadata (measured, before compression) costs little (basis: libphonenumber-js's README on `min` and `max`). (`min` metadata, 84 KB, whose `isValid()` checks length only.)
- **Validity alone does not tick a phone number.** Under the US region, bare digit runs such as the order number `12345678901` and the tail of `INV-2026-000123` are valid numbers (measured). So a candidate joined to a longer run of letters and digits is dropped, and a valid number is ticked only when it is written like one (AC-10). Everything else found is listed unticked, never hidden. (Ticking every valid number, which removes order numbers by default.)
- **Two default regions**, `PHONE_REGIONS = ["GB", "US"]`, each run over every block, with the results merged. International numbers are found under either.
- **Scanners, not one big pattern, where a pattern could backtrack.** Email is found by scanning outward from each `@` over the characters a local part and a domain may hold, then checking the result, which is linear by construction (basis: OWASP, Regular expression Denial of Service). (One regular expression over the block, which is where email patterns classically blow up.)
- **One character reader, repaired.** Detection reads through `walkCharacters`, extended to report block and line boundaries and each line's `direction`, so detection, target validation, the record and the self check can never disagree about what a character is (basis: spec 0004, INV-12). MuPDF.js 1.28.1 builds each walked character with `String.fromCharCode`, which keeps a code point's low 16 bits only, while `asText()` and `asJSON()` return whole code points (measured). So for each read whose `asText()` holds a code point above U+FFFF, the reader takes each text line's `text` from `asJSON()` and puts its code points in place of the walked characters, one for one. When a line's code point count differs from its walked characters, or a walked character is not its code point's low 16 bits, the read fails closed: `unsupported` in detection and validation, `redaction-incomplete` in the self check (spec 0004's rule for a check that cannot finish). A page with no such code point skips the JSON, so the common case costs one `asText()`. (Reading through `asJSON()` on every page, which works too and costs a serialisation per read; or leaving the walker as it is, which turns 𠮷 into a Tamil letter in the checklist.)
- **Per character NFKC with an index map.** Each character is normalised on its own, and the page string keeps, for every position, the character it came from. Detection sees `ﬁ` as `fi` and a fullwidth `＠` as `@`; the target keeps the raw characters, because that is what 0004's AC-27 compares (basis: Unicode NFKC normalisation; spec 0004, AC-27). (Matching raw text, which misses a name set with a ligature.)
- **Quads built from characters, along the line's direction.** For each line a match touches, measure how far each of the match's characters sits along that line's `direction` (the one MuPDF gives at `beginLine`), by its quad's centre. The character furthest back gives the line quad's upper left and lower left corners (its own), and the one furthest forward gives the upper right and lower right. On left to right text that is the first character's left corners and the last character's right corners, which is how `page.search()` builds its own (AC-7 proves it; basis: spec 0004's geometry, designed and measured on `page.search()` quads); on text drawn against its extraction order it still covers the match. (Asking `stext.search()` for the match text and picking the hit by position, which breaks when search and the walk disagree about a character.)
- **Detection per text block, context per page.** A match can never join two columns or two table cells; its context can.
- **`PRECEDENCE`**: `email`, `iban`, `card`, `us-ssn`, `uk-nino`, `phone`, `date`. A kind with a checksum or a unique marker outranks a looser digit shape. (Longest span wins, which lets a long date string swallow a phone number.)
- **A blocked match gets no target.** The worker's existing check (an id with no target is `unsupported`) then refuses it with no new code path (basis: fail closed; spec 0004, INV-6). (A target flagged blocked, which every reader of the map must remember to check.)
- **One shared set of predicates** in `src/engine/targets.ts`, used by detection and by `validateTargets` alike (INV-3; basis: spec 0004, AC-27 to AC-29, and its Follow-ups for feature 6). (Detection writing its own copies of the checks, which drift.)
- **Ids from `crypto.randomUUID()`**, minted in the worker, so an id from a finished session can never name a match in a new one. (A counter per session.)
- **The checklist is its own component**, `src/app/tool/review-checklist.tsx`, rendered by `tool-client` only, outside the live region. Labels, icons, nouns, reason copy and `detectionCounts` live in `src/lib/detectors.ts`, typed as records over `DetectorKind` and `BlockedReason`.
- **The email rejoin is narrower than a plain join** (AC-4): a join after `.` that would swallow an email the unjoined text already holds is dropped, so "Call Bob." at a line's end followed by "smith@example.com" never becomes `Bob.smith@example.com`. The cost is a local part wrapped at a dot (`john.` then `smith@example.com`), which lists as `smith@example.com`.

No community skill shaped this design.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing is stored):

Crosses the boundary, in `src/worker/protocol.ts`:

| Shape | Fields | Change |
|---|---|---|
| `DETECTOR_KINDS` / `DetectorKind` | release 1: `email`, `phone`. Release 3 adds `date`, `card`, `iban`, `us-ssn`, `uk-nino`. The array's order is the group order | grows; a union only grows |
| `BLOCKED_REASONS` / `BlockedReason` | `unsound-outline`, `replacement-text`, `slanted-text`, `image-overreach` | new, closed, frozen `as const` |
| `ReviewMatch` | `id: MatchId` · `type: DetectorKind` · `page: number` (one based) · `text` · `before` · `after` · `tickedByDefault: boolean` (false whenever blocked) · **`blocked: BlockedReason \| null`** | gains `blocked` |
| `DetectionCounts` | `foundByType: Readonly<Partial<Record<DetectorKind, number>>>` · `blockedByReason: Readonly<Partial<Record<BlockedReason, number>>>` | new; joins `LoggablePayload` |

Stays in the worker, in `src/engine/types.ts`:

| Shape | Fields | Change |
|---|---|---|
| `RedactionTarget` | `page` (zero based) · `quads` (one per line) · `start`, `end` (offsets into the ordinary mode page string, end exclusive; not read by the engine yet, kept for feature 13) · `kind` · `text` (the raw characters, a line join as one space) | exists; feature 6 fills it |
| `FoundMatch` | `page` (zero based) · `kind` · `text` · `before` · `after` · `tickedByDefault`, and either `{ blocked: null, target: RedactionTarget }` or `{ blocked: BlockedReason, target: null }` | new; a union, so a blocked match cannot carry a target |
| `TargetMap` | `MatchId` to `RedactionTarget`, unblocked matches only | exists |

Pure, never crosses, in `src/detect`:

| Shape | Fields |
|---|---|
| `DetectInput` | `text: string` (one block, lines joined by one space) · `joins: readonly number[]` (the index of each synthetic join space) |
| `Span` | `kind` · `start` · `end` (offsets into `text`, end exclusive) · `tickedByDefault` |

Relationships: a page has many matches; each match has zero or one target (zero exactly when blocked); each `Span` becomes one match. Rules: no two matches in one mode share a character (AC-3); a match found only with replacement text ignored is dropped when any of its characters' centres lies inside an ordinary mode match's quads, so one place on the page is one row.

**State transitions**: spec 0002's session machine is unchanged. Two guards join it: `tick-toggled` on a blocked match returns the session unchanged, and `seededTicks` leaves out every blocked match, whatever its `tickedByDefault` says. Detection adds one phase inside `opening`: `loading-engine`, `opening`, `inspecting`, `detecting`, then `result`.

**The find step** (`src/engine/find.ts`, called as `OpenDocument.findMatches`), per page with a text layer:

1. Read the prepared review page in ordinary mode (`EXTRACTION_OPTIONS[0]`) through `walkCharacters`, with its code point repair (AC-26), and build its page text: each text block's characters in order, NFKC normalised one at a time, lines inside a block joined by one synthetic space (none added when either side is already whitespace), blocks joined by one synthetic space, with an index from every position back to its character (or to nothing, for a synthetic space). Image blocks are skipped.
2. Run `detect` on each block, and resolve overlaps across the page by `PRECEDENCE`.
3. Map each span to its characters, group them by line, and build one quad per line (AC-7). Take `text` for display from the page text, and the target's `text` from the raw code points.
4. Read the page again through `walkCharacters` with replacement text ignored (`EXTRACTION_OPTIONS[1]`), detect the same way, and keep only the matches that no ordinary mode match covers (AC-9).
5. Check every match in AC-8's order, with the shared predicates, and block the first that fails. The image check walks the page's images once and answers for every match at once.
6. Cut `before` and `after` from the page text (AC-5).
7. After each of the three reads (steps 1, 4 and 5), yield a macrotask and stop with `RunCancelled` if `isCancelled()` says so. Both structured texts and the page are destroyed in a `finally` on every path, a cancel included.

Nothing in the find step calls `search()`, so no hit cap applies (AC-25).

**Detectors** (`src/detect`, one file per kind, each a pure `(input: DetectInput) => readonly Span[]`, registered in `DETECTORS: Readonly<Record<DetectorKind, Detector>>`):

- **`email`** (release 1). Scan out from each `@`. Local part: 1 to 64 letters (`\p{L}`), marks (`\p{M}`), digits (`\p{N}`) and `. _ % + -`, not starting or ending with `.`, no `..`. Domain: two or more labels of letters, marks, digits and inner hyphens, separated by single dots, the last label two or more letters, 253 characters at most. Boundaries: no local part character right before it, and no domain character, or `.` followed by one, right after it. So `mailto:a@b.com` gives `a@b.com`, and "write to a@b.com." ends before the stop. Rejoin (AC-4): for each join whose previous character is `@` or `.`, scan again with that one join space treated as invisible (skipped as if absent, never deleted from the string), and keep an email that runs across it, when no email already found overlaps it. Its `start` and `end` index the original block text, and the span contains the join space; the match's display text and its target's `text` leave that one space out. It has two quads.
- **`phone`** (release 1). `findNumbers(text, { defaultCountry, v2: true, leniency: "POSSIBLE" })` from `libphonenumber-js/max` for each region in `PHONE_REGIONS`. A result is dropped when the character before it is a letter or digit, or is a hyphen, dot or slash that itself follows a letter or digit, and likewise after it, so no candidate is cut from a longer code. Each kept result is ticked by default when `number.isValid()` and it is written like a phone number (AC-10), and unticked otherwise. Identical spans from two regions count once, ticked if either region ticks it; of two overlapping spans, the longer is kept, then the one from the region earlier in `PHONE_REGIONS` (GB before US). An extension the library includes stays in the match.
- **`date`** (release 3). A day, month and year together, in one of these forms: day, month and year as numbers with the same separator (`/`, `-` or `.`) twice, where the year has 4 digits or 2, accepted when either a day first or a month first reading is a real calendar date; year first ISO (`2026-09-27`, `2026/09/27`); written forms with English month names, full or three letter (plus `Sept`), an optional full stop after an abbreviation, an optional ordinal (`1st`, `2nd`, `3rd`, `27th`), an optional `of`, and an optional comma (`27 September 2026`, `27th of Sept. 2026`, `September 27, 2026`, `Sep 27 2026`). Four digit years run 1900 to 2099. Never a year alone, a month and year, a time, or a relative date. Ticked by default only when `date of birth`, `birth date`, `birthdate`, `DOB`, `D.O.B` or `born` (any case, a whole word) ends within `KEYWORD_REACH` characters before the date's start, in its block.
- **`card`** (release 3). 13 to 19 digits, unbroken or split by single spaces or single hyphens (one kind of separator throughout), with no digit, or separator then digit, touching either end. Must pass Luhn and match a prefix and length in `CARD_BRANDS`: Visa `4` (13, 16, 19), Mastercard `51` to `55` and `2221` to `2720` (16), American Express `34`, `37` (15), Discover `6011`, `644` to `649`, `65` (16 to 19), JCB `3528` to `3589` (16 to 19), Diners Club `300` to `305`, `36`, `38`, `39` (14 to 19), UnionPay `62` (16 to 19).
- **`iban`** (release 3). Two capital letters naming a country in `IBAN_LENGTHS`, two check digits, then capital letters and digits, unbroken or in groups of four split by single spaces (the last group may be shorter), with the country's exact length once spaces are dropped. Moving the first four characters to the end, turning each letter into two digits (A is 10) and taking the remainder by 97, digit by digit, must give 1. `IBAN_LENGTHS` is written from the SWIFT IBAN Registry, and a test pins a sample (GB 22, DE 22, FR 27, NL 18, ES 24, IT 27, IE 22).
- **`us-ssn`** (release 3). Three, two and four digits split by one hyphen or one space, the same both times. The area is never `000`, `666` or `900` to `999`, the group never `00`, the serial never `0000`. A bare run of nine digits under the same rules counts only when `SSN`, `SS#`, `SS No` or `Social Security` (any case, a whole word) ends within `KEYWORD_REACH` characters before it, in its block. No digit touches either end.
- **`uk-nino`** (release 3). Two letters, six digits, then an optional suffix `A` to `D`, in any case, with optional single spaces between the letters and digits, between the digit pairs, and before the suffix (`QQ 12 34 56 C`, `qq123456c`, `QQ123456`). The first letter is never D, F, I, Q, U or V; the second never D, F, I, O, Q, U or V; the pair never BG, GB, KN, NK, NT, TN or ZZ. No letter or digit touches either end.

Constants in `src/detect`, each commented as a rule about a pattern, not a cap on the visitor, like the engine's geometry constants: `PHONE_REGIONS`, `PRECEDENCE`, `KEYWORD_REACH` (32 characters), the phone, birth and SSN word lists, `CARD_BRANDS`, `IBAN_LENGTHS`, and the NI prefix rules.

**API surface** (messages and module functions; there is no HTTP endpoint):

| Surface | Kind | Key inputs | Key outputs | Access | Key errors |
|---|---|---|---|---|---|
| `open` (exists) | worker message | `bytes` (transferred), `limits`, `contextChars` | `progress` (`loading-engine`, `opening`, `inspecting`, `detecting`), then `result { summary, matches }` | the tool page, anonymous | the existing kinds, plus `unsupported` when a page with text cannot be read (AC-12); a cancel posts nothing |
| `redact` (exists) | worker message | `matchIds` | `redacted` | the tool page | `unsupported` for an unknown id, a blocked one included (it has no target) |
| `OpenDocument.findMatches` | engine, async | `{ contextChars: number, isCancelled?: () => boolean }` | `readonly FoundMatch[]` in AC-3's order | the worker only | throws `EngineFailure("unsupported")` (AC-12), `RunCancelled` |
| `walkCharacters(page, options, visit)` | `src/engine/characters.ts`, grows | a loaded page, one extraction option | each character with its code point (whole, AC-26), origin, quad and angle, plus block and line boundaries and the line's `direction` | the engine | throws `EngineFailure` when a repair cannot line up (`unsupported`, or `redaction-incomplete` from the self check) |
| `detect` | `@/detect`, pure | `DetectInput` | `readonly Span[]`, sorted by `start`, overlaps resolved | `src/engine` only | none; bad input finds nothing |
| `unsoundTargets(page, targets)`, `slantedTargets(targets)`, `imageReachVerdicts(page, targets)` | `src/engine/targets.ts`, `pixels.ts` | a loaded page, targets | one boolean per target | the engine | none; a MuPDF throw inside becomes `unsupported`, as in `validateTargets` |
| `detectionCounts(matches)` | `src/lib/detectors.ts`, pure | `readonly ReviewMatch[]` | `DetectionCounts` | the main thread | none |
| `Checkbox` | `src/ui`, grows | `disabled?: boolean` | a native disabled checkbox | callers | none |
| `ChecklistItem` | `src/ui`, grows | `blockedReason?: string` | a disabled row with a reason line in its description | callers | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| open | `matches[].id` | minted per match in the worker with `crypto.randomUUID()` |
| open | `matches[].type`, target `kind` | the `Span.kind` from `@/detect` |
| open | `matches[].page` | the page index the find step read, plus one, in the worker |
| open | `matches[].text` | the NFKC page text between the span's offsets, a line join as one space (none at a rejoined email join) |
| open | `matches[].before`, `.after` | the NFKC page text either side of the span, whitespace collapsed, capped at `contextChars` code points; `contextChars` comes from the `open` request, which takes `config.matchContextChars` |
| open | `matches[].tickedByDefault` | the detector's rule (AC-10); false when blocked |
| open | `matches[].blocked` | the find step's checks, in AC-8's order, through the shared predicates |
| open | target `page`, `quads` | the page index; the match's characters grouped by line, the back character's left corners and the front character's right corners along the line's `direction` |
| open | target `start`, `end` | the span's offsets in the ordinary mode page text |
| open | target `text` | the raw code points of the match's characters in ordinary mode, a line join as one space (left out at a rejoined email join) |
| open | phone regions, precedence, keyword reach, word lists, brand table, IBAN lengths, NI rules | constants in `src/detect`, values from this spec |
| review | group icon, label, noun | `DETECTOR_LABELS` in `src/lib/detectors.ts`: email `Mail`, "Email addresses", email address(es); phone `Phone`, "Phone numbers", phone number(s); date `Calendar`, "Dates", date(s); card `CreditCard`, "Card numbers", card number(s); iban `Landmark`, "Bank account numbers (IBAN)", IBAN(s); us-ssn `IdCard`, "US Social Security numbers", Social Security number(s); uk-nino `IdCard`, "UK National Insurance numbers", National Insurance number(s) |
| review | group count | derived: the matches of that kind |
| review | row checked | `session.ticked` (spec 0002) |
| review | row disabled | `match.blocked !== null`, or `session.state === "redacting"` |
| review | blocked reason line | `BLOCKED_REASON_TEXT` in `src/lib/detectors.ts` (copy under *Checklist copy*) |
| review | coverage note's and empty state's list | `DETECTOR_KINDS`, mapped through `DETECTOR_LABELS` to plural nouns, joined by `Intl.ListFormat("en")`: `conjunction` ("and") for the note, `disjunction` ("or") for the empty state |
| review | `detecting` phase text | the existing `PHASE_TEXT.detecting` in `tool-client.tsx` |
| redact | the targets | the worker's `targets` map, from the ticked ids (spec 0004, INV-6) |
| feature 11 | `DetectionCounts` | `detectionCounts(session.matches)` |

**Checklist copy** (plain, feature 8 may restyle it):

- Coverage note (info callout): "RedactNest looked for {nouns}. Anything else, such as names and addresses, stays in the file.", with `{nouns}` joined by `Intl.ListFormat("en", { type: "conjunction" })`. Release 1 renders: "RedactNest looked for email addresses and phone numbers. Anything else, such as names and addresses, stays in the file."
- Empty state: title "Nothing found to remove"; helper "RedactNest found no {nouns}. Redact still makes a cleaned copy, with metadata and hidden content removed.", with `{nouns}` joined by `Intl.ListFormat("en", { type: "disjunction" })`. Release 1 renders: "RedactNest found no email addresses or phone numbers. Redact still makes a cleaned copy, with metadata and hidden content removed."
- `unsound-outline`: "RedactNest cannot outline this text precisely enough to remove it, so it will stay in the file."
- `replacement-text`: "Hidden replacement text covers this, so it cannot be removed safely and will stay in the file."
- `slanted-text`: "This is set at too steep an angle to remove safely, so it will stay in the file."
- `image-overreach`: "Removing this would blank too much of the image under it, so it will stay in the file."

**Key invariants**:

- **INV-1**: Detection reads only the prepared review copy, through `EXTRACTION_OPTIONS`, never `CHECK_EXTRACTION_OPTIONS`, so the visitor reviews what the page shows (spec 0004, INV-9).
- **INV-2**: A match has a target exactly when it is not blocked. A blocked match cannot be ticked (the reducer) and cannot be redacted (no target, so `unsupported`).
- **INV-3**: Detection and `validateTargets` answer through the same predicates. An unblocked match passes target validation alone and with any other unblocked matches, because each check is decided per target.
- **INV-4**: Quads, offsets and page geometry never cross the boundary (spec 0002, INV-2). `FoundMatch` is an engine type, and the worker strips it to a `ReviewMatch`.
- **INV-5**: Document text inside the find step and `src/detect` is never logged, stored or sent. `src/detect` imports nothing that touches the page, the network or storage, and has no console.
- **INV-6**: `before` and `after` are at most `contextChars` code points each (spec 0002, INV-9).
- **INV-7**: Every detector is pure and linear time (AC-16).
- **INV-8**: `libphonenumber-js` is imported only by `src/detect`, and `@/detect` only by `src/engine` (AC-17).
- **INV-9**: Every `DetectorKind` has a detector, a place in `PRECEDENCE`, a label, an icon, a noun and a tick rule, as typed records, so a new kind cannot ship half done (AC-24).
- **INV-10**: Detection fails closed: a readable page it cannot read fails the open (AC-12), and a check that cannot finish blocks rather than passes (every predicate is written so `NaN` or a throw counts against the match).
- **INV-11**: Detection finds matches by walking characters, never through `search()`, so no hit cap can drop one (AC-25). Lint holds it (below).
- **INV-12**: One character reader serves detection, validation, the record and the self check, and it returns whole code points (AC-26). Nothing downstream of it indexes text by UTF-16 unit.

**Security model**: an anonymous visitor, one tab, no account and no server call; detection is the same for the free and paid tiers. Everything detection finds is personal data (email, phone, dates of birth, card, bank, SSN and NI numbers, which GDPR, PCI DSS and US state privacy law all care about), and none of it leaves the device, so RedactNest processes none of it. Match text and context live on the main thread for the life of the session only (spec 0002, INV-1 and INV-3). Every document string is rendered as React text, which escapes it (spec 0003, INV-7). A crafted document can make detection slow only in the visitor's own tab, and AC-16 bounds that.

**Configuration required**: no new environment variables. `NEXT_PUBLIC_MATCH_CONTEXT_CHARS` (spec 0002) sets the context window. `libphonenumber-js` joins `dependencies`.

**Lint zones** (`eslint.config.mjs`, each built with `zone()`):

- New `redactnest/detect` for `src/detect/**`: bans `mupdf`, `@/engine`, `@/ui`, `@/lib`, `@/config`, `react`, `next` and every `@/worker` import except `import type` from `@/worker/protocol` (`allowTypeImports`); adds `no-console`.
- Every other zone gains a ban on `@/detect` except `redactnest/engine-wall-engine`, and a ban on `libphonenumber-js` except `redactnest/detect`, each also as `import()` and `typeof import`. `tests/unit/engine-wall.test.ts` proves both, as it proves the engine wall.
- `redactnest/engine-wall-engine` and `redactnest/detect` add a `no-restricted-syntax` ban on any call to a member named `search` (`CallExpression[callee.property.name="search"]`), passed through `zone()` so the storage bans stay. Nothing in `src/` calls it today; tests stay outside the zones, because AC-7 compares against it.

**Critical test scenarios**:

- Happy path: a fixture with emails and phone numbers opens, the checklist lists every one with page and context, the visitor unticks one, runs Redact, and the output holds none of the ticked values and still holds the unticked one. Verifies **AC-1**, **AC-2**, **AC-5**, **AC-6**, **AC-13**.
- Every row removable: for each fixture in `detect-*.pdf`, every unblocked match's target has `kind` equal to its `type` and `text` equal to its raw characters, and every blocked match has none; redact with every unblocked match ticked, then with each alone; no run fails with `unsupported`, `slanted-text` or `redaction-overreach`. Verifies **AC-6**, **INV-2**, **INV-3**.
- Same geometry: each match's quads equal `page.search()`'s for a unique needle, and the comparison fails if `search()` returned 500 quads. Verifies **AC-7**, **AC-25**.
- No hit cap: a page holding 600 email addresses gives 600 matches, all of which redact. Verifies **AC-25**.
- Whole code points: an email whose local part holds 𠮷 (U+20BB7) and U+2D800, written through a ToUnicode map, is found with both letters in its `text`, redacts, and passes the self check; a pin records that MuPDF.js's own walker still returns U+0BB7 and U+D800 for them, so an upgrade that fixes it is noticed and the repair can go. Verifies **AC-26**.
- Wraps: a phone number and an email wrapped across lines are each found with two quads; "Bob." at a line's end followed by "smith@example.com" lists `smith@example.com` only; a value split between two blocks is not joined. Verifies **AC-4**.
- Phone confidence: `020 7946 0958` and `+44 20 7946 0958` are found ticked; `(212) 123 4567` (possible, not valid) is found unticked; the bare order number `12345678901` is found unticked, and ticked once `Tel:` precedes it; `INV-2026-000123`, dates, UK postcodes and ZIP codes give no `phone` match; a pin checks that `findNumbers` with `leniency: "POSSIBLE"` still returns `(212) 123 4567`. Verifies **AC-2**, **AC-10**.
- Blocked: an email set at 30 degrees, an email over a coarse image drawn at an angle, an email whose replacement text differs, and email glyphs behind unrelated replacement text are each listed blocked with the right reason, with no target, unticked, not tickable, and a hand made `redact` naming one is `unsupported`. Verifies **AC-8**, **AC-9**, **INV-2**.
- The honest limit: an email inside wider replacement text with equal glyphs is listed unblocked, and ticking it fails the run with `replacement-text`, pinned so a MuPDF.js upgrade that exposes replacement spans is noticed. Verifies **AC-9**.
- Failure case: a page that throws during detection fails the open with `unsupported`; a cancel during detection of a 50 page document posts nothing and closes the document within one read. Verifies **AC-11**, **AC-12**.
- Privacy: the instrumented browser run from spec 0002 runs a detected redaction and finds no match text or context in any request, store or log. Verifies **AC-15**.
- Adversarial input: each detector on 100,000 characters finishes within 1 second. Verifies **AC-16**.
- Permission: a lint fixture importing `libphonenumber-js` from `src/lib`, or `@/detect` from the worker, fails. Verifies **AC-17**.
- The waiting verify steps: `/check verify` for feature 6 runs every step listed in AC-18 and ticks it in specs 0002, 0003 and 0004's `verify.md`. Verifies **AC-18**.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest usable whole: a visitor drops a PDF, sees its email addresses, ticks, redacts and downloads, which is already a real tool. It is safe on its own, because the engine's validation and self check still refuse anything unsafe; what slice 1 lacks is only the kindness of saying so before Redact. Slice 2 adds phone numbers, which completes release 1's promise. Slice 3 stops a visitor ever ticking a row the engine would refuse. Slice 4 closes the wrap and robustness edges. Feature 12's tasks follow, against the same code.

**Slice 1: an email found, shown and removed**

1. Grow `src/worker/protocol.ts`: `BLOCKED_REASONS` and `BlockedReason`, `blocked` on `ReviewMatch`, `DetectionCounts` in `LoggablePayload`, and the type gate in `tests/unit/loggable.test.ts`. Types only. Satisfies **AC-8**, **AC-15**.
2. Create `src/detect`: `DetectInput`, `Span`, the registry typed over `DetectorKind`, `PRECEDENCE` with its overlap resolution, and the email scanner without the rejoin; the `redactnest/detect` zone and the `@/detect` bans; unit tests from the rules above. Satisfies **AC-1**, **AC-3**, **AC-17**, **INV-9**.
3. Grow `walkCharacters`: block and line boundaries, the line's `direction`, and the code point repair from `asJSON()` with its fail closed rule; the character record, the self check and target validation keep passing their existing tests untouched. Add the `search` ban to the engine and detect zones. Satisfies **AC-25**, **AC-26**, **INV-11**, **INV-12**. Then add `src/engine/find.ts` and `OpenDocument.findMatches` on that reader: the page text with its index map, per block detection, quads per line along the line's direction, raw target text, context, one page at a time with a yield and a cancel check after each read, `unsupported` when a page with text throws; blocked set only by the AC-27 predicate for now. Export `FoundMatch`. Satisfies **AC-3**, **AC-4** (plain joins), **AC-5**, **AC-7**, **AC-11**, **AC-12**.
4. Wire the worker: report `detecting`, call `findMatches`, mint ids, fill `targets` with unblocked matches, post `matches`, and treat `RunCancelled` as a cancel. Extend `tests/unit/engine-worker.test.ts`. Satisfies **AC-6**, **AC-11**, **INV-2**.
5. Session guards: `tick-toggled` ignores a blocked match, `seededTicks` leaves blocked matches out; exhaustive reducer tests. Satisfies **AC-8**, **AC-10**.
6. `src/lib/detectors.ts` (labels, icons, nouns, reason copy, `detectionCounts`) and `src/app/tool/review-checklist.tsx`: groups, rows, the coverage callout, the empty state, disabled while redacting, outside the live region, rendered by `tool-client`. Add `disabled` to `Checkbox` with its component and axe tests. Satisfies **AC-13**, **AC-14**, **AC-15**.
7. Fixtures through `scripts/make-fixture.mjs`: `detect-email.pdf` (emails in running text, repeated, in any script, after `mailto:`, before a full stop, set with an `fi` ligature, one per column of a two column page, and a line whose glyphs are drawn right to left one positioned glyph at a time, so extraction order runs against visual order, since the fonts in `scripts/fonts/` carry no right to left script). Engine tests: every email found, quads against `page.search()` on the left to right lines, every unblocked match redacts alone and together, the reversed line included. Also `detect-many.pdf` (one page of 600 email addresses) and `detect-unicode.pdf` (an email whose local part holds U+20BB7 and U+2D800, drawn through a ToUnicode map, since no committed font carries them), and the 500 quad guard in `tests/support/targets.ts` and in the AC-7 comparison. Satisfies **AC-1**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-25**, **AC-26**.
8. Browser: extend `privacy.spec.ts` to a detected redaction, `design-system.spec.ts` to the review state (axe, keyboard, forced colours), and add the retick and rerun run, the second file confirm with a tick changed, and the leave warning with a tick changed. Every step AC-18 lists is then reachable; `/check verify` for feature 6 runs the rest (the OCRmyPDF scans among them) and ticks them all in their specs' `verify.md`. Satisfies **AC-13**, **AC-15**, **AC-18**.

**Slice 2: phone numbers**

9. Add `libphonenumber-js` 1.13.14, the `phone` detector (`max` metadata, `findNumbers` with `leniency: "POSSIBLE"` through a declared options type, `PHONE_REGIONS`, the token boundary rule, `isValid()` plus the written like a phone rule for the tick, the phone words, merge rules), `phone` in `DETECTOR_KINDS` and `PRECEDENCE`, its label, and the `libphonenumber-js` ban in every other zone. Satisfies **AC-2**, **AC-10**, **AC-17**, **INV-8**.
10. `detect-phone.pdf`: UK and US national numbers, international numbers, a number wrapped across two lines, an extension, a possible but not valid number, a bare valid digit run with and without `Tel:` before it, and the look alikes (an invoice code, dates, postcodes, ZIP codes). Unit and engine tests, including every unblocked match redacting, the tick of each, and the pin on the `POSSIBLE` leniency. Satisfies **AC-2**, **AC-4**, **AC-6**, **AC-10**.

**Slice 3: nothing the engine would refuse can be ticked**

11. Split `validateTargets` into `unsoundTargets`, `slantedTargets` and `imageReachVerdicts` (one image walk per page answering for every target), with `validateTargets` composed from them and its kinds and order unchanged; the existing redaction tests must pass untouched. Satisfies **AC-8**, **INV-3**.
12. The find step's full checks: the second mode, the replacement text comparison, the matches found only with replacement text ignored, the overlap rule between modes, and all four reasons in AC-8's order. Satisfies **AC-8**, **AC-9**, **INV-10**.
13. `blockedReason` on `ChecklistItem` (the disabled row and its reason in the description), component and axe tests, and the reason copy in the checklist. Satisfies **AC-8**, **AC-13**.
14. `detect-blocked.pdf`: an email at 30 degrees, an email over a coarse image drawn at an angle, an email whose replacement text differs, email glyphs behind unrelated replacement text, and an email inside wider replacement text with equal glyphs (the pinned limit). Satisfies **AC-8**, **AC-9**.

**Slice 4: wraps and hardening**

15. The email rejoin at joins after `@` or `.`, with the rule that it never swallows an email already found; wrap tests, the two block test and the "Bob." test. Satisfies **AC-4**.
16. The adversarial input test for each detector, and a note beside each pattern on why it cannot backtrack. Satisfies **AC-16**, **INV-7**.
17. Cancel during detection: a worker test, and the browser cancel test on the 50 page document built in `cancel.spec.ts`. Satisfies **AC-11**.

**Feature 12 (release 3), against this spec**

18. `date`, with the birth word tick rule, and its fixture of forms and near misses. Satisfies **AC-19**, **AC-10**.
19. `card` with `CARD_BRANDS` and Luhn, and its fixture (valid test numbers per brand, Luhn failures, wrong prefixes, grouped and unbroken). Satisfies **AC-20**.
20. `iban` with `IBAN_LENGTHS` and mod 97, and its fixture. Satisfies **AC-21**.
21. `us-ssn` with the SSA rules and the keyword rule, and its fixture. Satisfies **AC-22**.
22. `uk-nino` with HMRC's rules, and its fixture. Satisfies **AC-23**.
23. Each kind added to `DETECTOR_KINDS`, `PRECEDENCE`, `DETECTOR_LABELS` and the coverage note, with the precedence tests across all seven, the adversarial tests for the new detectors, and every unblocked match redacting. Satisfies **AC-6**, **AC-16**, **AC-24**.

## Consequences

**Positive**:
- Release 1 is a usable tool the day slice 1 lands, and every later kind is a detector, a fixture and a label.
- A row that can be ticked is a row the engine will accept, because both ask the same predicates. The session loss spec 0004 warned about is gone for slant, images and visible replacement text.
- `src/detect` is pure and has no MuPDF, so its tests are fast string tests, and the engine grows by one step, not a second job.
- A visitor is told both what was found and what was not looked for.

**Negative / tradeoffs**:
- Rule based detection misses whatever does not look like its pattern: a phone number written in words, a national number from a region outside `PHONE_REGIONS`, a date with a non English month, and names and addresses entirely. The coverage note says so; nothing else can.
- Some runs can still fail after a clean review, for causes spec 0004 records and no check before removal can see: a size or scaling change inside a text object next to a match, a combining mark drawn at zero width, a file that shows lines with the `'` or `"` operators (which fails every run on that file), a text watermark crossing a match, and replacement text wider than a match whose string equals its glyphs (MuPDF.js 1.28.1 reports no replacement spans, and both extraction modes read such a match exactly as they read one that redacts cleanly, measured). Each ends in `failed`, never a leak.
- One row per occurrence makes a long list on a document with a repeated footer; feature 8's select all per group is the relief.
- A value wrapped mid word or at a hyphen is missed, and an email wrapped at a dot in its local part lists only the part after the break.
- The worker's chunk grows by libphonenumber-js and its `max` metadata, 157 KB of metadata before compression (measured on 1.13.14), fetched once and cached.
- The phone group carries more unticked rows: plausible numbers that are not valid, and valid numbers written as bare digits. Nothing is hidden and nothing unsure is removed by default, at the cost of a longer list to scan.
- `leniency` is an option the package's types leave out, so a libphonenumber-js upgrade could drop it quietly; the pin in slice 2 is what notices.
- A page holding a code point above U+FFFF costs one `asJSON()` per read on top of the walk, and a line where MuPDF's two views of the text disagree refuses the open or the run rather than guessing.
- Every page is read three more times at open (two structured texts and one image walk), so opening costs more on a 50 page document; measured in Follow-up, not guessed.
- On text whose extraction order runs against its visual order, quads are proved by redacting cleanly (AC-6), not against `page.search()`, and the fixture only simulates it, because the repository has no right to left font.

**Neutral**:
- `validateTargets` is reorganised without changing what it refuses; the existing redaction tests are the proof.
- Feature 18's third party notices gain libphonenumber-js: MIT for the package, with Google's metadata under Apache 2.0 (`LICENSE.Apache` in the package), both compatible with AGPL 3.0.
- `DetectorKind` grows by five in release 3; every reader handles a union that only grows.

## Follow-up

- [ ] Measure at the paid cap: open time with detection on a dense 50 page document, the slowest single read (which sets how quickly a cancel is noticed, AC-11), and how many matches a staff directory or call log produces, then decide whether the checklist needs virtual scrolling or a cap. Record the numbers in `rationale.md`.
- [ ] Ask upstream (with 0004's MuPDF report) for replacement text spans in MuPDF.js, as device metatext callbacks or a structured text flag. With them, AC-9's limit closes and the pinned test in slice 3 will say so.
- [ ] Report upstream that MuPDF.js 1.28.1's structured text walker builds each character with `String.fromCharCode` where `String.fromCodePoint` is needed (line 1150 of `dist/mupdf.js`), which cuts code points above U+FFFF. Once a release fixes it, the AC-26 pin fails and the repair in `walkCharacters` can go.
- [ ] Decide whether to close AC-9's limit with a trial removal at open: one working copy with every unblocked match ticked, checked for surviving replacement text, and any match it names blocked before review. It would catch replacement text wider than a match, and some of the other self check causes, at the cost of roughly one redaction run added to every open, and it cannot prove every smaller tick set. Bring it to `/architect` if the counts below, or your own judgement, say it is worth it.
- [ ] Feature 8's result screen says how many found items stayed in the file: at `complete`, derived on the main thread from `session.matches` and `session.ticked` as the matches not ticked, split into unticked and blocked, by kind, and by blocked reason. It must not come from `RedactionOutcome`, whose `removedByType` counts only what was removed. A pure helper beside `detectionCounts` in `src/lib/detectors.ts` gives the numbers, and they are counts only, so feature 11 may log them.
- [ ] Count `replacement-text` refusals after a clean review in feature 11's numbers. If they are common, bring back to `/architect` the option of a refused run returning to `reviewing` with that match blocked, which needs the engine to name the target.
- [ ] Confirm HMRC's list of never allocated NI prefixes (BG, GB, KN, NK, NT, TN, ZZ) against its National Insurance manual when feature 12 builds `uk-nino`; the research check could not read it.
- [ ] Add libphonenumber-js 1.13.14 to feature 18's third party notices, with both its MIT and its Apache 2.0 licence texts.
- [ ] Record for root `AGENTS.md` (owned by `/sync`): the `src/detect` folder and its lint zone, the "only `src/detect` imports `libphonenumber-js`" and "only `src/engine` imports `@/detect`" rules, the detector constants as rules rather than caps, and, under `## Agent skills`, libphonenumber-js on the `Declined:` line (Agent Skill and MCP discovery was declined for it on 2026-09-27).
- [ ] When built, tick spec 0004's Follow-ups addressed to feature 6, and update spec 0003's Follow-up that has feature 8 placing the checklist primitives.
- [ ] Feature 8 owns the final wording of the coverage note, the empty state and the reason lines, and select all per group (spec 0003 says where it may go).
