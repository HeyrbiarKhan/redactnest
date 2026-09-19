# Scope: RedactNest

A web tool that truly redacts PDFs for small businesses handling sensitive documents. Text is removed from the content stream and metadata is stripped, never covered with a black box. Uploaded files are never stored.

**Build approach:** Skateboard (ship the thinnest usable whole first, then grow it).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack, scaffold & processing boundary | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Document session & privacy guarantee | Foundation | planned |
| 4 | Design system & UI foundation | Foundation | planned |
| 5 | Redaction engine | Release 1 | planned |
| 6 | Pattern detection | Release 1 | planned |
| 7 | Scanned page detection & warnings | Release 1 | planned |
| 8 | Redact flow | Release 1 | planned |
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

### 1. Stack, scaffold & processing boundary · in-progress
Decide where redaction actually runs (in the visitor's browser or on your server) and which engine does it, then scaffold a project that boots. This single answer drives the privacy story, the page cap, your hosting bill, and what every later feature is even able to do.
**Done when:** the processing boundary and the engine are recorded in a spec, the scaffold boots locally, and the build passes with the PDF engine loaded and able to open a file.
spec [0001](../specs/0001-browser-only-redaction-stack/index.md)
- [x] Decide the stack (spec): `/architect stack, scaffold & processing boundary`
- [ ] Scaffold from the decision: `/develop stack, scaffold & processing boundary`
- [ ] Verify it: `/check verify stack, scaffold & processing boundary`
- [ ] Test it: `/test stack, scaffold & processing boundary`

### 2. Coding standards & tooling
Capture conventions from the real scaffolded project, then install lint, format and pre commit enforcement so every later slice is written the same way.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format and pre commit run clean.
- [ ] Capture conventions + tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

### 3. Document session & privacy guarantee · needs a decision · GA
The shape of a redaction job while it is alive in memory (the file, the per page text layer flags, the detected items and their confirm state, the output) and the rules that stop it ever touching disk, a store, or a log. This is the promise the whole product rests on, so it gets decided once, here, rather than rediscovered in every feature.
**Done when:** a job exists only in memory for the life of one request or one tab, nothing is written to disk or to any store, buffers are released once the download is handed over, and logs carry counts only with no file name, no text and no document content.
- [ ] Design it (spec): `/architect document session & privacy guarantee`

### 4. Design system & UI foundation · needs a decision
The small set of primitives the core flow needs: layout, type, colour, buttons, the file drop surface, checklist rows, warning banners, the summary panel. Kept deliberately thin so it does not eat the first week.
**Done when:** the primitives the redact flow needs exist, they are keyboard reachable with visible focus and sufficient contrast, and a page composed from them holds WCAG 2.2 AA on the core path.
- [ ] Design it (spec): `/architect design system & UI foundation`

## Release 1: A real redaction

The smallest usable whole. An anonymous visitor drops in a short PDF, sees what was found, ticks what to remove, and downloads a genuinely clean file. No accounts, nothing paid, no marketing site. Small, but a real tool somebody could use tomorrow.

### 5. Redaction engine · needs a decision · GA
The heart of the product. Given a document and a set of targets, remove the text from the content stream itself and strip everything else that quietly carries data, in one pass.
**Done when:** targeted text is gone from the content stream (extracting text from the output returns nothing for it, rather than returning text that sits under a covering box), and the output carries no document info or XMP metadata, no annotations, no form fields, no attachments, no bookmarks, no hidden layers, no JavaScript, and no earlier versions left behind by incremental saves.
- [ ] Design it (spec): `/architect redaction engine`

### 6. Pattern detection · needs a decision
Find sensitive patterns and present them as a confirm checklist rather than removing anything on the user's behalf. This spec decides the detection approach and defines all seven pattern types; release 1 builds email and phone, and the rest follow in release 3 against this same spec.
**Done when:** email and phone are found across a document, each match is shown with enough surrounding context to judge it, nothing is removed without a tick, and every match maps to a target the engine can actually remove.
- [ ] Design it (spec): `/architect pattern detection`

### 7. Scanned page detection & warnings · needs a decision · GA
Detect per page whether a text layer exists, and never let somebody leave with a file that looks redacted and is not.
**Done when:** pages with no text layer are identified at upload and named plainly, the warning is repeated at download, and a document whose every page lacks a text layer produces no file at all, with a clear explanation of why instead.
- [ ] Design it (spec): `/architect scanned page detection & warnings`

### 8. Redact flow · needs a decision
The single page that is the product: drop a PDF, see what was found, tick what to remove, download the clean file, read the summary of what happened.
**Done when:** an anonymous visitor can take a document up to the page cap from drop to download in one pass, the cap is a config value (3 to start), the scanned page warnings surface in the flow, the summary shows counts by detection type plus what was sanitized, and failure states say plainly what went wrong.
- [ ] Design it (spec): `/architect redact flow`

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
