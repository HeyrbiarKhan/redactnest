# Review, feat/security-page, 2026-11-15

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 30 files, branch vs main
**Verdict**: Approve with nits

## Summary

This branch adds the `/security` page as a static server component in the legal pages' frame, a `CoverFigure` primitive for the drawing, a footer link, a shared id for the home band, and the tests and spec notes around them. I traced each claim on the page to the engine, the worker and the specs. The absolutes sit behind real gates (the self check, the content security policy, the open refusals, the closed kind records), and the limits are written as "can" lines. I found no claim that breaks AC-5. There are two minor wording points and a few nits, including your three notes.

## Minor

### 🟡 The original copy line does not say what it can hold, `src/app/security/page.tsx:224`
**Problem**: The line reads "The original copy of a figure or picture under a removed item can stay in the file, untouched, when another part of the file points to it." This is true (spec 0018 item 17 measured it). But a buyer can read "original copy of a figure" as a spare picture, not as the very text they ticked. The word "untouched" also works against the point: the reader hears "harmless". Your note c is right. The page's own text check, a section below, says "none lying in one is left", and a reader can take that as a promise about the whole file, since only the line above says otherwise.
**Why it matters**: This is the one place where the page's limit is about a ticked value, not metadata. Stating it so it is easy to read past undercuts the "look over the document" advice. It is not an AC-5 failure, because the sentence is a true "can" line.
**Suggested fix**: Say what it can hold, in a kind: "can stay in the file, still holding what you ticked". Leave the exact cases to the specs. Optionally let the text item in The check on every file say it reads the pages' drawing instructions, so the two sections agree. Fixing the engine stays on feature 30.

### 🟡 "None of these is reported" sits next to a list that includes reported kinds, `src/app/security/page.tsx:375`
**Problem**: In the Hidden data paragraph, "none of these is reported" is true of page labels, viewer preferences and automatic actions (no `SANITIZED_KINDS` entry). The next sentence, "Its links and its accessibility tags no longer work either", comes right after it. `accessibility-tags` is in `SANITIZED_KINDS` and `src/engine/inventory.ts` reports links as `annotations`. A reader who takes "these" to cover the paragraph reads a false line.
**Why it matters**: It is an absolute with a loose referent, on a page whose rule is that absolutes need a gate.
**Suggested fix**: Move "none of these is reported" so it is clearly about the first group, or name the group ("page labels, viewer preferences and automatic actions … are not reported"). The comment's gate (`SANITIZED_KINDS`) then matches the words.

## Nits

- ⚪ `src/app/security/page.tsx:341`, your note a: the Hidden data pointer ("the kinds of hidden data RedactNest looks for") and the structure item ("the check looks for the hidden data the home page lists") state the same fact from two sides. A pointer may name its subject (AC-6), and "looks for" is nearly a claim, so it brushes against "Said once". It is not worth a change on its own. If you touch either line for the first minor, make the pointer say only "The home page lists the hidden data kinds" and leave "looks for" to the check.
- ⚪ `src/app/security/page.tsx:377`, your note b: "Its links … no longer work" is true of the link annotations the rebuild removes, which is what the check holds. Chrome and Acrobat make a typed web address clickable on their own. The error is on the safe side (it promises less function, not less removal), so it stays a nit. "The file's link areas are removed" would be exact.
- ⚪ `src/ui/AGENTS.md:3`, it still says "twenty four" primitives and does not mention `CoverFigure`. This is /sync's job on merge.
- ⚪ `src/ui/cover-figure.tsx:42`, a few comment lines run well past the file's usual width (42 to 50). Prettier leaves comments alone, so this is only tidiness.
- ⚪ `src/app/security/page.tsx:446`, one comment line is much longer than its neighbours, and line 458 holds a long run of text in a comment. Same tidiness point.

## Claims traced (no findings)

- Worker holds the document, MuPDF runs in it; Start over and `pagehide` terminate it (spec 0002, AC-5a, AC-5b, INV-6). The replacement wording ("released for reuse") matches the spec, and a test bans "wipe" and "erase".
- Text check: both extraction modes with `clip=no`, whitespace skipped, replacement text ignored in the second read, a character under a box fails (`CHECK_EXTRACTION_OPTIONS`, spec 0004 AC-13, INV-10). Off page rule is spec 0006 AC-17; a straddling character may go or stay (AC-16).
- Pictures: images meeting a target quad must be blank, and one that cannot be decoded counts as not blank (AC-13).
- Structure: the three allowlists and the carrier key sweep are in `src/engine/rebuild.ts` and `self-check.ts`. The page claims only a single version and that the check "looks for" the listed kinds, and the "can" line covers the keys the rebuild leaves below the catalog and pages.
- Refusals at open: not a PDF, damaged, password (`needsPassword`), any `/OCProperties` (`hasLayers`), no readable page (spec 0006 AC-10). "Among others" keeps the list honest.
- No names or postal address detector exists in `src/detect`; the custom term is plain words (spec 0017, INV-5).
- Metadata description and every absolute in the comments name their gate or the step that does not exist.

## Strengths

- Every paragraph carries a source comment in AC-5's order, and the comments say which absolute rests on which gate. This made the claim by claim trace quick and honest.
- The page is a plain server component; words come from the page file and `SECURITY_SECTIONS`, paths from `routes.ts`, and the band link uses a shared `HOME_BAND_ID`, so a renamed heading breaks typecheck, not a link.
- `CoverFigure` is a clean primitive: native elements, `aria-hidden` drawings with the meaning in visible words, the box as an SVG in `currentColor` so forced colours keep it, a container query for the layout, and no new colour pairing.
- The tests hold AC-5 in the way the spec asks: banned outcome phrases as whole words, one pin per AC-7 line per section, the exact link set, and guards for each earlier verify's phrases.

## Test coverage

Covered: banned phrases (AC-5), pinned phrases per section (AC-7), the link set (AC-6), `SECURITY_SECTIONS` order (AC-4), static server component rules (`policy-pages.test.ts`, AC-11), the footer link (`site-nav.test.tsx`, `shell.spec.ts`), the figure's accessibility and layout (`cover-figure.test.tsx`, `legal-pages.spec.ts`). The one gap is inherent to the "Sourced" rule: no test checks that a source comment names an item that exists and says the thing. The spec assigns that to verify's walk, which was done. If you change the original copy line, update its pin and its guard so the old words stay out.
