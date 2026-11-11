# 0017. Custom terms

**Date**: 2026-11-11
**Status**: Proposed

## Summary

A Pro visitor types names, reference numbers or phrases while reviewing a document, and RedactNest finds every place each one appears, across line, block and page breaks, and lists them in the checklist ready to remove. A whole, exact match is ticked; a match that is joined to other text, written with different spacing, punctuation or vowel marks, or split across a page break is listed unticked with a note, so a name written two ways is never half found in silence. The list stays for the tab (in memory only, never saved or sent), is searched in each new document in the same pass as detection, and every term is always said to be found, not found, or not searched and why. Matching is our own pure code beside the detectors, and removal is the engine's existing path, so nothing about how text is removed or checked changes.

## Amends specs 0002, 0003, 0004, 0005, 0007, 0011, 0012, 0013 and 0016

Applied in place by the build (task 21).

| Spec | Section | Change |
|---|---|---|
| 0002 | INV-1 | Term rows are match text like any other row. Typed terms are the visitor's own words, held in page memory and in the worker for the tab, under INV-3 (never stored) and INV-4 (never logged) |
| 0003 | Primitives | `src/ui` gains `TextField` and `Chip` (task 7), presentation only (INV-7), with component and axe tests |
| 0004 | `RedactionTarget`, `RedactionResult` | `kind` becomes `MatchKind`; a target gains `term`; a run also reports `removedByTerm`, counted after the self check like `removedByType` |
| 0005 | *The find step* | Beside the per block text the detectors read, the find step builds one whole page text for the terms (*Matching rules*), recording its line and block breaks; term spans take the same path through `candidate`, the checks and the replacement text pass, where a term's hidden row yields only to an ordinary row of the same term (AC-9); a term match may run on into the next readable page (AC-33) |
| 0005 | INV-5 | Document text in the find step lives for one page's read, plus AC-33's carried tail: at most the longest searched term's length in characters that are not separators, from the end of the page before, dropped once the next page is matched (INV-12) |
| 0005 | `RedactionTarget` `start`, `end` | "kept for feature 13" becomes "not read by the engine; term spans carry page level offsets, which feature 13 does not need either" |
| 0005 | AC-14 | The coverage note names the custom terms when this job searched any (AC-16); `lookedFor` and the detectors it names are unchanged |
| 0007 | AC-11, AC-12, INV-2 | The result card adds each term's Removed and Left in the file counts and the set aside terms (AC-22); `countRemoved` counts every `MatchKind`, so a run that removed only term rows is never named cleaned (AC-21) |
| 0007 | INV-3, INV-4 | A refusal or result line about a term may carry the term as the visitor typed it, their own words and never the document's; per term counts come from `removedByTerm` |
| 0011 | Claims C3, C14 | As AC-25 says, with an entry in `src/lib/policy-changes.ts` |
| 0012 | INV-8 | Pricing's Pro card names custom terms, since Pro does it now (AC-26) |
| 0013 | AC-19 | The Found items card holds the custom terms panel after the coverage note, and the term groups come before the detector groups |
| 0016 | AC-1, *Data model sketch* | `found`, `blocked`, `removed`, `unticked` and `blockedByKind` count by `MatchKind`; `redaction-completed` gains `terms` and `termsSetAside` (AC-24) |

## Requirements

**User stories**:
- As a Pro visitor, I want to type the names and references this document must lose and have every place they appear found, so that I am not hunting through 50 pages by eye.
- As a Pro visitor, I want a name written two ways, joined to other text or split across a line, to show up rather than slip through, so that I can trust that what I did not tick is what I chose to keep.
- As a Pro visitor redacting a batch of files, I want my list to carry from one file to the next in this tab, without it ever being saved anywhere.
- As a Free visitor, I want to see that custom terms exist and what it takes to get them.

**Acceptance criteria**:

*The panel*
- **AC-1**: With billing on and a job whose frozen snapshot is `paid`, the Found items card holds a custom terms panel during `reviewing`, `redacting` and `complete`, after the coverage note and before the groups: a labelled one line field, an Add button, the list's terms as chips in the order added, each with a remove button named for its term, a Remove all button while the list holds two or more terms, and a polite status line in the page from the panel's first render. While `redacting`, the field, Add and every remove button are disabled. There is no panel while `idle`, `opening`, `failed` or `lost`.
- **AC-2**: With billing on and a `free` job, the panel is locked: the field and Add are disabled, and one line from `TERMS_LOCKED_TEXT` (records over `EntitlementAccount`) says custom terms come with Pro. For `none` and `signed-in` it carries a new tab link to Pricing (spec 0012, INV-10); for `sign-in-needed` and `unknown` it says this file opened on the Free plan because the plan could not be confirmed, with spec 0012's Check my plan and open it again (AC-6 there). Kept terms show as AC-17 says. With billing off there is no panel at all.
- **AC-3**: Enter in the field, or Add, adds the field's text as one term. Pasting text that holds a line break into the field adds each non empty line as a term, in order, and leaves the field empty. Each term is trimmed and each inner run of whitespace collapsed to one space before it is judged. An added term becomes a chip at the end of the list and its search starts at once (AC-9).
- **AC-4**: A term is refused, and named in the panel's line with its reason from `TERM_REFUSAL_TEXT`, when it is shorter than `TERM_MIN_CHARS` (2 code points), longer than `config.maxTermChars` (100), holds no letter or digit, folds the same as a listed term (AC-7), or would take the list past `config.maxCustomTerms` (50). A paste adds every line that passes, in order, until the list is full. Its refusals are grouped by reason, each with its count; the first 20 refused lines are named, each in full up to 60 code points and a longer one by its first 60, an ellipsis and its length; past 20, each reason says how many more it refused. A typed term that is refused stays in the field to be fixed. No refused line passes unsaid, and no added term is cut short: the field has no length limit of its own.
- **AC-5**: A chip's remove button takes its term out of the list, its group and rows out of the checklist, and its rows out of the tick set; Remove all does so for every term. Focus moves to the next chip's remove button, else the previous one's, else the field; after Remove all, to the field. A search whose terms have all been removed is cancelled (spec 0002, INV-8), and rows that land for a term no longer listed are dropped.
- **AC-6**: The list belongs to the tab, not the job. Choose another PDF, a replacement, Start over, a lost worker and its retry all keep it; reloading or closing the page ends it. Each open of a `paid` job searches the whole kept list in the same pass as detection (AC-9). While the full drop zone shows (`idle` or `failed`) and the list holds terms, one line beside it says how many custom terms are kept for this tab, with Remove all; it adds and searches nothing.

*Matching*
- **AC-7**: Both the term and the page are folded before they are compared, one code point at a time with a map back to the page: NFKC (as detection already reads the page), then every combining mark removed, then case folded (upper then lower case, so `Straße` matches `STRASSE`); apostrophe styles (`'`, `‘`, `’`, `ʼ`) fold to one, and hyphen and dash styles (the detectors' `HYPHEN` set) fold to one. Invisible format characters (soft hyphen, zero width joiner and non joiner, word joiner, byte order mark) read as nothing; a zero width space reads as a space. So `José` finds `JOSE` and `Muller` finds `Müller`. Whether a difference in marks still ticks is AC-32's rule.
- **AC-8**: An exact match is the folded term equal to the folded page, where a run of whitespace or a break (a line or block join) matches one space in the term, and a hyphen right before a line break (never a block break; a page break as AC-33 reads it) reads either as nothing with the break (`Smith-` then `son` for `Smithson`) or as a hyphen with the break as nothing (`Smith-son`). Both its edges must be word edges: at each, the match's own boundary character is not a letter or digit, or the nearest page character outside it is not one (whitespace, a break, punctuation, or the page's start or end), a combining mark after its last letter belonging to the match. An exact match is ticked unless blocked.
- **AC-9**: A term is read against the whole page as one text, its blocks joined by breaks, so a match crosses line and block breaks; an off line stretch that leaves the text for detection (spec 0014, AC-4) leaves it for terms too. A match that runs on into the next page is AC-33's. At open, the kept list is matched against each readable page's text in the same read as detection. During review, one Add or one paste is one `find-terms` request, which reads each readable page once for the whole batch. Term matches go through the find step's checks like any detector's: blocked reasons (spec 0005, AC-8), the replacement text pass (AC-9 there) and concealment (spec 0006, AC-13), so a blocked place is listed blocked with its reason. A term's match found only with replacement text ignored is left out only where an ordinary row of the same term already holds that place; detector rows keep today's rule (spec 0005, AC-9).
- **AC-10**: An edge is touched when the match's boundary character there and its neighbour outside are both letters or digits. Both are read as the page has them before the fold (NFKC, with case and marks kept), through the position map. A match that is exact but for a touched edge is listed unticked with the `joined` note only where, at each touched edge, (a) the case changes across it: at the start, the neighbour is lowercase and the boundary letter uppercase or titlecase; at the end, the boundary letter is lowercase and the neighbour uppercase or titlecase (`JohnSmith`, `SmithDate` for `Smith`); or (b) a letter meets a digit (`0958Mobile` for `0958`, `Smith2026` for `Smith`); or (c) either is a letter of a script written without spaces between words (Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar). An edge touched any other way lists nothing: `Ann` lists neither `Annual` nor `planning`, and `Smith` lists nothing in `SMITHSON` or `Smithson`. An edge whose boundary character is not a letter or digit (`#42`, `O'`) is never touched.
- **AC-11**: Where no exact match covers it, a stretch of the page whose characters equal the term's once both are folded and every separator is removed from both is listed unticked with the `spaced` note. Separators are whitespace, breaks, hyphens and dashes, apostrophes, full stops and the invisible characters. The stretch starts and ends on a character that is not a separator, and its edges are judged as AC-8 and AC-10 say. So `Smith-Jones` finds `Smith Jones` and `SmithJones`; `INV-2026-0042` finds `INV 2026 0042` and `INV20260042`; `McDonald` finds `Mc Donald`; `Smith` finds `S M I T H`; `O'Brien` finds `OBrien` and `O Brien`; `J. Smith` finds `J Smith`; `Smithson` finds `Smith` and `son` split by a line break whose hyphen was lost. A row's notes come in `TERM_NOTES` order: `joined`, `spaced`, `marks`, `page-break`.
- **AC-12**: Within one term, exact matches are chosen first, leftmost and not overlapping, then matches with notes that overlap none of them, leftmost and not overlapping, those within one page before those across a page break. Two terms, or a term and a detector, may list the same place, each in its own group: spec 0005's `PRECEDENCE` orders detectors only, and term rows never cut or move a detector row.
- **AC-13**: A term row's text is the page text it covers with a break shown as one space, except a line break right after a hyphen, shown as nothing (`Smith-son`). The target's text follows the same rule. Context, page and cut flags are as for any row (spec 0005, AC-5; spec 0007, AC-9).
- **AC-32**: Marks on a Latin, Greek or Cyrillic letter are folded away for every match, so `José` ticks `JOSE`. Marks on a letter of any other script are folded away for finding too, but there a match whose marks differ from the term's (a term typed without Arabic, Hebrew or Devanagari vowel marks against a page that has them, or the other way) is listed unticked with the `marks` note; one whose marks agree is exact.
- **AC-33**: A match may run from the end of one readable page into the start of the next page, when that page is readable too. The find step carries the tail of each readable page into the next one's matching, in both extraction modes: from the k-th last character that is not a separator (k being the longest searched term's length in such characters) to the page's end, with the page break read as a line break, so the hyphen readings apply. A match across the break is listed as two rows under its term, the part on each page with that page's context, each its own target, both unticked with the `page-break` note; each part's edge at the break is a word edge. The first part's checks run on its own page, which the find step loads again, alone, once the next page is closed. Text drawn between the parts in reading order (a running footer or a page number) still keeps them apart, and nothing carries past a page that is not readable.

*The checklist and the coverage note*
- **AC-14**: The checklist lists one group per term this job searched, in the list's order, before the detector groups: headed by the term as typed, counting its rows (blocked included) with `TERM_GROUP_NOUN` (`match` for one, `matches` otherwise), and starting with a select all once two of its rows can be ticked (spec 0007, AC-7). A row with notes shows each from `TERM_NOTE_TEXT`. The Found items count includes term rows, and Nothing found to remove shows only when no row of any kind exists.
- **AC-15**: A searched term with no rows says so on its chip and in its place in the list: not found in this document, or, when some page carries a warning, not found on the pages RedactNest could read (spec 0006, AC-26).
- **AC-16**: When this job searched any term, the coverage note says RedactNest also looked for the custom terms, by count, and still that everything else stays in the file. `lookedFor`, the `detecting` phase line's detector list and the home page's words are unchanged.

*Never silently missed*
- **AC-17**: A listed term this job did not search shows not searched with its reason, on its chip and in its place in the list: `free-plan` (the job opened on the Free plan, so the kept list was not searched) or `search-failed` (AC-20). Beside the reason: Set aside for this file, Remove, and Try again for `search-failed` or Check my plan and open it again for `free-plan` (where the snapshot's account offers it, AC-2). Set aside marks the term set aside for this job only; it stays in the list for later files and says set aside on its chip.
- **AC-18**: Make a cleaned copy waits while any listed term is `searching` or `not-searched` (set aside does not hold it): the button stays in place, cannot run and says so to assistive technology, and the action panel's line says why (still searching, or which terms were not searched and that Try again, Set aside or Remove lets the run go ahead). Ticks keep working throughout.
- **AC-19**: One search runs at a time. While any term is `searching`, Add shows busy (spec 0013, AC-34), the field is read only and Try again waits, while Remove and Remove all stay enabled; the panel's polite line says what is being searched (the term, or how many); when it lands the line says how many matches each term found or that it was not found, heard once, and focus stays where it was. Adding or removing a term from `complete` returns the session to `reviewing`, with the outcome cleared and the made copy dropped, as a tick change does (spec 0007, AC-14).
- **AC-20**: A review search that fails (the worker answers with an error kind) keeps the review: the rows and ticks so far stay, the batch's terms become `not-searched` (`search-failed`), and the polite line says those terms could not be searched. Try again searches them again as one batch. A worker lost during a search goes to `lost` as today; its retry reopens with the kept list searched at open, set aside terms staying set aside. A Try again that fails again leaves its terms `search-failed`.

*Removal and the result*
- **AC-21**: A ticked term row is removed through the engine as any target is (spec 0004): text out of the content stream, the box drawn after, the self check on the exact bytes, all or nothing. A run whose only removals are term rows names the file redacted or partly redacted, never cleaned (spec 0007, AC-12, INV-2). A term row the engine refuses (a joined row whose removal would reach the word it is glued to is refused as `redaction-overreach`) refuses the run as today, keeping the review. Two ticked rows over the same place (a term row and a detector row, or two terms) are removed together, and each counts once under its own kind and term.
- **AC-22**: The result card's Removed line names each term with how many of its rows the engine removed (`removedByTerm`), in list order, beside the detector kinds' counts; its Left in the file line names each term with its unticked and blocked rows; and a line names each set aside term as not searched, with its reason.

*Privacy, counts and words*
- **AC-23**: No term, and nothing derived from one but counts, is stored, logged or sent: no request, no browser storage and no console line carries it, and `tests/e2e/privacy.spec.ts` types a term, searches, redacts and downloads to prove it. The field has `autocomplete`, `spellcheck`, `autocorrect` and `autocapitalize` off, no `name`, and sits in no `form`, so the browser keeps no history of it and sends it to no spelling service. An error from the worker stays a kind only.
- **AC-24**: `document-opened` (`found`, `blocked`) and `redaction-completed` (`removed`, `unticked`, `blockedByKind`) count by `MatchKind`, so `term` is one more kind; `redaction-completed` gains `terms` (how many terms were `searched` in this job when the run completed) and `termsSetAside`, both a `Bucket`. `document-opened` counts only the rows found at open. No event carries a term, a `TermId` or a per term count. The parser and the type gate cover the new fields (spec 0016, AC-1, AC-3).
- **AC-25**: Claim C3 names the terms you type among what stays on your device, and C14 says the counts include how many custom terms were used, never the terms. `src/lib/policy-changes.ts` gains an entry dated the day it ships. Both content security policies stay byte for byte as they are.
- **AC-26**: Pricing's Pro card gains one line naming custom terms, its cap from `config.maxCustomTerms`. The home page, the sign in panel and the terms of service keep their words.

*The worker's gate*
- **AC-27**: The open request carries the kept list as `TermQuery` items (empty for a `free` job), and `EngineLimits` gains `maxTerms` (`config.maxCustomTerms` for `paid`, 0 for `free`) and `maxTermChars`. The worker judges each request's terms alone and keeps no list: it answers `unsupported` to an open or a `find-terms` whose terms number more than `maxTerms`, hold a text `prepareTerm` would change, or hold a term `termRefusal` refuses against the request's own terms (too short, too long, no letter or digit, or a repeat within the request), and to a `find-terms` with no session. So a `free` job's `find-terms` is always refused.

*Measured and fixed*
- **AC-28**: On `tests/fixtures/detect-dense.pdf` (50 pages, entitlement routed to `paid`), in the `speed` project: an open with 50 kept terms, from the file input's `change` to the rows committed, the engine's load included, within 5 s, for three lists: 50 terms of 100 characters found nowhere; the fixture's 50 most frequent distinct words of 4 to 12 letters, so each is found; and its most frequent two letter word alone, so one group lists thousands of rows. A pasted batch of those 50 found words during review, from the paste to the rows committed, within 3 s; and the slowest single read in any of them under 1 s. The page break carry (AC-33) is on throughout. The figures are recorded in `rationale.md`, and a budget the carry breaks comes back to `/architect` with its measurement before any fallback.
- **AC-29**: The matcher is linear in the page text for each term, builds no `RegExp` from a term, and never backtracks: a case in `tests/unit/detect-adversarial.test.ts`, 50 terms of 100 characters against 100,000 characters built against a naive matcher (a term's prefix repeated, separators between every character, case and mark variants), finishes within 1 s (spec 0005, AC-16).
- **AC-30**: `scripts/make-fixture.mjs` writes `tests/fixtures/terms.pdf` with a line for each case AC-7 to AC-13 names (the folds, a line break, a hyphenated break each way, a block break, the joined and unlisted edges, each spaced form, terms typed without vowel marks against Arabic and Hebrew text that has them, a covered and a replacement text place, a term's replacement text place beside a detector row, a term split across two pages, listed as two parts, and one split by a footer between its parts, which lists nothing). Each exact row redacts through the real engine alone and with the rest, leaving every neighbour's text, and the fixture gate (feature 27) covers the file.
- **AC-31**: Specs 0002, 0003, 0004, 0005, 0007, 0011, 0012, 0013 and 0016 read as *Amends* says.

## Decision

**Chosen option**: Option 1: match in the worker's find step, with a pure term matcher in `src/detect`, reading every page again for each review search batch.

Terms ride with the open (the kept list) or in a new `find-terms` request (one per Add or paste); the find step matches them against each page's whole text and hands every match through the checks detector matches already pass, and removal is the engine's unchanged path. Ticked rows are exact whole word matches only; joined, spaced, marks and page break variants are listed unticked with a note.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (memory only; nothing is persisted):

| Entity | Lives | Fields | Rules |
|---|---|---|---|
| `CustomTerm` | Page memory, one list per tab, outside the job (`tool-client` state, list operations in `src/lib/terms.ts`) | `id: TermId` (opaque, `crypto.randomUUID()` on the page) · `text: string` (as typed, trimmed, inner whitespace collapsed) | At most `config.maxCustomTerms`, in the order added; no two with the same `foldTerm(text)`; each 2 to `config.maxTermChars` code points with a letter or digit |
| `TermState` | The job: `LiveSession.terms`, keyed by `TermId` | `{ state: "searching" }` · `{ state: "searched" }` · `{ state: "not-searched", reason }` · `{ state: "set-aside", reason }`, `reason` from `NOT_SEARCHED_REASONS` (`free-plan`, `search-failed`) | One per listed term the job knows; a `searched` term with no rows is not found |
| `ReviewMatch` (grows) | Worker to page | `type: MatchKind` · `term: TermId \| null` · `termNotes: readonly TermNote[]` (`joined`, `spaced`, `marks`, `page-break`; empty for exact rows and detector rows) | A term row's `term` is the id it was searched under |
| `RedactionTarget` (grows) | Worker only | `kind: MatchKind` · `term: TermId \| null` | A target exactly when not blocked (spec 0005, INV-2) |
| `TermQuery` | Page to worker | `id: TermId` · `text: string` | In `open.terms` and `find-terms.terms` |
| `TermSpan` | Inside `src/detect` and the find step | `term: TermId` · `start`, `end` (code point offsets into `TermInput.text`) · `notes: readonly TermNote[]` | Never crosses the boundary; one that crosses `pageStart` becomes a part per page (AC-33) |
| `removedByTerm` | Worker to page with `redacted`, beside `outcome`; then `LiveSession.removedByTerm`, set at `redacted` and cleared wherever `outcome` is | `readonly { term: TermId; removed: number }[]` | Never inside `RedactionOutcome`, so never in a `LoggablePayload` |

New closed sets: `MATCH_KINDS = [...DETECTOR_KINDS, "term"]` and `TERM_NOTES = ["joined", "spaced", "marks", "page-break"]` in `src/worker/protocol.ts` (both cross the boundary); `TERM_REFUSALS = ["too-short", "too-long", "no-letter-or-digit", "duplicate", "list-full"]` in `src/lib/term-text.ts`; `NOT_SEARCHED_REASONS = ["free-plan", "search-failed"]` in `src/lib/session.ts`. `DetectorKind`, `DETECTOR_KINDS`, `DETECTORS`, `PRECEDENCE` and `DETECTOR_LABELS` are unchanged; every record that counts removals or rows by kind (`removedByType`, `ResultCounts`, `DetectionCounts`, the telemetry `ByKind` fields) moves to `MatchKind`.

**State transitions** (a term's `TermState` in one job):
- File chosen, `paid`: each kept term → `searching`; `opened` → `searched`.
- File chosen, `free`: each kept term → `not-searched` (`free-plan`).
- Add or paste (review): new terms → `searching`; `terms-found` → `searched`; a worker error → `not-searched` (`search-failed`).
- Try again: `not-searched` (`search-failed`) → `searching`.
- Set aside: `not-searched` (either reason) → `set-aside` (same reason), for the rest of the job. Remove and add again to search it.
- Remove or Remove all: the term's state, rows and ticks go, from any state.
- Retry after `lost`: `set-aside` states stay; every other term is searched at open as for a file chosen, with the job's own snapshot.

The session gains `terms-searching`, `terms-found`, `terms-failed`, `terms-set-aside` and `terms-removed`. `file-chosen` and `retry` carry the kept list's ids. Every `terms-*` action carries `jobId` and its batch's `TermId`s; one whose `jobId` is not the session's, or that arrives outside `reviewing` and `complete`, returns the session unchanged. `terms-found` drops rows for a term the session no longer holds and adds each new row's default tick (`tickedByDefault` and not blocked) to the tick set, never reseeding it, so an untick survives. `terms-searching` and `terms-removed` from `complete` return to `reviewing` with `outcome` and `removedByTerm` cleared and `downloaded` false (AC-19). `canMake(session)` is false while any state is `searching` or `not-searched`, and `redact-started` and `rerun` are refused unless it holds.

**API surface** (the worker protocol; no network endpoint changes):

| Message | Direction | Key inputs | Key outputs | Gate | Key errors |
|---|---|---|---|---|---|
| `open` (grows) | page → worker | `terms: TermQuery[]` (req, empty when `free`) · `limits.maxTerms`, `limits.maxTermChars` | `result` whose `matches` hold the kept list's rows | the request's terms judged alone (AC-27) | `unsupported` |
| `find-terms` (new) | page → worker | `id`, `jobId` · `terms: TermQuery[]` (req, 1 or more) | `terms-found`: `terms: TermId[]` (the batch) · `matches: ReviewMatch[]` | a session for `jobId`; `maxTerms > 0`; the request's terms judged alone (AC-27) | `unsupported`; nothing posted when cancelled |
| `cancel` | page → worker | the `find-terms` `id` | nothing | none | none |
| `redacted` (grows) | worker → page | none | `removedByTerm` beside `outcome` | none | none |

A `find-terms` joins the session's run queue (spec 0004, AC-18), so a session reads for a search and runs a redaction one at a time. While it reads it is the session's `activeRunId`, so a replacement's `endSession` cancels it before the review copy closes, and a queued one checks that its session is still current, as `runRedaction` does. `src/worker/client.ts` tracks each operation by its own id, so a search can be cancelled whatever else is in flight. Engine: `OpenDocument.findMatches({ contextChars, isCancelled, terms })` and `OpenDocument.findTerms({ contextChars, isCancelled, terms })`; `src/detect/terms.ts` exports `findTerms(input: TermInput, terms: readonly TermQuery[]): readonly TermSpan[]`, where `TermInput` is `{ text, breaks, lineBreaks, pageStart }`: `breaks` holds the code point position of every synthetic space that stands for a line, block or page break; `lineBreaks` the line and page breaks among them, where the hyphen readings apply; and `pageStart` where this page begins after the tail carried from the page before (0 when nothing is carried). A space an off line stretch left is in neither list and reads as an ordinary space.

**Matching rules** (where AC-7 to AC-13 live in code):
- `src/lib/term-text.ts` imports nothing and is the one home of `prepareTerm` (trim, collapse whitespace), `foldTerm`, `TERM_MIN_CHARS` (2, a rule about matching: a one character whole word floods the list, so not a cap in `config`) and `termRefusal(prepared, listedFolds, caps)`. The page's list, the worker's gate and the matcher all use it.
- `src/detect/terms.ts` folds the page once per page with a position map, then runs each term's exact reading and its skeleton (separators removed) reading with a bit parallel matcher: work per character bounded by the term's length in machine words, so linear in the page for each term (AC-29). The line end hyphen gives at most two readings at that one place. No `RegExp` is built from a term. Marks are folded for finding in every script; for a letter outside Latin, Greek and Cyrillic the matcher also compares the marks it folded away, and a difference gives the `marks` note (AC-32).
- `pageText` records its line and block breaks as it writes them (one walk of the characters, as today). The find step builds the whole page text alongside the per block text, prefixes the tail carried from the page before, passes `TermInput` to `findTerms`, and turns each `TermSpan` into a candidate. A span across `pageStart` becomes two candidates: the second on this page, the first held until this page is closed and then checked on the page before, loaded again alone (AC-33). Tickedness: exact rows `tickedByDefault: true`; rows with any note `false`.
- The panel's handlers change the tab's list and dispatch the session's action in the same handler: the list owns each term's text and order, the session each term's state.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Add, paste | the term's text | the field's value, through `prepareTerm` |
| Add, paste | `TermId` | `crypto.randomUUID()` on the page |
| Add, paste | refusal kind and the refused text | `termRefusal`, with caps from `config.maxCustomTerms`, `config.maxTermChars` and `TERM_MIN_CHARS`; listed folds from the tab's list |
| Add, paste | refusal words | `TERM_REFUSAL_TEXT` in `src/lib/flow-text.ts`, a record over the refusal kinds, with the term inserted |
| Paste | refusal groups, counts, the first 20 names | `termRefusal` per line, grouped by kind; each of the first 20 refused lines in full up to 60 code points, a longer one cut to 60 with its length |
| Idle or failed | how many terms are kept | the tab's list's length; words in `TERMS_TEXT` |
| Panel shown or locked | `paid` or `free`, the account | the job's frozen snapshot (spec 0002, INV-5) |
| Locked line and its link or action | words and target | `TERMS_LOCKED_TEXT` by `EntitlementAccount`; `PRICING_PATH`; spec 0012's recheck handler |
| Open | `terms`, `limits.maxTerms`, `limits.maxTermChars` | the tab's list; `config.maxCustomTerms` when `paid`, else 0; `config.maxTermChars` |
| Find step | page text, breaks | the characters the find step already walks (spec 0005, *The find step*; spec 0014, AC-4) |
| Find step | row text, context, cut flags, page, blocked, concealed | as for detector rows (spec 0005, AC-5, AC-8, AC-9; spec 0006, AC-13; spec 0007, AC-9) |
| Find step | `tickedByDefault`, `termNotes` | the matcher's reading: exact, or the notes it found |
| Find step | a page break part's page, context and checks | the page it lies on; the first part's page loaded again alone (AC-33) |
| Find step | the carried tail's length | the longest searched term's length in characters that are not separators |
| Term group | heading, count, noun | the term's `text`; the rows with that `term`; `TERM_GROUP_NOUN` in `src/lib/detectors.ts` |
| Term chip and group | found count, not found, searching, not searched, set aside and reason | `LiveSession.terms` and the rows; `isPartly(summary)` for the partly wording; words in `TERMS_TEXT` in `flow-text.ts` |
| Row note | the note's words | `TERM_NOTE_TEXT`, a record over `TermNote` in `src/lib/detectors.ts` |
| Coverage note | the searched count | the count of `searched` states in `LiveSession.terms` |
| Action panel | whether Make can run, and why not | `canMake(session)`; the names of `not-searched` terms; words in `TERMS_TEXT` |
| Polite line | what is searching, found counts | the batch's terms; the rows that landed for each |
| Result card | removed per term | `LiveSession.removedByTerm`, set at `redacted` from the message, labelled by the list's `text` |
| Result card | left per term | the job's term rows and ticks (spec 0007's rule for Left in the file) |
| Result card | set aside terms and reasons | `LiveSession.terms` |
| File name | redacted, partly redacted or cleaned | `countRemoved` over every `MatchKind` (spec 0007, AC-12) |
| Telemetry | `term` counts, `terms`, `termsSetAside` | `detectionCounts` (rows at open), `resultCounts`, and the `searched` and `set-aside` states when the run completes, through `bucket` |
| Pricing line | the cap | `config.maxCustomTerms` |

**Key invariants**:
- **INV-1**: A term is never stored, logged or sent. It lives in page memory and in the worker's session, and nothing else: no storage API (spec 0002, INV-3), no request, no console line, no telemetry field, no error payload, no browser form history and no spelling service (AC-23).
- **INV-2**: Custom terms are Pro, read from the job's frozen snapshot. The worker refuses terms on a job whose limits allow none, and a batch past the cap or holding a term `termRefusal` refuses (AC-27). With billing off there is no panel. Like the page cap, this is honesty based (spec 0001).
- **INV-3**: No listed term is ever silently unsearched. In every job each term is `searching`, `searched` (with rows, or said not found), `not-searched` with its reason, or `set-aside` with its reason, and says which. Make runs only when none is `searching` or `not-searched`, and the result card names every set aside term.
- **INV-4**: A ticked term row is an exact whole word match (AC-8). Every match with a note (joined, spaced, marks, page break) is listed unticked. An edge glued with no likely lost word break lists nothing.
- **INV-5**: Matching lives in `src/detect` behind the detector wall (spec 0005, INV-5 and INV-8): pure, text and terms in, offsets out, linear for each term, no `RegExp` from a term, no `search()` (spec 0005, INV-11). Only `src/lib/term-text.ts` may be imported from `@/lib`, and it imports nothing.
- **INV-6**: Term rows pass every check detector rows pass, and a term row has a target exactly when it is not blocked (spec 0005, INV-2 and INV-3).
- **INV-7**: The list is the tab's and the job holds only each term's state. Release and replacement never clear it; a reload does, because nothing is stored.
- **INV-8**: Each page is read once per open, detection and the kept list together, and once per review search batch, never once per term. A page is loaded again only for the first part of a match across its end (AC-33), and then alone.
- **INV-9**: Per term removals come from the engine, never from the ticks, and travel beside `RedactionOutcome`, never inside it, so no `TermId` reaches a `LoggablePayload` or a telemetry event.
- **INV-10**: `term` is a `MatchKind`, never a `DetectorKind`. Every `DetectorKind` record, `PRECEDENCE`, `lookedFor` and the home page are unchanged.
- **INV-11**: No refused term passes unsaid: each is counted under its reason, and the first 20 are named (AC-4).
- **INV-12**: Document text crosses a page boundary only as AC-33's tail: at most the longest searched term's length in characters that are not separators, held while the next page is matched and dropped after. No other page text outlives its page's read (spec 0005, INV-5, as amended).

**Security model**: Only a job frozen `paid` may search terms, on the page and in the worker (INV-2). Terms are as sensitive as the document: page memory and the worker only (INV-1). Typed text reaches the worker and never comes back; what crosses back is page text, as for every row (spec 0002, INV-1). `/tool` keeps its policy and makes no new request. No regulated data scope beyond what the product already holds.

**Configuration required**:
- `NEXT_PUBLIC_MAX_CUSTOM_TERMS`: how many terms the tab's list holds. Default 50, from 1 to 100, read in `src/config` like every cap. Raising the default reruns AC-28.
- `NEXT_PUBLIC_MAX_TERM_CHARS`: the longest term, in code points. Default 100, from 2 to 200. Raising the default reruns AC-28 and AC-29.
- Both go in `.env.example`; neither is a secret, and Playwright's build takes the defaults.

**Proposed words** (for your read at build; they live in `flow-text.ts` and `detectors.ts`): the field's label "Add a name, number or phrase"; Add; "Remove all terms"; a chip's remove button "Remove {term}"; searching "Searching for {term}…" or "Searching for {n} terms…"; found "Found {n} matches for {term}"; not found "Not found in this document" or "Not found on the pages RedactNest could read"; notes "Joined to other text, so it was left unticked", "Written with different spacing or punctuation, so it was left unticked", "Written with different vowel signs or marks, so it was left unticked" and "Part of a match split across a page break, so it was left unticked; its other part is listed too"; the kept line "{n} custom terms are kept for this tab"; refusals "{n} not added: too long", the names after it, then "and {n} more"; not searched "Not searched: this file opened on the Free plan" and "Not searched: the search could not finish"; Set aside for this file; locked "Custom terms come with Pro: add names, numbers or phrases and every place they appear is found"; the coverage note "RedactNest looked for {detectors} and your {n} custom terms. Anything else stays in the file."; Pricing "Custom terms: up to {maxCustomTerms} names, numbers or phrases, found wherever they appear".

**Critical test scenarios**:
- Happy path: a `paid` job; type `Acme Ltd`; its group lists every exact place (one split by a line break, one by a block break), ticked; Make; the downloaded file's text holds none of them and every neighbour's text, and the result card says how many were removed for `Acme Ltd`, verifies **AC-1**, **AC-3**, **AC-8**, **AC-9**, **AC-14**, **AC-21**, **AC-22**
- Never half found: in `terms.pdf`, `Smith` lists `JohnSmith` and `S M I T H` unticked with their notes, `Smith-` then `son` ticked for `Smithson`, and nothing for `Smithson` under `Smith`; `Ann` lists nothing in `Annual` or `planning`, verifies **AC-8**, **AC-10**, **AC-11**, **AC-12**, **AC-30**
- Across a page break: `Acme Ltd` split between pages 2 and 3 of `terms.pdf` lists two unticked parts with the page break note; ticking both removes both and leaves the rest of each page, verifies **AC-21**, **AC-33**
- Marks: an Arabic term typed without vowel marks lists the page's vowelled form unticked with the marks note, while `José` ticks `JOSE`, verifies **AC-32**
- Races: a replacement file while a search reads, and a term removed mid search, leave no rows from the old search and no read of a closed document, verifies **AC-5**, **AC-19**
- Failure: a `find-terms` that errors keeps every row and tick, marks the batch not searched, holds Make with the reason, and Set aside lets the run go ahead with the term named on the result card, verifies **AC-17**, **AC-18**, **AC-20**, **AC-22**
- Kept list on Free: a second file opens `free` (plan check routed to `unknown`); the locked panel shows the kept terms not searched (`free-plan`) and Make waits; Check my plan and open it again (routed `paid`) searches them at open, verifies **AC-2**, **AC-6**, **AC-17**, **AC-18**
- Permission: a hand made `find-terms` on a `free` job is answered `unsupported`, verifies **AC-27**
- Privacy: a typed term reaches no request, no store and no console, and the field's attributes hold, verifies **AC-23**
- Refusals: a paste of 55 lines with a duplicate, a one letter line and a 101 character line adds the 50 that fit and names each other line with its reason, verifies **AC-4**

## Build plan

Skateboard: slice 1 is a usable whole on its own (a Pro visitor types a term, sees it found and removed), then each slice widens what is found and what is said.

**Slice 1: a term found and removed**
1. Protocol: `MATCH_KINDS`, `MatchKind`, `TermId`, `TermQuery`, `TERM_NOTES` (all four), `ReviewMatch`'s `type`, `term` and `termNotes`, `FindTermsRequest`, `TermsFoundMessage`, `EngineLimits.maxTerms` and `maxTermChars`, `OpenRequest.terms`, `RedactedMessage.removedByTerm`, `removedByType` and `LoggablePayload` over `MatchKind`; `DetectorKind` records untouched, satisfies **AC-9**, **AC-14**, **AC-21**, **AC-27**
2. `src/lib/term-text.ts` (`prepareTerm`, `foldTerm`, `TERM_MIN_CHARS`, `TERM_REFUSALS`, `termRefusal`) with its own lint zone that bans every import, the detect zone allowing that one module from `@/lib`; `config.maxCustomTerms` and `config.maxTermChars` with their ranges, and `.env.example`, satisfies **AC-4**, **AC-7**, **AC-27**
3. `src/detect/terms.ts`, the exact reading: the fold with its position map (marks folded silently on Latin, Greek and Cyrillic letters only), whitespace and breaks, both hyphen readings at line breaks, word edges by boundary character, the exact half of AC-12; unit tests, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-12**, **AC-32**
4. Engine: `pageText` recording line and block breaks; the whole page `TermInput` beside the per block text; term spans through `candidate`, the checks and the replacement text pass, a term's hidden row yielding only to its own term; the row text rule; `findMatches` with terms and `findTerms`; `RedactionTarget.term`; `removedByTerm` counted after the self check; engine tests through the real MuPDF, one with two overlapping ticked targets (`John Smith` with `Smith`, and a term inside an email), satisfies **AC-9**, **AC-13**, **AC-21**
5. Worker and client: `find-terms` on the session's run queue as its `activeRunId`, cancelled by `endSession`, a queued one checking its session is current; the gate judging each request alone; `terms-found`, cancel, the open with terms; `src/worker/client.ts` tracking each operation by its own id, satisfies **AC-5**, **AC-9**, **AC-27**
6. Session: `LiveSession.terms` and `removedByTerm`; the five actions carrying `jobId` and their batch's ids; the kept list's ids on `file-chosen` and `retry`, set aside kept through a retry; ticks merged, never reseeded; `canMake` guarding `redact-started` and `rerun`; `complete` back to `reviewing`; rows dropped for a removed term; reducer tests over every edge, satisfies **AC-5**, **AC-18**, **AC-19**, **AC-20**, **AC-22**
7. Interface: `TextField` and `Chip` in `src/ui` with component and axe tests (existing token pairings, or a new one into spec 0003's contract in the same change); `src/app/tool/terms-panel.tsx` in the Found items card; the tab's list in `tool-client` with list operations in `src/lib/terms.ts`, changed in the same handler as the session's action; Enter and Add, a typed refusal named, remove with its focus rule, one search at a time (Add busy, the field read only, Remove live) and the polite line; the field's attributes and no form, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-19**, **AC-23**
8. The checklist and the rail: term groups first, their headings, counts by `TERM_GROUP_NOUN` and select all, the not found line, row notes, Nothing found to remove only with no rows; the coverage note; the action panel's waiting line; the result card's per term Removed and Left lines; `countRemoved` over every `MatchKind`, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-18**, **AC-21**, **AC-22**
9. Browser: with `paid` routed, add a term, see its rows, redact and read the download's text; the privacy test's typed term case; axe on the panel's states, satisfies **AC-1**, **AC-21**, **AC-23**

**Slice 2: never half found**
10. Matcher: the joined edges (case change, letter and digit, scripts without spaces), the spaced reading over every separator, the `marks` note outside Latin, Greek and Cyrillic, the notes' order, the variant half of AC-12; the AC-10, AC-11 and AC-32 examples as unit cases, satisfies **AC-7**, **AC-10**, **AC-11**, **AC-12**, **AC-32**
11. Page breaks: the tail carried in both extraction modes, the page break read as a line break, a match across it split into two parts with the `page-break` note, the first part checked on its own page loaded again alone; engine tests through the real MuPDF, satisfies **AC-12**, **AC-33**
12. The adversarial case in `tests/unit/detect-adversarial.test.ts`, run alone as the stopwatch rule says, satisfies **AC-29**
13. `tests/fixtures/terms.pdf` from `scripts/make-fixture.mjs`, read and redacted through the real engine in the detection and redaction tests, under the fixture gate; `verify.md`'s steps, satisfies **AC-21**, **AC-30**, **AC-32**, **AC-33**

**Slice 3: the tab's list**
14. The list kept across Choose another PDF, a replacement, Start over, a lost worker and its retry; the kept list sent with each `paid` open and searched in the same pass; the kept line with Remove all beside the full drop zone, satisfies **AC-6**, **AC-9**
15. A `free` job: the locked panel by account, the kept terms `not-searched` (`free-plan`), Set aside, Remove, Check my plan and open it again; no panel with billing off, satisfies **AC-2**, **AC-17**
16. A failed search: `search-failed`, Try again as one batch, Set aside; the action panel's three ways forward; the result card's set aside line, satisfies **AC-17**, **AC-18**, **AC-20**, **AC-22**
17. Paste: each line a term, the cap, refusals grouped by reason with the first 20 named; Remove all and its focus, satisfies **AC-3**, **AC-4**, **AC-5**

**Slice 4: measured, counted and said**
18. The speed cases (three open lists, the pasted batch, the slowest read, the carry on) in the `speed` project, added to `SPEED_SPEC`; the figures in `rationale.md`; a budget the carry breaks comes back to `/architect` with its measurement, satisfies **AC-28**
19. Telemetry: `MatchKind` in the tool events, `terms` and `termsSetAside`, the parser, the type gate, `src/telemetry/tool.ts`, satisfies **AC-24**
20. Words outside the tool: C3 and C14, the `policy-changes.ts` entry dated the day it ships, the legal page tests; Pricing's line from `config`, satisfies **AC-25**, **AC-26**
21. The amends to specs 0002, 0003, 0004, 0005, 0007, 0011, 0012, 0013 and 0016, and your read of every new word (`flow-text.ts`, `detectors.ts`, Pricing, the policy), satisfies **AC-31**

## Consequences

**Positive**:
- Pro gains a capability with real substance: names and references, the thing the coverage note today says stays in the file.
- No new way of removing text: term rows are targets like any other, so the self check, the refusals and the all or nothing rule hold as they are.
- A name written two ways, joined, letter spaced or split by a line shows up as a row instead of slipping through.
- The list carries through a batch of files with nothing saved, so the privacy story stays whole.

**Negative / tradeoffs**:
- Each review search reads every page again: about 1 s on a dense 50 page file (spec 0012's measure). Caching page text was declined to keep spec 0005's one page at a time rule.
- Folding case and marks, and the spaced reading, find more than was typed: more rows to read, most unticked. A short term (a two letter initial) can list many rows; rows are never capped, because a cap would drop matches in silence.
- A joined row, if ticked, may be refused as `redaction-overreach`, since the word it is glued to sits within the removal's reach. The refusal says to untick it, as today.
- One place can show in two groups (a term and a detector, or two terms), and the result card then counts it in each.
- A match across a page break costs one more load of the page before it, and lists two unticked parts that each need a tick.
- Outside Latin, Greek and Cyrillic, a term typed without its marks lists every vowelled match unticked (`marks`), so those scripts take a tick per row.
- One search runs at a time, so a second Add waits about a second on a dense 50 page file.
- Kept terms on a job that opened Free hold Make until they are set aside, removed or searched on Pro: one more step, on purpose.
- The gate is honesty based like the page cap: an edited page can call the worker with a `paid` limit.
- The protocol grows a second request kind and a per term count beside the outcome, and every by kind record moves to `MatchKind`.

**Neutral**:
- Known misses, recorded: a term split across a page break with text drawn between its parts (a running footer or a page number); an all capitals word glued to the next (`SMITHDate` lists nothing for `Smith`, since no case change marks the edge); text on a scanned page, which the page warnings already name.
- Scripts written without spaces list their matches unticked (joined), never ticked.
- Two new primitives in `src/ui` and two new values in `config`.

## Follow-up

- [ ] `/sync`: root `AGENTS.md` lines for `src/lib/term-text.ts` (imports nothing, the one module `src/detect` may take from `@/lib`), `MatchKind` beside `DetectorKind`, and terms never stored or sent; `src/engine/AGENTS.md` for the whole page term text in the find step and the carried tail (spec 0005's one page rule as amended, INV-12).
- [ ] Scope Deferred: a term split across a page break with a running footer or page number between its parts, measured on real documents before any design.
- [ ] Scope Deferred: patterns or wildcards in a term (for example a reference number's shape), a decision of its own.
- [ ] Scope Deferred: an all capitals edge (`SMITHDate`), measured for noise on natural text before any rule widens.
- [ ] Feature 15 may name custom terms on its search pages, under spec 0012's INV-8.
- [ ] *Read the first month of counts* (scope Deferred): add `term` rows, `terms` and `termsSetAside`, to see whether Pro's capability is used and how often a Free job meets a kept list.
