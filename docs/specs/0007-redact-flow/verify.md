# Verify: Redact flow · spec 0007 · updated 2026-09-30

_Steps derived from spec 0007's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Fixtures are in `tests/fixtures/`; run the app with `pnpm build && pnpm start` so the tool runs under its real content security policy._

## UI / manual

### One pass, step by step

- [x] At `/tool`, drop `detect-email.pdf`, clear and tick the emails with the group's select all, press Redact, press Download, then Redact another PDF. Keep the Network panel open throughout → no page load, no sign in, and no request carries the file, its text or its name → AC-1
- [x] With nothing open, read the drop zone → it says "Up to 3 pages for now." It says the same after Start over, after Redact another PDF, and under a failed open → AC-2
- [x] Choose a file → the drop zone becomes the file bar: the file's name, no page count while it opens, then "3 pages"; a Choose another PDF button and a Start over link. The document card no longer states the page count, and there is no action row beneath the page → AC-3
- [x] Drag a file over the file bar → teal edge and soft teal fill; drop it → it opens → AC-3
- [x] Press Redact on a long document, then look at the file bar → both buttons stay enabled during the run → AC-3
- [x] Change a tick, then choose another file → the browser asks first; cancel it → nothing changes, the ticks and the document stay → AC-3
- [x] Open a file, then run it → one phase line with a spinner at a time ("Reading each page…", "Looking for email addresses and phone numbers…", "Removing what you ticked…", "Checking every page of your clean file…") → AC-4
- [x] Untick everything, then press Make a cleaned copy → the run's first phase says "Stripping hidden content…" → AC-4
- [x] Open `detect-stamped.pdf` and press Redact → the page reads, top to bottom: file bar, Document opened, the refusal, the action panel, the coverage note, the checklist → AC-5
- [x] On `detect-email.pdf`: all ticked → "12 of 12 found items will be removed." and "Redact 12 items"; untick all but one → "Redact 1 item"; untick all → "Nothing is ticked, so nothing will be removed." and "Make a cleaned copy" → AC-6
- [x] Open `kerning.pdf` (nothing found) → no count line, the button reads "Make a cleaned copy" → AC-6
- [x] Press Redact, then look at the action panel → Cancel stands where Redact was → AC-6, AC-10

### The checklist

- [x] Open `detect-email.pdf` → the email group's first row is "Select all 12 email addresses"; clicking it clears every row, clicking again ticks them all, each in one step; untick one row → the box shows mixed → AC-7
- [x] Open `detect-blocked.pdf` → a group's select all counts only rows that can be ticked, the group's badge counts every row, and select all never changes a blocked row → AC-7
- [x] Start a run → every checkbox, select all included, is disabled → AC-7, AC-10
- [x] Open `detect-dense.pdf` with a paid entitlement and tick a row far down → the tick lands at once; `pnpm test:e2e tests/e2e/checklist-speed.spec.ts` passes (first render under 1 s, a tick under 200 ms) → AC-8
- [x] On `detect-email.pdf`, read the first row's context → no "…" before "Contact:" (the page's start); a row mid page → "…" on both sides → AC-9
- [x] Change a tick, press Redact, then Cancel → back on the checklist with the same ticks → AC-10

### The result

- [x] Finish a run → the result card takes the action panel's place, above the coverage note and the checklist, and focus lands on its heading; a screen reader hears the card once → AC-11
- [x] Read the card → Removed, Left in the file, Also stripped, then the off page note (if any), then the download warning (if any), then Download → AC-11
- [x] Download, then change a tick → back to review, with focus still on that checkbox; the card stays until then → AC-11
- [x] On `read-mixed.pdf`, untick everything and run → "Nothing was removed", Removed reads "Nothing", the file is `read-mixed-cleaned.pdf`, the warning's page line stays and the "partly redacted" line is gone → AC-12
- [x] On `read-mixed.pdf`, run with the email ticked → "Your redacted file is ready", `read-mixed-partly-redacted.pdf`, and the "partly redacted" line shows → AC-12
- [x] Download → "Your browser has the file.", then Redact another PDF (primary) and Make it again (secondary); focus on Redact another PDF → AC-13
- [x] Press Make it again → a run over the same ticks, then Download offers the same name again → AC-13
- [x] On a heavy document, press Make it again, then Cancel → plain review, no result card, no refusal → AC-13
- [x] Press Redact another PDF → the full drop zone, and focus on Choose a PDF → AC-13, AC-20

### Failures

- [x] Open `detect-stamped.pdf` and press Redact → "Your last run was stopped" over "Removing what you ticked would remove more", as an alert, with focus on its heading; both addresses still ticked; no Download → AC-14
- [x] Untick an address → the refusal stays; press Redact with `jane.doe@example.com` unticked → the refusal clears and the run succeeds → AC-14
- [x] With the refusal showing, choose another file → the browser asks first → AC-14, AC-23
- [x] A refusal of a kind a tick can cause shows no button; one a tick cannot cause (`unsupported`, `edge-text`) offers Choose another PDF, which opens the file picker → AC-14
- [x] Open a file whose header is `%PDF-1.7` followed by junk, a text file named `.pdf`, `detect-dense.pdf` on the free tier, and `layers-all-on.pdf` → each shows its title, body and next step above the full drop zone, focus on the heading → AC-15, AC-16
- [x] Read the failure words for every kind (`tests/unit/flow-text.test.ts`) → each has a title, body and next step; no line asks for a password or promises text recognition works → AC-16, AC-17, AC-18
- [x] Open a page with scans (`read-mixed.pdf`) → the advice says text recognition "may" help → AC-18
- [x] Open a file whose trim removes content (`trim-text.pdf`) → the note ends "A found item crossing a page's edge is listed by the part inside the page; the part outside is removed with the rest." → AC-19

### Across the flow

- [x] Walk the *Focus* table step by step → focus lands where it says after every change, never on the page body → AC-20
- [x] At 320px wide, take every step → nothing scrolls sideways; on a phone the tool runs with no device check → AC-21
- [x] `pnpm test:e2e tests/e2e/design-system.spec.ts` → axe, the keyboard walk and 320px reflow pass in every step state → AC-22
- [x] Leave the page with a refusal showing → the browser warns; leave after a download → it does not; the lost callout's Try again still reopens the file → AC-23

## Value sourcing

- [x] Build with `NEXT_PUBLIC_FREE_PAGE_CAP=5` → the drop zone says "Up to 5 pages for now." → page cap in the drop zone helper
- [x] Open a file named `<b>notes</b>.pdf` → the file bar shows the name as plain text → file name
- [x] Open a one page file → the file bar says "1 page"; before the open finishes it shows no count → page count
- [x] On `detect-blocked.pdf`, compare the count line with the rows → n counts ticks, m leaves blocked rows out → n and m
- [x] Reach each of the four count line cases (some ticked, none ticked, all blocked, nothing found) → the line matches the case → which count line
- [x] Tick exactly one item → "Redact 1 item"; none → "Make a cleaned copy" → button label
- [x] On a group holding a blocked row → select all names only the tickable rows, with the plural noun → select all count and noun
- [x] Tick none, some, then all of a group → select all shows clear, mixed, then checked → select all state
- [x] Run with and without ticks → "Removing what you ticked" or "Stripping hidden content" → phase line words
- [x] Run a file where nothing is removed and one where something is → the two titles → result card title
- [x] On `metadata.pdf`, run with its defaults → Removed reads "1 email address and 1 phone number", from the engine's counts → Removed
- [x] On `detect-stamped.pdf` after unticking one address → Left in the file reads "1 email address you left unticked."; on `detect-blocked.pdf` blocked rows appear as "…RedactNest couldn't remove." → Left in the file
- [x] On `metadata.pdf` → Also stripped lists document info, XMP metadata and the rest in order; a file with none → "Nothing else needed stripping." → Also stripped
- [x] On `read-mixed.pdf` and a trim fixture → the download warning and the off page note appear only for their findings → off page note, download warning
- [x] Clean copy versus partly redacted run on `read-mixed.pdf` → the "partly redacted" line follows the name → `PARTLY_REASON` shown
- [x] Download from a quiet file, a partly readable one, and a run that removed nothing → `-redacted`, `-partly-redacted`, `-cleaned` → download file name
- [x] Trigger two failure kinds → each shows its own words and nothing from the file → failure title, body, next step
- [x] Route `/api/entitlement` to the paid tier (`pageCap: 50`) and open a 51 page file → "This PDF has more than 50 pages" and "RedactNest handles up to 50 pages."; a tiny size cap reads "1 MB", never "0 MB" → cap and size
- [x] A refusal of each group → no button for the four tick kinds, Choose another PDF for the rest; an open failure → the full drop zone below → which button
- [x] A match at a page's start or end versus mid page → "…" only on a cut side → "…" either side

## Commands

- [x] `pnpm typecheck` → no errors (the loggable gate holds `ResultCounts` too) → AC-25, AC-26
- [x] `pnpm lint` → clean
- [x] `pnpm test` → all pass, including `session.test.ts`, `worker-client.test.ts` (same `jobId` open settles a pending redact), `detectors.test.ts`, `flow-text.test.ts` and `checklist-renders.test.tsx` → AC-7, AC-8, AC-12, AC-13, AC-14, AC-16 to AC-18, AC-24, AC-25
- [x] `pnpm test:e2e` → all pass, including `flow.spec.ts`, `checklist-speed.spec.ts`, `design-system.spec.ts`, `cancel.spec.ts` and `privacy.spec.ts` → AC-1, AC-8, AC-13, AC-21, AC-22, AC-23
- [x] `tests/unit/engine-worker.test.ts` → a review row carries exactly its old fields plus `beforeCut` and `afterCut` → AC-26

## Acceptance criteria coverage

- AC-1 · one pass step, `pnpm test:e2e` · AC-2 · idle step · AC-3 · file bar steps · AC-4 · phase steps · AC-5 · order step · AC-6 · count line steps · AC-7 · select all steps · AC-8 · dense fixture step and speed spec · AC-9 · ellipsis step · AC-10 · Cancel steps · AC-11 · result card steps · AC-12 · cleaned and partly steps · AC-13 · after download steps · AC-14 · refusal steps · AC-15 · open failure step · AC-16 to AC-18 · failure words steps · AC-19 · edge line step · AC-20 · focus walk · AC-21 · 320px step · AC-22 · design system spec · AC-23 · leave warning step · AC-24 · worker client test · AC-25 · detectors test and typecheck · AC-26 · worker test and typecheck
