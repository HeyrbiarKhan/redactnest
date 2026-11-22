# Verify: engine and code follow ups (the lost inline picture) · spec 0022 · updated 2026-11-22
_Steps derived from spec 0022 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Every PDF named here is a committed fixture in `tests/fixtures`; any other document is built inside a test, never read from elsewhere on the machine._

## UI / manual
- [ ] In `/tool` (the Playwright build), open `inline-indexed.pdf` → refused before any review, with the title "A picture in this PDF can't come through cleanly", the body "One of its pictures stores its colours in a way RedactNest's cleaning can't write back, so it stopped rather than hand back a copy with that picture missing, and made no file." (no "or changed"), and the next step "Printing it to a new PDF from your PDF app, then opening that copy here, may help." No line names a page, a picture or the file → AC-2, AC-5, INV-5
- [ ] Open `inline-indexed-form.pdf`, `inline-indexed-pattern.pdf` and `inline-indexed-glyph.pdf` the same way → each refused with the same words, before any review → AC-2, AC-6
- [ ] Open `colour-inline.pdf` and `glyph-bitmap.pdf` → each opens and makes a file as before, with no refusal → AC-7
- [ ] Open `marked-descriptions.pdf` → it warns on the same pages as before, and nothing else warns newly → AC-7
- [ ] After a refused open, read the request to `/api/telemetry` → the failure event carries `kind: "inline-picture"` and nothing from the document (no page, no name, no text) → AC-5, Value sourcing (telemetry)

## Commands
- [ ] `pnpm exec vitest run --project unit tests/unit/marked.test.ts` → all pass, every two key case in both orders → AC-1, AC-6
- [ ] In that file, the cases `/IM true` beside `/ImageMask false` (kept) and `/ImageMask true` beside `/IM false`, `/IM 0` or `/IM null` (lost), each order → the mask is read from `/IM` first → Value sourcing (whether a picture is a mask)
- [ ] The cases `/Filter /JPXDecode`, `/Filter [/JPXDecode]`, `/F /JPXDecode`, `/F [/AHx /JPXDecode]` and a mask with `/Filter /JPXDecode` → all lost → Value sourcing (whether a picture is JPX)
- [ ] The cases an indexed `/CS` beside a device `/ColorSpace` (lost) and a device `/CS` beside an indexed `/ColorSpace` (kept), each order, and the repeated `/CS` both ways → the loaded space is `/CS` when present, the last of a repeated key → Value sourcing (the space MuPDF loads)
- [ ] The `inlineSpaces` cases → `Cs1` for `/CS /Cs1` whatever `/ColorSpace` says, in either order; nothing for `/CS /RGB` or `/CS/` → Value sourcing (the name the writer prints)
- [ ] The device space cases → `[/DeviceRGB 7]`, `[/RGB]` and `[/CalCMYK << >>]` kept under either key; `[]` and `[/Pattern]` under `/CS` lost → Value sourcing (what a device space is)
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-inline.test.ts` → 88 pass: the four refusals at open, the run's refusal before any pass, the seam's throw (`unsupported`) and `"problem"` (`unreadable-structure`), the backstop, the MuPDF pin row by row and the three ticked spellings → AC-2, AC-3, AC-4, AC-6, Value sourcing (open, run, check, the refusal, the failure)
- [ ] In that file, the pin's rows under *measured in the build* (`/CS /Cs9`, `/CS/` beside `/ColorSpace /DeviceRGB` each order, the repeated `/CS` both ways) → pass as recorded in `rationale.md`, *Task 8's measurements, on the corrected rule* → AC-6
- [ ] In that file, the three spellings ticked (`/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside an indexed `/ColorSpace`, `/ImageMask false` beside `/IM true`, each order) → each run makes a file that draws the picture's four cells as the source does, the ticked line gone → AC-6
- [ ] In that file, the pin's `/ImageMask true` beside `/IM false` with no colour space, each order → with two data bytes at 8 bits, no `BI` and the line after it dropped; with data that fills the picture, the write throws → AC-1, AC-6
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → all pass, the four fixtures in `OPEN_NOW` as `inline-picture` → AC-7
- [ ] `pnpm exec vitest run --project unit tests/unit/cost.test.ts`, alone, with no other suite running → all 10 pass, thresholds unchanged → AC-3, AC-7
- [ ] `pnpm exec vitest run --project unit tests/unit/redaction-kept.test.ts` → the named indexed base pin runs with `judgeInlinePictures` swapped, and spec 0021's `/Ordering <FEFF00650E>` test passes → AC-7, AC-8
- [ ] `pnpm exec vitest run tests/unit/protocol.test.ts tests/unit/flow-text.test.ts tests/component/tool-client.test.tsx` → `ENGINE_ERROR_KINDS` ends with `inline-picture`, and its words read as AC-5 gives them, at open and as a run's refusal → AC-5, Value sourcing (`/tool`'s words)
- [ ] `pnpm lint` and `pnpm typecheck` → no errors → AC-7
- [ ] Specs 0001, 0004, 0006, 0007, 0019 and 0021 → each names spec 0022 in its `**Updated**` line and carries an _Amended by spec 0022_ note at each place spec 0022's *Amends* table lists; spec 0021's lost inline picture and owed test Follow-up items are ticked → task 11, AC-1 to AC-8

## Acceptance-criteria coverage
- AC-1: the scan cases in `marked.test.ts`, and the pin's two key rows
- AC-2: the four fixtures refused in `/tool` and in `redaction-inline.test.ts`
- AC-3: the run's refusal and seam cases in `redaction-inline.test.ts`, and `cost.test.ts` alone
- AC-4: the backstop and `structureIsClean` cases in `redaction-inline.test.ts`
- AC-5: the words in `/tool`, `flow-text.test.ts`, `tool-client.test.tsx` and the telemetry request
- AC-6: the fixtures, the scan cases, the pin and the ticked runs
- AC-7: the gate, the budgets, lint, typecheck, and the unchanged opens in `/tool`
- AC-8: spec 0021's owed test in `redaction-kept.test.ts`
