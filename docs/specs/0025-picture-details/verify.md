# Verify: Details inside pictures · spec 0025 · updated 2026-11-24

_Steps derived from spec 0025's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

**Hard rule for every step:** use only the committed fixtures (`tests/fixtures/picture-*.pdf`) and documents built in a test or a scratch script from `scripts/lib/`. Never search for, open or upload a PDF or picture from anywhere else on the machine. Every JPEG and JPEG 2000 picture comes from the fixture script's own code.

## UI / manual

- [x] On `/tool` (a production build, Pro answered through Playwright's routing or a signed in sandbox account, since the fixture has 7 pages), open `picture-jpeg.pdf` → it opens with page 6's address found and ticked, and no refusal → AC-1, AC-14
- [x] Make the file → the result card says "1 email address" and its "Also stripped" line reads "XMP metadata and picture details" → AC-9, AC-14
- [x] Download it, then read every stream's stored bytes in Node with MuPDF (`readRawStream`, never decoded) → none of `PICTURE_MARKERS["picture-jpeg.pdf"]` is there; `RN-ICC-KEPT-4` is → AC-2, AC-10, AC-14
- [x] Open the downloaded file and the source side by side at 200% → every picture looks the same, page 6's under the box aside → AC-10
- [x] Open `picture-kept.pdf` and make the file with nothing ticked → no "Also stripped" picture details; every `PICTURE_MARKERS["picture-kept.pdf"]` marker is still in the download (page 3's in the decompressed page content) → AC-1, AC-4, INV-6
- [x] Open `picture-jpx.pdf` and make the file → "XMP metadata and picture details"; none of its markers in the raw streams; every picture draws grey as before → AC-3, AC-9, AC-10
- [x] `/security`, Hidden data → the picture paragraph reads AC-11's words exactly, and the change list's newest entry is dated the merge day (move `2026-11-24` in `SECURITY_CHANGES` if it merges later) → AC-11
- [x] `/` → the Strips card lists neither XMP metadata nor picture details → AC-11
- [x] Search pages (`/redact-pdf`, `/remove-text-from-pdf`, `/black-box-redaction`) → no word about metadata or pictures changed → AC-11

## Commands

- [x] `pnpm exec vitest run tests/unit/picture-reader.test.ts` → every kept and dropped marker, fills, stuffing, restarts, tails, JFIF and ICC branches, and each `as-stored` case pass → AC-2, AC-3, AC-4, AC-5
- [x] `pnpm exec vitest run tests/unit/redaction-pictures.test.ts` → the MuPDF pins, each fixture page, the guard, the cancel and the check pass → AC-1 to AC-10
- [x] `pnpm exec vitest run tests/unit/redaction-gate-0.test.ts tests/unit/redaction-gate-1.test.ts tests/unit/redaction-gate-2.test.ts tests/unit/redaction-gate-3.test.ts` → every fixture draws as main drew it with `MAIN` swapping the strip out → AC-10
- [x] `pnpm exec vitest run tests/unit/cost.test.ts` (alone) → the strip adds under 1 s of CPU and its live peak is within 5%; spec 0019's budgets still pass → AC-12
- [x] `pnpm exec playwright test tests/e2e/engine.spec.ts --project=chromium -g "pictures"` → passes → AC-14
- [x] `node scripts/make-fixture.mjs` then `git status tests/fixtures` → clean (the script writes the same bytes every run) → AC-13, INV-8

## Value sourcing (one step per row, each at the edge that breaks if the source is wrong)

- [x] Which objects are pictures: a picture reached only as a soft mask, and one only inside a form, are both stripped (`picture-jpeg.pdf` page 5); an inline DCT picture is not (`picture-kept.pdf` page 3) → AC-1
- [x] The filter: a direct `/DCTDecode` strips; `[/FlateDecode /DCTDecode]` stays as stored (`picture-kept.pdf` page 1); in a scratch test built from `scripts/lib/`, an indirect `/Filter` and `/DCT` as a stream name stay as stored → AC-1
- [x] Whether ICC stays: page 3 (`/ColorSpace /DeviceRGB`) loses `RN-ICC-GONE-3`; page 4 (no `/ColorSpace`) keeps `RN-ICC-KEPT-4` → AC-2
- [x] The stored bytes: the control (page 7) keeps every byte, its `\r\n` tail included → AC-5
- [x] What stays: Adobe on page 2 and JFIF on pages 1 and 3 stay; `JFXX`, `MPF`, EXIF, XMP, IPTC, comments and the appended picture go → AC-2
- [x] A rewritten JFIF header: page 3's output JFIF segment has length 16 and thumbnail size 0, its version and density unchanged → AC-2
- [x] A rewritten Adobe header: a scratch JPEG with a 20 byte Adobe payload leaves with a 12 byte one → AC-2
- [x] A rewritten box header: `picture-jpx.pdf` page 1's `jp2h` length drops by the `res ` box's size; page 3's `jp2c` keeps length 0 → AC-3
- [x] The guard's comparison: the guard seam that flips one kept byte fails the run with `unsupported` → AC-6
- [x] `sanitized`: nothing ticked on `picture-kept.pdf` reports nothing; on `picture-jpeg.pdf` both kinds, in `SANITIZED_KINDS` order, after any inventory kind → AC-9
- [x] The self check's verdict: the strip skipped fails `picture-jpeg.pdf` and `picture-jpx.pdf` with `redaction-incomplete`; a clean output with one picture's original bytes put back reads as a leak → AC-8
- [x] The result card's words: "Picture details" leads when it is the only kind; mid line it reads "picture details" → AC-9
- [x] The security page's line: AC-11's words, its source comment naming AC-1, AC-2, AC-3, AC-4 and AC-8 → AC-11

## Acceptance criteria coverage

- AC-1: Value sourcing rows 1 and 2, manual step 5 · AC-2: manual step 3, Value sourcing rows 3 to 7 · AC-3: manual step 6, Value sourcing row 8 · AC-4: manual step 5, the reader command · AC-5: Value sourcing row 4 · AC-6: Value sourcing row 9 · AC-7: the run command (page 6 blanked, written as Flate) · AC-8: Value sourcing row 11 · AC-9: manual steps 2 and 6, Value sourcing rows 10 and 12 · AC-10: manual steps 3 and 4, the gate command · AC-11: manual steps 7 to 9 · AC-12: the cost command · AC-13: the fixture command · AC-14: manual steps 1 to 3, the browser command
