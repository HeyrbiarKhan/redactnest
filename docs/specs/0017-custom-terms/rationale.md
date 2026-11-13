# 0017. Custom terms: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and skips this file.

## Context

Detection finds seven kinds of pattern, and the coverage note says plainly that anything else, "such as names and addresses, stays in the file". Names, client references and case numbers are what small businesses most need gone, and no pattern can know them: only the visitor can. Scope feature 13 makes this the first paid capability with real substance, and its bar is that every occurrence goes, including matches broken across line breaks and hyphenation, with the summary saying how many.

The forces:

- **Privacy is structural.** The document lives only in the worker (spec 0002, INV-1), nothing is stored (INV-3), and logs carry kinds and counts only (INV-4). A typed term is as sensitive as the document it names, so it inherits all three, and claim C3 has to say so.
- **One removal path.** Removal is geometric (spec 0001): a match becomes quads, target validation proves they surround the text (spec 0004, AC-27), the self check proves the output, and a run is all or nothing. Anything this feature finds has to become an ordinary target, or the guarantees fork.
- **Detection's shape.** The find step reads each page twice (ordinary and with replacement text ignored), runs the detectors on each text block, and never calls `search()` (spec 0005, INV-11). Page text lives for one page's read (spec 0005, INV-5). The detectors sit behind a lint wall: pure text in, offsets out, linear time (INV-7).
- **No silent miss.** The product's promise is that nothing looks redacted when it is not. For terms, the matching failure is a name the page writes differently from how it was typed: in capitals, without its accent, joined to the next word by a lost space, letter spaced in a heading, or split by a line whose hyphen MuPDF dropped. The owner's standing rule is to lean toward finding and to measure before loosening.
- **Pro is honesty based** (spec 0001): the page can be edited, so a gate can only be as strong as the page cap's.
- **Cost.** Opening `detect-dense.pdf` (50 pages, about 2,200 matches) measured about 2.5 s end to end, about 1 s of it detection, with the slowest single read 8 to 14 ms (spec 0012, `rationale.md`, task 16). Any design that reads the pages once per term multiplies that.

Without this feature Pro sells only a higher page cap, and the coverage note keeps telling every visitor that the names stay.

## Options considered

### Option 1: Match in the worker's find step, pages read again per search batch (chosen)

Terms reach the worker with the open (the kept list) or in a new `find-terms` request (one per Add or paste). The find step matches them against each page's whole text with a pure matcher in `src/detect`, and every match takes the detectors' path: candidate, checks, target.

**Pros**:
- One removal path, one set of checks, the detector wall kept.
- No new memory held across the session; page text still lives for one page's read.
- The kept list costs no extra read at open: it rides in the detection pass.

**Cons**:
- Each review search reads every page again, about 1 s on a dense 50 page file.
- A second request kind on the worker, and the session must track each term's state.

### Option 2: Keep each page's text in the worker from the open

As Option 1, but the open keeps every page's characters, positions and both extraction modes in the session, so a review search reads memory, not MuPDF.

**Pros**:
- A review search is near instant.

**Cons**:
- Tens of MB more held for the whole session on a dense file, beside the review copy MuPDF already holds.
- Spec 0005's rule that page text lives for one page's read is amended, for a speed the owner did not need (3 s budget).
- The image pass still needs the page loaded for each new match.

### Option 3: MuPDF's own `search()` for each term

Ask MuPDF to search each page for each term and redact the quads it returns.

**Pros**:
- Least code: MuPDF returns quads directly.

**Cons**:
- Banned by spec 0005, INV-11: `search()` caps its hits at 500 quads a page in MuPDF.js, so a common term would be dropped in silence.
- No folding of marks, no line end hyphen readings, no whole word edges, no variants: exactly the silent misses this feature must not have.
- A second way to find text, beside the character reader every check uses (spec 0005, INV-12).

### Option 4: Terms only before the file opens

The visitor types terms first; they are searched once, inside detection, and never during review.

**Pros**:
- No new request kind and no per term state during review: the simplest build.

**Cons**:
- A forgotten term means opening the file again, and the review is where a visitor notices one.
- The owner chose entry during review only; this option would have reversed that.

### Matching: how strict a ticked row is

Within Option 1, three ways to match were weighed:

- **Exact and ticked only.** Simple and quiet, but a name joined to the next word or written with other spacing is missed in silence.
- **Loose and ticked** (separators interchangeable, any glued edge). Finds everything, but ticks `coop` for `co-op` and the start of `Annual` for `Ann`, which a visitor may not catch.
- **Exact ticked, variants listed unticked with a note (chosen).** Exact whole word matches are ticked; a match joined by a likely lost word break, or written with other separators, is listed unticked with a note saying which; an edge glued with no sign of a lost break lists nothing, so short names do not flood the list.

## Rationale

Option 1 is the only option that keeps one removal path and the detector wall, holds no new memory, and finds what `search()` cannot. Option 2's speed is real but buys nothing the owner asked for: a review search within 3 s on a dense 50 page file is within Option 1's reach (about 1 s of reads plus matching), and Option 2 would amend a privacy rule to save it. The owner's challenge on the open's cost shaped one rule: the kept list is matched in the same read as detection, and a review batch is one read per page, never one per term (INV-8), with the worst open measured against a 5 s budget (AC-28).

The matching rules come from the owner's answers, each a guard against a silent miss with a bound on noise: ignore case and marks (a name typed without its accent is still found); like for like separators for a ticked row; joined and spaced variants unticked with a note; and the joined rule kept narrow to a case change, a letter meeting a digit, or a script written without spaces, so `Ann` never lists `Annual` or `planning`.

The rest follows from the forces. Per term counts on the result card come from the engine and travel beside the loggable outcome, never inside it (INV-9), so the owner gets per term detail on the page while telemetry still sees only a `term` total as a range. A kept list meeting a job that opened Free is never silent (the owner's addition): the terms say not searched and why, Make waits, and Set aside lets the run go ahead with them named on the result card.

### Calls made in writing (each with its runner up)

- **`MatchKind` beside `DetectorKind`, not `term` added to `DetectorKind`.** `DETECTORS`, `PRECEDENCE`, `DETECTOR_LABELS`, `lookedFor` and the home page all read `DetectorKind`, and a term has no fixed detector, no precedence and no fixed label. Runner up: one widened kind list, which would put `term` in the coverage note's detector list and on the home page.
- **The page mints `TermId`.** The page needs the id before the worker answers (the chip, the searching state, a removal mid search). Runner up: the worker mints, which forces a round trip before a chip can be removed safely.
- **`find-terms` joins the session's run queue.** A session then does one thing at a time, and a search never reads the review copy while a run builds its own. Runner up: a separate queue, which allows a search and a run to interleave for no gain, since Make waits for searches anyway.
- **No message to drop a removed term's targets.** The page never names a removed row's id again (the reducer drops its rows and ticks), and the worker's map ends with the session. Runner up: a `drop-terms` request, more protocol for no safety gain.
- **One fold module that imports nothing (`src/lib/term-text.ts`).** The page's duplicate check, the worker's gate and the matcher must judge sameness alike. Runner up: the fold in `src/worker/protocol.ts`, which `src/detect` may import for types only.
- **The fold itself.** NFKC, marks removed after canonical decomposition, then upper then lower case per code point (so `ß` meets `SS` and `ı` meets `i`), with a position map. Runner up: `toLocaleLowerCase`, which depends on the browser's locale.
- **Marks outside Latin, Greek and Cyrillic** (the owner's call on the cross check). Folded for finding in every script, because Arabic and Urdu are usually typed without vowel marks and a strict match would miss the name; but where the marks differ there, the row is unticked with the `marks` note, because those marks can change the word. The cross check's fix (no folding there) would have missed the name in silence.
- **Page breaks** (the owner's call on the cross check, in place of a wording caveat). Each readable page's tail is carried into the next page's matching, bounded by the longest searched term's length in characters that are not separators, so spec 0005's one page rule bends by a few dozen characters and no more (INV-12). A match across the break becomes two unticked parts, one per page, because a target lives on one page. The first part's checks need its own page loaded (the outline check reads every character inside its quads, and the image pass needs the page), so that page is loaded again, alone, after the next one closes; that costs a page load only when such a match exists. Runner up: keep the previous page loaded while the next one is read, two pages alive at once, which the one page rule exists to prevent. A running footer between the parts still keeps them apart; that residual is recorded, not designed around.
- **One search at a time on the page** (from the cross check). A second search queued behind the first adds nothing a visitor waits less for, and a single search in flight keeps cancel and stale rows simple. Remove stays live throughout.
- **The worker judges each request alone** (from the cross check). It never learns which terms the page removed, so a list kept in the worker would refuse a term removed and added again. Runner up: a `drop-terms` request so the worker can mirror the list, more protocol for a check the page already makes.
- **A failed search stays `search-failed`.** The cross check suggested reading `unsupported` from a missing session as a lost worker. Declined: a lost worker has its own path (the worker's error event), a missing session in a healthy worker means a bug, and `search-failed` still offers Try again, Set aside and Remove.
- **Refusals grouped, the first 20 named** (the owner's call on the cross check). A huge paste would otherwise put thousands of lines in one live region; every refusal is still counted under its reason, so none passes unsaid.
- **The kept line while no document is open** (the owner's call on the cross check). The list survives Start over, so the page says how many terms it holds, with Remove all, and someone on a shared machine is never misled into thinking Start over cleared them.
- **Invisible characters.** Soft hyphen, zero width joiner and non joiner, word joiner and byte order mark read as nothing; a zero width space reads as a space, since producers set it between words. Runner up: all as nothing, which would glue words a zero width space keeps apart.
- **`TERM_MIN_CHARS` as a rule constant, the two caps in `config`.** The maximum count and length limit the visitor and set the cost, so they are caps; the minimum of 2 is a rule about matching (a one character whole word floods). Runner up: all three in `config`, which would let an environment value make one letter terms flood the list.
- **A bit parallel matcher.** Linear for each term whatever the input, with the line end hyphen as a bounded second reading. Runner up: a naive scan, quadratic on adversarial text; a `RegExp` from the term, which needs escaping and can backtrack.
- **Set aside lasts the job.** A set aside term is searched again only by removing and adding it. Runner up: Try again from set aside, one more state edge for a rare path.
- **No `form` around the field, Enter handled on the field.** A form submission is what browsers take as the moment to save field history. Runner up: a form with its submit prevented, which some browsers still read as a submission.
- **Two primitives in `src/ui`.** `TextField` and `Chip` are presentation only, with their own component and axe tests, so the panel stays composition. Runner up: markup in `terms-panel.tsx`, which would leave the site's first text field outside the design system.
- **Telemetry fields.** `terms` and `termsSetAside` on `redaction-completed`: how much the capability is used, and how often a kept list meets a Free job. Runner up: a new event per search, more volume and a new event to keep in step with the parser.
- **AC-28's third list on a fixture of its own** (2026-11-13). One group of thousands is measured on `terms-dense.pdf`, where `JK` lists 3,000 rows, with its select all held to spec 0007's 200 ms tick line. Runner up: growing `detect-dense.pdf` until one word lists thousands, which would change the lists specs 0007, 0012 and 0017 recorded on it. The reasons and the measurement are in Evidence.
- **AC-28's select all held by the median, with a ceiling, timed with no trace** (2026-11-13; the median and the ceiling are the owner's preference). Ten presses, five each way: the median each way within 200 ms, every press within 500 ms, in a test file that records no Playwright trace. Runner up: the median and the ceiling with the trace kept, which on CI would sit on the line, since every traced press there measured 177 to 206 ms. The reasons and the measurement are in Evidence (*AC-28's select all line*).
- **Words.** Panel, refusal, not searched and result words in `src/lib/flow-text.ts`; row notes and the group noun in `src/lib/detectors.ts`, beside the checklist's other copy; all proposed in `index.md` for the owner's read.

## Evidence

### Cost of a read (from spec 0012's task 16)

On `detect-dense.pdf` with Pro routed: the open 2,471 to 2,719 ms end to end; loading the engine 447 to 580 ms; inspecting 731 to 841 ms; detecting 978 to 1,077 ms; slowest read during detection 8 to 14 ms. A review search reads each page with both extraction modes plus the image pass where it finds something, about the detecting phase's cost, which is why the review budget is 3 s and the open budget (AC-28) 5 s.

### AC-28, as built (measured 2026-11-11, recorded 2026-11-13)

`tests/e2e/terms-speed.spec.ts` in the `speed` project, on `detect-dense.pdf` (50 pages) with `paid` routed and the page break carry on. An open runs from the file input's `change` to the rows committed, the engine's load included.

| Case | Measured | Budget |
|---|---|---|
| Open, no terms (for comparison) | 2,353 ms | none |
| Open, 50 kept terms of 100 characters found nowhere | 2,809 ms | 5,000 ms |
| Open, the found words (27 kept terms, see below) | 2,665 ms | 5,000 ms |
| Open, `Jo` alone | 2,264 ms | 5,000 ms |
| Paste of the found words during review, to the rows committed | 1,236 ms | 3,000 ms |
| Slowest single read, at open | 46 ms | 1,000 ms |
| Slowest single read, in a review search | 12 ms | 1,000 ms |

The kept list adds at most about half a second to an open (2,353 ms to 2,809 ms), so reading the kept list in the same pass as detection holds (INV-8).

**Two lists are smaller than AC-28 wrote.** The fixture is a staff directory: 1,100 rows of a name, an address at `example.com` and a phone number, under a `Staff directory` heading on each page. So it has few distinct words:

- The found list. AC-28 asked for the 50 most frequent distinct words of 4 to 12 letters. The fixture holds 27, so the case uses all 27. Through the real engine in Node, they list 3,620 rows between them, every one ticked: `staff` 1,150 (50 headings and 1,100 addresses), `example` 1,100, 15 last names 60 each, 4 first names (`Alex`, `Dana`, `Hana`, `Lior`) 55 each, `directory` 50, and 5 last names 40 each.
- The two letter word. Its most frequent two letter word is `Jo`, a first name, which lists 55 rows, not thousands.

**No term on this fixture lists thousands of rows.** Counted through the real engine in Node for every word a term could take: `staff` 1,150, `example`, `example.com` and `com` 1,100 each, `020`, `7946` and `020 7946` 1,000 each, `212` and `555` 100 each, `Staff directory` and `directory` 50 each. So 1,150 is the most one group lists here, and one group of thousands is not measured. That needs a fixture of its own, decided on 2026-11-13 (*AC-28's third list* below).

**Rows barely change the worker's cost.** One review search in Node (`OpenDocument.findTerms`, the real MuPDF, two runs each, outside the browser so not comparable with the table above): `Jo` (55 rows) 2,169 and 2,181 ms; `staff` (1,150 rows) 2,268 and 2,286 ms; the 27 found words (3,620 rows) 2,087 and 2,202 ms; 15 terms listing 7,980 rows together, 2,034 ms. The read of each page, not the rows found, sets the cost. So the risk left in a group of thousands is on the page: committing the rows and rendering one group that large. Spec 0007's checklist stopwatch already covers 2,200 rows in two groups of 1,100.

### AC-28's third list, decided 2026-11-13

As built, no term on `detect-dense.pdf` lists more than 1,150 rows, so one group of thousands was never on the page. The worker's cost barely moves with rows (above), so what is left to measure is the page: committing one group that large, and pressing its select all, which changes every row in it at once.

**The fixture.** `tests/fixtures/terms-dense.pdf`, from `scripts/make-fixture.mjs`: a 50 page review log whose every line names one reviewer's initials, `JK`, twice, each as a whole word. That makes 60 places a page and 3,000 in all.

- **Why a fixture of its own.** `detect-dense.pdf`'s lists are recorded in specs 0007, 0012 and 0017 and stay as they are. Growing that file until one word lists thousands would change every figure measured on it.
- **Why initials.** The two letter term a visitor actually types is someone's initials (*Consequences*). A common short word such as `of` would list thousands too, but nobody removes `of`.
- **Why every place is exact.** Every row is ticked, so the select all reaches all 3,000 and a press changes every row in the group. A joined or spaced row would be unticked and make the press smaller than the count.
- **Why no detector rows.** The file holds no digit and no `@`, so the term's group is the only group. The open then measures one group of thousands, not a mix.
- **Why exactly 3,000.** It is the floor asked for, 2.7 times the largest group measured so far (`staff`'s 1,150), and the test holds the exact count, so a matcher that started dropping places would fail it too.

**The select all budget.** 200 ms from the click to the next paint, each way, spec 0007's line for a single tick (AC-8 there). To the visitor a select all is one press, like a tick, and 200 ms is where a press stops feeling immediate (spec 0007's own reason for the line). Runner up: spec 0007's 1 s line for the checklist's first render, on the grounds that a select all renders every row in the group again, as a first render does. Declined: a visitor waits for an open but expects a press to answer, and 1 s would hide a select all five times slower than today's. A line that grows with the group was declined too, because it would grow with the very cost it is meant to hold.

**First checked on a scratch copy.** Before the fixture was committed, this decision was checked on a copy drawn in the session scratchpad. Its figures are replaced by the committed fixture's, below (*as built*, and *AC-28's select all line*).

### AC-28's third list, as built (measured 2026-11-13)

`tests/e2e/terms-speed.spec.ts`'s second test, on the committed `terms-dense.pdf`, with `paid` routed and the carry on, against production builds made with Playwright's environment, by the methods above. `tests/unit/terms-engine.test.ts` holds the fixture to its promise through the real engine in Node: `JK` lists 3,000 rows, 60 a page, each exact, ticked and with a target, and nothing else is listed.

| Case | Measured (10 runs) | Budget |
|---|---|---|
| Open, `JK` kept (3,000 rows, all ticked, the only group) | 2,296 to 2,596 ms | 5,000 ms |
| `JK` pasted during review, to its rows committed | 1,128 to 1,237 ms | 3,000 ms |
| Slowest single read, at open | 46 to 59 ms | 1,000 ms |
| Slowest single read, in the search | 9 to 12 ms | 1,000 ms |
| Select all, clearing all 3,000 rows | 111 to 163 ms | 200 ms |
| Select all, ticking all 3,000 rows | 136 to 160 ms | 200 ms |

The runs: one on the build before the owner's word changes, six on the builds after them (the last after the owner's final three changes), and three more on the earlier build in a same test A/B beside three of those five (earlier build: clear 113 to 116 ms, tick 136 to 160 ms; later build: clear 111 to 151 ms, tick 138 to 140 ms), so the new words cost nothing measurable. The first test, run four times beside these (once before the word changes, three times after), measured `detect-dense.pdf`'s opens at 2,235 to 2,982 ms, its pasted batch at 1,209 to 1,373 ms and its slowest read at 67 ms, in line with the 2026-11-11 table.

**These presses were timed under a trace.** `playwright.config.ts` records a trace for every test, and its recorder watches every change to the page so it can draw its snapshots. A select all changes 3,000 rows at once, so the select all figures above hold the recorder's cost as well as the page's: about 60 ms a press (*AC-28's select all line*, below). They are kept as measured. An earlier reading of them, that the line had about 1.4 times the room on this machine rather than the scratch copy's twice, mistook the recorder for the page.

**A slower hour.** Between those runs this machine ran slower for about an hour, on both builds alike: opens of 3.2 to 4.7 s, pastes of 2.6 to 2.8 s, `detect-dense.pdf`'s found list opening in 5.9 to 6.1 s (over its 5 s line), and the earlier build's select all at 164 to 268 ms under the trace, over its line too. It passed, and nothing in the code changed it, but it is what a slower machine does to these lines; a CI run over a line comes back to `/architect` with its figure, as AC-28 says.

**A test may not read an accessible name before the presses.** With the select all's accessible name read just before the presses (to check its words), the presses measured up to about 110 ms slower than the same build's without it. The test reads the label as text instead.

### AC-28's select all line, decided 2026-11-13

**What came back.** Three quiet local runs of the `speed` project on the committed build, once a leftover server on port 3000 was stopped: every open 2.3 to 2.9 s against 5 s, every paste about 1.2 s against 3 s, and `terms-dense.pdf`'s select all at 117 to 120 ms clearing and 141 to 143 ms ticking, with one tick at 226 ms, so a single press crossed the 200 ms line about once in six. CI, in the two runs that held the test, pressed at 177 to 206 ms on every attempt:

| CI run (commit) | Attempt | Clear | Tick |
|---|---|---|---|
| `d38a76c` | first | 201 ms | 206 ms |
| `d38a76c` | retry 1 | 180 ms | 203 ms |
| `d38a76c` | retry 2 | 198 ms | 204 ms |
| `f2ff60e` | first | 186 ms | 201 ms |
| `f2ff60e` | retry 1 | 177 ms | 195 ms |

Four of the five attempts had a press over the line, and the second run passed only on its retry. Every other figure in those runs sat well inside its line: opens 2.6 to 3.3 s, pastes about 1.4 s, the slowest read under 100 ms.

**Custom terms leaves a select all as fast as it was.** Main (`9cbb4c3`) and the custom terms build (`f2ff60e`), both built with Playwright's environment and served side by side, each in a browser of its own, opened `detect-dense.pdf` with `paid` routed. Its email group's select all (1,100 rows) was pressed on each by turns, the order swapped every round, 300 ms between presses, each timed from the click to the next paint, with no trace. Two runs of 15 rounds:

| Build | Clear | Medians | Tick | Medians |
|---|---|---|---|---|
| main | 25 to 43 ms | 28 and 32 ms | 27 to 43 ms | 34 and 30 ms |
| custom terms | 26 to 46 ms | 30 and 29 ms | 26 to 39 ms | 34 and 33 ms |

The same within noise, so there was nothing in the page to fix first.

**Where the time went: the trace.** The custom terms build, `terms-dense.pdf` set up as the test sets it up (`JK` kept, Start over, then the open), a fresh browser for each session, and the group's select all pressed by turns, 300 ms apart:

| Timed | Sessions, presses | Clear | Tick | First clear after the open |
|---|---|---|---|---|
| No trace | 9, 132 | 70 to 116 ms (median 79) | 72 to 101 ms (median 77) | 91 to 116 ms |
| With a trace as `playwright.config.ts` records it (DOM snapshots, no screenshots) | 2, 24 | 111 to 150 ms (median 136) | 135 to 175 ms (median 147) | 111 and 123 ms |

The traced figures match the committed test's (117 to 143 ms, one 226). The trace's recorder watches every change to the page so it can draw its snapshots, and a select all changes 3,000 rows at once, so the recorder adds about 60 ms a press, about 70 percent, which no visitor's browser pays. The test's own open probe, a page wide observer of added and removed nodes that stays attached after the open, cost nothing measurable (two sessions with it, two without, the same figures). So the scratch copy's 70 to 104 ms was the page, and the committed test's figures were the page plus the recorder. With no trace a select all costs about 26 microseconds a row, in a term group as in a detector group.

**The decision.** The 200 ms line stays, held this way:

- **No trace.** `test.use({ trace: "off" })` at the top of `terms-speed.spec.ts`. Playwright 1.63 sets `trace` per worker (asked inside a group of tests, it refuses to load the file), so both tests in the file lose it. Their failures still print every figure, and `terms.spec.ts` keeps traces for the same flows in the `chromium` project.
- **Ten presses, five each way.** By turns, starting with a clear, 300 ms apart, as the test spaces its two presses now. The first press after the open runs 20 to 50 percent slower than the rest (91 to 116 ms against a median of 76 ms for the later presses), so with five each way the median is a settled press while the first still counts against the ceiling. An odd count has a true middle.
- **The median each way within 200 ms.** One press is one sample on a shared machine, and the median holds what a select all costs.
- **Every press within 500 ms.** 200 ms is spec 0007's edge of a responsive press, which is also where Chrome's own measure of a page's responsiveness (Interaction to Next Paint) stops calling a press good; 500 ms is where that measure calls it poor. One press past it fails the run, so a real freeze is never averaged away. The slowest single press measured anywhere so far is 268 ms, under the trace, in the slower hour above.

With no trace, every session's median of its first five presses each way sat at 75 to 91 ms, and its slowest press at 91 to 116 ms, so the rule passes on this machine with more than twice the room. CI's figures with no trace are not measured yet. Under the same trace CI took about 1.5 times as long as this machine, which would put its medians near 120 ms; the first CI run after the change records them, and a CI attempt over a line, retried or not, comes back to `/architect` with its figures.

**Declined.**

- The median and the ceiling with the trace kept: CI's traced presses all measured 177 to 206 ms, so its medians would sit on the line and fail about half its runs.
- No trace, one press each way: a single sample would still decide the run, and the owner asked for the median.
- Three presses each way: one slow first press and one noisy press would set the median. Seven: more time for little more.
- A ceiling of 400 ms, twice the line: arithmetic with no reason behind it. A ceiling of 1 s, spec 0007's first render line: a visitor would see a one second freeze and the test would pass it.
- No trace for the whole `speed` project: it would move the figures specs 0007 and 0012 recorded under a trace, for no line that is failing. Their stopwatches still time under the trace and sit far inside their lines (a tick at 15 to 31 ms against 200 ms); if one of them nears its line, the trace is the first thing to rule out.
- A faster select all in the page (rendering the group's rows in batches, or virtual scrolling): the page is no slower than main, and 3,000 rows press in about 78 ms. Spec 0007 keeps virtual scrolling for a group that is slow on its own.

### AC-28's select all line, as built (measured 2026-11-13)

`tests/e2e/terms-speed.spec.ts` as task 18 amends it (`2f0a4ce`): `test.use({ trace: "off" })` at the top of the file, and the second test's select all pressed ten times by turns, starting with a clear, 300 ms apart, the ticked rows counted after each (none, then all 3,000), the median each way held to 200 ms and every press to 500 ms. One production build made with Playwright's environment (the app as at `95b9ea3`, since only the test changed), served on port 3000 with nothing else listening there, and `pnpm exec playwright test --project=speed --no-deps` run three times on it, one run after another. Every case passed in all three.

| Run | Ten presses, in order, clear first (ms) | Median clear | Median tick | Slowest press |
|---|---|---|---|---|
| 1 | 131, 87, 82, 77, 88, 79, 83, 95, 71, 71 | 83 ms | 79 ms | 131 ms, the first |
| 2 | 100, 84, 79, 75, 76, 80, 73, 75, 81, 72 | 79 ms | 75 ms | 100 ms, the first |
| 3 | 100, 82, 78, 78, 75, 77, 73, 75, 79, 72 | 78 ms | 77 ms | 100 ms, the first |

The medians, 75 to 83 ms, sit inside the 75 to 91 ms the decision expected, about 2.4 times under the 200 ms line. The first press after the open was the slowest in every run, as the decision found, and once a little past the "about 120 ms" of the scratch sessions; every press stayed under a third of the 500 ms ceiling.

Both tests in the file now run with no trace. Their other figures, in the same three runs:

| Case | Three runs | Budget |
|---|---|---|
| `detect-dense.pdf`, open with 50 terms found nowhere | 2,541 to 2,587 ms | 5,000 ms |
| `detect-dense.pdf`, open with its 27 found words | 2,449 to 2,479 ms | 5,000 ms |
| `detect-dense.pdf`, open with `Jo` alone | 2,108 to 2,136 ms | 5,000 ms |
| The 27 found words pasted during review | 1,126 to 1,154 ms | 3,000 ms |
| `terms-dense.pdf`, open with `JK` kept | 2,258 to 2,329 ms | 5,000 ms |
| `JK` pasted during review | 1,102 to 1,125 ms | 3,000 ms |
| Slowest single read, at open | 29 to 34 ms | 1,000 ms |
| Slowest single read, in a search | 9 to 11 ms | 1,000 ms |

In line with the traced figures above, so the trace weighed on the select all alone. The checklist's and the paid cap's stopwatches, still traced, passed in the same runs (a tick at 11 to 29 ms).

**The ceiling holds on its own.** A scratch copy of the test, its first test skipped, added a click listener that held the main thread for 600 ms on the third press alone (a clear), and ran under `retain-on-failure`, the trace setting `playwright.config.ts` uses. Its presses: 99, 81, 686, 76, 75, 74, 72, 73, 78 and 88 ms. Both medians passed (78 ms clearing, 76 ms ticking), and the run failed on "select all, press 3 (clearing)" at 686 ms. The failure kept no trace, only Playwright's `error-context.md`, so the file's `test.use` turns the trace off even where the config would keep one.

**Main beside custom terms, again.** By the method of the decided section: main (`9cbb4c3`) and this build, each built with Playwright's environment and served side by side, each in a browser of its own, `detect-dense.pdf` opened with `paid` routed, its email group's select all (1,100 rows) pressed by turns, the order swapped every round, 300 ms between presses, no trace. Two runs of 15 rounds:

| Build | Clear | Medians | Tick | Medians |
|---|---|---|---|---|
| main | 26 to 43 ms | 33 and 28 ms | 27 to 36 ms | 30 and 30 ms |
| custom terms | 26 to 54 ms | 30 and 30 ms | 29 to 42 ms | 34 and 35 ms |

The same within noise. Custom terms' tick medians sat 4 to 5 ms above main's in both runs this time, where earlier the same day they sat level (main 34 and 30 ms, custom terms 34 and 33 ms). Across the four runs, main's tick medians span 30 to 34 ms and custom terms' 33 to 35 ms: a few microseconds a row at most, and nothing a visitor could see.

### AC-8 and AC-29, as built (2026-11-11)

- **Mixed line end hyphens.** Each hyphen before a line break is read both ways by two whole readings of the page (all such hyphens as nothing, then all as hyphens), which keeps every reading linear and every match its term's length, so its start comes in one step (AC-29). Checked through `findTerms` on 2026-11-13: `Jean-` then `Luc Smithson`, and `Jean-Luc Smith-` then `son`, are each exact for `Jean-Luc Smithson`; `Jean-` then `Luc Smith-` then `son`, which needs the first hyphen kept and the second dropped, lists one row with the `spaced` note. It is listed unticked, never missed.
- **The adversarial case.** `tests/unit/detect-adversarial.test.ts`'s term case covers six shapes; the slowest (hyphenated terms on lines that end in a hyphen) takes about 0.5 s of CPU alone, against the 1 s budget.

### Design conversation (2026-11-11)

The owner's answers, as given:

- Terms are entered only during review. The list is kept for the tab and searched in each new document.
- A Free visitor sees the panel locked, with a Pricing link. Terms are entered in one field with Add and become chips; pasting several lines adds each.
- The panel sits at the head of the found items. One group per term. Rows are ticked. A term found nowhere is said plainly.
- Whole words are ticked; a match glued where a word break was likely lost (a lowercase to capital change or a letter meeting a digit at the edge) is listed unticked, kept narrow so `Ann` lists neither `Annual` nor `planning`.
- Case and marks are ignored. Separators are like for like for a ticked row; matches that differ only by separator are listed unticked, anywhere in the term (so `Mc Donald` and letter spacing are found), with apostrophes and full stops as separators.
- A hyphenated line break is ticked. Unticked term rows carry a short note.
- A term crosses block breaks. Each term lists its own rows whatever else lists the place.
- At most 50 terms, 2 to 100 characters. The owner asked that a page be read once for every term, never once per term, and that the worst open (50 terms, the dense 50 page fixture) carry a measured budget: 5 s, and 3 s for a pasted batch during review.
- Every refused term is named with its reason, never dropped or cut short.
- The result card counts per term, from what the engine removed.
- Telemetry counts terms in ranges; C3 is extended and held by a test; only Pricing names the feature; the worker refuses terms on a Free job too.
- Ticks keep working during a search and Make waits; a term change after a copy returns to review; a failed search keeps the review with Try again, and Make waits while a term is not searched.
- Remove all from two terms.
- The owner's gap in the data model: a kept list meeting a job that opened Free is said not searched with the reason, Make waits, and the result card names those terms; Set aside for this file covers both reasons.
- The matcher is our own, in `src/detect`. Scripts without spaces count as joined, unticked.

### Cross check (2026-11-11)

A read only critique on Sonnet 5.5 found the design sound but not yet buildable. Its load bearing claims were checked against the code before they were applied: the client's single operation slot (`src/worker/client.ts`), `endSession` cancelling only `activeRunId` before closing the review copy, the replacement text pass hiding a match under any ordinary target on the page, `pageText` recording line joins only, and no engine code having met overlapping targets.

Applied as recommended: a search as the session's `activeRunId` and one search at a time; reducer payloads carrying `jobId` and batch ids, ticks merged rather than reseeded, `canMake` guarding a run, `removedByTerm` kept on the session; a term's hidden row yielding only to its own term; `breaks` and `lineBreaks` recorded, the hyphen readings at line breaks only; edges judged on the boundary character with case read before the fold; the worker judging each request alone; set aside kept through a retry; an engine test of overlapping ticked targets; the group noun by count; Nothing found to remove only with no rows; a two letter term and the found word list defined in AC-28; the list and the session changed in one handler.

The owner's calls in place of the critique's fixes: marks folded in every script with the `marks` note outside Latin, Greek and Cyrillic (AC-32), and page breaks carried rather than worded (AC-33). Also the owner's: refusals grouped with the first 20 named (AC-4), and the kept line while no document is open (AC-6). Declined: reading a search's `unsupported` as a lost worker.
