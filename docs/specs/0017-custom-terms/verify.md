# Verify: Custom terms · spec 0017

_Steps derived from spec 0017's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build with Playwright's environment (billing on, fake keys). Route `/api/entitlement` to `paid` unless a step says otherwise, as the paid cap tests do. The fixtures are `tests/fixtures/terms.pdf` and `tests/fixtures/terms-dense.pdf` (both new here) and `tests/fixtures/detect-dense.pdf`, written by `node scripts/make-fixture.mjs`. "Read the download's text" means open the downloaded file in a reader and copy each page.

## UI / manual

- [ ] Idle and opening show no panel; open `terms.pdf` → the Found items card shows the coverage note, then the panel (labelled field, Add, an empty list, no Remove all), then the groups → AC-1
- [ ] Type `Acme Ltd`, press Enter → a chip appears, Add shows busy, the polite line says it is searching and then how many matches it found; its group comes first, headed `Acme Ltd`, every exact place ticked (one split by a line break, one by a block break); focus never left the field → AC-1, AC-3, AC-8, AC-9, AC-14, AC-19
- [ ] Add each term `terms.pdf` lists and read each group against the fixture's table: folds (`JOSE`, `Müller`, `STRASSE`), both hyphenated break readings ticked, `JohnSmith` and `SmithDate` unticked with the joined note, `S M I T H`, `Mc Donald`, `OBrien`, `J Smith` and the hyphen lost at a line's end unticked with the spaced note, nothing for `Ann` in `Annual` or `planning`, nothing for `Smith` in `SMITHSON`, the covered place with its covered note, the replacement text place blocked with its reason and still listed beside the detector row there, the Arabic and Hebrew terms typed without vowel marks listing the vowelled forms unticked with the marks note → AC-7 to AC-13, AC-30, AC-32
- [ ] In `terms.pdf`, `Acme Ltd` split between two pages lists two unticked parts with the page break note, one on each page; the one split by a running footer lists nothing; tick both parts, Make and read the download's text → both parts are gone and the rest of each page is there → AC-21, AC-33
- [ ] Keep `JK` for the tab, then open `terms-dense.pdf` → one group headed `JK`, counting 3,000 matches, every one ticked, and no detector group; its select all clears all 3,000 at once, and a second press ticks them all again at once; a tick far down the group lands at once → AC-14, AC-28
- [ ] Add `zzqx` → its chip and group say not found in this document; on a file with a scanned page the line says on the pages RedactNest could read → AC-15
- [ ] The coverage note names the custom terms by count once any was searched, and still names the seven detectors → AC-16
- [ ] Paste 55 lines (a duplicate, a one letter line, a 101 character line, a line of `---`, the rest good) → the 50 that fit are added in order, and each other line is named under its reason with a count; paste 200 lines → the refusals are counted by reason, the first 20 named and the rest said as "and N more", a 300 character line shown by its first 60 characters and its length; type a 101 character term → it is refused by name and stays in the field → AC-3, AC-4
- [ ] While a search runs, Add is busy and the field read only, and Remove still works; a second Add waits for the first to land → AC-19
- [ ] With terms listed, Start over → beside the drop zone one line says how many custom terms are kept for this tab, with Remove all; Remove all clears them → AC-6
- [ ] Remove a chip → its group, rows and ticks go and focus lands on the next chip's remove button; Remove all → the list empties and focus lands on the field; remove a term while its search runs → its rows never appear → AC-5
- [ ] Tick the defaults, Make, Download, read the download's text → every ticked term place is gone, every neighbour's text is still there, the file is named `-redacted.pdf`, and the result card names each term with its removed count and its left count → AC-21, AC-22
- [ ] Tick only `JohnSmith`'s joined row and Make → either it is removed with `John` left, or the run is refused as overreach and the review stays → AC-21
- [ ] After a copy is made, add a term → the review returns, Download goes, and the next run includes it → AC-19
- [ ] Choose another PDF, then Start over and open a file again → the list is still there and searched at open (its groups appear with the detector rows); reload the page → the list is gone → AC-6
- [ ] Route the next open to `unknown` → the panel is locked with the account's line and Check my plan and open it again, each kept term says not searched (Free plan), Make waits and the action panel says why; Set aside one, Remove another → Make runs, and the result card names the set aside term as not searched with its reason; Check my plan and open it again with `paid` routed → the terms are searched at open → AC-2, AC-17, AC-18, AC-22
- [ ] Route to `none` → the locked line links to Pricing in a new tab; a build with billing off shows no panel → AC-2
- [ ] Make a `find-terms` fail (a probe that answers the worker's request with an error) → rows and ticks stay, the batch says not searched (search failed), Make waits with Try again, Set aside and Remove; Try again searches them → AC-17, AC-18, AC-20
- [ ] Tab through the panel, chips and Remove all; run axe on the panel's states (empty, listed, searching, refused, not found, locked, not searched) at desktop width and at 320 pixels → no violations, every control reachable with visible focus → AC-1, AC-2

## Code and records

- [ ] `tests/e2e/privacy.spec.ts` types a term, searches, redacts and downloads, and finds it in no request, no store and no console line; the field has `autocomplete`, `spellcheck`, `autocorrect` and `autocapitalize` off, no `name`, and no `form` ancestor → AC-23
- [ ] A hand made `find-terms` on a `free` job, past `maxTerms`, or with a one letter term is answered `unsupported` (worker test) → AC-27
- [ ] `git diff main -- src/detect/index.ts` leaves `DETECTORS` and `PRECEDENCE` as they are; `lookedFor` and `src/lib/home-text.ts` are unchanged; `src/lib/term-text.ts` imports nothing and lint rejects any other `@/lib` import in `src/detect` → AC-16, INV-5, INV-10
- [ ] `pnpm exec playwright test --project=speed --no-deps` → on `detect-dense.pdf`, the three opens (50 unfound terms, the fixture's 27 found words, its most frequent two letter word `Jo`) within 5 s and the pasted batch within 3 s; on `terms-dense.pdf`, the open with `JK` kept within 5 s (one group of 3,000 rows, all ticked, no other group), `JK` pasted during review within 3 s, and the group's select all within 200 ms for each press, clearing and ticking; the slowest read under 1 s throughout, with the page break carry on; the figures are in `rationale.md` → AC-28
- [ ] `node scripts/make-fixture.mjs` leaves `tests/fixtures` unchanged, `terms-dense.pdf` included, and `pnpm exec vitest run tests/unit/fixtures.test.ts` passes → AC-28
- [ ] Engine tests hold two overlapping ticked targets removed together, each counted once under its own kind and term → AC-21
- [ ] `pnpm exec vitest run tests/unit/detect-adversarial.test.ts` alone → the term case within 1 s → AC-29
- [ ] The telemetry type gate and parser cover `term` in the by kind fields and `terms` and `termsSetAside`; no event field holds a term or a `TermId` → AC-24
- [ ] The privacy page's C3 and C14 read as AC-25 says, `policy-changes.ts` has the dated entry, and both policies are byte for byte as before; Pricing's Pro card has the custom terms line with the cap from `config` → AC-25, AC-26
- [ ] The amended specs read as *Amends* says → AC-31

## As built · updated 2026-11-11

_Added by `/develop`: what the build found and where its own checks live, for `/check verify` to start from._

- [ ] `pnpm exec playwright test tests/e2e/terms.spec.ts` → five cases pass: a Pro term found, removed and read back from the download; Remove and focus on the field; not found; a refused term kept in the field; the locked Free panel, axe clean throughout → AC-1 to AC-3, AC-5, AC-14 to AC-16, AC-21, AC-22
- [ ] `pnpm exec playwright test tests/e2e/privacy.spec.ts -g "typed custom term"` → passes → AC-23
- [ ] `pnpm exec vitest run tests/component/terms-flow.test.tsx` → the kept list across files, Start over and its kept line, a 55 line paste's grouped refusals, the Free job's not searched terms holding Make until set aside (axe clean), and a failed search with Try again → AC-2 to AC-6, AC-17 to AC-20, AC-27
- [ ] `pnpm exec vitest run tests/unit/terms-engine.test.ts tests/unit/detect-terms.test.ts tests/unit/session-terms.test.ts tests/unit/engine-worker.test.ts` → the matcher's examples, `terms.pdf` page by page through the real MuPDF (20 ticked rows redacted alone and together, the two page break parts, a term inside an address counted once under each kind), every session edge, and the worker's gate → AC-7 to AC-13, AC-21, AC-27, AC-30, AC-32, AC-33
- [ ] `pnpm exec playwright test --project=speed --no-deps` → as measured on 2026-11-11: opens with 50 kept terms of 2,809 ms (50 unfound terms of 100 characters), 2,665 ms (the found words) and 2,264 ms (`Jo` alone), against 2,353 ms with no terms; a pasted batch of the found words 1,236 ms; slowest read 46 ms at open and 12 ms in a search → AC-28
- [ ] AC-28's found list: `detect-dense.pdf` holds 27 distinct words of 4 to 12 letters, not 50, so the case uses all 27; and its most frequent two letter word, `Jo`, lists 55 rows, not thousands. A denser list needs a fixture of its own: decided 2026-11-13 as `terms-dense.pdf` (the speed step under *Code and records*)
- [ ] AC-8 as built: each hyphen right before a line break is read both ways as two linear readings, so a match is always its term's length long and its start comes in one step (AC-29). One match that needs one such hyphen read as nothing and another read as a hyphen is not read exactly: the spaced reading lists it unticked, never missed. Check `Jean-` then `Luc Smith-` then `son` for `Jean-Luc Smithson` lists a spaced row
- [ ] AC-21 as built: the four joined rows on `terms.pdf` page 2 each redact alone without an overreach refusal (`tests/unit/terms-engine.test.ts` does not tick them; the scratch probe did). A joined row's refusal remains possible on other layouts
- [ ] AC-29 as built: `tests/unit/detect-adversarial.test.ts`'s term case covers six shapes, the slowest (hyphenated terms on lines ending in a hyphen) about 0.5 s of CPU alone
- [ ] Stopwatches in the full parallel `pnpm test`: the phone detector's random groups case and `cost.test.ts` failed under load on 2026-11-11 and passed alone, as they do on main

## As built · updated 2026-11-13

_Added by `/develop`: task 18 on `terms-dense.pdf`, and the owner's read of the words, for `/check verify` to start from._

- [ ] `node scripts/make-fixture.mjs` writes `tests/fixtures/terms-dense.pdf` from `termsDense()` (`scripts/lib/terms-fixtures.mjs`, what it holds in `TERMS_DENSE`) and leaves every other fixture byte for byte as it was; `pnpm exec vitest run tests/unit/fixtures.test.ts` passes → AC-28
- [ ] `pnpm exec vitest run tests/unit/terms-engine.test.ts -t "terms-dense"` → `JK` lists 3,000 rows through the real engine, 60 a page, each exact (no note), ticked and with a target, and nothing else is listed → AC-28
- [ ] `pnpm exec playwright test --project=speed --no-deps tests/e2e/terms-speed.spec.ts` → both tests pass; the second, on `terms-dense.pdf`: one group, headed `JK`, 3,000 rows all ticked, its select all labelled "Select all 3,000 matches" and its chip "3,000 matches"; as measured on 2026-11-13, the open 2,296 to 2,596 ms, the paste 1,128 to 1,237 ms, select all 111 to 151 ms clearing and 136 to 160 ms ticking, slowest read 54 ms at open and 12 ms in the search (`rationale.md`) → AC-28
- [ ] The select all line has about 1.4 times the room on this machine, not twice: a slower hour on 2026-11-13 put the earlier build's select all at up to 268 ms and `detect-dense.pdf`'s found list open at 6.1 s. A CI run over a line comes back to `/architect` with its figure → AC-28
- [ ] The words, as the owner asked on 2026-11-13, each held in `tests/unit/flow-text.test.ts` (*the custom terms words*), and on the page by `tests/component/terms-flow.test.tsx` and `tests/e2e/terms.spec.ts`:
  - Make waits names the ways on by reason: Try again for a failed search; for the Free plan, set aside or remove, and check your plan and open the file again only where the job's account offers it; each reason its own sentences when they are mixed → AC-17, AC-18
  - The coverage note names the terms as the last part of its one list ("… National Insurance numbers and your 3 custom terms.") → AC-16
  - A set aside chip says "Set aside: not searched in this file", and its place in the list adds the reason; only the button says "Set aside for this file" → AC-17
  - Refusals read alone and grouped: "“a” not added because it is too short (at least 2 characters)." and "3 not added because they are too short (at least 2 characters): “a”, “b” and “c”." → AC-4
  - A term is quoted wherever a sentence names it (the searching and found lines, the result card's Removed and Left in the file); chips, group headings and the remove button's name show it as typed → AC-14, AC-19, AC-22
  - Counts of 1,000 and more take a separator in every terms line, a group's select all (detector groups too) and the result card's Removed and Left in the file, detector counts included, since one sentence names both (spec 0007, AC-7 and AC-11, as amended) → AC-14, AC-22
  - Check my plan and open it again asks "You have unsaved work on the document that is open. Checking your plan opens this file again, which discards your work on it. Continue?" when there is unsaved work, and a cancelled ask changes nothing → AC-2, AC-17
- [ ] Still showing a count without a separator on the same screen: the Found items badge and each group's count badge, the action panel's "{n} of {m} found items will be removed." and "Redact {n} items" (spec 0007, AC-6 and AC-7's badge; spec 0003's `CountBadge`), outside the terms lines this read covered
