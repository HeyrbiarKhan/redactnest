# 0024. Search pages

**Status**: In Progress
**Date**: 2026-11-23
**Updated**: 2026-11-23, after the cross check (another model): the 14 gaps it found closed as recommended, the owner's call, with the brand file line in root `AGENTS.md` moved into build task 8.

## Summary

Three small pages, each written for one thing your buyers type into a search engine: how to redact a PDF without uploading it, how to remove text from a PDF rather than cover it, and why a black box over text is not redaction. They share one template, claim outcomes in a short closed list of sentences each backed by a gate every file passes, and send engine detail to `/security`. A sitemap, a robots file, per page social cards, a footer Guides group and a reworded site description come with them. Feature 29's home page reflow is this spec's first slice, because its 320 pixel and 200% text browser test is the one the search pages join.

## Requirements

**User stories**:
- As an HR, legal or healthcare worker searching for a way to redact a PDF, I want a page that answers what I searched and leads me to the tool, so I can redact without uploading the file anywhere.
- As someone who heard that a black box in a PDF can be undone, I want to learn how to check a file and what real redaction does, so I stop sharing files that only look redacted.
- As the owner, I want every claim on these pages to hold on every file, so a buyer who tests a claim never finds it false.

**Acceptance criteria**:

- **AC-1**: `/redact-pdf`, `/remove-text-from-pdf` and `/black-box-redaction` each answer 200 as a prerendered static page (`export const dynamic = "force-static"`, shown as `○` in the build output) with the shell (`PageHeader` with "Try it free", `main` with the skip link's target, the footer). Each page and everything it renders from are server components with no client component and no script element (`SEARCH_FILES` in `tests/unit/policy-pages.test.ts`: `src/app/search-page.tsx`, the three `page.tsx` files and `src/lib/search-pages.ts`). Each runs under the standard content security policy, unchanged; `/tool`'s policy is unchanged.
- **AC-2**: Each search page's head carries: its title through the root template (`<title> · RedactNest`); its description; a canonical link to its own absolute address on `config.siteUrl`; `og:title` and `twitter:title` equal to the bare title (no " · RedactNest"); `og:description` and `twitter:description` equal to the description; `og:url` its canonical address; `og:type` `website`; `og:site_name` `LEGAL.tradingName`; `og:image` the absolute address of its own `/<path>/opengraph-image.png`, with `og:image:alt` equal to its record's `socialAlt`; `twitter:image` equal to `og:image`; `twitter:card` `summary_large_image`; no manifest link; nothing asking not to be indexed. The words are the *Page frames* table's, word for word. `tests/e2e/shell.spec.ts`'s head check runs per page over `/` and the three search pages.
- **AC-3**: Each search page holds, in this order: the hero (eyebrow, `h1`, lead, the page's button into the tool, the cap line); the trio (`FeatureList`, its titles as `h2`); How it works (`h2` "How it works" over `StepList` with `IDLE_STEPS`); the answer (`h2` from the frame, its parts as the frame says, and on `/black-box-redaction` the `CoverFigure`); the close (the page's button again, then an `h2` "More guides" over a list linking the other two search pages). One `h1`, no skipped heading level. Every word comes from `src/lib/search-pages.ts`, except `IDLE_STEPS` (`src/lib/flow-text.ts`), the cap line (`capLine` in `src/lib/home-text.ts`) and the plan name (`PRO_PLAN.name`). The page's content sits in an element with `data-testid="search-page"`, which the component tests read.
- **AC-4**: Both buttons into the tool are `Button` with `reload` and `TOOL_PATH` (spec 0003, INV-10). The "More guides" links, the look over link and the footer's Guides links are plain `a` elements in the same tab.
- **AC-5**: Every sentence on a search page that says what RedactNest does with a document, the `CoverFigure`'s panels and caption included, is one of the claims in the *Claim register*, in the register's allowed wording or a rewording that claims no more, and carries a source comment naming the register row and that row's source. A sentence about PDFs in general (row G1) is a "can" sentence. No search page and no head says "never covered", "not covered with a black box" or "instead of a black box"; removal is said as removed, then marked (spec 0004's Follow-up). `tests/component/app/search-pages.test.tsx` fails if any page's `search-page` text, title or description holds, as whole words in any case, a phrase from the shared banned lists (*Claim test*). `IDLE_STEPS` is the tool's own step list, held by its own spec, and is outside this test and AC-6.
- **AC-6**: Each idea is said once in a page's `search-page` content, in the element the *Page frames* table names for it (the home page's rule, spec 0013 INV-11): upload in any form once, "in your browser" at most once, removed then marked once, and on `/black-box-redaction` each G1 risk (copy and paste, search) once as a risk. The head, the footer and `IDLE_STEPS` do not count. The component test checks the upload, "in your browser" and "removed, then marked" counts per page.
- **AC-7**: Each answer section ends with one sentence telling the visitor to look over the whole document before sharing it, not only what was found and ticked, ending in a plain link whose text is "What it can miss" to `/security#` plus the `id` of `SECURITY_SECTIONS.whatItCanMiss` (spec 0018, AC-5 puts the advice under the detection limits). The link lands on a heading that exists.
- **AC-8**: The cap line is `capLine(config.billingEnabled, config.freePageCap, config.maxPages)`, so no cap and no price is written as a number. With billing on, `/remove-text-from-pdf`'s answer names custom terms once, as part of `PRO_PLAN.name`, for names and other words no detector looks for (spec 0012, INV-8); with billing off that sentence is absent. No sentence other than the cap line and that one names a plan.
- **AC-9**: Every page's footer, `/tool` included, shows a third group, labelled `LEGAL.guidesNavLabel` ("Guides"), after Product and before Legal, holding the three search pages in `SEARCH_PAGES` order, each a plain link with its `navLabel`, at least 24 pixels tall (`FOOTER_LINK_CLASS`). The footer still has exactly one paragraph, the licence notice. Spec 0013's AC-8 is amended to name the group.
- **AC-10**: `/sitemap.xml` lists absolute addresses on `config.siteUrl` for `/`, the three search pages, `/tool`, `/security`, `/privacy`, `/terms`, and `/pricing` only with billing on; no account page, no `/api` path, and no `lastmod`, `changefreq` or `priority`. `/robots.txt` allows every crawler everywhere except `/api/` and names the sitemap's absolute address. The account pages stay crawlable on purpose, so a crawler can read their `noindex`; never disallow them. Both files are static.
- **AC-11**: The site line is `HOME_TEXT.siteLine` in `src/lib/home-text.ts`, the root layout's description (the fallback for every page without its own) and `/`'s, held to AC-5 with a source comment. `/` gains a `metadata` export with that description and a canonical link to `config.siteUrl`'s root, and carries one `WebSite` JSON-LD block (`name` `LEGAL.tradingName`, `url` `config.siteUrl`), a data block the browser never runs and the one script element any page in this spec adds. The root layout sets no canonical.
- **AC-12**: `PAGE_KINDS` in `src/telemetry/events.ts` gains `redact-pdf`, `remove-text` and `black-box`, each with its path in `PAGE_PATHS`, and `pageKindFor` maps each search page's path to its kind, so a visit to one is counted as its own kind and never as `not-found`. `SearchPageKind` is typed as a subset of `PageKind`, so a search page without a kind fails `pnpm typecheck`.
- **AC-13**: Each search page passes axe with spec 0003 AC-18's tags at desktop width, at 320 pixels and in forced colours; needs no sideways scroll at 320 pixels; clips nothing with the root font size doubled; keeps a visible focus ring on every control; sends requests to our own origin only; and fires no `securitypolicyviolation`. The `CoverFigure` keeps spec 0018 AC-8's behaviour (words reach assistive technology, drawings do not, the box solid in forced colours).
- **AC-14** (feature 29): At 320 pixels wide with the root font size at 200%, `/` has no sideways scroll with the header's menu shut and with it open. The element that was wider than the window wraps or shrinks rather than being clipped. At 1280 pixels `/`'s layout is unchanged: a browser test records the hero, trio and band boxes at 1280 pixels before the fix and holds them after. One browser test holds 320 pixels and 200% text together, menu shut and open, over `REFLOW_PAGES`, which holds `/` and each search page. Spec 0013's AC-26 is amended to name the combined case. If the fix needs `Button` (or any `src/ui` primitive) to wrap or shrink its label, the build stops and brings that to `/architect`, since it touches spec 0003 and `design.md`.
- **AC-15**: On the production build, Lighthouse's mobile preset reports for each search page a Largest Contentful Paint (the time until the biggest thing on screen is drawn) at or under 2.5 s, a Cumulative Layout Shift (how much the page jumps while loading) at or under 0.1, and a Total Blocking Time (the lab stand in for responsiveness) at or under 200 ms, each figure recorded in `verify.md` with the machine and the throttling preset. After the production deploy, PageSpeed Insights on each live search page is recorded the same way.
- **AC-16**: Each search page's `opengraph-image.png` (1200 by 630, under 1 MB) and `opengraph-image.alt.txt` are made only by `scripts/make-brand.mjs`, in the home card's composition, from the built page's own eyebrow (`data-testid="search-eyebrow"`) and `h1`, and committed. The alt file reads `RedactNest. <eyebrow>. <h1>.`, written by the script from the page's text. The script never writes the Polar image from a search page, and fails if a card's content is wider than 1200 or taller than 630 pixels. `tests/unit/brand-files.test.ts` holds each size, the 1 MB limit, and each alt file equal to its record's `socialAlt`. Root `AGENTS.md`'s brand raster files line names the search pages' files and says to rerun the script when a search page's eyebrow or headline changes.

## Decision

**Chosen option**: Option 2: one shared template over typed page records, with a closed claim register.

Three search pages render one server component from records in `src/lib/search-pages.ts`; every engine claim comes from a short register of sentences backed by gates, and engine detail lives on `/security`.

**Implementation skills**: `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`), for metadata, the sitemap and robots file conventions, and the per segment `opengraph-image` file · `frontend-design` (`anthropics/skills`, `.claude/skills/frontend-design/`), only where `design.md` and spec 0013 leave a choice open.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Design source.** `docs/design/design.md` and the current UI, as built: the home page's hero type (`eyebrow`, `text-display`, `text-lead`), `PageContainer`, `FeatureList`, `StepList`, `CoverFigure`, `Button`, `Prose` for the answer's paragraphs and list. No new primitive, no new token, no new colour pairing, no image. The hero is words only, so each page's largest paint is its `h1`.

**Data model sketch**: no stored data. One typed, frozen record per page, a closed set like `PAGE_FINDINGS`:

| Field | Type | Notes |
|---|---|---|
| `SEARCH_PAGES` | `readonly ["redact-pdf", "remove-text", "black-box"]` | closed set; its order is the footer's and the sitemap's |
| `SearchPageKind` | union of `SEARCH_PAGES`, `satisfies` a subset of `PageKind` | one word names a page in its record, its route and its count |
| `SEARCH_PAGE_TEXT` | `Readonly<Record<SearchPageKind, SearchPageText>>` | a page added without its words fails `pnpm typecheck` |
| `SearchPageText.path` | `string` | from `src/lib/routes.ts` (`REDACT_PDF_PATH`, `REMOVE_TEXT_PATH`, `BLACK_BOX_PATH`) |
| `.title`, `.description`, `.eyebrow`, `.headline`, `.navLabel`, `.primary`, `.answerTitle` | `string` | pinned by *Page frames* |
| `.lead`, `.features`, `.answer` | `string`, `readonly FeatureItem[]` (3), the answer's parts | written at the build under AC-5, each with its register row in a comment |
| `.figure` | `CoverFigureProps \| null` | `black-box` only; `CoverFigureProps` gains `export` in `src/ui/cover-figure.tsx`; its words are new, written in this module |
| `.socialAlt` | `string` | derived: `` `RedactNest. ${eyebrow}. ${headline}.` `` |

Also in this module: `MORE_GUIDES_TITLE = "More guides"`, `LOOK_OVER_LINK_TEXT = "What it can miss"`, and `removeTextTermsLine(planName)`, rendered only with billing on. The footer group's label is `LEGAL.guidesNavLabel` in `src/lib/legal.ts`, beside `productNavLabel` and `legalNavLabel`. The site line is `HOME_TEXT.siteLine`.

**Page frames** (pinned; the build writes `lead`, the trio bodies and the answer under AC-5):

| | `/redact-pdf` (`redact-pdf`) | `/remove-text-from-pdf` (`remove-text`) | `/black-box-redaction` (`black-box`) |
|---|---|---|---|
| Searches it answers | redact pdf; redact pdf online free; redact pdf without uploading | remove text from pdf; delete text from pdf permanently | black box redaction; redacted pdf text can be copied; how to check a redacted pdf |
| `title` | Redact a PDF online, free and without uploading | Remove text from a PDF, not just cover it | Why a black box over text isn't redaction |
| `description` | Redact a PDF in your browser. RedactNest looks for details such as email addresses and phone numbers, and the selectable text you tick is taken out of the page. | Take text out of a PDF instead of only covering it: tick what to remove, and RedactNest takes the selectable text out of the page, then marks where it was. | A box drawn over text can leave the words in the PDF, where copy and paste or search can still reach them. How to check a file, and what real redaction does. |
| `eyebrow` | Redact a PDF | Remove text from a PDF | Black box redaction |
| `headline` (`h1`) | Redact a PDF without uploading it (carries upload) | Take text out of a PDF, not just cover it | A black box over text isn't redaction |
| `primary` (both buttons) | Redact a PDF now | Remove text from a PDF | Redact a PDF properly |
| trio titles (`h2`) | Stays in your browser (M1, carries "in your browser") · You choose from a list (M4) · Checked before you download (M3) | Removed, then marked (M2, carries it) · Nothing to upload (M1, carries upload) · Checked before you download (M3) | Copy and paste can reveal it (G1, carries that risk) · Search can find it (G1, carries that risk) · Nothing to upload (M1, carries upload) |
| `answerTitle` (`h2`) | What redacting a PDF should do | What removing text means | How to check a redacted PDF |
| answer's parts | Paragraphs: redaction should take the words out, not hide them (G1); the selectable text you tick is taken out of the page, then marked (M2, carries it, since this trio does not); words that exist only in a scan are a picture and are not read (L1). Then the look over sentence (AC-7) | Paragraphs: a PDF draws text with instructions, and a white patch or a box can leave them (G1); RedactNest takes the text you tick out of those instructions, the mechanism only, never "removed, then marked" again (M2's mechanism); with billing on, `removeTextTermsLine` (M6); a scan's words are a picture (L1). Then the look over sentence | An ordered list of checks a reader can run on any file (select across the box and copy it; search for a word that should be gone; open it in another viewer), naming no risk again (G1); then the `CoverFigure`, which carries removed then marked (M2); then the look over sentence |
| `navLabel` | Redact without uploading | Removing text from a PDF | Black box redaction |

The site line (`HOME_TEXT.siteLine`, AC-11): "Redact PDFs in your browser, with nothing uploaded. The selectable text you tick is taken out of the page, then marked, and every new file is checked before you download it." (M1, M2, M3.)

The lead of each page carries none of upload, "in your browser" or removed then marked; it says what the page is about in the page's own terms. On `/redact-pdf` and `/remove-text-from-pdf` it carries M4: what RedactNest looks for, with `lookedFor()`, and that you choose from its list, so `/remove-text-from-pdf` never reads as removing any text you pick.

**Claim register** (the only things a search page says RedactNest does; anything else needs a change to this table first):

| Row | In substance | Allowed wording (or a rewording that claims no more) | Gate or source |
|---|---|---|---|
| M1 | The document is never uploaded | "never uploaded to us or anyone else", "stays in your browser", "nothing to upload" | privacy claim C1; `/tool`'s `connect-src 'self'` (spec 0011, INV-1 and INV-2) |
| M2 | Ticked selectable text is taken out of the page, then marked | "the selectable text you tick is taken out of the page", "removed, then marked"; the `CoverFigure`'s second panel and caption | spec 0004, AC-13 and INV-2 (the self check's text part, which reads what each page draws); spec 0019, AC-12, as built ("selectable", "the page", never "the file") |
| M3 | The new file is checked, and fails closed | "Every page of the new file is checked. If the check fails, you get no file." | spec 0004, INV-2 |
| M4 | What RedactNest looks for | "looks for" with `lookedFor()` or named `DETECTOR_LABELS`; it lists what it finds for you to choose from | spec 0005; spec 0018, AC-5 ("looks for", never "finds" as an outcome) |
| M5 | You choose what goes | "you tick what to remove"; a starting tick is a suggestion | spec 0018, AC-7 (What it looks for) |
| M6 | Custom terms, Pro only | "With <Pro> you can add your own words, such as names, and RedactNest looks for them too" | spec 0017, AC-1; spec 0012, INV-8 |
| L1 | Limits | "can be missed", "can stay"; words that exist only as a picture are not read; look over the whole document | spec 0018, AC-5 and AC-7 (no text recognition is a step that does not exist) |
| G1 | PDFs in general, not RedactNest | "can stay", "can still be copied", "can still be found"; the `CoverFigure`'s first panel | spec 0006 (covered text); general PDF behaviour, always a "can" sentence |

Never on a search page: metadata or hidden data stripping, what the page warnings catch, refusals, the original copy of a figure, or any exact condition. Those live on `/security`, linked.

**Claim test.** AC-5's eight banned phrases move out of the inline `it.each` in `tests/component/app/security-page.test.tsx` into a new `tests/support/claim-phrases.ts` as `CLAIM_BANNED_PHRASES`, which the security page test and the new search pages test both read. The search pages test adds `MARKETING_BANNED_PHRASES` there: "never covered", "not covered with a black box", "instead of a black box", "permanently", "for good", "is removed from the file", "is stripped". Whole words, any case, over each page's `search-page` text and its title and description. The billing off cases (no terms line, the one plan cap line, no `/pricing` in the sitemap) are component and unit tests with `config` mocked, because the Playwright build runs with billing on.

**API surface** (routes and generated files; all public, all static):

| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/redact-pdf`, `/remove-text-from-pdf`, `/black-box-redaction` | GET | none | prerendered HTML under the standard policy | public | none (static) |
| `/<page>/opengraph-image.png` | GET | none | 1200 by 630 PNG, committed | public | none |
| `/sitemap.xml` (`src/app/sitemap.ts`) | GET | none | `MetadataRoute.Sitemap` | public | none |
| `/robots.txt` (`src/app/robots.ts`) | GET | none | `MetadataRoute.Robots` | public | none |
| `/` | GET | none | adds a `metadata` export (site line, canonical) and the `WebSite` block | public | none |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Render a search page | every word | `SEARCH_PAGE_TEXT[kind]`; steps from `IDLE_STEPS` |
| Render a search page | cap line, plan name | `capLine(config.billingEnabled, config.freePageCap, config.maxPages)`; `PRO_PLAN.name` |
| Render a search page | whether the terms line shows | `config.billingEnabled` |
| Render a search page | the look over link | `SECURITY_PATH` + `#` + `sectionId("whatItCanMiss")` (`src/lib/policy-sections.ts`); text `LOOK_OVER_LINK_TEXT` |
| Metadata | title, description, `og:title`, `twitter:title`, `og:description`, `twitter:description` | the record's `title` and `description`, set in each `page.tsx`'s `metadata` |
| Metadata | canonical, `og:url` | `metadataBase` (`config.siteUrl`) + the record's `path` |
| Metadata | `og:site_name` | `LEGAL.tradingName` |
| Metadata | `og:image`, `twitter:image` | the segment's `opengraph-image.png` (Next file convention), absolute on `metadataBase` |
| Metadata | image alt | the segment's `opengraph-image.alt.txt`, equal to `socialAlt` |
| Site description | root and `/` | `HOME_TEXT.siteLine` |
| Sitemap | each address | `config.siteUrl` + paths from `src/lib/routes.ts` and `SEARCH_PAGES` order |
| Sitemap | whether `/pricing` is listed | `config.billingEnabled` |
| Sitemap | `lastmod` | none, on purpose (a build time date would be false, and Google ignores the others) |
| Robots | sitemap address | `new URL("/sitemap.xml", config.siteUrl)` |
| Home JSON-LD | `name`, `url` | `LEGAL.tradingName`, `config.siteUrl`, through `JSON.stringify` with `<` escaped |
| Footer Guides | label, links | `LEGAL.guidesNavLabel`; each record's `navLabel` and `path` |
| Telemetry | page kind and its path | `PAGE_KINDS`, `PAGE_PATHS`, `pageKindFor` |
| Social card | eyebrow, headline, alt file | the built page's `[data-testid="search-eyebrow"]` and `main h1` |

**Key invariants**:
- **INV-1**: A search page claims only what the *Claim register* lists; a new claim is a reviewed change to the register first, with its gate named.
- **INV-2**: Every word a search page shows lives in `src/lib/search-pages.ts` (or the named shared sources); no literal in a component.
- **INV-3**: A search page is a static server component with no client component and no script element, so the standard policy and the page budget stay as they are.
- **INV-4**: Search page social cards and their alt files are made only by `scripts/make-brand.mjs`; never edited by hand.
- **INV-5**: The three paths, the records and the telemetry kinds name each page with one word (`SearchPageKind`).

**Security model**: public, anonymous, read only pages. No document, no form, no request beyond the page's own assets and the telemetry post to our own origin. The JSON-LD block on `/` is a data block (`type="application/ld+json"`), which the browser never runs, so the standard policy (`script-src 'self' 'unsafe-inline'`) needs no change; its content is `JSON.stringify` of two values with `<` escaped. No regulated data.

**Configuration required**: no new variable. The canonical links, `og:url`, the sitemap, robots and the JSON-LD all name `NEXT_PUBLIC_SITE_URL` (`config.siteUrl`), so a Vercel preview names whatever that is set to there; previews carry Vercel's `X-Robots-Tag: noindex` (checked in `verify.md`), so none is indexed.

**Critical test scenarios**:
- Happy path: each search page renders its frame in order, its head carries every tag with absolute addresses and its own card, and its buttons are real page loads into `/tool`, verifies **AC-1** to **AC-4**, **AC-16**.
- Claims: no page's text, title or description holds a banned phrase; each idea once in its named element; each answer ends on the look over line with a link that lands, verifies **AC-5** to **AC-7**.
- Billing off (config mocked): no terms line, the single cap line, no `/pricing` in the sitemap; billing on: both, verifies **AC-8**, **AC-10**.
- Reflow: at 320 pixels with 200% text, `/` and each search page scroll no sideways with the menu shut and open, and `/` at 1280 pixels is unchanged, verifies **AC-13**, **AC-14**.
- Counts: a view of each search page posts its own kind, never `not-found`, verifies **AC-12**.
- Denied: there is nothing to deny; the closest case is a crawler, which gets every page and the sitemap but nothing under `/api/` by robots, verifies **AC-10**.

## Build plan

Skateboard: feature 29's test first, then one search page as a complete whole (frame, head, card, sitemap, robots, footer, counts, every test), then the other two pages join each piece.

1. [x] Feature 29: record `/`'s hero, trio and band boxes at 1280 pixels as a test; then find the element in `/`'s main content wider than the window at 320 pixels with 200% text, menu shut and open, with `/debug` (`tests/e2e/design-system.spec.ts` already calls this case about 800% zoom, and a `size="lg"` button may be the cause), and let it wrap or shrink. If the fix needs a `src/ui` primitive to change how its label wraps or shrinks, stop and bring it to `/architect`. Satisfies **AC-14**.
2. [x] Feature 29: the combined test in `tests/e2e/design-system.spec.ts`, over `REFLOW_PAGES = ["/"]`, menu shut and open; amend spec 0013's AC-26 to name the combined case. Rerun `scripts/make-brand.mjs` only if a brand picture changed. Satisfies **AC-14**.
3. `src/lib/search-pages.ts` with the closed set, the types and `redact-pdf`'s record; its path in `src/lib/routes.ts`; the shared `src/app/search-page.tsx` and `src/app/redact-pdf/page.tsx` with `force-static` and its full `metadata`. Satisfies **AC-1** to **AC-4**, **AC-8**.
4. `redact-pdf`'s words under the register, each with its source comment; `tests/support/claim-phrases.ts` with the security page test moved onto it; `tests/component/app/search-pages.test.tsx` (frame order, headings, links, banned phrases, idea counts, billing on and off with `config` mocked) and `SEARCH_FILES` in `policy-pages.test.ts`. Satisfies **AC-1**, **AC-3**, **AC-5** to **AC-8**.
5. `src/app/sitemap.ts` and `src/app/robots.ts`, with their unit tests; `HOME_TEXT.siteLine` with its source comment, used by the root layout and a new `metadata` export on `/` with its canonical; the `WebSite` block. Satisfies **AC-10**, **AC-11**.
6. The footer's Guides group (`LEGAL.guidesNavLabel`, `GuidesNav` in `src/app/site-nav.tsx`, in the root layout between Product and Legal); spec 0013's AC-8 amended; `shell.spec.ts` and the layout component test updated; the `/tool` layout suites in `design-system.spec.ts` (sticky panel, step states at 200% text) rerun, since `/tool`'s footer grows. Satisfies **AC-9**.
7. `redact-pdf` in `PAGE_KINDS`, `PAGE_PATHS` and `pageKindFor`, the subset type, and `telemetry-events.test.ts` and `telemetry-server.test.ts` updated. Satisfies **AC-12**.
8. `scripts/make-brand.mjs`: `makeCards` takes a page (path, eyebrow selector, output folder), loops over `/` and each search page, writes the Polar image only from `/`, writes each search page's alt file from its text, and fails on a card wider than 1200 or taller than 630 pixels; its header comment names the search pages. `brand-files.test.ts` holds each card and alt file. Root `AGENTS.md`'s brand raster files line gains the search pages' `opengraph-image.png` files and the rerun rule for a search page's eyebrow or headline, in this task. Capture `redact-pdf`'s card, then rebuild so the head carries it. Satisfies **AC-16**, **AC-2**.
9. `/redact-pdf` in the browser suites: axe, 320 pixels, 200% text, forced colours, `REFLOW_PAGES`, the per page head check (`shell.spec.ts`), same origin requests (`privacy.spec.ts`), the look over link landing. Satisfies **AC-2**, **AC-7**, **AC-13**, **AC-14**.
10. `remove-text` and `black-box`: records, words, routes, `CoverFigureProps` exported and the figure's new words, the terms line, kinds, cards, and each joined to every test above. Satisfies **AC-1** to **AC-9**, **AC-12** to **AC-14**, **AC-16**.
11. Your read of every word on the three pages, the figure and the site line before merge. Satisfies **AC-5**, **AC-6**.
12. Lighthouse's mobile preset on each search page against the production build, figures in `verify.md` with the machine and preset; PageSpeed Insights on the live pages after the deploy. Satisfies **AC-15**.

## Consequences

**Positive**:
- Search has pages to land on, each leading straight into the tool.
- A closed claim register keeps the marketing pages from saying more than the engine does, and makes the next verify short.
- `/security` stays the one place for engine detail, so a change to the engine rereads one page, not four.
- The footer group and the sitemap give every page a crawl path.

**Negative / tradeoffs**:
- Three more pages of words to hold when the engine changes; a change that weakens a register row rereads all three.
- A headline change needs `make-brand.mjs` rerun, or the card says the old words (the alt file test catches the alt, not the pixels).
- Short pages with a few claims rank less well on informational searches than long guides would.
- The footer grows a third group on every page, `/tool` included.
- Feature 29 may turn out to need a primitive change, which would pause slice 1 for a design call.
- `/security` page views still count as `not-found` until its kind is added (Follow-up).

**Neutral**:
- Spec 0013's AC-8 and AC-26 are amended; `CoverFigureProps` becomes exported.
- Root `AGENTS.md` gains the brand file line in task 8; lines for `src/lib/search-pages.ts` and the claim register are `/sync`'s.
- No web app manifest, so both policies stay byte for byte (spec 0013's reasoning holds).

## Follow-up

- [ ] `/security` is missing from `PAGE_KINDS`, so its page views count as `not-found`. Older than this branch, found while designing this spec (2026-11-23), not fixed here (your call): add `security` to `PAGE_KINDS` and `PAGE_PATHS`. Recorded in the scope's Deferred list.
- [ ] Check the combined 320 pixel and 200% text case on `/tool`, `/pricing`, `/privacy`, `/terms` and `/security`, and add any that pass to `REFLOW_PAGES`.
- [ ] Read the search pages' page view counts once they have a month of visits, before writing more pages.
- [ ] Audience pages (HR, legal, healthcare) and a "remove metadata from a PDF" page: considered and left out; the metadata page waits on feature 32.
