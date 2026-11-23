# 0023. Rationale: fail a run whose descriptions keep ticked text

## Context

Feature 30 (engine and code follow ups, Alpha, Skateboard) carries spec 0021's last Follow-up item: measure whether a ticked word inside an `/ActualText` span survives a run with the check passing, and, if it does, close it. Root `AGENTS.md` and the owner's call on spec 0021 (2026-11-18) set the bar. A ticked value that can survive with the self check passing is a silent miss to close, never a recorded limit; only unticked text may stay as a "can" limit.

**What `/debug` measured (2026-11-23).** A scratch vitest built 22 one page documents with `document()` from `scripts/lib/redaction-fixtures.mjs`, the term `Jane Smith`, on this branch and on main's code (0ee7571). The answers were identical.
- **Clean**: a span wrapping exactly the word (inline, UTF-16 or named). MuPDF drops the span and the `/Properties` entry.
- **Blocked**: replacement text holding the word over other glyphs. Detection lists the row as `replacement-text`, so it cannot be ticked. Forced past the block, the run is clean. If the same word is also drawn plainly and ticked, the blocked span keeps the word in the output: an unticked row.
- **Fails closed** (`replacement-text`): a trailing space glyph, a second line, a `Tr 3` glyph or an inline image inside the span, and glyphs wider than the replacement text.
- **Leaks**: the span also draws a shape outside the box, a highlight wider than the box, only a clip, or a form. The glyphs go, `BDC ... EMC` stays round the leftover drawing, and `/ActualText (Jane Smith)` stays, inline or in `/Properties` for the named form. Extraction ignores replacement text round no text, `STRING_PLACES` allows `/ActualText`, `tickedAtStringPlace` does not look at it, and the open's AC-9 rule exempts it because the word is still drawn there: no `marked-descriptions` warning. The cleaned file would warn if opened again.

**Why the engine cannot remove it.** MuPDF.js exposes no marked content: no callback hands out a `BDC` property list and no filter drops one, and `sanitize` keeps a property list around leftover drawing (spec 0019, AC-10, pinned). The engine never edits a content stream itself (spec 0004, INV-13). Whatever closes this must refuse, not remove.

**The same miss, already pinned.** Spec 0019's AC-10 pins that an inline `/Alt` around a ticked value stays in the output, with the page warned at open. Its ticked value (`jane.doe@example.com`) is not inside its `/Alt` string ("Alternate text naming Jane Doe"), but nothing stops a description from holding the ticked text itself, and then it is the same kind of silent miss with a warning on top. Spec 0019 was decided on 2026-11-15, before the owner's rule above.

**Forces.** Fail safe over completeness: a refusal is acceptable, and a clean looking file that keeps a ticked word is not. Do not refuse files that would not leak (the clean span is common: Word and LaTeX write replacement text for ligatures and symbols). Keep the open as it is: no warning without a measured base. Keep the run's cost, since the 10,000 form and 50 dense page budgets hold the structure part. And keep one decoding and one fold for every string comparison (spec 0021, INV-1).

## Options considered

### Option 1: The self check compares (chosen)

The structure part's scan, which already reads every drawing stream once for resource use, takes the run's folded ticked list and answers whether any description string still in the output holds a ticked text: every string in an inline property list, and an `/ActualText` the character check cannot read (round no text, on a `DP`, never closed). A hit fails the run.

**Pros**:
- Refuses exactly the files that keep a ticked text, and nothing else; every other run and every open is unchanged.
- Covers the inline and the named form, and every place a drawing can sit (page, form, tiling pattern, Type 3 glyph), through the reads that already happen.
- Edits nothing (INV-13) and reuses spec 0021's decoder and fold.

**Cons**:
- The visitor learns only after ticking, with no row named.
- Containment on folded text can refuse a clean run when a short ticked term sits inside an unrelated description.

### Option 2: The same check, plus the rebuild leaving a named `/ActualText` out

As Option 1, but first the rebuild deletes the `/ActualText` of a named property list when it holds a ticked text, as spec 0021 leaves the catalog's `/Lang` out. The named form then makes a clean file, and only the inline form refuses.

**Pros**:
- One of the five measured leaks makes a file instead of refusing.
- There is a precedent in `keepsLang`.

**Cons**:
- The rebuild cannot tell whether the span still draws text. Where it does (the blocked row in named form), removing the replacement text changes what the page extracts, and the run then fails the character check anyway.
- More code in the rebuild for the rarer form. Inline replacement text is what Word and LaTeX write.

### Option 3: Refuse at open any span that draws text and something else

The scan at open flags an `/ActualText` sequence that draws text and also anything that is not text, and the open refuses the file (or warns).

**Pros**:
- The visitor hears before reviewing or ticking.

**Cons**:
- Refuses files where nothing is ticked, or where the ticked words are elsewhere, which is far more than leak.
- No measured base for how common such spans are. Underlined links inside spans would trip it.
- It still leaves the inline `/Alt` case open.

### Where the comparison runs (an implementation choice settled here)

- **Chosen: inside the structure part's scan.** `resourceUse` and `resourcelessUse` already read every drawing, so passing the list costs only the decoding of description strings. The price is that it sits behind the `checkStructure` seam, so a test that swaps the structure check skips it.
- **Runner up: a second scan in `checkOutput`, outside the seam**, as spec 0021's `tickedAtStringPlace` sits. That needs a second role walk and a second read of every drawing on every ticked run, about doubling the structure part's scan cost on the 10,000 form budget, to guard against a swap only tests make.

## Rationale

Option 1 wins because it is the only one that closes the miss at the moment it exists, on the bytes that will cross, without editing a stream or refusing files that would not leak. The leak happens after MuPDF removes the glyphs, so only the written output can show it. That is the job of the self check, the same reasoning that put spec 0021's string place check there. Option 2's extra path saves one rare form from a refusal, at the cost of rebuild logic that fails in the blocked case anyway. Option 3 trades a clear, narrow refusal for a broad one with no data behind it.

**The scope is every description string, not only `/ActualText`** (your call, 2026-11-23). The mechanism is the same scan reading the same property lists, so one rule closes the measured case and spec 0019's pinned `/Alt` case at no extra cost, and the owner's rule asks that a ticked value never be left as a limit. `/Lang` tags are compared too, as spec 0021 holds the catalog's tag.

**The blocked row passes** (your call, 2026-11-23). Only strings the character check cannot read are compared. Replacement text over glyphs still drawn is page text to the character check, which expects it back when its row was not ticked. The blocked row was listed to the visitor as one RedactNest cannot remove, so it is unticked text, shown as such: the one kind of text that may stay. Comparing every `/ActualText` would make any file with one blocked occurrence impossible to redact for that word, for no gain in what the visitor was told.

**The kind is `replacement-text`** (your call, 2026-11-23), ranked as a leak below `redaction-incomplete`. Its words already say a ticked item sits in hidden text that cannot be removed safely, and its next step (untick one group at a time) is the only way forward the visitor has. `redaction-incomplete`'s words name accents and footnote markers, which would mislead. The body is reworded to name a description for screen readers as well as replacement text (your call).

**No warning at open, and no page lines change** (your calls, 2026-11-23). The check closes the miss, and a warning would fire on files that never leak, with nothing measured to size it. `/tool`'s `marked-descriptions` line and the security page say descriptions "can stay in the file, even around text you tick", which stays true for a description that does not hold the ticked text, so no claim breaks and no change entry is owed.

**Smaller calls made in writing this spec.** Each states the pick and the runner up.
- A string that cannot be decoded counts as a hit, as spec 0021's AC-4 does as built. Runner up: skip it, which would let an odd encoding carry a ticked text through.
- `ADOBE_COLLECTIONS` is not applied: it names a `CIDSystemInfo`'s format words, never a description's. Runner up: apply it everywhere, which would only skip words that cannot sensibly occur here.
- For a named list, only `/ActualText` is read, since any other key there is already a leak to the walk. Runner up: walk every key, which duplicates the walk.
- The join is per `scanContent` call, not across a whole page and its forms. Runner up: one join per page across every drawing it reaches, which catches a name split between a page and a form, but adds false refusals across unrelated drawings for a shape no measured file writes.
- The fixtures: `marked-ticked.pdf` for the refusals and `marked-blocked.pdf` for the case that makes a file, so the gate's `NEEDLES` tick only what makes a file. The places beyond the page (form, tiling pattern, glyph) are built in the test, as spec 0019's AC-9 tests build them. Runner up: one fixture, with per page ticks everywhere, which makes the gate rows harder to read.

## What the cross check changed (2026-11-23)

A read only cross check on a second model found the design sound with no simpler option, and raised seven gaps. All were applied on your call:
1. **The fixture's names.** The ticked list covers a whole run, so one name shared by every page would have made page 8's control refuse and broken its gate row. Each page now holds a distinct name (AC-3).
2. **Split spans.** Word style files can write replacement text one word at a time, and no single string then holds the ticked text, so both words survived. The scan now joins the folds of every string it settles, per drawing, and tests the join (AC-1, page 9).
3. **`/ActualText`'s shape.** Only a top level string `/ActualText` on a `BDC` waits for its sequence; any other is settled at once (AC-1).
4. **Text drawn by a form inside a span.** It does not count as drawn, so such replacement text is compared, a false refusal that fails safe. Counting it would reopen the measured form leak (AC-1, AC-3 page 10, INV-4).
5. **The verdict's path through the code.** `resourceUse`'s own flag, tested before `unreadable` and kept past an unsure read; `resourcelessUse`'s widened answer; `checkOutput`'s flag; spec 0021's string place hit outranking this one (AC-2).
6. **Page 7's `DP`.** Nothing pins that MuPDF keeps it after a run, so task 1 measures it first (AC-3).
7. **Small points.** Wider wording for false refusals, names as the one unread place, how Type 3 glyph procedures are read, no `OPEN_NOW` or `RUN_NOW` rows, and `/sync` owning `AGENTS.md` (*Consequences*, AC-3, AC-6).
