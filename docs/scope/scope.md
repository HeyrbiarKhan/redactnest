# Scope: RedactNest

A web tool that truly redacts PDFs for small businesses handling sensitive documents. Text is removed from the content stream and metadata is stripped, never covered with a black box. Uploaded files are never stored.

**Build approach:** Skateboard (ship the thinnest usable whole first, then grow it).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack, scaffold & processing boundary | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Document session & privacy guarantee | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Redaction engine | Release 1 | done |
| 6 | Pattern detection | Release 1 | done |
| 7 | Scanned page detection & warnings | Release 1 | done |
| 8 | Redact flow | Release 1 | done |
| 9 | Privacy policy & terms | Release 2 | planned |
| 10 | Billing & paid plan | Release 2 | planned |
| 11 | Telemetry & error monitoring | Release 3 | planned |
| 12 | Remaining detectors | Release 3 | planned |
| 13 | Custom terms | Release 4 | planned |
| 14 | Manual rectangle redaction | Release 5 | planned |
| 15 | Marketing site | Release 6 | planned |
| 16 | Security & how it works page | Release 6 | planned |
| 17 | Data processing agreement | Release 6 | planned |
| 18 | AGPL compliance & source publication | Release 1 | planned |

## Foundations

### 1. Stack, scaffold & processing boundary · done
Decide where redaction actually runs (in the visitor's browser or on your server) and which engine does it, then scaffold a project that boots. This single answer drives the privacy story, the page cap, your hosting bill, and what every later feature is even able to do.
**Done when:** the processing boundary and the engine are recorded in a spec, the scaffold boots locally, and the build passes with the PDF engine loaded and able to open a file.
spec [0001](../specs/0001-browser-only-redaction-stack/index.md) · code in `src/` (`src/engine`, `src/worker`, `src/config`, `src/app/tool`)
- [x] Decide the stack (spec): `/architect stack, scaffold & processing boundary`
- [x] Scaffold from the decision: `/develop stack, scaffold & processing boundary`
- [x] Verify it: `/check verify stack, scaffold & processing boundary`
- [x] Test it: `/test stack, scaffold & processing boundary`

### 2. Coding standards & tooling · done
Capture conventions from the real scaffolded project, then install lint, format and pre commit enforcement so every later slice is written the same way.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format and pre commit run clean.
code in `eslint.config.mjs`, `prettier.config.mjs`, `lint-staged.config.mjs`, `vitest.config.mts`, `tests/setup/component.ts`, `.husky/pre-commit`, `.github/workflows/ci.yml`
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`
- [x] Check it runs clean: `/test`

### 3. Document session & privacy guarantee · done · GA
The shape of a redaction job while it is alive in memory (the file, the per page text layer flags, the detected items and their confirm state, the output) and the rules that stop it ever touching disk, a store, or a log. This is the promise the whole product rests on, so it gets decided once, here, rather than rediscovered in every feature.
**Done when:** a job exists only in memory for the life of one request or one tab, nothing is written to disk or to any store, buffers are released once the download is handed over, and logs carry counts only with no file name, no text and no document content.
spec [0002](../specs/0002-document-session-privacy-guarantee/index.md) · code in `src/worker`, `src/lib` (`session.ts`, `entitlement.ts`, `download.ts`), `src/app/tool`, `src/app/api/entitlement`, `eslint.config.mjs`
- [x] Design it (spec): `/architect document session & privacy guarantee`
- [x] Build it: `/develop document session & privacy guarantee`
  - [x] Protocol, config and the worker session registry: the full message envelope, `NEXT_PUBLIC_MATCH_CONTEXT_CHARS`, and a worker that holds a document across steps, evicting the previous one in place · AC-1, AC-5a, AC-5b, AC-6, AC-7, AC-8, AC-10, AC-11, AC-15
  - [x] The no storage guarantee, enforced and proved: the ESLint zone plus the instrumented browser test · AC-2, AC-3
  - [x] The session reducer and the tool client: state machine, frozen entitlement snapshot, `File` handle, leave and restore handling, and the once per job silent retry inside the engine load window · AC-1, AC-9, AC-11, AC-11a, AC-12, AC-13, AC-14
  - [x] The exit path: download, revoke, release, and exhaustive reducer tests · AC-4, AC-8, AC-10, AC-14
- [x] Verify it: `/check verify document session & privacy guarantee`
- [x] Test it: `/test document session & privacy guarantee`
- [x] Review it (fresh model): `/check review document session & privacy guarantee`
- [x] Document it: `/document document session & privacy guarantee`

### 4. Design system & UI foundation · done
The small set of primitives the core flow needs: layout, type, colour, buttons, the file drop surface, checklist rows, warning banners. Kept deliberately thin so it does not eat the first week. The summary panel moved to feature 8, which owns what it reports (spec 0003).
**Done when:** the primitives the redact flow needs exist, they are keyboard reachable with visible focus and sufficient contrast, and a page composed from them holds WCAG 2.2 AA on the core path.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `src/ui`, `src/lib/cx.ts`, `src/lib/routes.ts`, `src/lib/document-load.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/tool`, `next.config.ts`, `eslint.config.mjs`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Tokens, type and guards: the wiped palette and colour roles, Inter, the contrast test, the lint patterns and the `src/ui` zone · AC-1, AC-2, AC-3, AC-4, AC-19
  - [x] The tool page primitives and a restyled `/tool`: button, card, callout, drop zone with one tab stop, layout pieces, callouts outside the live region · AC-5, AC-6, AC-7, AC-8, AC-11, AC-12, AC-14, AC-16
  - [x] Proved in a real browser: axe, keyboard walk, 320px reflow, 200% text, reduced motion, forced colours, same origin requests only · AC-15, AC-16, AC-17, AC-18, AC-20
  - [x] The review vocabulary: checkbox, count badge, checklist group and row, empty state, with component and axe tests for every primitive · AC-5, AC-9, AC-10, AC-18
  - [x] The restyled home page · AC-13, AC-14, AC-15
  - [x] Every way into the tool is a real page load: `Button`'s `reload` prop on both home page links, and the load guard in `ToolClient` · AC-21
  - [x] The load guard cannot loop: it reloads only when the address bar reads `/tool`, otherwise shows the wrong URL callout, and lint lets only the tool page import `tool-client` · AC-21, INV-11
- [x] Verify it: `/check verify design system & UI foundation`
- [x] Test it: `/test design system & UI foundation`

## Release 1: A real redaction

The smallest usable whole. An anonymous visitor drops in a short PDF, sees what was found, ticks what to remove, and downloads a genuinely clean file. No accounts, nothing paid, no marketing site. Small, but a real tool somebody could use tomorrow.

### 5. Redaction engine · done · GA
The heart of the product. Given a document and a set of targets, remove the text from the content stream itself and strip everything else that quietly carries data, in one pass.
**Done when:** targeted text is gone from the content stream (extracting text from the output returns nothing for it, rather than returning text that sits under a covering box), and the output carries no document info or XMP metadata, no annotations, no form fields, no attachments, no bookmarks, no hidden layers, no JavaScript, and no earlier versions left behind by incremental saves.
spec [0004](../specs/0004-redaction-engine/index.md) · code in `src/engine/`, `src/worker/engine.worker.ts`, `src/app/tool/tool-client.tsx`
- [x] Design it (spec): `/architect redaction engine`
- [x] Build it: `/develop redaction engine`
  - [x] The door and the prepared page: protocol growth, the `%PDF-` byte check, the layer refusal, the shared prepare step and a silenced MuPDF log · AC-1, AC-2, AC-3, AC-22, AC-24
  - [x] A cleaned file leaves the tool: the rebuild, the structural self check, the worker's `redact`, the thin Redact and Download path with its outcome line, and the privacy proof's redaction leg · AC-7, AC-8, AC-9, AC-12, AC-13, AC-14, AC-15, AC-16, AC-19, AC-20, AC-21
  - [x] Targets really removed, and checked: target validation, the band, padded and box passes, the character and pixel self check with its two new kinds, the fixture matrix, two runs from one original, and the encryption fixtures (built) · AC-4, AC-5, AC-6, AC-10, AC-11, AC-13, AC-25, AC-26, AC-27
  - [x] A run stops cleanly: cancel between pages, one run at a time, a replacement that cancels a run in flight, and the browser cancel test · AC-17, AC-18, AC-23
  - [x] Slanted targets and images blanked too far refused before anything is removed: the slant check with its `slanted-text` kind, the image reach check, the padded area soundness check, the slant and image fixtures, and the pin on MuPDF's bounds behaviour · AC-5, AC-19, AC-27, AC-28, AC-29
  - [x] The self check sees text drawn off the page, so a match MuPDF moves off the page rather than removing it is refused: `CHECK_EXTRACTION_OPTIONS` with `clip=no` for the record and the check, the fixtures `next-line-0.pdf` to `next-line-4.pdf`, and the pin on MuPDF's `'` and `"` rewrite · AC-4, AC-13, AC-25
- [x] Verify it: `/check verify redaction engine`
- [x] Test it: `/test redaction engine`
- [x] Review it (fresh model): `/check review redaction engine`
- [x] Document it: `/document redaction engine`

### 6. Pattern detection · done
Find sensitive patterns and present them as a confirm checklist rather than removing anything on the user's behalf. This spec decides the detection approach and defines all seven pattern types; release 1 builds email and phone, and the rest follow in release 3 against this same spec.
**Done when:** email and phone are found across a document, each match is shown with enough surrounding context to judge it, nothing is removed without a tick, and every match maps to a target the engine can actually remove.
spec [0005](../specs/0005-pattern-detection/index.md) · code in `src/detect`, `src/engine` (`find.ts`, `characters.ts`, `targets.ts`), `src/worker/engine.worker.ts`, `src/lib` (`detectors.ts`, `session.ts`), `src/app/tool` (`review-checklist.tsx`, `tool-client.tsx`), `src/ui` (`checkbox.tsx`, `checklist-item.tsx`), `eslint.config.mjs`, `scripts/lib/detection-fixtures.mjs`
- [x] Design it (spec): `/architect pattern detection`
- [x] Build it: `/develop pattern detection`
  - [x] An email found, shown and removed: the protocol's `blocked` field, `src/detect` and its lint zone, the engine's find step, the worker, the session guards, the thin checklist with its coverage note and empty state, and the browser proofs · AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-17, AC-18, AC-25, AC-26
  - [x] Phone numbers: libphonenumber-js with `max` metadata, UK and US national formats plus international, and the look alike fixture · AC-2, AC-4, AC-6, AC-10, AC-17
  - [x] Nothing the engine would refuse can be ticked: the shared predicates, both extraction modes, and blocked rows with a reason · AC-8, AC-9, AC-13
  - [x] Wraps and hardening: the email rejoin, the adversarial input tests, and cancel during detection in the browser · AC-4, AC-11, AC-16
  - [x] Phone numbers side by side: our own phone finder with libphonenumber-js judging each window, the trunk and numeric date rules, the 2 s phone budget with its parse count proof, and the side by side fixture · AC-2, AC-6, AC-10, AC-16, AC-27
- [x] Verify it: `/check verify pattern detection`
- [x] Test it: `/test pattern detection`

### 7. Scanned page detection & warnings · done · GA
Detect per page whether a text layer exists, and never let somebody leave with a file that looks redacted and is not. Besides scanned pages, that covers three kinds of text a viewer never shows: text under a box drawn over it (a fake redaction already in the source), white or otherwise invisible text that is not OCR, and text outside the crop box, which is now removed in every run.
**Done when:** pages with no text layer are identified at upload and named plainly, the warning is repeated at download, and a document whose every page lacks a text layer produces no file at all, with a clear explanation of why instead. Text under a box and white or invisible text are named the same way, and text outside the crop box never reaches the output.
spec [0006](../specs/0006-scanned-page-detection-warnings/index.md) · code in `src/engine` (`device.ts`, `inspect.ts`, `trim.ts`, `open.ts`, `redact.ts`, `passes.ts`, `self-check.ts`, `find.ts`, `characters.ts`), `src/worker` (`protocol.ts`, `engine.worker.ts`), `src/lib` (`page-findings.ts`, `session.ts`, `detectors.ts`), `src/app/tool` (`tool-client.tsx`, `review-checklist.tsx`), `src/ui/checklist-item.tsx`, `scripts/lib/reading-fixtures.mjs`
- [x] Design it (spec): `/architect scanned page detection & warnings`
- [x] Build it: `/develop scanned page detection & warnings`
  - [x] Scans named, and no file for a document with nothing readable: the page reading, the refusal, the warnings at open and at download, and the partly redacted name · AC-1, AC-2, AC-3, AC-9, AC-10, AC-11, AC-12, AC-19, AC-20, AC-22, AC-23, AC-26, AC-27, AC-28, AC-29
  - [x] Pictures, OCR and the crooked scan: bare pictures, the stamp cap, the machine read note and the crooked scan line · AC-2, AC-4, AC-5, AC-21, AC-25
  - [x] Text a viewer never shows: covered and hidden text, and the row marks · AC-6, AC-7, AC-9, AC-13, AC-24
  - [x] Nothing outside the visible area survives: the foundation pins, the trim on both copies with its proof, the self check rules, the off page note and picture warning · AC-8, AC-14, AC-15, AC-16, AC-17, AC-18, AC-21, AC-22, AC-29
  - [x] What the build sent back (slice 4b, settled 2026-09-29): the cropped OCR scan pin first, then pictures kept and named with no pixel work, the image stream cost test, text a clip hides wholly named, and text under an empty clip refused · AC-5, AC-7, AC-8, AC-9, AC-10, AC-11, AC-14 to AC-18, AC-20, AC-22, AC-23, AC-29
- [x] Verify it: `/check verify scanned page detection & warnings`, including the real scan steps made locally (AC-30)
- [x] Test it: `/test scanned page detection & warnings`
- [x] Review it (fresh model): `/check review scanned page detection & warnings`
- [x] Document it: `/document scanned page detection & warnings`

### 8. Redact flow · done
The single page that is the product: drop a PDF, see what was found, tick what to remove, download the clean file, read the summary of what happened.
**Done when:** an anonymous visitor can take a document up to the page cap from drop to download in one pass, the cap is a config value (3 to start), the scanned page warnings surface in the flow, the summary shows counts by detection type plus what was sanitized, and failure states say plainly what went wrong.
spec [0007](../specs/0007-redact-flow/index.md) · code in `src/app/tool` (`tool-client.tsx`, `review-checklist.tsx`, new `action-panel.tsx`, `result-card.tsx`, `failure-callout.tsx`), `src/lib` (`session.ts`, `detectors.ts`, `page-findings.ts`, new `flow-text.ts`), `src/ui` (`drop-zone.tsx`, `checklist-item.tsx`, new `summary-list.tsx`, `checklist-select-all.tsx`), `src/worker` (`client.ts`, `protocol.ts`), `src/engine/find.ts`
**Also owed here:** `retireOtherJobs` in `src/worker/client.ts` skips pending operations under the same `jobId` as the open it is making room for. The worker makes no such exception: an open with the same `jobId` cancels that job's run in flight, and a cancelled run posts nothing. So if such an open ever reached a live worker while that job's redact was pending, the redact could never settle, and the visitor would sit on a run that neither finishes nor fails. It is not reachable today, because both callers that reuse a `jobId` get a fresh worker first. The redact flow is where a new path that reopens a job on a live worker would most likely appear, so check this when you add one. A suggested fix and its test are in the open follow up at the end of the [redaction engine review](../reviews/2026-09-27-feat-redaction-engine.md).
**Also owed here:** the review checklist is too slow on a big document. `ReviewChecklist` in `src/app/tool/review-checklist.tsx` renders every row again on each session change, with a new toggle handler per row, so a 50 page document with thousands of matches freezes the page for seconds, and a single tick takes 5 to 6 s. Feature 8 must avoid rendering a row again when nothing about it changed. Spec 0005's first Follow-up (measure at the paid cap, then decide on virtual scrolling or a cap) belongs to the same fix.
**Also owed here:** plain copy for `unsupported` when the trim's proof fails away from the page edge. Today that case shows the generic `unsupported` line (spec 0006, AC-16 and AC-26).
**Also owed here:** reword the `no-readable-text` advice in `src/lib/page-findings.ts` and `errorText` in `src/app/tool/tool-client.tsx`. "If you have the original" confuses people who only have the scan. Say "Run this file through text recognition (OCR) first" instead.
- [x] Design it (spec): `/architect redact flow`
- [x] Build it: `/develop redact flow`
  - [x] The session and the counts: `retireOtherJobs` hardened, the refusal that keeps the review, select all and rerun edges, the cleaned name, `resultCounts` · AC-7, AC-12, AC-13, AC-14, AC-23, AC-24, AC-25
  - [x] The steps take over: the file bar, the action panel above the checklist, the result card with its summary, failures in place, after download actions, focus · AC-2, AC-3, AC-5, AC-6, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-20
  - [x] The checklist: select all rows, memoised rows, the cut flags for the ellipsis, the dense fixture measured · AC-7, AC-8, AC-9, AC-26
  - [x] The words: every failure kind, the phase lines, the stripped list, the OCR advice and the fragment line · AC-4, AC-16, AC-17, AC-18, AC-19
  - [x] The browser proof and the amends: every step state under axe, the keyboard walk and 320px reflow, then specs 0001 to 0006 amended · AC-1, AC-21, AC-22, AC-23, AC-26
- [x] Verify it: `/check verify redact flow`
- [x] Test it: `/test redact flow`
- [x] Review it (fresh model): `/check review redact flow`

### 18. AGPL compliance & source publication · Alpha · from spec 0001
Spec 0001 chose MuPDF, which is copyleft, so RedactNest's own source is licensed AGPL 3.0 and published. The obligation attaches the moment the tool is publicly available and shipping the engine to visitors' browsers, which is this release rather than a later one. Artifex enforce their licence, so this is a real deliverable and not a formality.
**Done when:** the repository is public under AGPL 3.0, the licence file and third party notices are in place, every production deploy is tagged, and the source offer link in the footer and on the tool page resolves to the exact deployed commit rather than the repository root.
- [ ] Build it: `/develop AGPL compliance & source publication`
- [ ] Verify it: `/check verify AGPL compliance & source publication`

## Release 2: Take money

Short slice. The only paid benefit that exists yet is the removed page cap, and that is fine: it proves the payment path while you still have energy, and every later capability makes the same plan worth more.

### 9. Privacy policy & terms · Prototype
The commitments behind the product, published before money changes hands. The privacy policy is where the never stored claim stops being marketing copy and becomes something you are held to.
**Done when:** both pages are published and linked from the footer, and the privacy policy describes the in memory only processing and the counts only logging accurately.
- [ ] Build it: `/develop privacy policy & terms`

### 10. Billing & paid plan · needs a decision · GA
The paywall moment: an anonymous visitor hits the page cap, signs in, subscribes, and the cap is gone. The interesting part is that entitlement has to work with no database of your own.
**Done when:** a visitor at the cap can sign in, subscribe at around $19 a month, and immediately redact a document past the cap; a trial is offered if Polar supports one; cancelling restores the cap; the subscription can be managed; and no usage counter or user table of your own is introduced.
- [ ] Design it (spec): `/architect billing & paid plan`

## Release 3: See it working, and widen the net

### 11. Telemetry & error monitoring · needs a decision
Enough numbers to know whether the funnel works and whether anything is failing silently, without ever touching document content.
**Done when:** events carry counts only (page count, items redacted by type, completion, upgrade), analytics sets no cookies so no consent banner is needed, error reports are scrubbed of file names and content, and the only cookies in the product are the strictly necessary auth ones.
- [ ] Design it (spec): `/architect telemetry & error monitoring`

### 12. Remaining detectors
Dates, credit cards with Luhn validation, IBAN with checksum validation, US Social Security numbers, and UK National Insurance numbers, built against the detection spec already written in release 1.
**Done when:** all five appear in the confirm checklist with their validators applied, and dates in particular do not flood the checklist with noise.
- [ ] Build it: `/develop remaining detectors`

## Release 4: First paid capability

### 13. Custom terms · needs a decision
Type the names, reference numbers or phrases to remove and they go everywhere they appear. The first paid capability with real substance behind it.
**Done when:** a paid user can enter terms and every occurrence is removed from the content stream, including matches broken across line breaks and hyphenation, and the summary reports how many were removed.
- [ ] Design it (spec): `/architect custom terms`

## Release 5: Second paid capability

### 14. Manual rectangle redaction · needs a decision · GA
Draw a box, and everything under it goes. The only way to remove signatures, logos, handwriting, table cells and images, and the only useful answer for a scanned page.
**Done when:** a paid user can draw boxes on rendered pages, everything under a box is genuinely removed from the output including image data, screen coordinates map correctly to page coordinates at every zoom level, and there is a keyboard path to place and adjust a box.
- [ ] Design it (spec): `/architect manual rectangle redaction`

## Release 6: Get found and get trusted

### 15. Marketing site · needs a decision
A landing page plus a small set of pages on what this audience actually searches for, since search is the acquisition channel for a self serve tool at this price.
**Done when:** the landing page explains the guarantee and converts into the tool, the search pages are server rendered with metadata, sitemap and social cards, and Core Web Vitals pass on mobile.
- [ ] Design it (spec): `/architect marketing site`

### 16. Security & how it works page · Alpha
The page that closes the sale for HR, legal and healthcare buyers: what in memory processing means, what the logs do and do not hold, and why covering text with a box is not redaction.
**Done when:** the page describes the real implementation accurately, with no claim the code does not support.
**Also owed here:** a sticky note or a file attachment that shows in the source is flattened into the page like any other visible annotation (spec 0004, AC-22), so its icon stays as a mark on the page even though the note's text and the attached file are gone. Say so plainly, so the page does not suggest every trace of them was removed.
**Also owed here:** the honest limits from spec 0006. A picture reaching past the crop keeps its hidden pixels, and text a clip hides wholly stays in the file. Both are warned about and the file is named partly redacted, but neither is removed. The page warnings lean toward saying too much, so a brochure photo or a thin legal line can raise one.
- [ ] Build it: `/develop security & how it works page`

### 17. Data processing agreement · Prototype
Something a business buyer can sign, ready before somebody asks for it under time pressure.
**Done when:** a DPA is available, reflects the no storage reality, and lists any subprocessors.
- [ ] Build it: `/develop data processing agreement`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **OCR for scanned PDFs**: the obvious next move once rectangles exist · needs a decision
- **Per country EU national IDs**: beyond the UK National Insurance number already planned · needs a decision
- **Batch processing**: more than one document at a time · needs a decision
- **Teams and organizations**: shared accounts and seats · needs a decision
- **API access**: programmatic redaction · needs a decision
- **Downloadable receipt file**: an audit record alongside the redacted PDF, once the on screen summary has proved its shape · needs a decision
- **Dark mode**: light only for now (spec 0003). Needs its own decision: the colour roles redefined for dark, a second contrast contract, and axe runs in both schemes. It would follow the system setting, since a toggle cannot remember a choice without storage · needs a decision · from spec 0003
- **A memory limit for blanking scan pixels**: spec 0004's padded pass rewrites every scan page it touches as Flate. One ticked match on each page of a 50 page 300 dpi grey scan measured 917 MB and a file 4.9 times larger. Settle a limit before the paid page cap applies to scans · needs a decision · from spec 0006
- **Name the item behind a refused run**: carry the `MatchId` with a run refusal where the engine can trace one, so the checklist can point at it. Waits for feature 11's refusal counts, alongside spec 0005's Follow-up on `replacement-text` · needs a decision · from spec 0007
- **Page preview in review**: page images on the main thread are a new kind of document data (spec 0002, INV-1). Decide with feature 14, which renders pages for rectangles · needs a decision · from spec 0007
- **Cookie consent banner**: deliberately not built. The only cookies are the strictly necessary auth ones and analytics is cookieless, so no consent is required. Kept here so it does not get added later out of habit.

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on the stack feature), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` plus 2 to 5 milestones; the tier's closing boxes (`Verify it` at Alpha and up, `Test it` at Beta and up, `Review it` plus `Document it` at GA) |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` plus milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is; `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage is the suggested point to call it done |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards and tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits Beta. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
