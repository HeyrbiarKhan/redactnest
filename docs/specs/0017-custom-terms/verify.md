# Verify: Custom terms · spec 0017

_Steps derived from spec 0017's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build with Playwright's environment (billing on, fake keys). Route `/api/entitlement` to `paid` unless a step says otherwise, as the paid cap tests do. The fixtures are `tests/fixtures/terms.pdf` (new here) and `tests/fixtures/detect-dense.pdf`, written by `node scripts/make-fixture.mjs`. "Read the download's text" means open the downloaded file in a reader and copy each page.

## UI / manual

- [ ] Idle and opening show no panel; open `terms.pdf` → the Found items card shows the coverage note, then the panel (labelled field, Add, an empty list, no Remove all), then the groups → AC-1
- [ ] Type `Acme Ltd`, press Enter → a chip appears, Add shows busy, the polite line says it is searching and then how many matches it found; its group comes first, headed `Acme Ltd`, every exact place ticked (one split by a line break, one by a block break); focus never left the field → AC-1, AC-3, AC-8, AC-9, AC-14, AC-19
- [ ] Add each term `terms.pdf` lists and read each group against the fixture's table: folds (`JOSE`, `Müller`, `STRASSE`), both hyphenated break readings ticked, `JohnSmith` and `SmithDate` unticked with the joined note, `S M I T H`, `Mc Donald`, `OBrien`, `J Smith` and the hyphen lost at a line's end unticked with the spaced note, nothing for `Ann` in `Annual` or `planning`, nothing for `Smith` in `SMITHSON`, the covered place with its covered note, the replacement text place blocked with its reason and still listed beside the detector row there, the Arabic and Hebrew terms typed without vowel marks listing the vowelled forms unticked with the marks note → AC-7 to AC-13, AC-30, AC-32
- [ ] In `terms.pdf`, `Acme Ltd` split between two pages lists two unticked parts with the page break note, one on each page; the one split by a running footer lists nothing; tick both parts, Make and read the download's text → both parts are gone and the rest of each page is there → AC-21, AC-33
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
- [ ] `pnpm exec playwright test --project=speed --no-deps` → the three opens (50 unfound terms, the 50 found words, the common two letter word) within 5 s, the pasted batch within 3 s, the slowest read under 1 s, with the page break carry on; the figures are in `rationale.md` → AC-28
- [ ] Engine tests hold two overlapping ticked targets removed together, each counted once under its own kind and term → AC-21
- [ ] `pnpm exec vitest run tests/unit/detect-adversarial.test.ts` alone → the term case within 1 s → AC-29
- [ ] The telemetry type gate and parser cover `term` in the by kind fields and `terms` and `termsSetAside`; no event field holds a term or a `TermId` → AC-24
- [ ] The privacy page's C3 and C14 read as AC-25 says, `policy-changes.ts` has the dated entry, and both policies are byte for byte as before; Pricing's Pro card has the custom terms line with the cap from `config` → AC-25, AC-26
- [ ] The amended specs read as *Amends* says → AC-31
