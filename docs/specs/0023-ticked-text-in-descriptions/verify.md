# Verify: engine and code follow ups (a ticked text in a description) · spec 0023 · updated 2026-11-23
_Steps derived from spec 0023 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Every PDF named here is a committed fixture in `tests/fixtures`; any other document is built inside a test, never read from elsewhere on the machine._

## UI / manual
- [ ] In `/tool` (the Playwright build), open `marked-ticked.pdf` → it opens, and only pages 6, 7 and 10 show the `marked-descriptions` warning → AC-3, AC-6
- [ ] Add a custom term for page 1's name (`Odile Brask`), tick only that row, and redact → the run refuses with the title "A ticked item can't be removed safely", the body "It sits inside hidden text written into the file, such as replacement text (the words copy and paste gives instead of what's drawn) or a description for screen readers, which can't be removed safely. RedactNest made no file.", the next step unchanged, every tick kept, and no Download. No line names a page, the name or the file → AC-2, AC-3, AC-5
- [ ] Do the same for page 6's name (`Mirela Strand`, an `/Alt` naming it) and page 9's name (`Corin Vale`, split across two spans) → each refuses with the same words → AC-3
- [ ] Do the same for page 8's name (`Wren Halloway`, the control) → the run makes a file; download it and search its text for the name → not found → AC-3
- [ ] Add page 10's name (`Esme Tarrow`) → two rows: the plain one tickable, the second blocked as replacement text. Tick the plain row and redact → the run refuses with the same words (the recorded false refusal) → AC-3, *Consequences*
- [ ] Redact `marked-ticked.pdf` with nothing ticked → a file is made → AC-3, INV-5
- [ ] Open `marked-blocked.pdf` and add `Juno Pellar` as a custom term → two rows: the first tickable, the second blocked as replacement text. Tick the first and redact → a file is made → AC-4
- [ ] Open `marked-descriptions.pdf`, tick `jane.doe@example.com` and redact → a file is made, as before, and the same pages warn as before → AC-6
- [ ] After a refused run, read the request to `/api/telemetry` → the event carries `kind: "replacement-text"` and nothing from the document (no page, no name, no term) → AC-5, INV-3, *Security model*

## Commands
- [ ] `pnpm exec vitest run --project unit tests/unit/marked.test.ts` → all pass, the *whether a description holds a ticked text (spec 0023)* cases among them, and `marked-ticked.pdf` warns on pages 6, 7 and 10 while every other fixture but `marked-descriptions.pdf` warns nowhere → AC-1, AC-3, AC-6
- [ ] In that file, the cases two spans `(Jane)` and `(Smith)` round shapes (hit) and each alone (miss) → one join per call, in the order settled → Value sourcing (whether they hold a ticked text)
- [ ] In that file, `/ActualText` round text, round text and a shape, and an outer one with text in a nested sequence (no hit), against round a shape, a sequence never closed and a `DP` (hit) → a pending `/ActualText` is settled at `EMC` or the stream's end only when its sequence drew no text, a `DP`'s at once → Value sourcing (whether a sequence draws text; when a pending `/ActualText` is settled)
- [ ] In that file, the hex, UTF-16 and undecodable `<FEFF00650E>` strings → decoded with `decodeTextString`, the undecodable one a hit with any text ticked → Value sourcing (a string's text), INV-6
- [ ] In that file, the named list cases → a hit round a shape, a miss round text, a `DP`'s always, and no list read with `properties` null → Value sourcing (each description string, named lists)
- [ ] In that file, the empty list case → `describesTicked` false everywhere and `describes` unchanged → INV-5
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-kept.test.ts -t "spec 0023"` → all pass: pages 1 to 7 and 9 refuse with `replacement-text`, page 10's plain row alone and every place refuse, page 8 and nothing ticked make a file → AC-3
- [ ] In the same run, *in every place* → a form, a tiling pattern and Type 3 glyph procedures with and without `/Resources` each refuse, make a file with nothing ticked, and answer `ticked-description` on the source; a font with no `/Resources` is read under the page's owner (measured), and a page with no resource dictionary answers `ticked-description` through `resourcelessUse` → AC-2, AC-3
- [ ] In the same run, *the order of kinds* → beside an unused colour space: `replacement-text`, verdicts `["ticked-description"]`, `rewrite` never called; beside an unreadable stream in the same owner and another: `ticked-description` and `replacement-text`; beside a ticked leak on a page or a ticked text at a string place: `redaction-incomplete` → AC-2, Value sourcing (the kind)
- [ ] In the same run, *a blocked row's replacement text* → the term search lists the second place blocked as `replacement-text`, and the plain row ticked makes a file whose page content still holds `/ActualText(Juno Pellar)` → AC-4, Value sourcing (the blocked row)
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → all pass, both new fixtures in `MAIN_FIXTURES` with no refusal or `sanitized` row, and their `NEEDLES` (page 8's name, the blocked plain row) making a file → AC-6
- [ ] `pnpm exec vitest run --project unit tests/unit/cost.test.ts`, alone, with no other suite running → all 10 pass, thresholds unchanged → AC-6
- [ ] `pnpm exec vitest run tests/unit/flow-text.test.ts tests/component/tool-client.test.tsx` → `replacement-text`'s body reads as AC-5 gives it, the same for both plans, in the run refusal → AC-5, Value sourcing (`/tool`'s words)
- [ ] Read `src/engine/redact.ts` → the one `foldTicked` list reaches `checkOutput` on both writes, and `checkOutput` hands it to `checkStructure` → INV-1, Value sourcing (the ticked texts, folded)
- [ ] Read the security page's descriptions line and self check section → no line claims more than the code does; the descriptions line still says they "can stay in the file, even around text you tick" → AC-7

## Acceptance-criteria coverage
- AC-1: the `marked.test.ts` steps, the named list, decoding and empty list steps
- AC-2: the order of kinds and every place steps, the first three UI steps
- AC-3: the `redaction-kept.test.ts -t "spec 0023"` step, the UI steps on `marked-ticked.pdf`
- AC-4: the blocked row command and UI steps
- AC-5: the words command, the refusal's UI words, the telemetry step
- AC-6: the gate, cost and `marked-descriptions.pdf` steps, the warnings step
- AC-7: the amends are in specs 0001, 0004, 0007, 0019 and 0021 (read each `**Updated**` line); the security page step
