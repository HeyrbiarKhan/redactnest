# Verify: Pattern detection · spec 0005 · updated 2026-09-27

_Steps derived from spec 0005's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development. The fixtures are `tests/fixtures/detect-*.pdf`, written by `node scripts/make-fixture.mjs`; every one is within the free cap of 3 pages. Context is 40 characters either side unless a step says otherwise.

Built: slices 1 to 4 of the build plan. **Open**: AC-16's budget for the phone detector. It is linear, but a 100,000 character adversarial block (`+44 ` repeated) took 0.6 to 1.4 s on the build machine, over the one second AC-16 sets, so its budget test is not committed. Owed to `/architect`.

## UI / manual

- [ ] Open `detect-email.pdf` → the info note reads "RedactNest looked for email addresses and phone numbers. Anything else, such as names and addresses, stays in the file." above one "Email addresses" group of 12 rows, every one ticked → AC-1, AC-3, AC-14
- [ ] In that group → `jane.doe@example.com` is two rows, `support@example.net` has no `mailto:`, `sales@example.org` has no full stop, the fullwidth address reads `info@example.com`, the ligature address reads `finance@example.com`, and the Greek, Cyrillic and Hebrew addresses are there, in page order then reading order → AC-1, AC-3
- [ ] Each row → its page ("Page 2"), and up to 40 characters either side with runs of spaces collapsed; the Greek row's context starts "Ελλάδα: " and never shows page 1's text → AC-5, INV-6
- [ ] Open `detect-phone.pdf` → a "Phone numbers" group: `020 7946 0958`, `+44 20 7946 0958`, `(212) 555-0123`, `1-800-555-0199`, `00 44 20 7946 0012`, `020 7946 0321 ext. 123`, `12345678902` (after `Tel:`) and the wrapped `020 7946 0777` ticked; `(212) 123 4567` and `12345678901` unticked; no row for `INV-2026-000123`, the dates, the postcodes or the ZIP codes → AC-2, AC-4, AC-10
- [ ] Open `detect-blocked.pdf` → `slanted@example.com`, `image@example.com`, `dave@example.com` and `hidden@example.com` each listed with a disabled checkbox and its reason line (steep angle, image, replacement text, replacement text); clicking one changes nothing; `plain@example.com` is ticked; `gave@example.com` never appears → AC-8, AC-9, AC-13
- [ ] In `detect-blocked.pdf`, tick only `wide@example.com` (page 3) and press **Redact** → the run fails with the replacement text message and offers no file (the recorded limit, never a leak) → AC-9
- [ ] Open `detect-wraps.pdf` → `jane.doe@example.com` and `sales@example.org` listed with no space in them, `smith@example.com` listed without "Bob.", nothing from page 2 → AC-4
- [ ] Open `kerning.pdf` → the info note, then "Nothing found to remove" and "RedactNest found no email addresses or phone numbers. Redact still makes a cleaned copy, with metadata and hidden content removed." → AC-14
- [ ] Open `detect-email.pdf`, untick `sales@example.org`, redact, download, open the file in two readers and paste each page's text → every ticked address is gone, `sales@example.org` is still there, and the words around each removed address read as before → AC-6, AC-13
- [ ] Keyboard only → Tab goes Choose a PDF, the group summary, each checkbox that is not blocked, Redact, Start over, each with a visible ring; Space ticks and unticks; Enter and Space on a summary close and open the group → AC-13
- [ ] Press **Redact** on a document with matches → every checkbox is disabled until the run ends → AC-13
- [ ] Screen reader (NVDA or VoiceOver) → a row reads as the address, "checkbox, checked", then "Page 1" and the context line; a blocked row adds its reason; a group reads its label and "12 email addresses"; the list is not read out as it appears → AC-13
- [ ] Forced colours (Windows High Contrast) → every checkbox is the system's own control, disabled ones look disabled, the highlighted match uses the system highlight → AC-13
- [ ] At 320 CSS pixels wide → the longest address wraps inside its row and the page never scrolls sideways → AC-13
- [ ] Devtools Network and Application while opening and redacting `detect-email.pdf` → no request carries any address or context, and nothing is written to any store → AC-15
- [ ] Open a long text heavy document (for example the dense one `tests/e2e/cancel.spec.ts` builds) and choose a second file while "Looking for sensitive details" shows → the second opens, the first never appears → AC-11

## The steps other specs left for feature 6 (AC-18)

Each is ticked in its own spec's `verify.md` as well as here.

- [ ] Spec 0002: with a tick changed, choose a second file → asked first; yes replaces the session, no keeps it → its AC-1
- [ ] Spec 0002: with a tick changed, close the tab → the browser's leave warning → its AC-13
- [ ] Spec 0002: from complete, change one tick, run again and download a second time without the file picker → the second file matches the new ticks → its AC-14
- [ ] Spec 0004: a ticked match leaves a box no wider than the match and no taller than its line, and pasting the page's text shows the match gone and its neighbours present → its AC-4, AC-6
- [ ] Spec 0004: in single spaced text, the lines above and below a ticked match read exactly as before (use a document with an address in single spaced lines) → its AC-4, AC-6
- [ ] Spec 0004: on a real OCRmyPDF scan, a ticked match with descenders leaves no ink around or below its box → its AC-5, AC-13
- [ ] Spec 0004: two ticks, then one unticked and run again → the unticked match is in plain text → its AC-11
- [ ] Spec 0004: on a scan fed about a degree crooked, a match redacts and a long line is shown blocked `slanted-text` during review → its AC-28, AC-29
- [ ] Spec 0003: Enter and Space on a group summary close and open it; a long unbroken address wraps inside its row; the checkbox falls back to the native control in forced colours; a row reads as the match, then "Page N" and the context line; a compact count badge reads with its noun → its review vocabulary checks

## Value sourcing

- [ ] `matches[].id` → open the same file twice: the rows are the same, and the worker test "mints a fresh id for every match, and new ones for the next document" passes → minted with `crypto.randomUUID()` in the worker
- [ ] `matches[].type`, target `kind` → each address sits in "Email addresses" and each number in "Phone numbers", and a run's `removedByType` counts them by kind (worker and engine tests) → the span's `kind`
- [ ] `matches[].page` → `detect-email.pdf`'s rows read Page 1, 2 and 3 as the file lays them out → the page index read, plus one
- [ ] `matches[].text` → the fullwidth address shows as `info@example.com`, a wrapped address shows without a space → the NFKC page text, a rejoined join left out
- [ ] `matches[].before`, `.after` → build with `NEXT_PUBLIC_MATCH_CONTEXT_CHARS=10` and reopen: context shortens to 10 characters either side; with `0`, the rows show the match alone → `contextChars` from the open request
- [ ] `matches[].tickedByDefault` → email ticked; phone ticked only when valid and written like a number; blocked never ticked → AC-10
- [ ] `matches[].blocked` → `detect-blocked.pdf` gives each reason in AC-8's order → the find step's checks through the shared predicates
- [ ] Target `page`, `quads` → after a run, each black box sits on its match's own line, one box per line for a wrapped value → characters grouped by line along the line's direction
- [ ] Target `start`, `end` → not read by anything yet (feature 13); nothing to see
- [ ] Target `text` → the fullwidth address and the address holding U+20BB7 (`detect-unicode.pdf`) both redact → the raw code points, which validation compares
- [ ] Detector constants → a UK national number and a US national number are both found; `Tel:` 32 characters before a bare number ticks it, 33 does not → `PHONE_REGIONS`, `KEYWORD_REACH`, `PHONE_WORDS`
- [ ] Group icon, label, noun → an envelope and "Email addresses", a handset and "Phone numbers", with "email address(es)" and "phone number(s)" in the count → `DETECTOR_LABELS`
- [ ] Group count → equals the rows in the group → derived from the matches
- [ ] Row checked → follows every tick change → `session.ticked`
- [ ] Row disabled → blocked rows always, every row while redacting → `match.blocked`, `session.state`
- [ ] Blocked reason line → matches `BLOCKED_REASON_TEXT` word for word → `src/lib/detectors.ts`
- [ ] Coverage note and empty state lists → "email addresses and phone numbers", "email addresses or phone numbers" → `DETECTOR_KINDS` through `Intl.ListFormat`
- [ ] `detecting` phase text → "Looking for sensitive details" shows while a long document opens → `PHASE_TEXT.detecting`
- [ ] Redact targets → only ticked, unblocked ids reach the worker, and a hand made `redact` naming a blocked id is `unsupported` (worker test) → the worker's `targets` map
- [ ] `DetectionCounts` → `tests/unit/detectors.test.ts` passes → `detectionCounts(session.matches)`

## Commands

- [ ] `pnpm test` → all pass, including `detect-email`, `detect-phone`, `detect`, `detect-adversarial`, `detection`, `detectors`, `engine-worker`, `engine-wall` and `session` → AC-1 to AC-17, AC-25, AC-26
- [ ] `pnpm typecheck` → passes, with the `PRECEDENCE` gate in `detect.test.ts` and the `DetectionCounts` gate in `loggable.test.ts` → AC-15, AC-24
- [ ] `pnpm lint` → passes; `engine-wall.test.ts` proves the `@/detect`, `libphonenumber-js` and `search()` bans and the detect zone → AC-17, INV-5, INV-8, INV-11
- [ ] `pnpm test:e2e` → all pass: the review states in `design-system.spec.ts`, `review.spec.ts`, the detected run in `privacy.spec.ts`, and the detection replacement in `cancel.spec.ts` → AC-11, AC-13, AC-15, AC-18
- [ ] `node scripts/make-fixture.mjs && git status tests/fixtures` → nothing changes

## Acceptance-criteria coverage

- AC-1 · email rows in `detect-email.pdf`; `detect-email.test.ts`, `detection.test.ts`
- AC-2 · phone rows and look alikes; `detect-phone.test.ts` (open: ZIP+4 such as `90210-1234` and dotted dates such as `05.12.1980` come back as possible GB numbers and would be listed unticked, owed to `/architect`)
- AC-3 · one row per occurrence, group order; `detect.test.ts`, `review-checklist.test.tsx`
- AC-4 · `detect-wraps.pdf`, the wrapped phone number; rejoin tests
- AC-5 · context steps, `contextChars` 10 and 0
- AC-6 · untick and redact; "every unblocked match redacts" in `detection.test.ts`
- AC-7 · quads against `search()` in `detection.test.ts`
- AC-8 · `detect-blocked.pdf`; session and worker guards
- AC-9 · `dave@`, `hidden@`, and the pinned `wide@` and `es@` limit
- AC-10 · phone ticks, `Tel:` reach
- AC-11 · replacement while detecting, in the worker and the browser
- AC-12 · `detection.test.ts` "reading pages"
- AC-13 · keyboard, screen reader, forced colours, 320px; `design-system.spec.ts`
- AC-14 · the info note and `kerning.pdf`'s empty state
- AC-15 · devtools step; `privacy.spec.ts`; `loggable.test.ts`
- AC-16 · `detect-adversarial.test.ts` (email budget, linear growth for both; phone budget open)
- AC-17 · `engine-wall.test.ts`
- AC-18 · the section above
- AC-25 · `detect-many.pdf`: 600 rows, all redacted; the 500 quad guard
- AC-26 · `detect-unicode.pdf`, and the pin on MuPDF.js's walker
