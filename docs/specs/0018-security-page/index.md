# 0018. Security page

**Status**: Assumed
**Date**: 2026-11-14
**Authorized by**: Heyrbiar Khan, during /develop

## Owed decision

The scope recorded that feature 16, the security and how it works page, needs no spec for its content (your call, 2026-11-14): every claim on it is one an earlier spec already records. What no spec settles is the page itself and its way in:

- Spec 0013's AC-8 lists the footer's links exactly ("Redact a PDF" and "Pricing" in Product, "Privacy policy" and "Terms of service" in Legal), and AC-7 the header's, so any link to a new page changes what AC-8 says.
- The page's path, title, frame and order of sections, and whether it shows a drawing of a box laid over text next to real removal.

## Assumption built on

Your answers during `/develop` on 2026-11-14:

- **Path and title.** The page lives at `/security` (`SECURITY_PATH` in `src/lib/routes.ts`). Its title and `h1` are "Security", and its metadata title is "Security · RedactNest" with a description of its own.
- **Way in.** The footer's Product group gains "Security" after "Redact a PDF" and before "Pricing" (Pricing still only with billing on), on every page, `/tool` included: a plain link in the same tab, underlined like every footer link, its words in `NAV_TEXT` in `src/app/site-nav.tsx` and its path from `src/lib/routes.ts`. The header does not change. Spec 0013's AC-8 owes a rewording to name it, which ratifying this spec settles.
- **Frame.** The legal pages' frame (`LegalPage` in `src/app/legal-page.tsx`, spec 0013's AC-25): the `h1`, "Last updated" from the page's own dated change list (`SECURITY_CHANGES` in `src/lib/policy-changes.ts`), the On this page list, and the text in `Prose` in the reading column. A prerendered static server component with no client component and no script of its own, under the standard content security policy, never `/tool`'s.
- **Sections.** Its `h2` headings live in `SECURITY_SECTIONS` in `src/lib/policy-sections.ts`, in this order: Your document stays in your browser; Removed, not just covered; The check on every file; Hidden data; What it finds; What it can miss; Pages it can’t fully read; When it stops instead; Plans and the page limit; Logs, counts and error reports; Check it yourself; Changes.
- **The drawing.** Under "Removed, not just covered", a figure of two small page drawings that look the same: a short document whose contact line ends in a black box. Under each, the words a copy of its text gives. The first, "A box drawn over the text", still gives the address under the box; the second, "Removed, then marked", gives the line with nothing after it. A caption says both look the same and only the second took the words out of the file. It is `CoverFigure`, a primitive in `src/ui`, built from the existing tokens with no new colour pairing. The drawings are hidden from assistive technology, and each panel's meaning is in its visible words. Side by side when the reading column has room, stacked when it does not, and at 200% text. The box stays solid in forced colours mode.
- **Words.** Every word on the page is written in the page file, as the legal pages' are, and the drawing's words are passed to the primitive as props.

## Code area

`src/app/security/page.tsx` (new), `src/ui/cover-figure.tsx` (new), `src/app/site-nav.tsx`, `src/app/legal-page.tsx` (comments), `src/lib/routes.ts`, `src/lib/policy-sections.ts`, `src/lib/policy-changes.ts`, `src/lib/home-text.ts` (the band's anchor), `src/app/page.tsx`, `src/app/globals.css` (a comment); tests in `tests/component/ui/cover-figure.test.tsx` (new), `tests/component/app/security-page.test.tsx` (new), `tests/unit/policy-pages.test.ts`, `tests/unit/policy-sections.test.ts`, `tests/e2e/legal-pages.spec.ts` and `tests/e2e/shell.spec.ts`.

## Requirements

Seeds from the scope's *Done when* and *Also owed here* for feature 16 and your notes of 2026-11-14. Each says what happens, never a pixel figure.

- **AC-1**: `/security` answers 200 as a prerendered static page with the shell (the header with "Try it free", `main` with the skip link's target, the footer), one `h1` "Security", the title "Security · RedactNest", its own description, and nothing asking not to be indexed.
- **AC-2**: Every page's footer, `/tool` included, shows "Security" in the Product group after "Redact a PDF" and before "Pricing" (with billing on), a plain link to `/security` in the same tab, large enough to press, before the licence notice. The footer still has exactly one paragraph, the licence notice.
- **AC-3**: The page behaves as the legal pages do under spec 0013's AC-25: "Last updated" and every change dated in a machine readable time, the On this page list naming every `h2` in order and landing on each, beside the text on a wide screen and above it otherwise, staying in view on a wide screen and scrolling with the page at 200% text.
- **AC-4**: The page's `h2` headings are `SECURITY_SECTIONS`, word for word and in order, and the page never skips a heading level.
- **AC-5**: The page describes the real implementation and makes no claim the code and the specs do not support. Each paragraph's source is named in a comment beside it (a spec and its criterion, invariant or recorded limit, or a measurement), so `/check verify` can walk them.
- **AC-6**: Where another page already says a thing, the security page links to it rather than restating it: the privacy policy's Your documents (claims C1 to C5, the plan check among them), What we receive when you visit (C10), and Counts and error reports (C14 to C16); the Terms of service's Checking the result is your job; the home page's list of what RedactNest finds and strips; and the footer's source link. Every link to a section lands on a heading that exists.
- **AC-7**: The page names the honest limits the specs record, in plain words:
  - In memory processing (spec 0002): where the document lives, how a session ends, that between two documents the first is unreachable rather than erased, the retained file handle, and what no website controls (swap and page files, the browser's memory and crash reports, extensions, the visitor's own disk). No record of documents or redactions is kept, on purpose.
  - Removal (spec 0004): removed, then marked; the self check on the exact bytes, all or nothing; the stripped kinds the summary never reports; visible comments, notes and form fields flattened, with a sticky note's or a file attachment's icon kept as a mark on the page while the note's text and the attached file are gone (measured on `tests/fixtures/metadata.pdf`, 2026-11-14); what the cleaned copy loses; owner restrictions removed on purpose; layered files refused; embedded fonts keeping the shapes of removed characters, an inventory of which characters the document used and never their order; scan ink beyond the padding.
  - Detection (specs 0005, 0014, 0015): what is found and what starts ticked; that names and addresses are not looked for; and the recorded misses (a value split across blocks or wrapped, a letter or digit stuck before a value, a plain digit stuck after one, the phone formats read, dates in full with English months only and the forms still not read, a card glued to other digits, two cards sharing a row).
  - Custom terms (spec 0017): what a term matches, and its known misses (split across a page break with text between the parts, an all capitals word glued to the next, no patterns).
  - Pages it cannot read (specs 0006, 0008, 0010): words inside a picture; warnings that lean toward saying too much; the partly redacted name; when a picture counts as read and that words text recognition missed stay in the picture; the scans named although recognition may have read them; a picture reaching past the visible edge and text a clip hides wholly, both named and left in the file; text outside the visible area removed; the fake redaction warning.
  - Refusals (spec 0004): the files refused at open and the items and files a run refuses rather than guess.
  - The plan check (claim C5) and why the page cap is honesty based (specs 0001, 0012, 0017).
  - Logs, counts and reports (specs 0011, 0016): our code writes no log, MuPDF's lines are discarded, and the counts and reports are linked, not restated.
- **AC-8**: The drawing behaves as *Assumption built on* describes: both panels' words reach assistive technology and the drawings do not, nothing in it is told by colour alone, it adds no colour pairing, and the box stays solid in forced colours mode.
- **AC-9**: No cap, no size and no price is written as a number, and no word names the source repository, so the legal pages' browser checks hold here too.
- **AC-10**: WCAG 2.2 AA as the legal pages hold it: axe reports nothing, every link in the text is underlined and ringed as Tab reaches it, nothing scrolls sideways at 320 CSS pixels or with the root font size doubled.
- **AC-11**: The page and everything it renders from are server components (`tests/unit/policy-pages.test.ts`).

## Ratify

This decision was recorded by /develop, not deliberated. Run `/architect security & how it works page` to deliberate and ratify it, and to reword spec 0013's AC-8 for the new footer link. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
