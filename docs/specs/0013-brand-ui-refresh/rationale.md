# 0013. Brand and UI refresh: rationale

The decision record behind [index.md](index.md). `/develop` does not read this file.

## Context

RedactNest works end to end, but it does not yet look like a product. The wordmark is plain text, the favicon is Next.js's default, a shared link shows no preview, and the home page is a headline and one button. Polar reviews the live site before it lets EdiventStudio take real payments (spec 0012, Go live step 8), and that review waits on this feature (scope feature 21).

The four reference images in `docs/design/references` give the target look. Spec 0003 took only their visual style. This feature takes their layouts and composition as well, which runs into four forces:

- **The references show things the product cannot do or say.** All four centre on a rendered page with matches highlighted. Spec 0002 INV-1 says "No preview, no page images" and INV-2 keeps coordinates in the worker, both GA tier promises. 04's copy claims "addresses and more", teams, "Trusted by" and a testimonial. 03's plan card says the free plan "covers the first 3 pages", but a document over the cap is refused whole. 01 merges Redact and Download, but the self check can refuse a run and spec 0006's warning must sit directly above Download.
- **The references disagree with each other.** 01 and 02 (leaf logo, Documents, History and Settings nav) set headings in a serif. 03 and 04 (document icon, Redact, How it works, Pricing and For teams nav) are all sans. Their logos are generic icons RedactNest cannot use as its own.
- **The privacy walls are load bearing.** `/tool` runs under its own strict policy with no third party script (spec 0001, spec 0012 AC-20), every way into it is a real page load (spec 0003 INV-10), and the privacy policy promises no new origin without a policy change first (spec 0011).
- **Truth is a rule, not a tone.** Every word must be true today: email addresses and phone numbers only, 3 pages free and 50 on Pro, nothing stored. Feature 12 will add five detectors, so words written as literals would turn false the day it ships.

The build approach is Skateboard, and the feature is tagged Beta plus a fresh model review because it touches `/tool`.

## Options considered

### Option 1: Restyle in place, one column

Keep today's 44rem tool column and today's home page shape, and apply the references' cards, header, type and a new mark.

**Pros**: the smallest change to `/tool` and its tests; no layout risk to spec 0007's focus and live region rules.

**Cons**: it ignores the composition the scope row asks for (two columns, a hero with a product picture, a benefit trio), so the site still does not look like the references. On a long list Redact scrolls out of view, as it does today.

### Option 2: The references' composition, without a page preview, from one set of brand sources (chosen)

04's hero with a real product shot, trio and an honest band in place of "Trusted by". 01 to 03's two columns on `/tool`, with the found items list where the page preview was and 03's right column (warnings, plan card, button, lock line) as the rail. Inter only. One Playwright script makes every raster file from committed sources.

**Pros**: follows the references' layouts as far as the product truthfully can; keeps spec 0002's walls whole; the list gets the width its context lines need; Redact stays in reach; no new package and no new origin.

**Cons**: the references' centrepiece, the page with highlights, is missing; the rail is read before the list but drawn to its right; the product shot is a committed picture that can drift.

### Option 3: The references' composition with a page preview

As option 2, plus thumbnails and a zoomable page with highlighted matches, rendered by MuPDF in the worker.

**Pros**: the closest match to 01, 03 and 04; visitors see their page and the matches in place.

**Cons**: amends spec 0002 INV-1 and INV-2, the GA promises the privacy policy leans on; page images on the main thread need memory limits for 50 page files, revoked object URLs and new privacy proofs; rendering competes with detection in the one worker; likely larger than the rest of this feature, on the launch path. Feature 14 has to build page rendering anyway.

### Option 4: Option 2 with serif headings

As option 2, but headings in a self hosted serif, following 01 and 02.

**Pros**: a more distinctive, document like voice, closer to what the `frontend-design` skill favours.

**Cons**: amends spec 0003 INV-6 and the AGENTS.md font rule; adds roughly 30 to 50 KB to every first load, `/tool` included; follows the two references that are not the landing hero or the most complete tool view.

## Rationale

Option 2 is the most of the references the product can honestly carry. The scope row asks for their composition, which rules out option 1. Option 3 buys the centrepiece at the price of two GA privacy invariants and a renderer, on the launch path, while feature 14 (also GA) must design page rendering anyway. Doing it there means the preview and the rectangle tool share one renderer and one privacy amendment, instead of two. Option 4 was offered and declined: 03 and 04 are the newer pair, holding the hero and the real warning and plan cards, and Inter alone keeps INV-6 and costs nothing.

Without a preview, the strongest stand in for 01 and 03's page column is the found items list. It is the content a reviewer actually reads, its context lines need width, and 03's right column (warnings, plan card, button, lock line) carries over unchanged as the rail. The page order keeps the rail first, so phones and screen readers keep spec 0007's order. That costs a right to left jump for sighted keyboard users, which is smaller than burying Redact under a 2,000 row list on a phone.

Making every raster file with the Chromium Playwright already installs keeps the package list and the licence allowlist unchanged, and lets the product shot be a real capture of a real build, which is what "the landing page's product picture must show the real product" asks for. Reading the detectors, caps and stripped kinds from the code is what keeps "every word true" from decaying when feature 12 lands.

### Smaller decisions, with the runner up

| Decision | Pick | Why | Runner up |
|---|---|---|---|
| Logo mark | Nest and bar (concept 1) | the name in one picture, holds at 16 pixels, nothing borrowed | The empty line (the clearest story, but it fades at favicon size) |
| Wordmark | Inter 700, tight tracking, live text | the references' setting, scales with the visitor's font size | two weights (splits the name at small sizes) |
| Polar | product image; avatar stays EdiventStudio's | matches "Your receipt shows EdiventStudio", stays right when a second product ships | the RedactNest mark as avatar (wrong on every portal page and email later) |
| Raster files | one Playwright script | no new package, real Inter, real capture | Next.js `ImageResponse` (needs an Inter TTF committed with its OFL notice, and still a script for `favicon.ico` and the shot) |
| Social card text | rendered by swapping the body of the built `/` for the card markup | the site's own Inter and the home page's own words, no route and no font file to license or notice | a public card route (lives forever, needs robots and policy decisions), or an Inter TTF committed for the script |
| Headline | 04's "Redaction that actually removes the text" | true, and names the one difference | today's "Truly redact a PDF." |
| Eyebrow | "PDF redaction in your browser" | your pick: 04's composition with true words | none (the skill calls an all caps eyebrow a tell) |
| Below the hero | what it finds and strips | sets honest expectations; depth no box drawing tool has | three steps (repeats the product shot) |
| Stripped list | seven kinds, four left out | `annotations` and `form-fields` are flattened (what showed stays), `hidden-layers` is refused, `accessibility-tags` is a loss | listing all eleven `SANITIZED_KINDS` (overclaims) |
| Footer groups | Product and Legal, notice unchanged | spec 0009 AC-1 already puts the three source links in the notice | a Source group (each source link twice) |
| Header links | not underlined at rest | a labelled nav row outside running text; current page marked by bar, weight and `aria-current` | keep underlines (unlike every reference) |
| Manifest | none | both content security policies stay byte for byte as specs 0001, 0011 and 0012 fix them; the site is not an installable app | add one with `manifest-src 'self'` in both policies (proper Android and maskable icons, three specs amended) |
| Tool page structure | one grid of three keyed areas in fixed page order | both polite regions must stay mounted from the first render to be heard (`tool-client.tsx`, `plan-line.tsx`) | separate idle and document layouts (remounts both regions at the moment the first phase is announced) |
| Sticky | the action panel only, last in the rail, from `lg`, in a stretched grid | nothing can scroll under it (WCAG 2.4.11); a rail that only fits its content never sticks | a sticky rail (its lower blocks unreachable when taller than the window) |
| Rail order | live region, plan card, refusal, action panel | 03's order (warnings, plan, button) and the sticky rule | plan card first, as the plan line sits today |
| Plan card | `plan-line.tsx`'s markup in an `info-bg` box | a `Callout` would add an icon and a spoken "Note:" before the plan words | `Callout tone="info"` |
| Clerk's logo | `layout.logoPlacement: "none"`, `logoBox` hidden as the fallback, and no Dashboard logo | a hidden box can still load its image | hiding `logoBox` alone |
| Footer lockup | not a link, and the brand line not a `p` | one "RedactNest" link per page; spec 0009's test reads the footer's one `p` as its notice | a second home link |
| Idle rail | plan card, three steps, lock line | useful on a first visit; a real sequence, so numbering is honest | 02's empty state |
| Sign in | a Pro panel beside Clerk's card, no Clerk logo | says why to sign in; Clerk's logo is a link its router may follow without a full page load (spec 0012 INV-13) and a Dashboard logo loads from `img.clerk.com` | Clerk's card alone |
| Pricing | two cards, Pro marked | 03 and 04's card language; only the cap differs today | a comparison table (one real row) |
| Legal pages | On this page list from `policy-sections.ts` | long pages; cannot drift from the headings | restyle only |
| Product shot | reviewing state, 1280 by 800 at scale 2 | the moment that explains the product, as 04 shows it | the result card |
| Favicon dark rule | inside `icon.svg` | teal on a dark tab bar measures about 2.5:1 | none |
| Inter optical size axis | not used | a larger font file on every page, `/tool` included, for a small gain at display sizes | `axes: ["opsz"]` through `next/font` |
| Redact and Download | two steps, as today | the self check can refuse; the warning sits above Download; late downloads get blocked | one "Redact & download" button |

### Decided after the cross check

An independent read of the draft (another model, read only, 2026-10-06) checked it against the code and specs 0001 to 0012 and found 25 points, 3 of them blocking. You chose to apply every recommended fix:

- **Blocking**: the social card had no page to render from (now the built `/` with its body swapped); separate idle and document layouts would have remounted both polite regions just as the first phase is announced (now one grid of three keyed areas in fixed order, the polite region first in the rail); and the app icon tile drew the teal mark on a teal square (now the mark's paths in `on-accent`, at stated sizes).
- **Should fix**: `sizes`, `loading="eager"` and `fetchPriority="high"` on the shot (Next 16 deprecates `priority`, and its docs prefer these over `preload`); the footer's brand line kept out of a `p`; the manifest dropped so no policy changes; the plan card's markup and its new contrast pair; the plan card's new place recorded as a change to spec 0007 AC-5 and spec 0012 AC-5; wide containers for the two "beside" layouts; the script freed from TypeScript imports and from any stub (with nobody signed in the real entitlement route answers free, `none`, with the build's caps); the script waiting for fonts and checking the reviewing state before it captures; the grid kept stretched so the panel can stick; `logoPlacement` in place of a CSS hidden logo; the alt text as a committed, tested text file.
- **Smaller**: the nav label stays "Site"; no current item on sign in; the phone header wraps in page order; the idle steps reworded so they repeat no button name and do not clash with "cleaned copy"; the count badge's noun and tone; `lookedFor` moved to `en-GB`; `HOME_STRIPPED` as a record over every kind; Pricing's title and lead kept; the trio's icons named; the word source claims scoped; every test that changes by design listed.

### What each reference gave, and what stayed out

| Reference | Kept | Left out, and why |
|---|---|---|
| 01 tool review | two columns; "Detected items" grouped with counts and icons; the full width primary button with the lock line under it | the page preview and thumbnails (spec 0002); "Other sensitive data" (no such detector); "Redact & download" as one step; the Documents, History and Settings nav and team avatar (no such features); serif headings; the leaf logo |
| 02 upload, empty | the large dashed drop zone with an icon circle; the right panel beside it | "choose a file" as a link in the title (a second tab stop, spec 0003 AC-8); "for privacy and speed" (an unmeasured claim); the empty state panel (replaced by three steps); serif headings |
| 03 warnings | the warning card and the info toned plan card above the list; select all; right aligned page numbers; the two column tool | "covers the first 3 pages, upgrade to redact all 12" (a document over the cap is refused whole); the page preview; "For teams"; the settings icon and avatar; the document icon logo |
| 04 landing hero | eyebrow, display headline, lead, two buttons, a framed product picture, a benefit trio | "addresses and more"; "Built for teams" and "Trusted by HR, legal and compliance teams"; the "Trusted by professionals at" row and the testimonial; "Fast and easy" (unmeasured); "Log in" and "Get started" (our Account and Redact a PDF) |

### The concept sheet

Three mark directions and three wordmark styles were drawn at 128, 64, 32 and 16 pixels, as an app tile and in a browser tab, on RedactNest's own colours, and published privately for this decision: [RedactNest Logo Concepts](https://claude.ai/artifact/BKqV9SHrkZ5nUMWH1gd2su). Concept 1 (Nest and bar) and wordmark A were chosen. The sheet's paths are sketches; `/develop` draws the final mark to AC-1's minimums.

## References

**Project sources**:
- Spec 0002, INV-1 and INV-2 (no page images, no coordinates outside the worker)
- Spec 0003 (tokens, contrast contract, INV-6 one typeface, INV-8 underlines, INV-10 real page loads into `/tool`)
- Spec 0006 and spec 0007 INV-5 (the download warning directly above Download), spec 0007 AC-5 (reading order) and its *Focus* table
- Spec 0009 AC-1 (the footer notice, its six parts and their order)
- Spec 0011 INV-7 (legal pages static, no script)
- Spec 0012 AC-5, AC-6, AC-8, AC-13, AC-20, INV-13 and its Go live steps
- Spec 0004 AC-22 and its inventory table (what is flattened, refused and stripped)
- `src/config/csp.ts` (`default-src 'none'`, no `manifest-src`), as specs 0001, 0011 and 0012 (AC-20) fix both policies
- `src/app/tool/tool-client.tsx` and `src/app/tool/plan-line.tsx` (each polite region in the page from the start so its first announcement is heard), `tests/e2e/shell.spec.ts` (the footer's one `p` is spec 0009's notice)
- Next.js 16's own docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/` (`app-icons.md`, `manifest.md`, `opengraph-image.md`: `favicon.ico` only as a file, `icon.svg` gets `sizes="any"`, the social image size limits)
- The `frontend-design` skill (`anthropics/skills`, `.claude/skills/frontend-design/`), installed for this feature
- The research cache `docs/.agent-cache/research/brand-ui-refresh.md` (2026-10-06)

**Practices and standards**:
- WCAG 2.2: 1.3.2 meaningful sequence and 2.4.3 focus order (the rail first), 1.4.1 use of colour (nav items), 1.4.10 reflow, 2.4.11 focus not obscured (the sticky panel)
- The six file favicon set (`favicon.ico`, an SVG icon, a 180 pixel Apple icon, 192 and 512 manifest icons, a maskable 512 with a 409 pixel safe circle)
- Open Graph's 1200 by 630 image, also used by X's `summary_large_image` card
- Reserved values for fictional data: `example.com` (RFC 2606), Ofcom's drama number ranges, the US `555-01xx` range

**Links** (web verified on 2026-10-06):
- Clerk, appearance prop options (`layout.logoImageUrl`, `logoPlacement`, `elements`): https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/options
- Clerk, appearance prop variables: https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
- Polar, organisation schema (`avatar_url`, shown on checkout, portal and emails; medium confidence): https://polar.sh/docs/api-reference/2026-04/organizations/get-organization
- Polar, products (product media on checkout; no size given; medium confidence): https://polar.sh/docs/features/products
- Evil Martians, How to Favicon: https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs
- W3C, Understanding 2.4.11 Focus Not Obscured (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum
- W3C, failure F110 (sticky content hiding focus): https://www.w3.org/WAI/WCAG22/Techniques/failures/F110.html
