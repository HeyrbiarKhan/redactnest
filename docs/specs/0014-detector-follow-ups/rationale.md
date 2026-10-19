# 0014. Detector follow ups: rationale

The decision record for [index.md](index.md). `/develop` reads the spec; this file is for people, and for `/architect` on a later update.

## Context

Spec 0005's detectors were built one rule at a time, and feature 12's four reviews kept finding the same family of miss: a value is hidden, or given the wrong row, by what stands beside it. Three causes sit behind every open item.

**A neighbour's digit group.** The phone detector takes the longest valid window at each unit from left to right and resumes after it. A stray four digit group before a number can form a valid number with the number's first groups by chance (`9346 212 555` is a real Long Island number), so the row takes it and the number's last group is left in the file with no row, beside a row that looks complete. One random group before a US number does this 36% of the time, three groups 45%, and a UK number on the line after a spaced card meets the same cause 11% to 13% of the time. A ticked row that removes the wrong digits and leaves the right ones is the worst shape a miss can take, because the visitor trusts it.

**A footnote marker glued to a value.** MuPDF reads a small raised glyph set flush after a value as glued to it (measured by the third and fourth reviews, and again here), so `Born 12/05/1980¹` reaches the detectors as `12/05/19801`. Feature 12's third update answered it with one digit tolerances for dates with a four digit year, separated Social Security numbers and cards, each with a measured cost on random codes. Email addresses and phone numbers, the release 1 kinds, ticked by default and the most common, were left out, as were dates with a two digit year, bare Social Security numbers and National Insurance numbers with no suffix. And the premise, that a real raised glyph reads as glued, was held by review notes only: every fixture draws its marker as a plain digit on the baseline. One more cost showed up here: a ticked row that holds a raised marker (`27-09-2026¹ 5`, listed as a phone row today) fails the whole run with `redaction-overreach`, because the self check reads a glyph under 0.67 of the row's height as not on its line, and the box would hide it.

**A date inside a phone unit.** The phone detector marks a unit that is a full numeric date so no window holds it (INV-14), but a unit that holds a date plus a marker (`05.12.19801`), or a time's minutes glued to an ISO date by a hyphen (`00-2026-09-28`), is not a date as a whole, so a window forms across it and its neighbour and wins by precedence.

The owner's rule for every detector decision since 2026-10-08: extra unticked rows are fine, missed values are not, and any looser rule needs measured evidence on real MuPDF. Spec 0005 also records two Follow-ups that the code already met (the HMRC prefix citation, and libphonenumber-js in the notices), which only need ticking.

## Options considered

### The phone leak

**Option 1: merge every overlapping valid window into one row (the card's rule).** Where two windows that pass overlap, one row covers both. Pros: the simplest statement, a precedent in `card`, fixes the leak (digits lost 36% to 1.6%). Cons: a window across the middle of two numbers side by side is valid by chance far more often for phones than for cards (no checksum): 60% of random US pairs and 45% of bracketed pairs share one unticked row, so a staff list's column loses most of its ticks.

**Option 2: rescue a stranded unit (chosen).** Valid windows, then possible windows, as today; then a unit both passes left free, which a valid window starting inside a valid row covers, is rescued, and each stretch of rescued units is listed as a row of its own, unticked. (Until 2026-10-17 the stretch joined the nearest row to its left; how a stretch is listed is weighed below.) Pros: loses no digit today keeps in a row, in any string, because it runs last and only adds; every row today lists keeps its end and its tick; no row it lists touches two numbers; changes none of the corpus strings. Cons: a stray group after a UK number lists as an extra unticked row about 12% of the time, because an 8 digit window such as `0958 1234` is valid under the GB metadata; a number cut by a stray group reads as two rows; the chooser gains a third pass.

**Option 3: rescue only with a window at least as long as the row's own.** Option 2 with a guard against short rescuing windows. Pros: rescues fewer stray groups (under the joined row it kept 88% of the UK ticks above; with stretch rows no tick is at stake). Cons: leaves 12% of US numbers leaking with three groups before (6% under option 2), which is a miss, and the owner's rule puts a miss above an extra row.

**Option 4: keep today's chooser and record the leak.** Pros: no change. Cons: the leak is live, in the worst shape a miss can take.

### Where the rescue runs (found in `/develop`, 2026-10-15)

**Option 1: before the possible pass (the first draft).** Pros: a stranded group always joins the valid number beside it, before any possible window is chosen. Cons: it takes units the possible pass would have used, so it can cause a miss today's chooser does not make: `0131 410 5214 020 2977 5777` gives `020` to the first row and leaves `2977 5777` with no row. On the build's layouts, UK numbers side by side lose a digit 6.7% of the time against 5.6% today, and touch one row 7.7% against 5.6%, which breaks AC-1's own bar.

**Option 2: after the possible pass, asking at every unit inside a row.** Pros: by construction it only adds to today's result, so every row today lists keeps its start and its units; the shortest statement. Cons: every unit inside a row asks its windows even with nothing to rescue, so 10,000 US numbers side by side take 609 ms against 172 ms today.

**Option 3: after the possible pass, asking only where a free unit is in reach (chosen).** Pros: the same result as option 2 on every input, since a window holds at most `MAX_WINDOW_DIGITS` digits as written and so cannot cover a free unit further away; numbers side by side cost what they cost today (164 ms against 172 ms). Cons: one more loop to keep honest in the linearity note (it reads at most `MAX_WINDOW_DIGITS` units from each unit); the slowest shapes measured, a stray group beside each US number, take about 16 ms more per 100,000 characters; and it does not cure a miss today's possible pass already makes, which option 1 sometimes cures by accident. Where a stray group sits before a UK number that is only possible, the possible pass takes the longest possible window at the group, so the group and the number's first groups form one row and the number's last group is left bare: `01865 514994 0472 0117 853 0001` lists `01865 514994` and `0472 0117 853` and leaves `0001`, today and under options 2 and 3. Option 1 gives `0472` to the first row before that pass runs, so the pass starts at `0117` and lists `0117 853 0001`. That is the whole of the 0.1 point gap where a stray group sits between two UK numbers (8.5% against 8.4% on the build's layouts, 6.8% against 6.7% in the first round). It is not a loss against today: in every such string today leaves the same digits bare (string by string in *Evidence*). AC-1's bar is measured against today, so it holds, and the miss is recorded in `index.md`'s Follow-up with a candidate fix.

### A rescued group that a date also reads (found by the cross kind check, 2026-10-15)

Phone outranks date in `detect`, so a stretch the rescue joins wins any position a date also holds. When the group after a number is a date's leading digits, the date loses them: `212 918 8665 1119 21 June 2014` lists `212 918 8665 1119 21` and `June 2014`, `+44 20 3149 6135 18/01/1992` lists `+44 20 3149 6135 18` and `/01/1992`. The first draft does the same, slightly more often.

**Option 1: the rescued stretch yields to a date, in `detect` (chosen).** The phone detector marks a joined row with its own window's end and tick; `detect` cuts the row back to where the earliest lower kind span overlapping the rescued stretch begins, and gives back the row's own tick when nothing rescued is left. Pros: no grammar, since the date detector's own reading decides; general over every kind below `phone`; exact, since a lower kind then resolves exactly as today (0 lost positions in 60,000 strings); keeps every rescued group no date holds; fewer ticks lost than without it. Cons: one optional field on `Span` and one step in `detect`; `DETECTORS.phone` alone and `detect` now differ on these strings, so each test must say which it calls.

**Option 2: a guard inside the phone detector, no join of a unit followed by a letter or a slash.** Pros: the phone detector alone; no new field. Cons: it also stops the rescue wherever a word follows the number (`9346 212 555 0123 today`), the commonest case in prose, by construction; and any date form it does not foresee still loses its day.

**Option 3: record it as an exception to AC-1.** Pros: no change. Cons: a date reads `June 2014` or `/01/1992` beside a number in up to 1.8% of such strings, and the number loses its tick; it breaks INV-14's promise that phone never takes a numeric date's digits.

With stretch rows (below) the yield is still needed: a stretch row with no yield takes a date's leading digits in up to 1.83% of a layout's strings, the same as the joined row did (*Evidence*).

### How a rescued stretch is listed (from the owner, 2026-10-17)

The owner's bar: the default never removes less than today. No digit loses a row, no row loses a tick, and the digits ticked by default are at least today's.

**Option 1: join the stretch into the row to its left, unticked (the rule of 2026-10-15).** Pros: one row per number where a stray group cut it, so the row reads as the number. Cons: the joined row had to be unticked, since it may hold a neighbour's digits, so the default removes less than today wherever a rescue fires: `9346 212 555 0123` goes from seven digits removed by default to none, a US number after one to three stray groups is removed less by default in 34.6% to 40.9% of a layout's strings, and beside dates a ticked row of today's loses its tick in up to 8.87% of strings (*Evidence*). It fails the bar.

**Option 2: list each stretch as a row of its own, unticked, in spec 0005's piece shape (chosen).** Pros: every row today's chooser lists is returned untouched, so it keeps exactly its end and its tick, and the default removes at least what it removes today in every string measured; the stretch lists every digit the joined row listed; no row the rescue lists touches two numbers (the joined row did in 37 of 40,000 strings); the chooser is simpler, since a stretch is marked rather than joined and `Span` needs only a flag. Cons: a number cut by a stray group reads as two rows, the first ticked and holding the stray group, the second unticked, so a visitor who ticks nothing keeps the stretch's digits, as today; a stray group after a number is an extra unticked row.

**Option 3: join the stretch and keep the row's own tick.** Pros: one row, and the default removes the whole number. Cons: it would tick, by default, a stray group nobody chose wherever one joins (a reference or account number after a phone number, about 12% of UK numbers with a group after), which INV-2 forbids, and it ticks digits no valid window reads as part of the number.

### The footnote boundary

**Option 1: geometry and code point, read as a join (chosen).** A glyph both smaller than its line's dominant glyphs and shifted off their baseline, or a raw superscript or subscript code point, is off the line; each short glued run of them reads as one synthetic space, none beside whitespace, and a span's quads are parted round such a run. Pros: one rule for every kind; no detector ever meets a real marker; the overreach refusal on a ticked row with a marker cannot recur; measured silent on 78,856 real glyphs and on a Chromium printed table; a full size `¹` glyph is covered by its code point. Cons: four engine constants to keep; the context no longer shows the marker; a row round a raised ordinal is drawn as two boxes; a value drawn small, shifted and glued to a kept glyph, of up to four glyphs, would leave the text (a guard shape no document in hand shows).

**Option 2: geometry only.** Pros: no code point set. Cons: a full size `¹` glyph in a simple font (WinAnsi has one) still folds to `1` and relies on the text rules.

**Option 3: code point only.** Pros: exact and cheap. Cons: the common case, a small raised `1`, has no special code point and still glues.

**Option 4: no boundary, text tolerances only.** Pros: nothing in the engine changes. Cons: email and phone need their own tolerances with their own costs, every future kind too, and the overreach refusal stays.

How an off line stretch reads: as a join (chosen; `27ᵗʰ September 2026` reads `27 September 2026`, `1980¹on` reads `1980 on`), dropped with no space (`1980¹on` reads `1980on`, a glued letter that drops a phone number and unticks a date), or kept as its own text with spaces round it (`27 th September 2026`, which the date detector does not read). The join is the only reading under which every probed case lists.

### The text tolerances once the boundary lands

**Option 1: keep them and add the three measured ones (chosen).** Pros: OCR text and PDFs that draw a marker as a plain digit still list; the three new ones take the fourth review's measured shapes. Cons: their measured noise stays (unticked rows on random codes).

**Option 2: keep them as they are.** Pros: no new noise. Cons: the two digit year, bare Social Security and National Insurance misses stay for OCR text.

**Option 3: retire them.** Pros: cleaner rules. Cons: every OCR'd footnote goes back to giving no row.

### Masking lower kinds

Running each lower kind with a higher kind's positions read as spaces would stop a phone window starting inside a card. Deferred: the rescue already leaves nothing in the file for that case, and masking changes how `detect` runs every kind, so it needs its own measurement against the overlap piece cases (`Call 020 7946 0958@example.com` lists a `020 7946` piece today that masking could change).

## Rationale

The leak decides itself once measured: option 1's 60% shared rows would undo the side by side guarantee spec 0005's AC-27 was built for, and option 3 trades a miss for fewer rows, which the owner's rule forbids. Option 2 loses nothing today's chooser keeps, and, with each stretch a row of its own, its only cost is an extra unticked row on a shape (a UK number then a stray group, or a number cut by a stray group before it) where today's row is still listed as it is today.

Where the rescue runs decides itself the same way. Run last, it can only add to what today's chooser lists, so "no digit today keeps is lost" holds in every string by construction, and the measurement confirms it rather than carrying it. Run first, it competes with the possible pass for the same units and can lose a number today finds, which is a miss, and the owner's rule puts a miss above everything else here. The reach skip changes no result and brings numbers side by side back to today's cost, so it is taken too. The first draft's layouts drew mostly valid numbers, which is why they did not show the cost of running first; the build's layouts draw UK local numbers at random, so about a quarter are only possible, and they did.

The date yield follows from the same bar measured where it matters: through `detect`, not the phone detector alone. Every earlier check ran the phone detector by itself, which cannot see that a rescued group is also a date's day. Option 1 lets the date detector's own reading decide, so it needs no grammar and cannot drift from what that detector reads; option 2 would cost the rescue its commonest case to guard a rarer one, and option 3 leaves a date with fewer digits than today, which is a miss.

How a stretch is listed follows from the owner's bar of 2026-10-17. The rescue exists to give a stranded digit a row; it never had a reason to change a row today's chooser lists. Joining the stretch did change one, and because the joined row could hold a neighbour's digits it had to be unticked, so the default removed less than today exactly where the rescue fired. Listing the stretch as its own row keeps the whole gain (every digit the rescue lists) and drops the whole cost in ticks, by construction: today's rows are returned untouched, and the measurement confirms that in every check rather than carrying it. Keeping the joined row's tick would meet the bar too, but by ticking stray groups nobody chose. What is left is a second row where a visitor once saw one, which the owner's rule, extra unticked rows are fine and missed values are not, accepts.

The boundary was chosen over wider text tolerances because MuPDF hands the engine the two facts a marker is made of, a smaller size and a shifted baseline, exactly and per glyph, while the text rules can only guess from one digit. Both facts together were needed: size alone would drop small print on the baseline (8 pt text inside a 12 pt line, measured as the same line) and shift alone has no margin on OCR layers; together they flagged none of the 78,856 glyphs in every fixture and every local scan. The code point trigger costs one `Set` lookup per character and covers the one shape geometry cannot see. Reading a stretch as a join reuses the line join rule the find step already has, so no detector changes for it. The stretch cap exists because a whole value aligned at its cap height beside larger text is both smaller and raised; no document in hand shows it, so the cap is a guard with a recorded shape rather than a measured rule.

The tolerances stay because the fixtures and OCR output draw exactly the shape the boundary cannot see, and the three additions were already measured by the fourth review at costs the owner's rule accepts.

## Evidence

All scripts are in the session scratchpads (`probe/geom.mjs`, `probe/phone.mjs`, `probe/phone2.mjs`, `probe/flags.mjs` for the first round; `probe/layouts.mjs`, `probe/corpus.mjs` and the `alt` prototype from the build; `check.mjs`, `timing.mjs`, `phone2-all.mjs`, `gap.mjs`, `layouts-gap.mjs`, `cross-kind2.mjs`, `fix-check.mjs` and the `fix` prototype from the update of 2026-10-15; `check-piece.mjs`, `layouts-piece.mjs`, `cross-piece.mjs`, `cross-noyield.mjs`, `shared-piece.mjs`, `timing-piece.mjs`, `uk-losses.mjs`, `uk-first-kinds.mjs`, `plus-alone.mjs` and the `piece`, `noyield` and `joined` prototypes from the update of 2026-10-17); nothing was written in the repository. Each loads the real engine or the real detectors through `jiti` with `@` aliased to `src`. The prototypes are scratch copies of `src/detect` with `chosenIn` replaced; `base` is the repository's own `src/detect`. Seeded random generators, so each run repeats.

### A raised glyph through MuPDF (`geom.mjs`, Helvetica 12 pt, marker as a second text object)

| Case | Same line | Height ratio | Shift (pt) | Rows today |
|---|---|---|---|---|
| `Born 12/05/1980` + 8 pt `1` raised 5 | yes, glued | 0.67 | 5.00 | date ticked |
| `27-09-2026` + marker + ` 5` | yes | 0.67 | 5.00 | phone ticked `27-09-20261 5`; the run refuses with `redaction-overreach` |
| `Tel 020 7946 0958` + marker | yes | 0.67 | 5.00 | none |
| `Mail john@example.com` + marker | yes | 0.67 | 5.00 | none |
| `SSN 123456789` + marker | yes | 0.67 | 5.00 | none |
| `NI AB123456` + marker | yes | 0.67 | 5.00 | none |
| `Born 12/05/80` + marker | yes | 0.67 | 5.00 | none |
| full size U+00B9 glyph (WinAnsi) after `12/05/1980` | yes | 1.00 | 0 | date ticked (NFKC and the text rule) |
| full size U+00B2 after `Tel 020 7946 0958` | yes | 1.00 | 0 | none |
| `27` + raised `th` + ` September 2026` | yes | 0.67 | 5.00 | date unticked `27th September 2026` |
| `H` + lowered `2` + `O 020 7946 0958` | yes | 0.67 | −2.00 | phone ticked |
| `Ref ` + 10 pt `020 7946 0958` + ` end`, same baseline | yes | 0.83 (line median is the number) | 0 | phone ticked |
| the same at 8 pt | yes | 0.67 | 0 | phone ticked |
| all 8 pt, 5.5 pt marker raised 3 | yes | 0.69 | 3.00 | date ticked |
| two glyph marker `10` raised | yes | 0.67 | 5.00 | none |
| 12 pt `1` raised 4 (same size) | yes | 1.00 | 4.00 | date ticked (text rule) |
| Word style 7.8 pt raised 4 | yes | 0.65 | 4.00 | date ticked |
| LaTeX style 7 pt raised 3.4 on 10 pt | yes | 0.70 | 3.40 | date ticked |
| marker at 1.0 pt gap | yes, glued | 0.67 | 5.00 | date ticked |
| marker at 1.5 pt gap | yes, a space between | 0.67 | 5.00 | date ticked |
| marker then a full size `2` glued | yes | 0.67 | 5.00 | none |
| 8 pt `1` on the baseline, glued | yes | 0.67 | 0 | date ticked |
| 16 pt `1` glued | yes | 1.33 | 0 | date ticked |

Reading: the rise and the size ratio come back exactly as drawn; MuPDF keeps the glyph on the line up to a 1 pt gap; a size change alone (the 10 pt and 8 pt lines, the 16 pt glyph) has no shift, and a rise alone (the 12 pt raised 4) has no size change, which is why the rule asks for both.

### The rule's silence on real text (`flags.mjs`, every `tests/fixtures/*.pdf` and the thirteen local scans)

| Rule | Glyphs read | Flagged | Stretches | Longer than 4 | Superscript code points |
|---|---|---|---|---|---|
| height ≤ 0.8 of the line's median and shift ≥ 0.15 of it | 78,856 | 0 | 0 | 0 | 0 |

`superscript.pdf`'s 4 pt `2` sits over the middle of its match on a line of its own, so it is its own line's dominant glyph and is not flagged; it is not glued to anything and spec 0004's refusal still holds for it. The size cap was raised to 0.9 after the Chromium measurement below; no glyph in these files sits between 0.8 and 0.9 with a shift of 0.15 or more (every line is one size, or mixes sizes on one baseline), so the count stands at 0 under the chosen constants; task 6 reruns it on the built code.

### A page printed by Chromium (`chrome.mjs`, Playwright 1.63's Chromium, Arial 12 pt, A4)

An HTML page with the browser's default `<sup>` and `<sub>`, raised ordinals, `<small>` print, a 9 pt span on the same baseline, a table with a 16 pt cell, a 9 pt cell and a 12 pt cell aligned middle, a Times line and a footnote line, printed with `page.pdf()` and read through `walkCharacters`. Ratios are against the line's median height, shifts against the median baseline of the line's tall glyphs, both as fractions of that height.

| Shape | Ratio | Shift | Rows today |
|---|---|---|---|
| `<sup>1</sup>` after `12/05/1980`, `0958`, `example.com`, `123456789`, `AB123456`, the card, `12/05/80`, `05.12.1980`, `27-09-2026` (Arial and Times alike) | 0.83 | 0.35 to 0.36 | date ticked; phone, email, Social Security, National Insurance and two digit year **no row**; card unticked; `05.12.19808 12` and `27-09-20269 5` phone rows (the second ticked, which refuses the run) |
| `<sup>th</sup>`, `<sup>st</sup>` in ordinals | 0.83 | 0.35 | dates listed (the text rule) |
| `<sub>2</sub>` in `H2O` | 0.83 | 0.23 | the number after it listed |
| `<small>` print (the whole stretch, same baseline) | 0.83 (the line's own glyphs are 1.20 against it) | 0.00 | listed |
| 9 pt span on the 12 pt baseline | 0.75 | 0.00 | listed |
| 9 pt table cell aligned middle beside 16 pt and 12 pt cells | 0.75 | 0.06 | listed |
| footnote line opening with `<sup>1</sup>` then a space | 0.83 | 0.35 | the number after it listed |

Reading: a browser's superscript is larger than a word processor's (0.83 against 0.65 to 0.70), so a size cap of 0.8 would miss every PDF printed from a browser; it is raised far more (0.35 against 0.24 to 0.30), so the shift floor of 0.15 holds it with margin. The one shape that is both smaller and shifted without being a marker, the table cell aligned middle, shifts by 0.06, well under the floor. So the constants are 0.9 and 0.15, and six of the eleven marked values on this page, which give no row today, list under the boundary.

### The rescue, restated after the cross check

The valid pass visits every unit outside a chosen row and takes the longest valid window at each, so after it no free unit has a valid window starting at it. Every valid window that covers a free unit therefore starts inside a row and extends it to the right, one pass joins everything a second pass would, and no joined row can be spanned by a valid window (that window would have been the pass's longest choice at the row's start). So a joined row is always unticked, the spanning window test and the reading rule of the first draft were dead, and the rescue is one linear pass. The prototype's figures above were produced by the first draft's rule, which the restated rule equals on every input (the extra tests were never true). The reasoning holds unchanged with the rescue moved after the possible pass: a possible row's units were free after the valid pass, so none of them starts a valid window either, and only units inside valid rows can rescue.

### Why the target quads are parted (soundness finding of the cross check)

`lineQuads` builds one quad per line from the span's first kept character to its last, so for `27ᵗʰ September 2026` the quad would still contain the raised `th`. Target validation (spec 0004, AC-27) then reads `27thSeptember2026` inside the quad against the target's `27September2026` and blocks the row as `unsound-outline`, a regression on a Word document, where typed ordinals are raised by default. One quad per run of kept characters, parted at each off line stretch, keeps validation, the box, the removal band and the self check off the marker, and also settles a marker set between a number's groups.

### Ordinals and markers as the detectors would see them after the join (`flags.mjs`, through today's `detect`)

`27 September 2026`, `1 of May 2026`, `1 May 1990` after `Born` (ticked), `May 3, 2026`, `12/05/1980` after `Born` (ticked), `020 7946 0958` after `Tel`, `john@example.com`, `123456789` after `SSN`, `AB123456` after `NI`, `12/05/80` after `Born` (ticked), `05.12.1980` after `DOB:` then ` 12 High Street` (ticked, no phone row), `27-09-2026 5` (the date, no phone row), `H O 020 7946 0958` (the number) each list as AC-6 asks with no change to any detector.

### The phone choosers (`phone.mjs`, `phone2.mjs`)

Corpus: every string literal holding a digit in `tests/unit/detect*.test.ts` and `scripts/lib/detection-fixtures.mjs`, NFKC normalised, 1,235 strings, through `detect`: **0 change** under the first draft's rule (and 0 under the greedy merge). Rerun in the update of 2026-10-15 under the chosen rule: 0 change on these 1,235, and 0 on the 1,258 the build's extraction finds (it also reads single quoted literals).

Random layouts, 3,000 per cell, seeded. Numbers drawn from real area codes and exchanges (US `3 3 4`, US `(3) 3-4`, UK area plus local, UK `+44`); stray groups are four random digits. "Lost" is any digit of the number with no phone row; "ticked" is the row holding the whole number ticked. "First draft" is the rescue run before the possible pass; "chosen" runs it last, with the reach skip. The last column and the two `+44` rows were added by the rerun of 2026-10-15 (`phone2-all.mjs`, the same seeds), which reproduced every other cell.

| Layout | Shape | Today lost / ticked | Greedy merge | Rescue, first draft | Length guarded | Rescue last, joined (2026-10-15) |
|---|---|---|---|---|---|---|
| 1 group before | US 3 3 4 | 36.3% / 63.7% | 1.6% / 63.7% | 1.6% / 63.7% | 1.6% / 63.7% | 1.6% / 63.7% |
| 1 group before | UK area local | 4.5% / 88.5% | 1.9% / 88.5% | 1.9% / 88.5% | 1.9% / 88.5% | 1.9% / 88.5% |
| 3 groups before | US 3 3 4 | 44.7% / 55.3% | 5.8% / 55.0% | 5.8% / 55.3% | 12.4% / 55.3% | 5.8% / 55.3% |
| 3 groups before | US (3) 3-4 | 6.9% / 93.1% | 0.0% / 93.0% | 0.0% / 93.1% | 6.9% / 93.1% | 0.0% / 93.1% |
| 3 groups before | UK area local | 15.3% / 79.6% | 11.3% / 79.6% | 11.3% / 79.6% | 11.5% / 79.6% | 11.3% / 79.6% |
| 1 group after | UK area local | 0.0% / 91.9% | 0.0% / 80.1% | 0.0% / 80.1% | 0.0% / 87.9% | 0.0% / 80.1% |
| 1 group after | UK +44 | 0.0% / 93.1% | 0.0% / 85.9% | 0.0% / 85.9% | 0.0% / 93.1% | 0.0% / 85.9% |
| 2 groups after | US 3 3 4 | 0.0% / 100% | 0.0% / 99.6% | 0.0% / 99.6% | 0.0% / 99.6% | 0.0% / 99.7% |
| 2 groups after | UK area local | 1.3% / 91.7% | 1.3% / 77.7% | 1.3% / 77.7% | 1.3% / 87.4% | 1.3% / 79.0% |
| 2 groups after | UK +44 | 0.0% / 93.5% | 0.0% / 86.3% | 0.0% / 86.3% | 0.0% / 93.1% | 0.0% / 86.9% |
| `Ref NNNNN` before, group after | US 3 3 4 | 9.3% / 89.9% | 2.7% / 89.9% | 2.7% / 89.9% | 9.3% / 89.9% | 2.7% / 89.9% |
| `Ref NNNNN` before, group after | UK area local | 5.6% / 79.3% | 4.9% / 69.2% | 4.9% / 69.2% | 5.2% / 74.5% | 4.9% / 69.2% |
| `Ref NNNNN` before, group after | UK +44 | 0.0% / 92.6% | 0.0% / 86.0% | 0.0% / 86.0% | 0.0% / 92.6% | 0.0% / 86.0% |

Bracketed US numbers lose nothing and keep every tick in the omitted rows; `+44` numbers lose nothing in any layout under any rule, and the rows where a rescue costs them ticks are all listed (the first draft of this table omitted two of them). The UK numbers' remaining losses (11.3% with three groups before) are explained under *The UK losses the rescue leaves* below: through `detect`, 9.8 of those 11.3 points are digits a chance card holds, and the rest a UK number that is only possible. (This paragraph first said they were a group that forms no valid window with the number; the 2026-10-17 measurement showed that was incomplete.)

Two numbers side by side, 3,000 pairs per cell. "One row" here is one row covering both numbers whole:

| Pair | Shape | Today either lost / both ticked / one row | Greedy merge | Rescue, first draft | Length guarded | Rescue last, joined (2026-10-15) |
|---|---|---|---|---|---|---|
| side by side | US 3 3 4 | 1.3% / 98.7% / 0.0% | 1.3% / 38.9% / 59.8% | 1.3% / 98.7% / 0.0% | 1.3% / 98.7% / 0.0% | 1.3% / 98.7% / 0.0% |
| side by side | US (3) 3-4 | 0.0% / 100% / 0.0% | 0.0% / 55.3% / 44.7% | 0.0% / 100% / 0.0% | 0.0% / 100% / 0.0% | 0.0% / 100% / 0.0% |
| side by side | UK area local | 4.1% / 83.0% / 0.0% | 3.9% / 70.0% / 14.2% | 3.9% / 83.0% / 1.2% | 4.2% / 83.0% / 0.0% | 2.9% / 83.0% / 1.2% |
| a group between | US 3 3 4 | 38.5% / 61.5% / 0.0% | 3.2% / 57.9% / 6.4% | 3.2% / 57.9% / 0.0% | 3.2% / 57.9% / 0.0% | 3.2% / 57.9% / 0.0% |
| a group between | UK area local | 8.4% / 80.0% / 0.0% | 6.7% / 70.1% / 1.6% | 6.7% / 70.1% / 0.0% | 6.9% / 76.1% / 0.0% | 6.8% / 70.1% / 0.0% |
| a group between | UK +44 | 0.0% / 86.6% / 0.0% | 0.0% / 80.4% / 0.0% | 0.0% / 80.4% / 0.0% | 0.0% / 86.6% / 0.0% | 0.0% / 80.4% / 0.0% |

The 1.2% of UK pairs in one row under either rescue are pairs whose second number today has no row at all: its digits join the first number's row, which is then unticked. The first draft of this record called that 0%; the table always showed 1.2%. With stretch rows those digits are a row of their own, and no row touches both numbers (0.0%, below).

Named cases under the joined rule of 2026-10-15 (the stretch rows' are below): `9346 212 555 0123` one unticked row; `0131 410 5214 020 2977 5777` unchanged (`0131 410 5214` ticked, `020 2977 5777` possible and unticked; the first draft gave `020` to the first row and left `2977 5777` with no row); `212 526 5087 020 2208 1633 24` lists `212 526 5087 020` unticked and `2208 1633 24` ticked, through `detect` as through the phone detector alone (today `212 526 5087` ticked and `020` with no row); `Box 2000 212 555 0123` and `Ste 1 212 555 0123` unchanged; `6293 6608 0005 7382 276 020 7946 0958` the card and `020 7946 0958` (unticked, the phone row having been cut by the card); `212 555 0123 9346 415 234 5678` lists `212 555 0123` ticked and `9346 415 234 5678` unticked (today `9346 415 234` ticked and `5678` lost); `020 7946 0958 020 7946 0321`, `212 555 0123 212 555 0124`, `1 212 555 0123`, `Call 020 7946 0958@example.com`, `123 45 6789 1234`, `SSN 223-45-6789¹` and `2026-09-27 10:00-2026-09-28 11:00` unchanged.

Time under the first draft (one run each, this machine): 100,000 characters of four digit groups 162 ms today, 166 ms; 10,000 US numbers side by side 245 ms today, 422 ms, because every unit inside a row asked its windows during the rescue, where today's pass skipped them. The reach skip removes that cost; the figures for the chosen rule are below.

### The rescue's place, found in the build (2026-10-15)

`/develop` built slice 1 to the first draft and measured it on new layouts (`probe/layouts.mjs`) whose UK local numbers are drawn at random after a first digit of 2 to 9, so 26.9% of them are possible but not valid (measured on 20,000 through libphonenumber-js's `max` metadata), where the first round drew mostly valid ones. Those layouts showed the first draft losing more digits than today on UK pairs. The prototype in `alt` moves the rescue after the possible pass and adds the reach skip; it is the chosen rule.

Same layouts, 3,000 per cell, seeded; phone alone. "One row" here is any row touching both numbers, a looser test than the first round's, which is why today already shows 5.6% (a possible window across two numbers' middles). Rows where all three columns agree are omitted.

| Layout | Shape | Today lost / ticked | Rescue, first draft | Rescue last, joined |
|---|---|---|---|---|
| 1 group before | US 3 3 4 | 36.2% / 63.8% | 0.0% / 63.8% | 0.0% / 63.8% |
| 1 group before | UK area local | 4.8% / 71.3% | 3.4% / 71.3% | 3.4% / 71.3% |
| 3 groups before | US 3 3 4 | 40.9% / 59.1% | 0.0% / 59.1% | 0.0% / 59.1% |
| 3 groups before | US (3) 3-4 | 6.0% / 94.0% | 0.0% / 94.0% | 0.0% / 94.0% |
| 3 groups before | UK area local | 6.2% / 72.2% | 3.9% / 72.2% | 3.9% / 72.2% |
| 1 group after | UK area local | 4.2% / 73.5% | 4.2% / 64.2% | 4.2% / 64.2% |
| 1 group after | UK +44 | 8.5% / 73.6% | 8.5% / 64.2% | 8.5% / 64.2% |
| 2 groups after | US 3 3 4 | 0.0% / 100.0% | 0.0% / 99.8% | 0.0% / 99.8% |
| 2 groups after | UK area local | 4.2% / 73.9% | 4.2% / 64.4% | 4.2% / 65.4% |
| 2 groups after | UK +44 | 8.4% / 73.3% | 8.4% / 60.7% | 8.4% / 61.6% |
| `Ref NNNNN` before, group after | US 3 3 4 | 5.7% / 93.6% | 0.0% / 93.6% | 0.0% / 93.6% |
| `Ref NNNNN` before, group after | UK area local | 1.2% / 66.2% | 1.1% / 60.6% | 1.1% / 60.6% |
| `Ref NNNNN` before, group after | UK +44 | 8.6% / 72.4% | 8.6% / 63.2% | 8.6% / 63.2% |

| Pair | Shape | Today either lost / both ticked / one row | Rescue, first draft | Rescue last, joined |
|---|---|---|---|---|
| side by side | UK area local | 5.6% / 53.2% / 5.6% | **6.7%** / 53.2% / **7.7%** | 4.6% / 53.2% / 5.6% |
| a group between | US 3 3 4 | 36.1% / 63.9% / 0.0% | 0.0% / 60.2% / 0.0% | 0.0% / 60.2% / 0.0% |
| a group between | UK area local | 10.0% / 52.4% / 0.5% | 8.4% / 46.0% / 0.8% | 8.5% / 46.0% / 0.5% |
| a group between | UK +44 | 12.5% / 51.8% / 0.0% | 12.5% / 45.8% / 0.0% | 12.5% / 45.8% / 0.0% |

Reading: the first draft is the only rule that ever does worse than today on a digit (the two bold cells), and only where the second number is possible but not valid. Run last, the rescue never does.

The 0.1 point gap in "a group between, UK area local", string by string (`gap.mjs` for the first round, `layouts-gap.mjs` for the build; both replay their generator's exact seeds, and `proto2`, the first round's prototype of the first draft, reproduces the build's 6.7%, 7.7%, 8.4% and 0.8% cells exactly):

| Layouts | Strings where the two rules differ | First draft leaves digits today lists | First draft rescues digits today leaves bare | Of those, bare today too |
|---|---|---|---|---|
| First round (6.7% against 6.8%) | 6, two distinct (the generator draws one five times) | 1: `0161 955 4479 2492 0113 726 7844` (the first draft takes `2492 0113` and leaves `726 7844`) | 5: `01904 58 1578 0451 0117 831 4848` (today and the chosen rule leave `4848`) | 5 of 5 |
| The build (8.4% against 8.5%) | 19 | 8, such as `0113 290 1610 6528 020 2088 1192` (the first draft takes `6528 020` and leaves `2088 1192`) | 11, such as `01865 514994 0472 0117 853 0001` (today and the chosen rule leave `0001`) | 11 of 11 |

Every string the chosen rule loses there, today loses with the same rows. The 11 share one shape: a stray group, then a UK number that is only possible, so the possible pass's longest window at the group takes the number's first groups and strands its last.

Per string (`check.mjs`), under the joined rule: 40,000 seeded strings of one to four numbers (US `3 3 4`, UK area plus local, UK `+44`), each with an optional stray group of two to five digits before it and one at the end. Against today's chooser: 32,269 list the same rows, 7,731 only move a row's end later, and none differs in any other way; none leaves a digit without a row that today puts in one; 37 have a row touching two numbers where today has none, and each such row's added units are units today leaves with no row, as the rule guarantees.

Time (`timing.mjs`): CPU time per call, each sample averaged over at least 300 ms, the median of five, in rotating order, this machine. The build's own single run read 188 ms against 172 ms on the US numbers.

| Shape (100,000 characters unless named) | Today | Rescue last, joined, reach skip | Rescue last, joined, no skip |
|---|---|---|---|
| four digit groups | 25 ms | 25 ms | 23 ms |
| 10,000 US numbers side by side | 172 ms | 164 ms | 609 ms |
| UK numbers side by side | 43 ms | 39 ms | 72 ms |
| US numbers in brackets | 35 ms | 33 ms | 45 ms |
| a stray group, then a US number | 47 ms | 63 ms | 75 ms |
| a US number, then a stray group | 66 ms | 82 ms | 98 ms |
| six digit groups | 24 ms | 26 ms | 26 ms |
| `(0)` groups | 45 ms | 43 ms | 41 ms |

### Through `detect`: the rescue beside dates (`cross-kind2.mjs`, `fix-check.mjs`)

60,000 seeded strings, six layouts drawn at random: a US, UK or `+44` number, an optional stray group of one to four digits, and a date in one of ten forms (`21 June 2014`, `5th of June 2014`, `June 21, 2014`, `June 21 2014`, `21 June`, `18/01/1992`, `05.12.80`, `2026-09-27`, the spaced `05 12 1980`, a day range), sometimes after a birth or date word. Each string through today's `detect` and each rule's. "Positions lost" is a string where some position one of today's rows holds is not held by a row of the same kind; "tick lost" is a string where one of today's ticked phone rows is no longer ticked, which counts the stray group cost AC-2 accepts as well.

| Layout | Strings | First draft: positions lost / tick lost | Rescue last, joined, no yield | Rescue last, joined, with the yield |
|---|---|---|---|---|
| number, date | 10,030 | 0.60% / 1.01% | 0.54% / 0.94% | **0.00%** / 0.40% |
| number, group, date | 9,952 | 1.20% / 9.08% | 0.94% / 8.89% | **0.00%** / 8.87% |
| group, number, date | 9,910 | 2.21% / 10.02% | 1.83% / 9.59% | **0.00%** / 7.78% |
| number, date, number | 10,232 | 1.81% / 6.19% | 1.51% / 5.90% | **0.00%** / 4.47% |
| date, number | 9,958 | 0.00% / 3.52% | 0.00% / 3.52% | 0.00% / 3.52% |
| date, group, number | 9,918 | 0.01% / 5.99% | 0.00% / 5.98% | 0.00% / 5.98% |

Every position lost without the yield is a date's leading digits taken into a phone row: a day before a month name, a day range, or the day before a slash. Under the joined rule, the yield's remaining tick losses beside a date (with stretch rows there are none; the group becomes an extra unticked row) are a spaced numeric date the date detector does not read (`+44 20 8052 7523 16 07 1995` gains ` 16`, 173 of 187 cases in 20,000 number then date strings; the rest gain more of the same spaced digits), which is a stray group to the phone detector. Under the yield, the corpus through `detect` is unchanged (1,258 strings, 0 change), and the named cases list as AC-1 and AC-15 say.

### The cross check of 2026-10-15 (another model, read only)

It found the design sound and the rescue last as simple as it can be, and raised thirteen items. Every one was taken:

1. Which units the rescue asks: named as the units whose row is one of the first `validRows`, start unit and joined units included; AC-14 says the measured timings are an upper bound (AC-1, AC-14, value sourcing).
2. The reach sum: inclusive of both ends, the same cap as `windowsFrom` (AC-1, value sourcing).
3. The reach test ignores date and slash stops on purpose, conservative (AC-1).
4. The join in operational form: the target row starts as the asked unit's and follows each owned unit; it may be a possible row; the order of asking changes nothing (AC-1, value sourcing).
5. The joined row's fields and the final mapping, and the extension after a joined end (data model).
6. AC-2's reason was loose (a valid window from an earlier row can span a later one): reworded to the window from the row's own start, and the untick stated as a decision (AC-2).
7. "A second pass joins nothing" has no test seam: argued in the code comment instead of pinned (AC-1, test scenarios).
8. AC-1's bar now holds the tick as well, unless a rescue joined the row (AC-1).
9. Spec 0005's AC-27 ("no match holds a digit of its neighbour") gains the exception a joined row needs (*Amends spec 0005*).
10. The piece rule for a joined row: the card then UK number case is named as its pin (test scenarios).
11. Consequences now say which round of layouts each figure comes from.
12. AC-14's reach bound is worded as a digit sum.
13. The prototype's `SKIP` switch does not ship (data model, task 1).

The owner's question about the 0.1 point gap, and the check through `detect` it prompted, found the date case above, which became AC-15.

### The rescued stretch as its own row (2026-10-17)

The `piece` prototype is the repository's `src/detect` with `chosenIn`, `detectPhone`, `Span` and `detect` changed as AC-1, AC-2 and AC-15 now say; `joined` is the 2026-10-15 rule (the `fix` copy); `noyield` is `piece` with the yield taken out. Each script replays an earlier script's generator and seed exactly, and the today and joined columns below reproduce every cell of the tables above.

Named cases, rows as listed, a `+` for ticked:

| Text | Today | Joined (2026-10-15) | Stretch rows (chosen) |
|---|---|---|---|
| `9346 212 555 0123` | `9346 212 555`+ | `9346 212 555 0123` | `9346 212 555`+, `0123` |
| `9346 212 555 0123 ext. 45` | `9346 212 555`+ | `9346 212 555 0123 ext. 45` | `9346 212 555`+, `0123 ext. 45` |
| `212 526 5087 020 2208 1633 24` | `212 526 5087`+, `2208 1633 24`+ | `212 526 5087 020`, `2208 1633 24`+ | `212 526 5087`+, `020`, `2208 1633 24`+ |
| `212 555 0123 9346 415 234 5678` | `212 555 0123`+, `9346 415 234`+ | `212 555 0123`+, `9346 415 234 5678` | `212 555 0123`+, `9346 415 234`+, `5678` |
| `6293 6608 0005 7382 276 020 7946 0958`, through `detect` | card+, phone `020`+ | card+, phone `020 7946 0958` | card+, phone `020`+, phone `7946 0958` |
| `212 918 8665 1119 21 June 2014`, through `detect` | `212 918 8665`+, date | `212 918 8665 1119`, date | `212 918 8665`+, `1119`, date |
| `+44 20 3149 6135 18/01/1992`, through `detect` | `+44 20 3149 6135`+, date | `+44 20 3149 6135`+, date | `+44 20 3149 6135`+, date (the stretch `18` dropped) |

`0131 410 5214 020 2977 5777`, `01865 514994 0472 0117 853 0001`, `Box 2000 212 555 0123`, `Ste 1 212 555 0123`, `1 212 555 0123`, the two side by side pairs, `Call 020 7946 0958@example.com`, `123 45 6789 1234`, `SSN 223-45-6789¹`, `2026-09-27 10:00-2026-09-28 11:00` and `212 555 0123 9346 21 June 2014` list exactly today's rows under all three rules. Through `DETECTORS.phone` alone the stretch rows list `1119 21` and `18` whole.

Per string (`check-piece.mjs`, `check.mjs`'s 40,000 strings). Phone alone, 32,269 list today's rows and 7,731 add rows; through `detect`, 32,486 and 7,514. In both, 0 strings where a row of today's changes its start, its end or its tick; 0 where a digit today puts in a row loses it; 0 where the digits in ticked rows are not a superset of today's; 0 where an added row overlaps one of today's; and the digits in rows equal the joined rule's in every string (0 fewer, 0 more). The ticked digits exceed the joined rule's in 7,731 strings alone and 7,585 through `detect`. `shared-piece.mjs`, the same strings with each number's place: no added row touches two numbers (the joined rule made 37 such rows); in 1,044 an added row holds a next number's first digits where today leaves them with no row, as `020` above.

Corpus: 1,258 strings through `detect`, 0 change.

Both rounds' layouts (`layouts-piece.mjs`), 3,000 per cell, the same seeds. "Below today" is a string where some digit of the number sits in a ticked row today and in none after, so the default removes less. Cells where all three rules agree are omitted; under stretch rows the ticked and below today columns are today's in every cell, and so is "whole by default" (every digit in a ticked row), not shown.

First round, through `detect`:

| Layout | Shape | Today lost / ticked | Joined lost / ticked / below today | Stretch rows (chosen) lost / ticked / below today |
|---|---|---|---|---|
| 1 group before | US 3 3 4 | 36.3% / 63.7% | 1.6% / 63.7% / 34.6% | 1.6% / 63.7% / 0.0% |
| 1 group before | UK area local | 4.5% / 88.5% | 1.9% / 88.5% / 2.6% | 1.9% / 88.5% / 0.0% |
| 3 groups before | US 3 3 4 | 44.7% / 55.3% | 5.8% / 55.3% / 39.8% | 5.8% / 55.3% / 0.0% |
| 3 groups before | US (3) 3-4 | 6.9% / 93.1% | 0.0% / 93.1% / 6.9% | 0.0% / 93.1% / 0.0% |
| 3 groups before | UK area local | 15.3% / 79.6% | 11.3% / 79.6% / 4.2% | 11.3% / 79.6% / 0.0% |
| 1 group after | UK area local | 0.0% / 91.9% | 0.0% / 80.1% / 11.9% | 0.0% / 91.9% / 0.0% |
| 1 group after | UK +44 | 0.0% / 93.1% | 0.0% / 85.9% / 7.2% | 0.0% / 93.1% / 0.0% |
| 2 groups after | US 3 3 4 | 0.0% / 100.0% | 0.0% / 99.7% / 0.3% | 0.0% / 100.0% / 0.0% |
| 2 groups after | UK area local | 1.3% / 91.7% | 1.3% / 79.0% / 12.8% | 1.3% / 91.7% / 0.0% |
| 2 groups after | UK +44 | 0.0% / 93.5% | 0.0% / 86.9% / 6.6% | 0.0% / 93.5% / 0.0% |
| Ref NNNNN before, group after | US 3 3 4 | 9.3% / 89.9% | 2.7% / 89.9% / 6.6% | 2.7% / 89.9% / 0.0% |
| Ref NNNNN before, group after | UK area local | 5.6% / 79.3% | 4.9% / 69.2% / 10.9% | 4.9% / 79.3% / 0.0% |
| Ref NNNNN before, group after | UK +44 | 0.0% / 92.6% | 0.0% / 86.0% / 6.6% | 0.0% / 92.6% / 0.0% |

| Pair | Shape | Today either lost / both ticked / one row | Joined, the same / either below today | Stretch rows (chosen), the same / either below today |
|---|---|---|---|---|
| side by side | UK area local | 4.1% / 83.0% / 0.0% | 2.9% / 83.0% / 1.2% / 2.0% | 2.9% / 83.0% / 0.0% / 0.0% |
| a group between | US 3 3 4 | 38.5% / 61.5% / 0.0% | 3.2% / 57.9% / 0.0% / 39.4% | 3.2% / 61.5% / 0.0% / 0.0% |
| a group between | UK area local | 8.4% / 80.0% / 0.0% | 6.8% / 70.1% / 0.0% / 13.0% | 6.8% / 80.0% / 0.0% / 0.0% |
| a group between | UK +44 | 0.0% / 86.6% / 0.0% | 0.0% / 80.4% / 0.0% / 6.9% | 0.0% / 86.6% / 0.0% / 0.0% |

The build, phone alone:

| Layout | Shape | Today lost / ticked | Joined lost / ticked / below today | Stretch rows (chosen) lost / ticked / below today |
|---|---|---|---|---|
| 1 group before | US 3 3 4 | 36.2% / 63.8% | 0.0% / 63.8% / 36.2% | 0.0% / 63.8% / 0.0% |
| 1 group before | UK area local | 4.8% / 71.3% | 3.4% / 71.3% / 1.4% | 3.4% / 71.3% / 0.0% |
| 3 groups before | US 3 3 4 | 40.9% / 59.1% | 0.0% / 59.1% / 40.9% | 0.0% / 59.1% / 0.0% |
| 3 groups before | US (3) 3-4 | 6.0% / 94.0% | 0.0% / 94.0% / 6.0% | 0.0% / 94.0% / 0.0% |
| 3 groups before | UK area local | 6.2% / 72.2% | 3.9% / 72.2% / 2.3% | 3.9% / 72.2% / 0.0% |
| 1 group after | UK area local | 4.2% / 73.5% | 4.2% / 64.2% / 9.3% | 4.2% / 73.5% / 0.0% |
| 1 group after | UK +44 | 8.5% / 73.6% | 8.5% / 64.2% / 9.4% | 8.5% / 73.6% / 0.0% |
| 2 groups after | US 3 3 4 | 0.0% / 100.0% | 0.0% / 99.8% / 0.2% | 0.0% / 100.0% / 0.0% |
| 2 groups after | UK area local | 4.2% / 73.9% | 4.2% / 65.4% / 8.6% | 4.2% / 73.9% / 0.0% |
| 2 groups after | UK +44 | 8.4% / 73.3% | 8.4% / 61.6% / 11.7% | 8.4% / 73.3% / 0.0% |
| Ref NNNNN before, group after | US 3 3 4 | 5.7% / 93.6% | 0.0% / 93.6% / 5.7% | 0.0% / 93.6% / 0.0% |
| Ref NNNNN before, group after | UK area local | 1.2% / 66.2% | 1.1% / 60.6% / 5.8% | 1.1% / 66.2% / 0.0% |
| Ref NNNNN before, group after | UK +44 | 8.6% / 72.4% | 8.6% / 63.2% / 9.2% | 8.6% / 72.4% / 0.0% |

| Pair | Shape | Today either lost / both ticked / one row | Joined, the same / either below today | Stretch rows (chosen), the same / either below today |
|---|---|---|---|---|
| side by side | UK area local | 5.6% / 53.2% / 5.6% | 4.6% / 53.2% / 5.6% / 3.2% | 4.6% / 53.2% / 5.6% / 0.0% |
| a group between | US 3 3 4 | 36.1% / 63.9% / 0.0% | 0.0% / 60.2% / 0.0% / 39.8% | 0.0% / 63.9% / 0.0% / 0.0% |
| a group between | UK area local | 10.0% / 52.4% / 0.5% | 8.5% / 46.0% / 0.5% / 10.0% | 8.5% / 52.4% / 0.5% / 0.0% |
| a group between | UK +44 | 12.5% / 51.8% / 0.0% | 12.5% / 45.8% / 0.0% / 8.5% | 12.5% / 51.8% / 0.0% / 0.0% |

Through `detect` beside dates (`cross-piece.mjs`, `cross-noyield.mjs`, `cross-kind2.mjs`'s 60,000 strings). "Ticked row changed" is any ticked row of today's, of any kind, not listed with the same start, end and tick; "less than today" is a string whose ticked positions are not a superset of today's.

| Layout | Strings | Joined with the yield: tick lost / less than today | Stretch rows, no yield: positions lost | Stretch rows with the yield (chosen): positions lost / ticked row changed / less than today |
|---|---|---|---|---|
| number, date | 10,030 | 0.40% / 0.40% | 0.54% | 0.00% / 0.00% / 0.00% |
| number, group, date | 9,952 | 8.87% / 8.87% | 0.94% | 0.00% / 0.00% / 0.00% |
| group, number, date | 9,910 | 7.78% / 7.78% | 1.83% | 0.00% / 0.00% / 0.00% |
| number, date, number | 10,232 | 4.47% / 4.47% | 1.51% | 0.00% / 0.00% / 0.00% |
| date, number | 9,958 | 3.52% / 3.52% | 0.00% | 0.00% / 0.00% / 0.00% |
| date, group, number | 9,918 | 5.98% / 5.98% | 0.00% | 0.00% / 0.00% / 0.00% |

Every position the stretch rows lose with no yield is a date's leading digits (`212 918 8665 1119 21 June 2014` lists `1119 21` and `June 2014`; `2389 +44 20 3149 6135 18/01/1992` lists `18` and `/01/1992`), which is why the yield stays. With the yield, the strings whose rows differ from today's are the same under both rules, 0.40% to 8.87% by layout; under stretch rows each difference is an added unticked row.

Time (`timing-piece.mjs`), `timing.mjs`'s shapes and method, CPU time per call, the median of five samples each averaged over at least 300 ms, rotating order, this machine (which runs today's figures faster than the machine of 2026-10-15):

| Shape (100,000 characters unless named) | Today | Stretch rows, reach skip (chosen) | Stretch rows, no skip | Joined, reach skip |
|---|---|---|---|---|
| four digit groups | 27 ms | 26 ms | 25 ms | 25 ms |
| 10,000 US numbers side by side | 120 ms | 125 ms | 453 ms | 125 ms |
| UK numbers side by side | 26 ms | 26 ms | 45 ms | 27 ms |
| US numbers in brackets | 22 ms | 22 ms | 33 ms | 23 ms |
| a stray group, then a US number | 31 ms | 47 ms | 57 ms | 41 ms |
| a US number, then a stray group | 31 ms | 45 ms | 52 ms | 43 ms |
| six digit groups | 15 ms | 16 ms | 15 ms | 14 ms |
| (0) groups | 22 ms | 22 ms | 22 ms | 21 ms |

Every shape of `tests/unit/detect-adversarial.test.ts` (80 read from its list) through the phone detector alone, one call each, then the heaviest timed the same way as above:

| Adversarial shape | Today | Stretch rows (chosen) | Joined |
|---|---|---|---|
| random groups of one to three digits | 360 ms | 547 ms | 484 ms |
| random one and two digit groups | 266 ms | 547 ms | 578 ms |
| single digit groups | 235 ms | 235 ms | 203 ms |
| single zeros | 328 ms | 273 ms | 344 ms |
| repeated 00 prefixes | 120 ms | 115 ms | 125 ms |
| two digit groups | 94 ms | 86 ms | 90 ms |
| repeated 011 prefixes | 66 ms | 63 ms | 66 ms |
| digits split by spaces | 43 ms | 44 ms | 41 ms |
| cards beside their expiry | 45 ms | 47 ms | 43 ms |
| one long run of four digit groups | 31 ms | 31 ms | 37 ms |
| UK numbers side by side | 30 ms | 31 ms | 31 ms |
| US numbers side by side | 30 ms | 31 ms | 30 ms |

Reading: the reach skip keeps numbers side by side at today's cost. Where nearly every unit inside a row has a free unit in reach, as in random one to three digit groups, the rescue asks most units' windows and the time grows by half to double, under either rule; the worst, about 547 ms, is within AC-16's 2 s. One call each put the worst at 282 ms today and 562 ms with stretch rows.

### The UK losses the rescue leaves (2026-10-17)

`uk-losses.mjs` replays the layouts above and classifies every string that still loses a digit under stretch rows; `uk-first-kinds.mjs` counts the first round's cell over rows of every kind; `plus-alone.mjs` draws 20,000 `+44` numbers the build's way with a new seed. A number's verdict is libphonenumber-js's `max` metadata on the number alone.

| Cell | Lose, stretch rows (today) | Same digits as today | Cause |
|---|---|---|---|
| Three groups before a UK area number, first round, through `detect` | 11.3% (15.3%) | 329 of 339; the other 10 lose fewer | 9.8 points: the stray groups and the number's head read as a card that passes the Luhn check by chance (300 of 3,000 strings hold a card), and card outranks phone, so those digits are in a card row and the rest in a phone piece; nothing is left without a row. 1.5 points (5.8 today): no row of any kind, the build's cause below. |
| Three groups before a UK area number, the build, phone alone | 3.9% (6.2%) | 118 of 118 | Every number is only possible. A window starting at a stray group takes its head and the last group is left: a possible window, unticked (92 strings; `6156 2500 1764 020 6393 7381` lists `1764 020 6393`, read as a US number with its trunk `1`, and leaves `7381`), or a valid one, ticked (26; `7411 7028 0901 020 2045 9229` lists `0901 020 2045`, a UK `09` number, and leaves `9229`). The rescue follows only valid windows, and the number's own window is only possible. |
| A `+44` number then a group, the build | 8.5% (8.5%) | 255 of 255 | Every number is only possible, and its `+44` (for `01632`, its area code too) is left: the valid pass finds no valid window from the `+`, moves on and takes a valid US reading of what follows, ticked. 137 strings read the number's own national digits as US (`+44 20 2350 8363` lists `20 2350 8363`, the US number 202 350 8363, and leaves `+44`); 118 read an `01632` number's local digits and the stray group as US (`+44 1632 833 546 5086` lists `833 546 5086` and leaves `+44 1632`). |
| Two `+44` numbers with a group between, the build | 12.5% (12.5%) | 271 of 271 (first number), 116 of 116 (second) | The same cause, in each number's own run: the first number loses 9.0% (136 strings its `+44` to its own digits read as US, 135 its `+44 1632` to a US reading that takes the group between), the second 3.9% (all its `+44`). |
| A `+44` number alone, 20,000 drawn the build's way | 4.0% | (no rescue applies) | 27.4% of these numbers are only possible, and every one that loses its `+44` is one of them. With a group after, 8.7%. |

Reading: no string in these cells loses a digit the rescue could have kept under AC-1's rule, and none loses more than today. The losses differ in weight. The `+44` cells leave the country code, and for an `01632` number the area code, while the subscriber's digits sit in a ticked row. The three groups cells leave a number's last group, the subscriber's own digits, beside a row that holds the rest. Both need the number to be only possible under the metadata, which a number in an allocated range is not; the first round's `+44` numbers, drawn after `20 7`, `20 3`, `161` and `113`, never lose a digit.

### The cross check of 2026-10-17 (another model, read only)

It found the stretch row design sound: rows the two passes choose are untouched, a stretch never overlaps a row or crosses a slash, the reach skip and the choice not to ask units in possible rows change no result, and the yield cannot change a lower kind's resolution. It raised eight gaps, each taken on the owner's word:

1. A stretch's `reading` had no stored source; it is now the reading of the row owning the unit just before the stretch, which is always owned (AC-2, value sourcing).
2. The yield trimmed only whitespace, so `212 918 8665 1119-21 June 2014` listed `1119-`; it now trims back to the last letter or digit (AC-15). Rerun with the prototype changed to match: every figure in *The rescued stretch as its own row* is unchanged (0 on every bar, the corpus unchanged), and that string lists `1119`.
3. Which lower spans the yield reads: those kinds' spans as their detectors return them, sorted by start, against the stretch's full end, extension included; a stretch that begins inside one is dropped (AC-15, value sourcing).
4. `rescued` is removed by destructuring before precedence, so no piece `freeStretches` builds carries it (AC-15).
5. The "rows equal today's" pin needs a baseline once the chooser is rebuilt: today's rows are written as literals, and the reach skip is pinned by today's parse count on numbers side by side (test scenarios, task 2).
6. The extension argument is now the real one: a row with a unit after it has no extension, and a stretch is never a run's first unit, so it never starts inside an extension's digits (data model; `212 555 0123 ext. 4567 212 555 0124` pinned unchanged).
7. `MAX_PARSES_PER_GROUP` still bounds each start; the total grows only by the starts the rescue asks (AC-14).
8. Pins for a stretch a higher kind takes whole (`9346 212 555 0123@example.com`, the stretch dropped), one beside an IBAN (`0123` kept, unticked) and one with an extension (`0123 ext. 45`) (test scenarios).

It also suggested that AC-1's "none of the 1,258 strings changes" was too strong, since the rescue adds rows; it was measured (0 of 1,258 change through `detect`), so it stands.

### The rescue as built (2026-10-19, task 2)

The same scripts as *The rescued stretch as its own row* and *The UK losses the rescue leaves*, with today read from a copy of `src/detect` taken before the build and the stretch rows column read from the built `src/detect`. The built code differs from the `piece` prototype in three ways that change no row: a stretch carries the reading of the row just before it (never read), the yield is one sweep rather than a scan of every date per stretch, and no switch ships.

- Named cases: every case in the table above lists the same rows, phone alone and through `detect`, and so do the strings listed under it.
- Per string (`check-piece.mjs`, 40,000 strings): phone alone 32,269 the same and 7,731 adding rows; through `detect` 32,486 and 7,514; 0 on every bar (a row of today's changed, a tick lost, a digit lost, the default below today, an added row over one of today's). Corpus: 1,258 strings through `detect`, 0 change.
- Both rounds' layouts (`layouts-piece.mjs`): every cell equals the stretch rows column above, the below today column 0.0% in every cell.
- Beside dates (`cross-piece.mjs`, 60,000 strings): 0.00% positions lost, 0.00% ticked rows changed and 0.00% below today in all six layouts; rows differ from today's in 0.40% to 8.87%, as above, each an added unticked row.
- The UK losses (`uk-losses.mjs`): every cell as recorded, every losing string losing the same digits as today.
- Parses (`tests/unit/detect-adversarial.test.ts`): 2,000 seeded US numbers side by side parse 2,000 times before the build and after; with the reach test switched off, 5,827.

Time, `timing.mjs`'s method on this machine, today against the built code: four digit groups 26 ms and 26 ms; 10,000 US numbers side by side 125 ms and 120 ms; UK numbers side by side 26 ms and 24 ms; US numbers in brackets 22 ms and 24 ms; a stray group then a US number 31 ms and 47 ms; a US number then a stray group 31 ms and 47 ms; six digit groups 15 ms and 14 ms; `(0)` groups 20 ms and 22 ms. The heaviest adversarial shapes: random one and two digit groups 266 ms and 546 ms, random groups of one to three digits 242 ms and 391 ms, single digit groups 195 ms and 188 ms, single zeros 172 ms and 180 ms; every other shape within a few milliseconds of today. All within AC-16's 2 s; `tests/unit/detect-adversarial.test.ts` passes alone with the three rescue shapes added.

### The boundary as built (2026-10-19, tasks 4 to 6)

`flags-built.mjs` reads every page with the built `offLineGlyphs`, as `flags.mjs` read them; `markers.mjs` reads a file through the engine's open and find step.

- The flag count. Every committed fixture, 81 files and 75,365 solid glyphs: glyphs off their line only in `detect-markers.pdf`, its 25 markers and raised letters, and none anywhere else. The thirteen local scans, 4,135 glyphs: none. `tests/unit/detection.test.ts` now holds the fixture half of this.
- The Chromium page of *A page printed by Chromium*: 19 glyphs off their line, every one a `<sup>` or `<sub>` glyph (the nine markers after values, the ordinals' four letters, the `H₂O` subscript, the four Times marker glyphs and the footnote line's opening marker); none in the table cells, the small print or the 9 pt span. All eleven marked values now list, where six gave no row before. The footnote line's opening marker has a space after it and the label before it, so it is glued to nothing and stays.
- `detect-markers.pdf`: every row as AC-6 names it, each with its tick and its `after` past the marker, and the two ordinal rows with two quads each. The fixture's `H₂O` line lowers its `2` by 2 pt on 12 pt Helvetica, 0.12 of the line's height, under the 0.15 floor, so that `2` stays in the text; the number after it lists, ticked, as AC-6 asks. Chromium's `<sub>` sits 0.23 off and leaves.
- `SUPERSCRIPT_CODE_POINTS` holds 114 code points: the 127 in AC-5's ranges less the 13 that NFKC folds to no letter or digit (U+207A to U+207E and U+208A to U+208E, the raised and lowered `+ − = ( )`) or that are unassigned (U+2072, U+2073, U+208F), which the pin of AC-5 would otherwise fail on.
- Time: `findMatches` on `detect-dense.pdf` (50 pages, 2,200 matches), CPU on this machine, the median of ten: 782 ms and 797 ms before the boundary, 812 ms and 875 ms after, in two runs.

### The text rules as built (2026-10-19, tasks 7 and 8)

`corpus-units.mjs` reads the corpus (every string literal holding a digit in `tests/unit/detect*.test.ts` and `scripts/lib/detection-fixtures.mjs`, NFKC normalised, the build's extraction) through `detect`, before slice 3 and after; `measure-ac9.mjs` reads 20,000 seeded random codes per shape through each kind's own detector.

- AC-3 alone, on 1,349 strings: 4 change, all the ISO interval with plain times (`2026-09-27 10:00-2026-09-28 11:00` and its kin), whose phone row `00-2026-09-28 11` goes and whose second date lists. With the two digit year mirror taken out the same 4 change, so the corpus cannot tell the mirror in from out; it stays, mirrored from AC-9, so that a two digit year date the date detector lists with its marker is never also a phone unit (`Born 05-12-801 2345 x` listed `05-12-801 2345` as a phone row before and lists `05-12-80`, ticked, after).
- One cost: `00-2026-09-28 11` on its own, an expected row's text in a test rather than an input, and `Ref 00-2026-09-28-11 here` lose their unticked phone row, and the date detector does not read a date glued after `00-` either, so those digits now have no row. Nothing ticked is lost.
- All of slice 3, on 1,388 strings: 31 change, every one intended: AC-3's eleven dates and intervals now list as dates where they were phone rows, AC-9's marked values list (dates ticked after a birth word, Social Security and National Insurance numbers unticked), the near miss `AB1234567` lists `AB123456` unticked, and `05.12.198` lists `05.12.19` unticked, a three digit year read as a two digit one and its marker, the random `NN.NN.NNN` shape below.

| Kind | Shape | Listed before | Listed after | Ticked after |
|---|---|---|---|---|
| date | `NN/NN/NNN` | 0.0% | 6.1% | 0.0% |
| date | `NN-NN-NNN` | 0.0% | 5.9% | 0.0% |
| date | `NN.NN.NNN` | 0.0% | 5.7% | 0.0% |
| date | `NN.NN.NN.N` | 0.0% | 5.7% | 0.0% |
| date | `N.N.NNN`, `N.NN.NNN` | 0.0% | 0.0% | 0.0% |
| date | `NN/NN/NNNN` (control) | 0.1% | 0.1% | 0.0% |
| us-ssn | ten digits after `SSN ` | 0.0% | 89.0% | 0.0% |
| us-ssn | eleven digits after `SSN `; ten with no word | 0.0% | 0.0% | 0.0% |
| uk-nino | two letters, seven digits | 0.0% | 55.0% | 0.0% |
| uk-nino | two letters, seven digits, a letter; tracking `AB123456789GB`; two letters, eight digits | 0.0% | 0.0% | 0.0% |

Reading: the two digit year and the bare Social Security tolerances cost what the spec expected (6.4% to 6.7% and 89.1% before, on other seeds). The National Insurance one costs more than any other: every two letter, seven digit code whose prefix HMRC's rules allow, about 55% of random ones, now lists an unticked row, since one digit with nothing after it is exactly how NFKC reads `AB123456¹`. Nothing it adds is ticked, and two digits or anything alphanumeric after the seventh still list nothing. A bare Social Security run whose ten digits are also a valid US phone number (`SSN 3141592651`) lists the number unticked and, through `detect`, its marker as an unticked phone piece, the bare form of the separated case spec 0005 pins; before, the whole run was one unticked phone row.

### The phone budget on the CI runner (2026-10-19, task 13)

AC-11's step, the last in the `checks` job of `.github/workflows/ci.yml`, runs `tests/unit/detect-adversarial.test.ts` alone on one worker with Vitest's verbose reporter, which prints each test's wall time in the log.

- Source: CI run #181 (https://github.com/HeyrbiarKhan/redactnest/actions/runs/39201379578), job "Lint, format, types, unit tests", on commit `bd30169`, runner `ubuntu-latest` (GitHub hosted), 2026-10-19. 1,248 of 1,248 tests passed, and the step took 143.73 s.
- Why this run and not a pull request's: AC-11 asks for the pull request's own run, but `ci.yml` runs on push only (`on: push`), so a pull request never gets a run of its own. Run #181 is the run the pull request will show for this commit.
- What the figure is: the wall time of one `finishes within its budget` test, which builds its 100,000 characters and calls the detector once, on one worker with nothing beside it. The test itself asserts CPU time against the budget, and it passed on every shape.

| Phone shape | Wall time on the runner |
|---|---|
| random one and two digit groups | 946 ms |
| random groups of one to three digits | 622 ms |
| single digit groups | 291 ms |
| single zeros | 252 ms |

The worst `finishes within its budget` time of every other detector, each against its 1 s budget: date 98 ms, card 71 ms, iban 48 ms, us-ssn 37 ms, email 20 ms, uk-nino 13 ms.

Reading: the Follow-up's line was 0.5 s, under which the 1 s phone budget would go back to `/architect`. The worst phone time is 946 ms, so the 2 s budget stands. On the runner the heaviest shape takes about half of the 2 s budget, and a 1 s budget would leave it 54 ms of room. It is also about 1.7 times the 547 ms this machine measured for the same shape (AC-14; 546 ms on the built code), so a budget read from this machine would be too tight for CI. The rescue is what brought it there: before it, the same shape took 266 ms on this machine. The same figure answers spec 0005's Follow-up item on the CI runner, since 946 ms is not well under 1 s.

### Carried from the fourth review (not remeasured here)

The date plus one digit unit rule: 0 of 1,102 strings change; the four stolen examples become date rows; the phone side loses only a unit shaped like a real date plus one digit (about 0.1% of random `NN-NN-NNNNN` units). The two digit year tolerance with both leading groups of two digits: 6.4% to 6.7% unticked dates on random `NN?NN?NNN` codes, 0.0% on `N.N.NNN` and `N.NN.NNN`; 2 of 1,102 strings change, both pins. The bare Social Security tolerance: 3 of 1,102 strings change, all pins; 89.1% of random ten digit runs after `SSN ` list an unticked row. The real raised marker: glued at gaps up to 1.0 pt at 8 and 7 pt and 0.5 pt at 6.5 pt.

### Measured in the build

Nothing the build owed is left to measure. The National Insurance tolerance on random codes (task 8) is in *The text rules as built*, and so is the year first cut rule against the side by side cases (task 7): the corpus holds spec 0005's AC-27 cases, and AC-3 alone changes only the ISO intervals. The corpus rerun on the built code is in *The rescue as built* (task 2) and *The text rules as built* (task 7), the flag count in *The boundary as built* (task 6), and the CI figure in *The phone budget on the CI runner* (task 13).
