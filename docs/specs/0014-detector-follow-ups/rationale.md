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

**Option 2: rescue a stranded unit (chosen).** Valid windows as today; then a free unit that a valid window covers, where that window overlaps a chosen row, joins that row over the free units contiguous with it. Pros: loses no digit anywhere today keeps one; pairs never share a row (0%); changes none of the 1,235 corpus strings; the joined row starts unticked unless one valid number spans it. Cons: a UK number with a stray group after it lists unticked 12% of the time with the group in its row, because an 8 digit window such as `0958 1234` is valid under the GB metadata; the chooser gains a second pass.

**Option 3: rescue only with a window at least as long as the row's own.** Option 2 with a guard against short rescuing windows. Pros: keeps 88% of the UK ticks above. Cons: leaves 12% of US numbers leaking with three groups before (6% under option 2), which is a miss, and the owner's rule puts a miss above a tick.

**Option 4: keep today's chooser and record the leak.** Pros: no change. Cons: the leak is live, in the worst shape a miss can take.

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

The leak decides itself once measured: option 1's 60% shared rows would undo the side by side guarantee spec 0005's AC-27 was built for, and option 3 trades a miss for a tick, which the owner's rule forbids. Option 2 loses nothing today's chooser keeps, in every layout measured, and its only cost is a tick on a shape (a UK number then a stray group) where the row still holds the number.

The boundary was chosen over wider text tolerances because MuPDF hands the engine the two facts a marker is made of, a smaller size and a shifted baseline, exactly and per glyph, while the text rules can only guess from one digit. Both facts together were needed: size alone would drop small print on the baseline (8 pt text inside a 12 pt line, measured as the same line) and shift alone has no margin on OCR layers; together they flagged none of the 78,856 glyphs in every fixture and every local scan. The code point trigger costs one `Set` lookup per character and covers the one shape geometry cannot see. Reading a stretch as a join reuses the line join rule the find step already has, so no detector changes for it. The stretch cap exists because a whole value aligned at its cap height beside larger text is both smaller and raised; no document in hand shows it, so the cap is a guard with a recorded shape rather than a measured rule.

The tolerances stay because the fixtures and OCR output draw exactly the shape the boundary cannot see, and the three additions were already measured by the fourth review at costs the owner's rule accepts.

## Evidence

All scripts are in the session scratchpad (`probe/geom.mjs`, `probe/phone.mjs`, `probe/phone2.mjs`, `probe/flags.mjs`); nothing was written in the repository. Each loads the real engine or the real detectors through `jiti` with `@` aliased to `src`. The prototypes are scratch copies of `src/detect` with `chosenIn` replaced; `base` is the repository's own `src/detect`. Seeded random generators, so each run repeats.

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

The valid pass visits every unit outside a chosen row and takes the longest valid window at each, so after it no free unit has a valid window starting at it. Every valid window that covers a free unit therefore starts inside a row and extends it to the right, one pass joins everything a second pass would, and no joined row can be spanned by a valid window (that window would have been the pass's longest choice at the row's start). So a joined row is always unticked, the spanning window test and the reading rule of the first draft were dead, and the rescue is one linear pass. The prototype's figures above were produced by the first draft's rule, which the restated rule equals on every input (the extra tests were never true).

### Why the target quads are parted (soundness finding of the cross check)

`lineQuads` builds one quad per line from the span's first kept character to its last, so for `27ᵗʰ September 2026` the quad would still contain the raised `th`. Target validation (spec 0004, AC-27) then reads `27thSeptember2026` inside the quad against the target's `27September2026` and blocks the row as `unsound-outline`, a regression on a Word document, where typed ordinals are raised by default. One quad per run of kept characters, parted at each off line stretch, keeps validation, the box, the removal band and the self check off the marker, and also settles a marker set between a number's groups.

### Ordinals and markers as the detectors would see them after the join (`flags.mjs`, through today's `detect`)

`27 September 2026`, `1 of May 2026`, `1 May 1990` after `Born` (ticked), `May 3, 2026`, `12/05/1980` after `Born` (ticked), `020 7946 0958` after `Tel`, `john@example.com`, `123456789` after `SSN`, `AB123456` after `NI`, `12/05/80` after `Born` (ticked), `05.12.1980` after `DOB:` then ` 12 High Street` (ticked, no phone row), `27-09-2026 5` (the date, no phone row), `H O 020 7946 0958` (the number) each list as AC-6 asks with no change to any detector.

### The phone choosers (`phone.mjs`, `phone2.mjs`)

Corpus: every string literal holding a digit in `tests/unit/detect*.test.ts` and `scripts/lib/detection-fixtures.mjs`, NFKC normalised, 1,235 strings, through `detect`: **0 change** under the chosen rule (and 0 under the greedy merge).

Random layouts, 3,000 per cell, seeded. Numbers drawn from real area codes and exchanges (US `3 3 4`, US `(3) 3-4`, UK area plus local, UK `+44`); stray groups are four random digits. "Lost" is any digit of the number with no phone row; "ticked" is the row holding the whole number ticked.

| Layout | Shape | Today lost / ticked | Greedy merge lost / ticked | Rescue (chosen) lost / ticked | Length guarded lost / ticked |
|---|---|---|---|---|---|
| 1 group before | US 3 3 4 | 36.3% / 63.7% | 1.6% / 63.7% | 1.6% / 63.7% | 1.6% / 63.7% |
| 1 group before | UK area local | 4.5% / 88.5% | 1.9% / 88.5% | 1.9% / 88.5% | 1.9% / 88.5% |
| 3 groups before | US 3 3 4 | 44.7% / 55.3% | 5.8% / 55.0% | 5.8% / 55.3% | 12.4% / 55.3% |
| 3 groups before | US (3) 3-4 | 6.9% / 93.1% | 0.0% / 93.0% | 0.0% / 93.1% | 6.9% / 93.1% |
| 3 groups before | UK area local | 15.3% / 79.6% | 11.3% / 79.6% | 11.3% / 79.6% | 11.5% / 79.6% |
| 1 group after | UK area local | 0.0% / 91.9% | 0.0% / 80.1% | 0.0% / 80.1% | 0.0% / 87.9% |
| 1 group after | UK +44 | 0.0% / 93.1% | 0.0% / 85.9% | 0.0% / 85.9% | 0.0% / 93.1% |
| 2 groups after | US 3 3 4 | 0.0% / 100% | 0.0% / 99.6% | 0.0% / 99.6% | 0.0% / 99.6% |
| 2 groups after | UK area local | 1.3% / 91.7% | 1.3% / 77.7% | 1.3% / 77.7% | 1.3% / 87.4% |
| `Ref NNNNN` before, group after | US 3 3 4 | 9.3% / 89.9% | 2.7% / 89.9% | 2.7% / 89.9% | 9.3% / 89.9% |
| `Ref NNNNN` before, group after | UK area local | 5.6% / 79.3% | 4.9% / 69.2% | 4.9% / 69.2% | 5.2% / 74.5% |

Bracketed US numbers and `+44` numbers lose nothing in any layout under any rule (omitted rows are 0.0% lost and unchanged ticks). The UK numbers' remaining losses (11.3% with three groups before) are a four digit group that forms no valid window with the number under any rule, the same today.

Two numbers side by side, 3,000 pairs per cell:

| Pair | Shape | Today either lost / both ticked / one row | Greedy merge | Rescue (chosen) | Length guarded |
|---|---|---|---|---|---|
| side by side | US 3 3 4 | 1.3% / 98.7% / 0.0% | 1.3% / 38.9% / 59.8% | 1.3% / 98.7% / 0.0% | 1.3% / 98.7% / 0.0% |
| side by side | US (3) 3-4 | 0.0% / 100% / 0.0% | 0.0% / 55.3% / 44.7% | 0.0% / 100% / 0.0% | 0.0% / 100% / 0.0% |
| side by side | UK area local | 4.1% / 83.0% / 0.0% | 3.9% / 70.0% / 14.2% | 3.9% / 83.0% / 1.2% | 4.2% / 83.0% / 0.0% |
| a group between | US 3 3 4 | 38.5% / 61.5% / 0.0% | 3.2% / 57.9% / 6.4% | 3.2% / 57.9% / 0.0% | 3.2% / 57.9% / 0.0% |
| a group between | UK area local | 8.4% / 80.0% / 0.0% | 6.7% / 70.1% / 1.6% | 6.7% / 70.1% / 0.0% | 6.9% / 76.1% / 0.0% |

Named cases under the chosen rule: `9346 212 555 0123` one unticked row; `Box 2000 212 555 0123` and `Ste 1 212 555 0123` unchanged; `6293 6608 0005 7382 276 020 7946 0958` the card and `020 7946 0958` (unticked, the phone row having been cut by the card); `212 555 0123 9346 415 234 5678` lists `212 555 0123` ticked and `9346 415 234 5678` unticked (today `9346 415 234` ticked and `5678` lost); `Call 020 7946 0958@example.com`, `123 45 6789 1234`, `SSN 223-45-6789¹` and `2026-09-27 10:00-2026-09-28 11:00` unchanged.

Time (one run each, this machine): 100,000 characters of four digit groups 162 ms today, 166 ms chosen; 10,000 US numbers side by side 245 ms today, 422 ms chosen (every start now asks its windows during the rescue pass, where today's pass skipped the units inside a taken row); both well under AC-16's 2 s.

### Carried from the fourth review (not remeasured here)

The date plus one digit unit rule: 0 of 1,102 strings change; the four stolen examples become date rows; the phone side loses only a unit shaped like a real date plus one digit (about 0.1% of random `NN-NN-NNNNN` units). The two digit year tolerance with both leading groups of two digits: 6.4% to 6.7% unticked dates on random `NN?NN?NNN` codes, 0.0% on `N.N.NNN` and `N.NN.NNN`; 2 of 1,102 strings change, both pins. The bare Social Security tolerance: 3 of 1,102 strings change, all pins; 89.1% of random ten digit runs after `SSN ` list an unticked row. The real raised marker: glued at gaps up to 1.0 pt at 8 and 7 pt and 0.5 pt at 6.5 pt.

### Still to measure in the build

The National Insurance tolerance on random codes (task 8); the year first cut rule against the side by side cases (task 7); the flag count and the corpus rerun on the built code (tasks 2, 6, 7); the CI figure (task 13).
