# 0013. Brand and UI refresh

**Date**: 2026-10-06
**Status**: Proposed

## Summary

RedactNest gets its own brand and the layouts of the four reference images in `docs/design/references`, built only from what the product really does today. An original mark (a redaction bar resting in a nest) and a bold Inter wordmark go on every page, with a favicon set, a social preview image and a product image for Polar's checkout, all made by one script from committed sources. The landing page follows 04 with a real screenshot of the tool, and `/tool` becomes two columns: the found items on the left, and a rail on the right holding the warnings, the plan card and the Redact button. There is still no page preview: spec 0002 keeps page images and coordinates inside the worker, and feature 14 decides previews when it renders pages for rectangles.

## Amends specs 0003, 0007 and 0012, and `design.md`

Applied by task 22, once the pages are built, so no spec describes a page that does not exist yet.

- **Spec 0003.** AC-12: `/tool` uses `PageContainer wide` as one grid of three areas (this spec, AC-14 to AC-19), and the lock line moves from under the title into the rail. AC-13: `/` is replaced by this spec's AC-10 to AC-13. AC-14: the header and footer contents are this spec's AC-7 and AC-8; the footer still ends with spec 0009's notice. INV-8: header nav items are identified by their place in the nav row and are not underlined at rest; every other link stays underlined (AC-7). The contrast contract gains `accent-strong` on `info-bg` (AC-18, AC-27). The component inventory gains `BrandMark`, `BrandLockup`, `StepList` and `FeatureList`; `SiteHeader` gains `account`; `Card` gains `accent`. The Follow-up for feature 15's feature trio is met by `FeatureList` (AC-10). Both content security policies are unchanged.
- **Spec 0007.** AC-2: the plan card sits in the rail beside the full drop zone, not above it. AC-5: the reading order becomes file bar, document card, plan card, run refusal, action panel, then the list; from `lg` the list is drawn on the left and the rail on the right (AC-16). The Follow-up "Page previews are out" is answered: they stay with feature 14 (see *Page preview*). Its Follow-up nit 4 is met: `lookedFor` formats with `en-GB` like the rest of the flow (AC-13).
- **Spec 0012.** AC-5: the plan line becomes the plan card in the rail, after the document card, with the same words, region and links (AC-18). AC-8: the sign in and sign up pages gain a panel beside Clerk's card, and Clerk shows no logo (AC-23). AC-13: `/pricing` becomes two plan cards under today's title and lead, words unchanged (AC-22). Go live gains step 9, the Polar product image, and step 6 gains a check that neither Clerk instance has a logo uploaded (AC-6, AC-23).
- **`docs/design/design.md`.** The references now give layout and composition as well as visual style, by this spec. *Composition patterns* describe the three area tool grid, the landing hero and the rail. A new line records that the `frontend-design` skill yields to this spec and spec 0003 wherever they pin a choice (see *Decision*).

## Requirements

**User stories**:
- As a first time visitor, I want the home page to show me the real tool and say plainly what it finds and removes, so I know what I get before I drop a document.
- As a visitor reviewing a long list of found items, I want the Redact button to stay in reach beside the list, so I do not scroll back up to act.
- As a visitor on a phone, I want the drop zone first and every link one tap away, with no sideways scrolling.
- As a keyboard or screen reader user, I want the new layout to keep a sensible reading and focus order and every announcement I hear today.
- As the operator, I want the brand files made by one script from committed sources, so the icons, the social image and the product shot never drift from the real product unnoticed.
- As a buyer at Polar's checkout, I want to see RedactNest's mark on the product I am paying for.

**Acceptance criteria** (the contract):

*The brand*

- **AC-1**: An original mark, drawn by `/develop` from the chosen concept "Nest and bar" ([concept sheet](https://claude.ai/artifact/BKqV9SHrkZ5nUMWH1gd2su), concept 1): a rounded horizontal bar resting above a shallow nest of two concentric arcs, on a 64 unit grid, with no letter, page outline, leaf or shield. The master is `src/app/icon.svg`, filled `accent` (`#1F7A7A`) on transparent, with a `@media (prefers-color-scheme: dark)` rule inside the SVG that fills it `accent-soft` (`#D5EEEA`) so it holds on a dark tab bar. At 16 pixels the bar is at least 2 pixels tall and every stroke at least 1.5 pixels (on the grid: bar height at least 8 units, strokes at least 6). `src/ui/brand-mark.tsx` draws the same paths inline with `currentColor`, from a frozen `MARK_PATHS` export.
- **AC-2**: The wordmark is the live text "RedactNest" in Inter 700 with `-0.02em` tracking in `ink`, never an image, so it scales with the visitor's font size and is read as text. `BrandLockup` sets the mark (in `accent`, about 1.25 times the cap height, `aria-hidden`) before it.
- **AC-3**: The icon set, linked from every page through Next.js's metadata file conventions: `src/app/favicon.ico` (16 and 32 pixel PNG entries, replacing Next's default), `src/app/icon.svg`, and `src/app/apple-icon.png` (180 by 180: the mark in `on-accent` at 62% of the width, centred on a full `accent` square with square corners, which iOS rounds itself). There is no web app manifest: the site is not an installable app, and a manifest would need `manifest-src` in both content security policies, which stay unchanged (AC-4). A browser without a manifest uses the Apple icon or the favicon for a home screen shortcut.
- **AC-4**: Neither content security policy changes. `/tool`'s stays exactly as specs 0001, 0011 and 0012 (its AC-20) fix it, and no page reports a content security policy violation.
- **AC-5**: A social preview image `src/app/opengraph-image.png`, 1200 by 630 and under 1 MB, on `canvas`: the lockup, the eyebrow and the headline from the home page (AC-10), in Inter. It names no detector, so it stays true when feature 12 adds detectors. Beside it, `src/app/opengraph-image.alt.txt` is a committed text file whose content equals `HOME_TEXT.socialAlt`. The root metadata adds `twitter: { card: "summary_large_image" }`, and `og:image` and `twitter:image` are absolute on `config.siteUrl` through the existing `metadataBase`. Every public page inherits it.
- **AC-6**: The script writes `docs/design/brand/polar-product.png` (1200 by 630, the social card's composition) for Polar. Spec 0012's Go live list gains step 9: upload it as the media of the "RedactNest Pro" product in the sandbox, check how the hosted checkout shows it, then do the same in production. The organisation avatar stays EdiventStudio's own, matching the receipt line. Nothing on our pages changes for this.

*The shell*

- **AC-7**: Every page's header (`surface`, a bottom `border`, static as today) holds, in page order: the lockup as one plain `a` to `/` whose accessible name is "RedactNest"; a `nav` labelled "Site" (as today) with "Redact" (`TOOL_PATH`) and, with billing on, "Pricing" (`PRICING_PATH`); then, with billing on, an "Account" link (`ACCOUNT_PATH`); then a primary `Button` "Redact a PDF" (`TOOL_PATH`, `reload`) on every page but `/tool`. Every link is a plain `a`. The current page's item (Redact on `/tool`, Pricing on `/pricing`, Account on `/account` and the pages under it, none on sign in or sign up) carries `aria-current="page"`, semibold `ink` text and a 2 pixel `accent` bar beneath; the others are `ink-muted` and show an underline on hover. Nav items are at least 40 pixels tall. From `sm` (640 pixels) everything sits on one row, the button at the right. Below `sm` the lockup sits alone on the first row and the nav, Account and the button wrap onto the rows beneath in page order, so focus never moves back up, with no script and no menu. With billing off the header holds the lockup, "Redact" and the button.
- **AC-8**: Every page's footer (`canvas`, a top `border`) shows a brand column (the lockup, not a link because the header's is the home link, and the line "PDF redaction in your browser." in a `div`, never a `p`, since spec 0009's test reads the footer's one `p` as its notice), a "Product" group ("Redact a PDF", and "Pricing" with billing on) and spec 0011's "Legal" group ("Privacy policy", "Terms of service"), each a `nav` with its own label; then spec 0009's notice, unchanged, ending the footer (its AC-1 to AC-3). Footer links stay underlined in `ink-muted` with `FOOTER_LINK_CLASS`. The group labels and the brand line come from `LEGAL` in `src/lib/legal.ts`, the Product links' words from `NAV_TEXT` in `src/app/site-nav.tsx`, and every path from `src/lib/routes.ts`.
- **AC-9**: `src/app/not-found.tsx` renders the shell with the `h1` "This page doesn't exist", the line "The address may be mistyped, or the page may have moved.", a primary "Redact a PDF" (`TOOL_PATH`, `reload`) and a secondary "Go to the home page" (`HOME_PATH`, a plain `a`). It answers with status 404 and is not indexed. `/pricing` with billing off shows it.

*The landing page*

- **AC-10**: `/` follows 04 inside `PageContainer wide`. From `lg` the hero is two columns (text left, product shot right); below `lg` the text comes first. The text column holds, in order: the eyebrow "PDF redaction in your browser" (spec 0003's `eyebrow` utility, `data-testid="home-eyebrow"`); the `h1` "Redaction that actually removes the text" (`text-display`); the lead "RedactNest finds {detectors} in your PDF, lets you tick what to remove, and takes that text out of the file itself. Your file never leaves your browser." (`text-lead`, `ink-muted`); a primary large "Redact a PDF" (`TOOL_PATH`, `reload`) and, with billing on, a secondary large "See pricing" (`PRICING_PATH`, a plain `a`); then one `text-small` `ink-muted` line, with billing on "Free up to {free} pages a document. Pro goes up to {paid}." and with billing off "Up to {free} pages a document." Under the hero, `FeatureList` shows three items, each an `accent` `lucide-react` line icon, a `text-heading` title and a `text-small` line:
  1. `Laptop`, **Stays on your device**: "Opened and redacted in your browser. Never uploaded, and nothing is stored."
  2. `Eraser`, **Removed, not covered**: "Ticked text is taken out of the page, and hidden data such as metadata and attachments is stripped."
  3. `ShieldCheck`, **Checked before you download**: "Every page of the new file is checked. If RedactNest can't vouch for it, you get no file."
- **AC-11**: Below the trio, in place of 04's "Trusted by" row and testimonial, one quiet section with the `h2` "What RedactNest finds and strips" and two parts, each with an `h3`. **Finds**: "{Detectors}. Nothing is removed until you tick it." **Strips**: "{Stripped list}, whenever a file carries them. Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does." The stripped list comes from `HOME_STRIPPED`, a `Readonly<Record<SanitizedKind, boolean>>`, so a kind added to `SANITIZED_KINDS` fails `pnpm typecheck` until someone decides whether the home page claims it. It is true for document info, XMP metadata, attachments, bookmarks, JavaScript, earlier versions and page thumbnails, and false for `annotations` and `form-fields` (flattened, so what showed stays: spec 0004, AC-22), `hidden-layers` (such a file is refused, never stripped) and `accessibility-tags` (a loss, not a benefit). The list runs in `SANITIZED_KINDS` order through `SANITIZED_TEXT`, joined with `en-GB` list formatting, its first letter capitalised ("Document info, XMP metadata, …").
- **AC-12**: The product shot is `src/app/product-review.png`, a real capture of `/tool` from a production build: 1280 by 800 CSS pixels at device scale 2, in the reviewing state, on `tests/fixtures/sample-agreement.pdf`, with nobody signed in, so the real `/api/entitlement` answers free with `account: "none"` and the build's own caps. Nothing is stubbed and nothing is retouched. It shows through `next/image` from a static import (so its size is known and nothing shifts as it loads), with `sizes="(min-width: 64rem) 40rem, calc(100vw - 2rem)"`, `loading="eager"` and `fetchPriority="high"`, framed as the page's one emphasised card (`rounded-xl`, a `border` and the one larger shadow used anywhere on the site). Its `alt` is `HOME_TEXT.shotAlt`: "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them." It loads from our own origin only.
- **AC-13**: Every word in `/`'s main content lives in `src/lib/home-text.ts` (the header and footer keep their own sources, AC-7 and AC-8). {detectors} is `lookedFor("conjunction")` from `src/lib/detectors.ts` ({Detectors} capitalised), which now formats with `en-GB` like `flow-text.ts`, so the page names exactly the detectors that exist. `home-text.ts` takes the caps and the billing state as arguments (the page reads `config.freePageCap`, `config.maxPages` and `config.billingEnabled`), and the plan names come from `FREE_PLAN` and `PRO_PLAN`. No word names a detector, cap, customer, team, testimonial or capability RedactNest does not have today. The page stays a static server component with no client component of its own, and its metadata keeps today's title and description.

*The tool page*

- **AC-14**: `/tool` uses `PageContainer wide`, with the `h1` "Redact a PDF" above one grid of three areas whose order in the page and whose element identity never change between steps (each area a stable, keyed child), so neither polite region remounts when a file is chosen: **A**, the document area (the full drop zone with the terms notice under it and any open failure above it, or the file bar); **B**, the rail; **C**, the found items column, rendered from `reviewing` on. Page order is A, B, C, so on a phone the drop zone or file bar comes first, then the rail, then the list. The grid keeps `align-items: stretch`, so the rail spans the row's full height. Today's lock line under the title moves into the rail as "Your file never leaves your browser." with the `Lock` icon (`LOCK_LINE` in `src/lib/flow-text.ts`). The unsupported browser and wrong URL callouts still return alone, as today.
- **AC-15**: With no document open (`idle`, and `failed` after an open), from `lg` A sits left and B right. B holds, in order: the polite live region (empty, except "Checking your plan" while the page's first entitlement answer is awaited, as today); the plan card (billing on); a `StepList` of `IDLE_STEPS`: "Open a PDF", "Tick what to remove", "Download your new file"; then the lock line.
- **AC-16**: With a document on the page (`opening`, `reviewing`, `redacting`, `complete`, `lost`), from `lg` A spans both columns, C sits left (about two thirds) and B right (`minmax(20rem, 24rem)`). B holds, in order: the polite live region (the phase line while working; the opened document card: the all clear line, or the warnings and notes as today); the plan card (billing on); the run refusal callout or the lost callout; then the action panel (count line, Redact or Cancel, and the lock line inside the panel beneath them), or at `complete` the result card in the action panel's place, followed by the lock line. The reading and focus order is therefore: file bar, document card, plan card, run refusal, action panel, then the list (spec 0007 AC-5, with the plan card moved from above the file bar). Below `lg` it is one column in page order. While `opening`, C is not yet rendered, so the left of the wide layout is empty for those seconds.
- **AC-17**: From `lg` only, the action panel (with the lock line inside it) is the rail's last block and `position: sticky` 1.5rem from the top, so Redact and Cancel stay in view beside a long list. Nothing follows it in the rail, so it never covers a later block, and it never overlaps the found items column or anything focused (WCAG 2.2, 2.4.11). The result card is never sticky. Below `lg` (a 1280 pixel window at 200% text included) nothing is sticky.
- **AC-18**: The plan card is `plan-line.tsx`'s own markup (not a `Callout`, so no icon and no hidden tone word join what is announced) in a box with an `info-bg` fill, an `info-border` edge, `rounded-xl` and `p-5`: the same `PLAN_TEXT` words, its own polite status region in the page from the start, its new tab links and its Try again. Its links and Try again are `accent-strong` on `info-bg`, a pairing that joins the contrast contract (AC-27). With billing off there is none. It never says the free plan covers part of a document, because a document over the cap is refused whole (spec 0012, AC-6).
- **AC-19**: The found items column is one `Card` titled `FOUND_ITEMS_TITLE` ("Found items") with a neutral `CountBadge` counting every found row with the noun `{ one: "found item", other: "found items" }`, then the coverage note, then the groups, with spec 0007's select all rows, memoised rows, render counts and context rules unchanged (its AC-7 to AC-9). When nothing was found, the existing empty state shows inside the card.
- **AC-20**: Every existing test id, role, accessible name and focus move (spec 0007, *Focus*) is kept. The live region rules hold: one polite region holds the phase line and the document card, the plan card keeps its own region, the downloaded line keeps its own, and every `role="alert"` callout renders beside a polite region, never inside one. The keyboard walk at idle is: skip link, home link, Redact, Pricing, Account, the drop zone's "Choose a PDF", the terms notice's two links, then the plan card's controls.
- **AC-21**: `/tool` loads no third party script and makes no request it does not make today (the entitlement, its own files, the engine), apart from the icon files every page now links.

*The other pages*

- **AC-22**: `/pricing` (billing on) keeps its `h1` "Pricing" and today's lead, then shows two plan cards, side by side from `md` and stacked below. Free: its name, "Up to {free} pages a document" and a secondary "Redact a PDF" (`TOOL_PATH`, `reload`). Pro: `Card` with `accent` (a 2 pixel `accent` edge, decorative, since Pro is named in text), its name, `PRO_PLAN.priceLine`, "Up to {paid} pages a document", "Everything in Free" and the primary "Subscribe" (a plain `a` to `SUBSCRIBE_PATH`, as today). Then the merchant, tax and terms lines, unchanged (spec 0012, AC-13). It stays static, indexed and free of client components.
- **AC-23**: `/sign-in` and `/sign-up` (billing on) use `AccountShell` with the wide container and show, from `md`, a panel beside Clerk's card, stacked above it below `md`. The panel's `h2` is "Sign in to use Pro" on both pages (Clerk's card holds the page's one `h1`), with the line "Pro opens documents up to {paid} pages. Your account needs only your email address, and your documents never touch it: they stay in your browser." and a plain link "See pricing". Its words are `SIGN_IN_PANEL` beside `PRO_PLAN` in `src/lib/plans.ts`. `CLERK_APPEARANCE` sets `layout.logoPlacement` to `"none"`, so Clerk draws no logo; if this Clerk version rejects that value, it hides `elements.logoBox` instead, and task 16 records which. Either way the Dashboard holds no logo (spec 0012 Go live step 6), so no logo is requested. Everything spec 0012 AC-8 and AC-9 require still holds. With billing off, the account pages still say accounts are not set up.
- **AC-24**: The account pages (`/account`, Welcome, Subscribe and Billing's error lines) use the shared header (Account current) and footer in the narrow container. `AccountShell`'s own header button gives way to AC-7's, and every word on them is unchanged.
- **AC-25**: `/privacy` and `/terms` use `PageContainer wide` with the text in a column no wider than `max-w-narrow` (44rem), and show an "On this page" list (a `nav` with that label) of plain links to every `h2`, built from `PRIVACY_SECTIONS` and `TERMS_SECTIONS` in `src/lib/policy-sections.ts`, each `h2` given a stable `id` made from its key (`yourDocuments` becomes `your-documents`). From `lg` the list sits in a side column beside the text; below `lg` it sits above it. Both pages stay static server components with no form, no client component and no script (spec 0011, INV-7), and the heading walk test is unchanged.

*Across every page*

- **AC-26**: `/`, `/tool` (in spec 0007 AC-22's states), `/pricing`, `/privacy`, `/terms` and the 404 each pass axe with spec 0003 AC-18's tags, at desktop width, at 320 pixels and with forced colours; reflow at 320 pixels with no horizontal scroll; clip nothing with the root font size doubled; and keep a visible focus ring on every control. The sign in panel passes axe in a component test, and Clerk's card is checked by hand in the sandbox walk. The mark stays visible in forced colours because it paints with `currentColor`. Nothing new moves, so reduced motion needs no new rule.
- **AC-27**: No new colour token. One new pairing, `accent-strong` on `info-bg` (AC-18), joins spec 0003's contract and `tests/unit/contrast.test.ts` at 4.5:1 in the same change; any other pairing that turns out to be needed does the same. `src/app/icon.svg` carries exactly the `accent` and `accent-soft` values, checked by a unit test that parses `src/app/globals.css`, and the script reads every colour it draws with from `globals.css` the same way.
- **AC-28**: `node scripts/make-brand.mjs` writes every raster file in AC-3, AC-5, AC-6 and AC-12, with no new package: it drives the Chromium Playwright already installs, against a production build it makes and starts itself (*The brand script*). It never imports a TypeScript module; it reads what it needs from committed files and from the running build. Before each capture it waits for `document.fonts.ready` and for the page to be idle, and before the product shot it confirms the reviewing state (the all clear line, seven items ticked, no phase line). It stops the server on success and on failure. Its outputs are committed, like fixtures; PNG bytes may differ between machines, so it is rerun only when the look changes. A unit test checks that each file exists at its exact pixel size (the PNG header, the ICO directory) and that the social image is under 1 MB.
- **AC-29**: No new runtime dependency, and no page makes a request to an outside origin it does not make today. The privacy suite's same origin check covers the new icon and image requests on `/`, `/pricing` and `/tool`.

## Decision

**Chosen option**: Option 2: the references' composition, without a page preview, from one set of brand sources.

The site takes 04's hero and 01 to 03's tool composition, swapping the page preview for the found items list so no page image or coordinate leaves the worker. The type stays Inter alone (03 and 04's direction), and every brand file comes from committed sources through one Playwright script.

**Implementation skills**: `frontend-design` (`anthropics/skills`, `.claude/skills/frontend-design/`) for the mark, the hero and the copy discipline, wherever this spec leaves an axis free. Where it conflicts, this spec, spec 0003 and `design.md` win, as the skill itself says ("where the brief pins down a visual direction, follow it exactly"). Inter, the warm off white `canvas` (close to the cream it calls a tell), the teal, rounded cards and the eyebrow are pinned here on purpose. · `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`) for the metadata file conventions, `next/image` and `not-found.tsx` · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) for keeping the new primitives server components and the tool grid's children stable · `clerk-nextjs-patterns` (`clerk/skills`, `.claude/skills/clerk-nextjs-patterns/`) for `appearance` on the sign in pages.

What was settled with you:

| Question | Decision |
|---|---|
| Type | All sans, Inter only, following 03 and 04. Spec 0003 INV-6 stands |
| Page preview | Left to feature 14. Spec 0002 INV-1 and INV-2 stand |
| Tool layout | Found items left, a decision rail right (03's right column: cards, button, lock line) |
| Logo mark | Concept 1, Nest and bar |
| Wordmark | One weight, Inter 700, tight tracking |
| Polar | A RedactNest product image on "RedactNest Pro"; the organisation avatar stays EdiventStudio's |
| Raster files | One Playwright script, no new package, outputs committed |
| Headline | 04's "Redaction that actually removes the text" |
| Eyebrow | A true one: "PDF redaction in your browser" |
| Trio | Stays on your device · Removed, not covered · Checked before you download |
| Below the hero | What RedactNest finds and strips |
| Header | Redact, Pricing, Account and a Redact a PDF button; links wrap below the lockup on a phone |
| Idle rail | The plan card, three steps and the lock line |
| Sign in | A Pro panel beside Clerk's card, no logo inside the card |
| Footer | A brand column and link groups (Product, Legal), then spec 0009's notice unchanged |
| Pricing | Two plan cards, Pro marked |
| Legal pages | An "On this page" list |
| Product shot | The reviewing state |
| Redact and Download | Kept as two steps, Redact then the self check then Download (see *Page preview*) |
| References | Sources plus web verified links |
| The cross check's gaps | Every recommended fix applied, the manifest dropped (see `rationale.md`, *Decided after the cross check*) |

Decided while writing (each with the runner up in `rationale.md`):

- **The Source link group became the notice itself.** Spec 0009, AC-1 makes its notice end every footer with all six parts in a fixed order, including the three source links, so a separate Source group would show each link twice.
- **Header nav items are not underlined at rest** (spec 0003 INV-8 narrowed). They sit in a labelled nav row, outside running text, so WCAG 1.4.1 does not apply, and the current page is marked by a bar, weight and `aria-current` as well as colour. Footer links and links in text stay underlined.
- **No web app manifest**, so both content security policies stay byte for byte as they are (AC-3, AC-4).
- **One grid of three stable areas on `/tool`** (AC-14), so the live regions survive every step change and phones get the drop zone first.
- **Only the action panel sticks, as the rail's last block** (AC-17), so nothing can scroll under it.
- **The script renders the social card inside a page of the production build**, so its text is the site's own Inter and the home page's own words, and no route or font file ships for it.
- **`favicon.ico` holds 16 and 32 pixel PNG entries**, packed by a few lines in the script.
- **The landing words live in `src/lib/home-text.ts`**, with the detectors from `lookedFor`, so the page cannot name a detector that does not exist.

## Rationale

Reasoning, the options weighed and the references: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. Nothing is stored, fetched or persisted. The only new values are constants (words, paths, the stripped record) and committed files.

**State transitions**: none new. Spec 0002's session machine and spec 0007's steps are unchanged; only where each step's pieces are drawn changes.

**Page preview** (the question spec 0007's Follow-up and the scope's Deferred list left open): not in this feature. Spec 0002 INV-1 says "No preview, no page images" and INV-2 keeps coordinates, page geometry and offsets in the worker. A preview needs both, plus memory limits for 50 page files, rendering scheduled against detection in one worker and new privacy proofs. Feature 14 must render pages for rectangles anyway and is GA tier, so the preview, the privacy amendment and the renderer are designed once, there. The three area grid leaves feature 14 free to choose where pages render.

**Redact and Download stay two steps.** A single "Redact & download" button would have to start a download long after the click (browsers block or question that), could not show spec 0006's warning directly above Download (spec 0007, INV-5), and would hide that the self check can still refuse a run.

**The tool grid** (AC-14 to AC-17), as `grid-template-areas` from `lg`:

| Step | Areas | Columns |
|---|---|---|
| `idle`, `failed` | `"a b"` | `minmax(0, 1fr) minmax(20rem, 24rem)` |
| `opening`, `reviewing`, `redacting`, `complete`, `lost` | `"a a" "c b"` | `minmax(0, 1fr) minmax(20rem, 24rem)` |

Below `lg`, one column in page order A, B, C. The children are always rendered in that order with stable keys; only the area template and what each area holds change.

**Interface surface** (no network endpoint, no new protocol message):

| Surface | Change |
|---|---|
| `src/ui/brand-mark.tsx` (new) | `BrandMark({ size })`: inline SVG from `MARK_PATHS` (frozen), `currentColor`, `aria-hidden`. `BrandLockup({ size: "md" \| "lg" })`: the mark in `text-accent` plus the live wordmark. Server components |
| `src/ui/step-list.tsx` (new) | `StepList({ steps: readonly string[] })`: an `ol`, each step numbered in a small `accent-soft` circle with `accent-strong` digits (both already in the contract) |
| `src/ui/feature-list.tsx` (new) | `FeatureList({ items: readonly { icon: LucideIcon; title: string; body: string }[] })`: a `ul`, three columns from `md`, one below |
| `src/ui/site-header.tsx` | the lockup replaces the text wordmark; props `nav?`, `account?`, `action?`, rendered in that page order; one row from `sm`, wrapping below the lockup under `sm` |
| `src/ui/site-footer.tsx` | a grid: brand column, the groups, then the notice full width. Still reads nothing; the layout passes everything |
| `src/ui/card.tsx` | `accent?: true`: a 2 pixel `accent` border in place of the 1 pixel `border` |
| `src/ui/page-container.tsx` | unchanged; its comment no longer calls `narrow` the tool's column |
| `src/app/site-nav.tsx` | `SiteNav({ current?: "tool" \| "pricing" \| "account" })` keeps the "Site" label and now holds Redact and Pricing; `AccountLink({ current })`; exports `NAV_TEXT` (Redact, Pricing, Account, Redact a PDF) |
| `src/app/layout.tsx` | the footer's brand column and Product group; `twitter.card`. The metadata file conventions add the icon and image tags |
| `src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `opengraph-image.png`, `opengraph-image.alt.txt` (new or replaced) | AC-1, AC-3, AC-5 |
| `docs/design/brand/polar-product.png` (new) | AC-6, uploaded by hand, never served |
| `src/app/not-found.tsx` (new) | AC-9 |
| `src/app/page.tsx`, `src/app/product-review.png` (new) | AC-10 to AC-13 |
| `src/lib/home-text.ts` (new) | `HOME_TEXT` (eyebrow, headline, lead parts, buttons, trio, band, `shotAlt`, `socialAlt`), `capLine(billingEnabled, free, paid)`, `HOME_STRIPPED: Readonly<Record<SanitizedKind, boolean>>`, `strippedList()` |
| `src/lib/detectors.ts` | `lookedFor` formats with `Intl.ListFormat("en-GB")` |
| `src/lib/flow-text.ts` | `LOCK_LINE`, `IDLE_STEPS`, `FOUND_ITEMS_TITLE` |
| `src/app/tool/page.tsx`, `tool-client.tsx`, `plan-line.tsx`, `action-panel.tsx`, `review-checklist.tsx` | AC-14 to AC-20: the three area grid, the plan card box, the lock line in the action panel, the Found items card |
| `src/app/pricing/page.tsx` | AC-22 |
| `src/app/(account)/` | `AccountShell` gains `width?: "narrow" \| "wide"` (wide on sign in and sign up) and uses the shared header; the sign in and sign up pages gain the panel; `clerk-appearance.ts` sets `layout.logoPlacement` (AC-23, AC-24) |
| `src/lib/plans.ts` | `SIGN_IN_PANEL` beside `PRO_PLAN` |
| `src/lib/legal.ts` | the footer's group labels and brand line in `LEGAL` |
| `src/app/legal-page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` | the wide container with a narrow text column, the On this page list and the `h2` ids (AC-25) |
| `tests/unit/contrast.test.ts` | the `accent-strong` on `info-bg` pair |
| `scripts/make-brand.mjs` (new), `scripts/make-fixture.mjs` | AC-28; the sample fixture for AC-12 |
| `tests/fixtures/sample-agreement.pdf` (new) | two pages of a fictional employment agreement |

**The brand script** (`scripts/make-brand.mjs`, run by hand, outputs committed, never imports TypeScript):

1. Read the colour tokens from `src/app/globals.css` (the `--color-<role>: #RRGGBB;` form the contrast test parses) and the mark's paths from `src/app/icon.svg`.
2. In Chromium, with a light colour scheme: render `icon.svg` on transparent at 16 and 32 pixels and pack both PNGs into `src/app/favicon.ico`; render the mark's paths in `on-accent` at 62% of the width on a full `accent` square at 180 pixels into `src/app/apple-icon.png`.
3. Build and start the production app with Playwright's build environment (`tests/e2e/build-env.ts`, billing on with the fake set), as `playwright.config.ts`'s web server does, on a free port.
4. Open `/`, wait for fonts and idle, read the eyebrow (`home-eyebrow`) and the `h1`, replace the page body with the card markup (the lockup, eyebrow and headline on `canvas`, using the classes the build already serves) at 1200 by 630, and screenshot it to `src/app/opengraph-image.png` and `docs/design/brand/polar-product.png`.
5. Open `/tool` at 1280 by 800 and device scale 2 with no cookies, wait for the plan card's answer, choose `tests/fixtures/sample-agreement.pdf` through the file input, wait for the reviewing state with the all clear line, seven items ticked and no phase line, wait for fonts and idle, and screenshot the viewport to `src/app/product-review.png`.
6. Stop the server, also on any failure. Print only the paths it wrote (no document text).

Rerun it whenever the mark, the home page's eyebrow or headline, or the tool's look changes. Feature 12 must rerun it (see Follow-up).

**The sample fixture**: `tests/fixtures/sample-agreement.pdf`, made by `scripts/make-fixture.mjs`, two pages of an employment agreement between a fictional company and a fictional employee. Its values use only reserved forms: addresses at `example.com`, UK numbers in Ofcom's drama ranges (`020 7946 0xxx`, `07700 900xxx`) and one US `555-01xx` number. Four email addresses and three phone numbers, every page readable, nothing blocked, so the review opens with the all clear line and all seven items ticked.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Any page | the mark's paths | `MARK_PATHS` in `src/ui/brand-mark.tsx`, equal to `src/app/icon.svg` (unit test) |
| Any page | the wordmark | the literal "RedactNest" in `BrandLockup` |
| Header | Redact, Pricing, Account, Redact a PDF | `NAV_TEXT` in `src/app/site-nav.tsx`; paths from `routes.ts` |
| Header | which item is current | the `current` prop each page passes (the tool page `"tool"`, Pricing `"pricing"`, `AccountShell` `"account"` except on sign in and sign up, others none) |
| Header, footer, `/`, `/pricing`, sign in | whether Pricing, Account, See pricing, the Pro cap line and the panel show | `config.billingEnabled` |
| Footer | group labels, brand line, notice | `LEGAL` in `src/lib/legal.ts`; `config.sourceUrl` (spec 0009) |
| `icon.svg` | fills | the `accent` and `accent-soft` token values (unit test) |
| Script | every colour it draws with | parsed from `globals.css` at run time |
| Apple icon | the mark | the paths in `icon.svg` |
| Social image, Polar image | eyebrow, headline | read by the script from the built `/` (`home-eyebrow`, the `h1`), which takes them from `HOME_TEXT` |
| Social image | alt text | `opengraph-image.alt.txt`, equal to `HOME_TEXT.socialAlt` (unit test) |
| `/` | {detectors} | `lookedFor("conjunction")` from `DETECTOR_LABELS`, `en-GB` |
| `/` | {free}, {paid}, billing state | `config.freePageCap`, `config.maxPages`, `config.billingEnabled`, passed to `capLine` |
| `/` | the plan names in the cap line | `FREE_PLAN.name`, `PRO_PLAN.name` |
| `/` | stripped list | `HOME_STRIPPED` through `SANITIZED_TEXT`, in `SANITIZED_KINDS` order |
| `/` | product shot, its size | the static import of `src/app/product-review.png` |
| `/` | product shot alt | `HOME_TEXT.shotAlt` |
| Product shot | the plan card it shows | the real `/api/entitlement` answer for nobody signed in (free, `none`, the build's caps) |
| Product shot | the review it shows | `tests/fixtures/sample-agreement.pdf` |
| `/tool` | lock line, idle steps, "Found items" | `LOCK_LINE`, `IDLE_STEPS`, `FOUND_ITEMS_TITLE` in `flow-text.ts` |
| `/tool` | found items count | `session.matches.length` |
| `/tool` | plan card words | `PLAN_TEXT` (spec 0012) |
| `/tool` | which area template | whether `session.state` is `idle` or `failed` (AC-15) or another live state (AC-16) |
| `/pricing` | caps, price, plan names, title and lead | `config`, `PRO_PLAN`, `FREE_PLAN`; the title and lead as today |
| Sign in panel | words, {paid} | `SIGN_IN_PANEL` in `plans.ts`, `config.maxPages` |
| Legal pages | the list's words and order, each `h2` id | `PRIVACY_SECTIONS`, `TERMS_SECTIONS`; the id from the key |
| 404 | words | literals in `not-found.tsx` (no document, no config) |

**Key invariants**:

- **INV-1**: Every word and picture on every page is true of the product today. A detector, a cap or a plan name is read from where the product holds it, never written as a fact in a component. No page claims teams, customers, testimonials, history, documents kept or a detector RedactNest lacks.
- **INV-2**: No page image, coordinate or page geometry leaves the worker (spec 0002, INV-1 and INV-2, unchanged). The product shot is a picture of our own page on a fictional fixture, made on a developer's machine, never a visitor's document.
- **INV-3**: `/tool` loads no third party script, and neither content security policy changes.
- **INV-4**: Every way into `/tool` is a real page load (spec 0003, INV-10): the header's Redact, every "Redact a PDF" button and every footer link is a plain `a` or `Button` with `reload`.
- **INV-5**: The tool page's three areas keep their order and identity across every step, so no live region remounts and phones read A, B, C.
- **INV-6**: Nothing sticky can cover focus: only the action panel sticks, only from `lg`, and only as the rail's last block.
- **INV-7**: Colours stay tokens (spec 0003, INV-1 and INV-2). A file that must carry a literal colour carries a token's exact value, checked by a test, and every new pairing joins the contract.
- **INV-8**: The brand's raster files are made only by `scripts/make-brand.mjs` from committed sources, and committed. Nobody edits a generated file by hand.
- **INV-9**: Inter is the only typeface (spec 0003, INV-6), on the pages and in every brand file that holds text.

**Security model**: public presentation, no accounts or data involved beyond spec 0012's, unchanged. What must hold:

- **No new origin and no policy change.** Fonts, icons and images are same origin; `next/image` serves through our own `/_next/image`. Clerk draws no logo and its Dashboard holds none, so the sign in pages request no logo from `img.clerk.com`.
- **The product shot holds no real data**: a fictional fixture made by our own script, reserved addresses and numbers only.
- **The script prints no document text** and runs only on a developer's machine.
- **Compliance**: unchanged. The privacy policy's claims hold, because nothing new is collected and no new service is added. Link previewers fetch the social image from our origin, as they fetch any page.

**Configuration required**: none. No new environment variable and no new package. `scripts/make-brand.mjs` uses `@playwright/test`'s Chromium, already installed.

**Lint zones**: `src/ui/brand-mark.tsx`, `step-list.tsx` and `feature-list.tsx` sit in `redactnest/ui` (presentation only, no `@/config`). `src/lib/home-text.ts` imports `@/lib/detectors`, `@/lib/flow-text`, `@/lib/plans` and types from `@/worker/protocol`, never `@/config` (the page passes caps in) and nothing from billing. `src/app/page.tsx` may import `next/image` and `@/config`; it still may not import `tool-client` (spec 0003, INV-11).

**Critical test scenarios**:

- **Brand files** (unit, `tests/unit/brand-files.test.ts`): `favicon.ico`'s directory lists 16 and 32, `apple-icon.png` is 180 by 180, the social and Polar images are 1200 by 630 and the social image under 1 MB, the shot is 2560 by 1600, `icon.svg`'s two fills equal `accent` and `accent-soft` from `globals.css`, `MARK_PATHS` equal the paths in `icon.svg`, and the alt text file equals `HOME_TEXT.socialAlt`. Verifies **AC-1**, **AC-3**, **AC-5**, **AC-27**, **AC-28**.
- **Head tags** (e2e, `shell.spec.ts`): on `/`, `/tool`, `/pricing` and `/privacy`, the icon links (`/favicon.ico`, `/icon.svg`, `/apple-icon.png`) resolve with 200 and the right types, `og:image` and `twitter:image` are absolute, `twitter:card` is `summary_large_image`, no manifest link exists, and no `securitypolicyviolation` event fires. Verifies **AC-3**, **AC-4**, **AC-5**.
- **Policies** (unit, `csp.test.ts`): unchanged and still passing. Verifies **AC-4**, **AC-21**.
- **Contrast** (unit, `contrast.test.ts`): `accent-strong` on `info-bg` at 4.5:1 or better. Verifies **AC-18**, **AC-27**.
- **Header** (component and e2e): the nav still labelled "Site"; `aria-current="page"` on Redact at `/tool`, Pricing at `/pricing`, Account at `/account`, and on nothing at `/sign-in`; no "Redact a PDF" button on `/tool`; with billing off only the lockup, Redact and the button; at 320 pixels the links wrap below the lockup in page order and nothing scrolls sideways; every nav item at least 40 pixels tall; exactly one link named "RedactNest" per page. Verifies **AC-7**, **AC-26**.
- **Footer** (component and e2e): the brand line and both groups from `LEGAL` and `NAV_TEXT`; Pricing absent with billing off; the lockup is not a link; `footer.locator("p")` is still exactly spec 0009's notice with its six parts in order. Verifies **AC-8**.
- **404** (e2e): an unknown path answers 404 with the `h1` and both buttons; `/pricing` with billing off (component, as spec 0012 tests it) is not found. Verifies **AC-9**.
- **Landing** (component and e2e): the eyebrow, headline, lead with `lookedFor`'s words, the cap line per billing state, the trio with its three icons and the band in order; `HOME_STRIPPED` is false for the four excluded kinds; See pricing absent with billing off; the product shot has its alt text, explicit size, `sizes`, eager loading and a same origin source; one `h1`. `lookedFor` gives `en-GB` lists (unit). Verifies **AC-10** to **AC-13**.
- **Sample fixture** (e2e): opening `sample-agreement.pdf` gives four email addresses and three phone numbers, all tickable and ticked, and the all clear line. Verifies **AC-12**.
- **Tool grid** (component): the three areas render in page order A, B, C in every step; the polite region and the plan card's region are the same DOM nodes before and after a file is chosen (held by reference and compared with `toBe`); "Checking your plan" shows in the rail's polite region at idle. Verifies **AC-14**, **AC-15**, **AC-20**.
- **Tool layout** (e2e): at idle the drop zone comes before the rail in the page and the rail holds the plan card, the steps and the lock line; reviewing at 1280 pixels draws the list left of the rail while the rail comes first in the page; the action panel's computed `position` is `sticky` at 1280 and `static` at 900 and at 200% text; the result card is never sticky; the keyboard walk in AC-20's order; axe, 320 pixels, 200% text and forced colours in every spec 0007 AC-22 state. Verifies **AC-15** to **AC-20**, **AC-26**.
- **Plan card** (component): the same `PLAN_TEXT` words with no hidden tone word before them, its own status region, new tab links and Try again. Verifies **AC-18**.
- **Tool requests** (e2e, `privacy.spec.ts`): the request set on `/tool` through a full run is today's plus the icon files, all same origin. Verifies **AC-21**, **AC-29**.
- **Pricing** (e2e): the title and lead, both cards and the lines, Subscribe a plain `a` to Subscribe, the Free card's link a real page load into the tool, static with no client component. Verifies **AC-22**.
- **Sign in panel** (component): the `h2`, the line with `config.maxPages`, See pricing a plain `a`, axe clean; `CLERK_APPEARANCE` draws no logo (unit, `clerk-appearance.test.ts`). Clerk's card by hand in the sandbox walk. Verifies **AC-23**, **AC-26**.
- **Legal pages** (unit and e2e): the On this page list matches the section records in order, each link targets an existing `h2` id, the text column is no wider than 44rem, the pages still have no script or client component (`policy-pages.test.ts`), and the heading walk is unchanged. Verifies **AC-25**.
- **Every page in a real browser** (`design-system.spec.ts`): axe with spec 0003's tags at desktop, at 320 pixels and with forced colours on `/`, `/pricing`, `/privacy`, `/terms` and a 404; 200% text with nothing clipped; the mark visible in forced colours. Verifies **AC-26**.
- **No outside origin** (e2e, `privacy.spec.ts`): every request on `/` and `/pricing`, images and icons included, goes to our own origin. Verifies **AC-29**.

**Tests that change by design**: the `/tool` keyboard walk in `design-system.spec.ts`; the home page words test in `design-system.spec.ts`; "sits directly above the drop zone, and stays there once a file opens" in `tests/component/tool-client.test.tsx` (the plan card now follows the drop zone, and follows the document card once a file opens); `tests/component/app/site-nav.test.tsx` (Redact joins the nav, `current`); `PRICING_FILES` in `tests/unit/policy-pages.test.ts` (it gains the `src/ui` files `/pricing` now renders); and any test that finds "RedactNest" as a link without scoping to the header.

## Build plan

Skateboard: each slice leaves the whole site working and better than before. The brand comes first because every page carries it. The tool page comes next because the landing page's product shot is a picture of it. The landing page follows, then the remaining pages, then the proof across all of them.

**Slice 1: the brand on every page**

1. Draw the mark: `src/app/icon.svg` (with its dark scheme rule) and `src/ui/brand-mark.tsx` (`MARK_PATHS`, `BrandMark`, `BrandLockup`), following concept 1 and AC-1's minimums, with component tests. Satisfies **AC-1**, **AC-2**.
2. `scripts/make-brand.mjs`, steps 1 and 2: the token and path reading, `favicon.ico` and `apple-icon.png`. Run it and commit the outputs. Satisfies **AC-3**, **AC-27**, **AC-28**.
3. `SiteHeader` (the lockup, the `nav`, `account` and `action` slots in page order, the phone wrap), `SiteNav` with Redact, `current` and `NAV_TEXT`, `AccountLink`, and every page passing its `current`. Narrow spec 0003 INV-8 for nav items in the same change. Satisfies **AC-7**.
4. The footer: `SiteFooter`'s grid, the brand column (not a link, not a `p`) and Product group in `layout.tsx`, the new `LEGAL` words; spec 0009's notice untouched. Satisfies **AC-8**.
5. The script's steps 3 and 4 (the build, the social card and the Polar image), `opengraph-image.png` and its alt file, `twitter.card`, and `src/app/not-found.tsx`. Add `tests/unit/brand-files.test.ts` and the head tag checks in `shell.spec.ts` (no manifest link, no policy violation, `csp.test.ts` unchanged). Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-9**, **AC-27**, **AC-28**.

**Slice 2: the tool page in three areas**

6. `StepList` in `src/ui` with its tests; `LOCK_LINE`, `IDLE_STEPS` and `FOUND_ITEMS_TITLE` in `flow-text.ts`; the `accent-strong` on `info-bg` pair in spec 0003's contract table and `contrast.test.ts`. Satisfies **AC-14**, **AC-15**, **AC-27**.
7. The tool grid: `PageContainer wide`, the three keyed areas in fixed page order with the two area templates, the polite region first in the rail, the plan card box, the lock line inside the action panel, and the Found items card. Keep every test id; update the tests listed in *Tests that change by design*, and add the region identity test. Satisfies **AC-14**, **AC-15**, **AC-16**, **AC-18**, **AC-19**, **AC-20**.
8. The sticky action panel from `lg`, as the rail's last block, with the grid stretched and the computed position checks. Satisfies **AC-17**.
9. Extend `design-system.spec.ts` and `privacy.spec.ts` for the tool in every spec 0007 AC-22 state at desktop, 320 pixels, 200% text and forced colours, and the unchanged request set. Satisfies **AC-20**, **AC-21**, **AC-26**, **AC-29**.

**Slice 3: the landing page**

10. `tests/fixtures/sample-agreement.pdf` from `scripts/make-fixture.mjs`, with its e2e check. Satisfies **AC-12**.
11. `src/lib/home-text.ts` (`HOME_TEXT`, `capLine`, `HOME_STRIPPED`, `strippedList`) with unit tests, and `lookedFor` moved to `en-GB` with its test. Satisfies **AC-11**, **AC-13**.
12. `FeatureList` in `src/ui` with its tests, and `Card`'s `accent` prop. Satisfies **AC-10**, **AC-22**.
13. The script's step 5 (the product shot); run it and commit `src/app/product-review.png`. Satisfies **AC-12**, **AC-28**.
14. `/`: the hero in two columns, the buttons and cap line by billing state, the framed shot through `next/image` with `sizes` and eager loading, the trio and the band; component and e2e tests. Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**.

**Slice 4: the other pages**

15. `/pricing`: today's title and lead, then the two cards. Satisfies **AC-22**.
16. The account group: `AccountShell`'s `width` and shared header, the sign in panel with `SIGN_IN_PANEL`, `logoPlacement` (recording whether this Clerk accepts `"none"`, or falling back to hiding `logoBox`), and their tests. Satisfies **AC-23**, **AC-24**.
17. The legal pages: the wide container with the narrow text column, the On this page list and the `h2` ids, with their tests. Satisfies **AC-25**.

**Slice 5: proof, words and amends**

18. Extend `design-system.spec.ts` to `/`, `/pricing`, `/privacy`, `/terms` and a 404 (axe, 320 pixels, 200% text, forced colours), and `privacy.spec.ts`'s same origin check to `/` and `/pricing`. Satisfies **AC-26**, **AC-29**.
19. Rerun `scripts/make-brand.mjs` on the finished pages, so every image shows the final look, and commit what changes. Satisfies **AC-12**, **AC-28**.
20. You read every word on every changed page, the social image and the sign in panel before merge. Satisfies **AC-13**, **INV-1**.
21. Record in spec 0012's Go live list step 9 (the Polar product image) and, in step 6, the check that neither Clerk instance has a Dashboard logo. Satisfies **AC-6**, **AC-23**.
22. Apply the amends at the top of this spec to specs 0003, 0007 and 0012 and to `docs/design/design.md`, each with an `**Updated**` line naming spec 0013. Satisfies **AC-7**, **AC-16**, **AC-18**, **AC-22**, **AC-23**.

## Consequences

**Positive**:

- RedactNest looks like a product with its own name: a mark that holds at 16 pixels, icons on every platform, and a preview card when a link is shared.
- The landing page shows the real tool and says only true things, with the detector list, caps and stripped kinds read from the code, so it updates itself when feature 12 or a cap change lands, and a new stripped kind cannot slip onto it unreviewed.
- The Redact button stays in reach beside a long list, and phones keep the drop zone first.
- The privacy design is untouched: no page image leaves the worker, both content security policies stay byte for byte as they are, and no new origin or package appears.
- Polar's review (spec 0012, Go live step 8) sees a finished site.

**Negative and tradeoffs**:

- **No page preview**, the centrepiece of 01, 03 and 04. The tool reads as a list, and visitors who expect to see their page will not, until feature 14.
- **No web app manifest**, so Android home screen shortcuts use the Apple icon rather than a maskable one, and the site cannot be installed as an app.
- **The product shot can drift.** It is a committed picture, so a later change to `/tool`'s look leaves the landing page showing the old one until someone reruns the script. Nothing fails automatically; `/check verify` and the Follow-up carry it.
- **The rail is drawn on the right but read first.** On a wide screen, Tab moves from the file bar through the rail and then to the list on the left, which is right to left. It keeps the action panel ahead of the list, as spec 0007 already had it, but a sighted keyboard user may find the jump surprising.
- **The left of the wide layout is empty while a document opens**, for a few seconds.
- **The plan card moves** from above the drop zone to the rail, so a screen reader user hears the drop zone before the plan's next step.
- **Spec 0003 INV-8 is narrower**: header nav items rely on their place in the nav row, not an underline. The footer and running text keep underlines.
- **The script needs a full production build** to run, so regenerating the brand files takes minutes, and its PNG bytes differ between machines, so a rerun on another machine changes files that look the same.
- **Inter alone** gives up the more distinctive serif headings of 01 and 02 and the frontend-design skill's push for a characterful face. The brand's character has to come from the mark, the hero and the product shot.
- **Clerk's "Secured by Clerk" badge stays** on the sign in card, because hiding it needs a paid Clerk plan.
- **Polar's checkout look is only partly ours**: the organisation avatar and the layout are Polar's and EdiventStudio's, and how the product image is cropped is checked by hand.

**Neutral**:

- The footer grows from two lines to a short grid; spec 0009's notice is unchanged and still ends it.
- `Card` gains one prop, `AccountShell` one, and `src/ui` gains three small primitives, all server components.
- `docs/design/` gains `brand/`.

## Follow-up

- [ ] Feature 12 (remaining detectors): rerun `scripts/make-brand.mjs` once the new detectors are listed, read the lead and the band again (they will name seven kinds), and check the sample fixture still opens with the all clear line.
- [ ] Feature 14 (manual rectangle redaction): decide the page preview, its privacy amendment to spec 0002 INV-1 and INV-2, and where rendered pages sit in the three area grid. The scope's Deferred entry "Page preview in review" points there.
- [ ] Feature 15 (marketing site): the search pages reuse the shell, `FeatureList` and the social card's composition; per page social cards, and whether a manifest is worth a policy change, are its decisions.
- [ ] `/sync`: add `frontend-design` to root `AGENTS.md`'s `## Agent skills` (`.claude/skills/frontend-design/`, `anthropics/skills`, Apache 2.0), with the note that this spec and spec 0003 win where they pin a choice; add `node scripts/make-brand.mjs` to `## Commands`; add rules that the brand's raster files are generated and never edited by hand, and that header nav items are the one link without an underline at rest; and update `src/ui/AGENTS.md`, whose "links are always underlined" needs the same narrowing.
- [ ] The scope's Deferred entry "Page preview in review" can now say: decided by spec 0013 to stay with feature 14 (a `/scope` or `/sync` edit; `/architect` touches only feature 22's row).
- [ ] Dark mode stays deferred. The favicon's own dark rule (AC-1) is the only dark styling this spec adds.
