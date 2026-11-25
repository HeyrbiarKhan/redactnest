# 0026. UI redesign

**Date**: 2026-11-25
**Updated**: 2026-11-25, after milestone 1 (e905b4e), from the owner's ruling on `/tool`'s review layout (`rationale.md`, *Amended after milestone 1*). AC-12: from `lg`, with a document on the page, `/tool` draws one centred column (the file bar, the document card, B's head with the plan card, the Found items card, then the action panel, sticky to the foot of the window), and the page order A, L, B, C is kept. This replaces spec 0013 AC-16's two columns, AC-17's sticky top and INV-6's wording. Recorded as built in milestone 1, no new design: Button's `link` variant and `icon` size and IconCircle's `solid` tone (AC-4), and the `night-accent` focus ring on the night band (AC-1, AC-9). The Amends line, the key invariants, the test scenarios, task 6 and the Consequences follow.
**Updated**: 2026-11-25, the owner's port of `/` to `Main.dc.html` and `06-home.png` at 1440 pixels, amending AC-2, AC-5, AC-8, AC-9 and AC-10 and spec 0003's AC-14 and INV-6, by the owner's rulings that day. AC-8: the trust strip and the questions go in, the hero's product window is drawn in HTML from the tool's own words (no screenshot), and its card is titled "Checked before you download" over "No pass, no file"; the black box section's eyebrow is "Why it matters" and "Removed, not covered" moves to the trust strip. The owner read every repeated claim, and `tests/unit/home-text.test.ts` holds each claim to an exact list of named places instead of one. New lines the owner approved: How it works' "No upload, no queue, no account for small files.", the trust strip's "Open source (AGPL), so you can check it", the Looks for chip "+ Your own terms with Pro" (billing on), and the closing card's caps line "... Nothing to install." under "Redact your next PDF". AC-9: the band's list is a two column table (Name, Path) in the monospace stack, a path breaking only after a slash. AC-10: on `/` the cards are `PricingCards`' summary form, each price large, and Pro's "Get Pro" opens Pricing, where the seller, tax and terms lines stay. AC-2: the window and the Pro card take teal tinted shadows, and the floating card and the Pro card join the larger shadows. Spec 0003, INV-6: the monospace stack is allowed in the band's table and the black box copies only (`data-mono`, held by the fonts test). Spec 0003, AC-14: the home page's header sticks from `lg`, white at 85% over an 8 pixel blur, with a top scroll padding so focus never lands under it (WCAG technique C43); every other header stays static. Every word stays at least 14 pixels, and every claim keeps today's words.
**Status**: In Progress

## Summary

RedactNest gets a new look on every page, built from the mockups in `docs/design/references/redesign/`: white and grey surfaces in place of the warm off white, the teal accent kept (at the mockups' `#0f766e`), shadcn/ui's component pattern restyled to our own tokens, and small CSS motion. Three parts of the mockups touch the privacy promise, the content security policy or the worker, so each is its own child decision: the signed in header (built), the page preview (deferred to a later feature) and the step by step progress (built on the phases the worker already sends). No lint rule, contrast rule or text size floor is loosened, and no page makes a request it does not make today, apart from one plan check for a visitor who is signed in.

## Structure

This umbrella holds the look (tokens, primitives, every page's layout). The three child specs each hold one decision the brief asked to keep apart:

- [0001-signed-in-header.md](0001-signed-in-header.md): the header knows who is signed in on every page, `/tool` included (avatar with the email's first letter, a menu, no "Try it free" when signed in). Supports AC-19 to AC-30.
- [0002-page-preview-deferred.md](0002-page-preview-deferred.md): the tool's page preview and thumbnails are not built here; spec 0002 INV-2 stays as it is, and the leanings for the later spec are recorded.
- [0003-step-progress.md](0003-step-progress.md): the open and the run show a step list and a bar over today's `ProgressPhase` kinds, with no worker or engine change. Supports AC-31 to AC-36.

Acceptance criteria are numbered once across the umbrella and its children, so `AC-24` means one thing anywhere in this folder.

**Cross child contract**:
- The header is one component (`PageHeader` in `src/app/site-nav.tsx`) on every page. Child 0001 owns its right side (the account slot) and, on `/tool`, the file context; this index owns its look, its nav and the lockup.
- Child 0003's progress card and child 0001's tool header share the `/tool` layout this index fixes (AC-12). Neither changes the four areas' order or identity (spec 0013, INV-5).
- No child changes `src/worker/protocol.ts` except child 0001's `/api/entitlement` answer, and that answer's email never enters `EntitlementSnapshot` (AC-21).

## Requirements

**User stories**:
- As a visitor, I want RedactNest to look current and calm, so that I trust it with a sensitive document.
- As a visitor on `/tool`, I want to see each step of the work as it happens, so that I know it is moving and what it is doing.
- As a signed in visitor, I want the header to show I am signed in and what my plan is, on every page, so that I never wonder whether Pro applies.
- As the owner, I want the redesign to keep every promise the site makes (no upload, no third party on `/tool`, nothing stored, claims no wider than the code), so that a new look never costs a true word.

**Acceptance criteria** (AC-1 to AC-18 here; AC-19 to AC-30 in child 0001; AC-31 to AC-36 in child 0003):

*Tokens and type (amends spec 0003 and `design.md`)*

- **AC-1**: The colour tokens in `@theme` (`src/app/globals.css`) take the mockups' values, hex only (`--color-<role>: #RRGGBB;`), with names kept where a role is unchanged:

  | Token | Value | Use |
  |---|---|---|
  | `canvas` | `#ffffff` | page background |
  | `surface` | `#ffffff` | cards, header, panels |
  | `subtle` | `#fafafa` | quiet bands, the tool's centre area |
  | `muted` (new) | `#f4f4f5` | chips, count badges, hover fills |
  | `border` | `#e4e4e7` | hairlines |
  | `border-strong` | `#71717a` | field edges and any edge that must clear 3:1 |
  | `ink` | `#09090b` | text |
  | `ink-muted` | `#52525b` | secondary text |
  | `ink-subtle` (new) | `#71717a` | captions on `canvas`, `surface` and `subtle` only (4.4:1 on `muted`, so never there) |
  | `accent` | `#0f766e` | primary buttons, links, the mark |
  | `accent-strong` | `#115e59` | hover, link hover |
  | `accent-soft` | `#ccfbf1` | soft accent fills (icon tiles, badges) |
  | `accent-faint` (new) | `#f0fdfa` | a ticked row's fill |
  | `on-accent` | `#ffffff` | text on `accent` |
  | `focus` | `#115e59` | the focus ring, except on `night`, where it measures 2.62:1 and the ring takes `night-accent` (AC-9) |
  | `warning-bg` / `warning-border` / `warning-icon` | `#fffbeb` / `#fde68a` / `#b45309` | warning callouts |
  | `warning-ink` (new) | `#78350f` | a warning callout's text |
  | `danger-bg` / `danger-border` / `danger-icon` | `#fef2f2` / `#fecaca` / `#b91c1c` | danger callouts |
  | `danger-ink` / `danger-strong` | `#b91c1c` / `#991b1b` | a failure line; the filled delete button's hover |
  | `info-bg` / `info-border` / `info-icon` | unchanged | the plan card |
  | `night` (new) | `#09090b` | the home page's dark band |
  | `night-ink` / `night-muted` (new) | `#fafafa` / `#a1a1aa` | text on `night` |
  | `night-accent` / `night-border` (new) | `#5eead4` / `#27272a` | links and edges on `night` |

  `#a1a1aa` is never text on a light surface (it fails 4.5:1); where a mockup uses it, the text takes `ink-subtle` or `ink-muted`. Every new foreground and background pairing joins spec 0003's contrast contract and `tests/unit/contrast.test.ts` in the same change. A pairing that fails is fixed by changing the pairing, never by lowering a threshold. Spec 0003, INV-1 to INV-3; spec 0013, AC-27 and INV-7.
- **AC-2**: Radius, shadow and motion are tokens in `@theme`, read from the `.dc.html` files: radii of 8, 10 and 14 pixels plus full (menu items, controls, cards, pills), the mockups' card, popover and window shadows (black at low alpha, the one place an alpha colour is allowed, because a shadow is depth, not a colour role, and it never carries text), and motion durations (`fast` 120 ms, `base` 200 ms, `slow` 320 ms) with one ease out curve. One rule in `globals.css` under `prefers-reduced-motion: reduce` sets every transition and animation to an instant change, and no component opts out. Motion appears only in: a menu or popover opening (fade with a 4 pixel rise), a checklist group opening and closing, the progress bar's fill, a progress step's tick appearing, and colour and border changes on hover and press. Nothing moves the layout under a focused control.
- **AC-3**: Inter stays the only typeface, and nothing renders below 14px (spec 0003, INV-6): every 9 to 13px line in the mockups becomes `text-small` (0.875rem), and its layout gives it the room. Two sizes join the scale for the mockups' large headings: `display` (the hero `h1`, about 3.25rem with tight leading and `-0.03em` tracking) and `headline` (section `h2`s, about 2.25rem), each falling back to `title` below `sm` through breakpoints, never viewport units.

*Primitives (amends spec 0003 and spec 0013, AC-29)*

- **AC-4**: `src/ui` follows shadcn/ui's pattern under our rules: variants through `class-variance-authority` (`cva`), every class a token utility, and a Radix primitive only where a widget needs managed focus and keyboard behaviour. Today that is one: `@radix-ui/react-dropdown-menu`, behind `src/ui/dropdown-menu.tsx`. Both packages are pinned exact, pass `scripts/sync-legal.mjs`'s licence allowlist (both MIT), and are the only new runtime dependencies (spec 0013, AC-29 amended to name them). No shadcn file is copied with its theme: no `text-xs`, no alpha modifier, no `cursor-` class, no oklch variable, so no lint rule and no test is loosened. The `redactnest/ui` zone keeps its bans, so a primitive stays presentation only and its caller passes what it shows. The primitives restyled or added: `Button` (variants `primary`, `secondary`, `ghost`, `link`, `danger`, `danger-secondary`; sizes `default`, `lg` and `icon`; `busy`, `reload` and `href` kept), `Card`, `Callout`, `Checkbox`, `Chip`, `CountBadge`, `IconCircle`, the checklist parts, `DropZone`, `TextField`, `Spinner`, `SiteHeader`, `SiteFooter`, and new `Avatar`, `DropdownMenu` and `ProgressSteps`. _Recorded as built in milestone 1 (e905b4e):_ `link` stays beside `ghost`. `ghost` is a quiet boxed action with no edge until the pointer is on it. `link` is an action drawn as a link, always underlined so it is never told apart by colour alone (Start over, and Untick all in AC-12's action panel), with the disabled look `unavailable-link`. Size `icon` is a 40 pixel square for a button whose words are visually hidden (the header's menu button, child 0001 AC-27), so it keeps an accessible name and clears the 24 pixel target. `IconCircle` keeps `accent` and `neutral` and gains `solid` (`on-accent` on `accent`, 5.47:1, a pairing already in the contract), the guide pages' filled step tiles (AC-11).

*Header, footer, mark (amends spec 0013, AC-2, AC-7 and AC-8)*

- **AC-5**: Every page's header follows `07-header.png`: a `surface` bar with a bottom `border`; the lockup (AC-14); a `nav` labelled "Site" holding "How it works" (`/#how-it-works`, a plain `a`), "Security" (`SECURITY_PATH`) and, with billing on, "Pricing" (`PRICING_PATH`), each marked current as spec 0013 marks it today; then the right side. Signed out, with billing on, the right side is "Sign in" (`SIGN_IN_PATH`, a plain `a`) and the primary "Try it free" (`NAV_TEXT.tryFree`, `TOOL_PATH`, `reload`). With billing off there is no Sign in and no account slot. There is no Guides item. Child 0001 owns the signed in right side and `/tool`'s header. Below `sm` the nav folds into the header's existing menu (feature 28). Every word lives in `NAV_TEXT`.
- **AC-6**: Every page's footer follows `06-home.png`: a brand column (the lockup, not a link, and the site line in a `div`), then three groups, "Product" (Redact a PDF, Security, Pricing with billing on), "Guides" (the three search pages, from `SEARCH_PAGES`) and "Legal" (Privacy, Terms), then the licence line. The licence notice stays the footer's one `p` with every word from `src/lib/legal.ts` and every path from `src/lib/routes.ts` (spec 0009, AC-1; spec 0011, INV-4). Footer links stay underlined.
- **AC-7**: The mark stays the nest and bar (spec 0013, AC-1), filled with the new `accent`. The header and footer lockup sets it in `on-accent` inside a rounded `accent` tile, as the mockups draw it, before the live wordmark (spec 0013, AC-2 amended). `src/app/icon.svg` takes the new `accent` and keeps `accent-soft` for its dark rule, and `tests/unit/brand-files.test.ts` holds both values and `MARK_PATHS`.

*Pages*

- **AC-8**: `/` follows `06-home.png`, in this order: the hero (an eyebrow chip, the `display` `h1`, the lead, the primary button to `TOOL_PATH` with `reload`, a secondary "See how it works" to `#how-it-works`, the caps line; from `lg`, the product shot on the right in a window frame with a small "Checked before you download" card beside it, in HTML); "How it works" (`id="how-it-works"`, three step cards with small drawn illustrations in HTML on fictional values); the black box comparison (a box drawn over text beside RedactNest's result, with what copied text gives in each, drawn in HTML on a fictional example); "Looks for" and "Strips" (today's two cards, their lists still from `findsItems()` and `strippedItems()`); the network band (AC-9); the pricing cards (AC-10); a closing call to action band; the footer. The mockups' trust strip and questions are left out. Every word lives in `src/lib/home-text.ts` (spec 0013, AC-13). The mockups' wording is a draft: every line that describes the engine is written to spec 0018 AC-5's rule and spec 0024's claim register, with a comment naming its row, and each line that repeats an idea already on the page gets the owner's read before merge (spec 0013, INV-11). Today's trio claims each land in exactly one place, so each is still said once (spec 0013, AC-30 amended to name the new places): "never uploaded" in the hero's eyebrow chip only (no step card repeats it), "removed, not covered" in the black box section only, and "checked before you download" in the third step card only (the hero's small card beside the product shot names the check by its result, "No pass, no file", and the owner reads that pair before merge).
- **AC-9**: The network band is a full width `night` section: the `h2` "Watch your network tab while you redact" (draft), a short paragraph, a link to the way to check on `/security`, and a list of what `/tool` fetches. The list is `NETWORK_ROWS` in `src/lib/home-text.ts`: each row a label, what it is, and the path prefix it stands for, taken from `src/lib/routes.ts` (the tool page, the page's own files under `/_next/static/` and the icons, the engine under `/engine/`, the plan check `/api/entitlement`, the counts `TELEMETRY_PATH`), plus a last row saying the visitor's file is not among them. A Playwright test (`tests/e2e/network-list.spec.ts`) opens, redacts and downloads a fixture on `/tool` in the Playwright build (which reports counts), records every request, and fails when any request matches no row, when any row is never seen, or when any request other than the counts post has a body longer than 0 bytes. The tool page row covers the document and Next's RSC requests to `TOOL_PATH` (with `_rsc`); the page files row covers `/_next/` (static files, and `/_next/image` if any page uses it). The counts post's body is checked to hold no fixture text. It runs in the `chromium` Playwright project (it times nothing). So the list cannot drift from what the page does. On the band the focus ring is `night-accent`, set by one rule in `globals.css` scoped to the band, because `focus` measures 2.62:1 on `night`, under the 3:1 a ring needs (WCAG 1.4.11). _Recorded as built in milestone 1 (e905b4e):_ the contrast contract holds `night-accent` on `night`, and `contrast.test.ts` holds `focus` on `night` out of the contract as a failing pair. The scoped rule lands with the band (task 10).
- **AC-10**: The pricing cards are one component in `src/app` used by `/` and `/pricing` (spec 0013, AC-22): Free (its name, the free cap from `config`, a secondary "Try it free") and Pro (a "Most useful" badge, the price line from `PRO_PLAN`, the paid cap and the term limit from `config`, a primary button to where `/pricing`'s Pro card goes today, a plain `a`). With billing off there is no pricing section on `/`. No number is written in a component.
- **AC-11**: The three search pages follow `10-guide.png` through `src/app/search-page.tsx` and `src/lib/search-pages.ts`: a centred hero (breadcrumb text with no Guides link, the `h1`, the lead, the primary button and the free caps line) over a soft accent glow drawn in CSS from tokens; three step cards with icon tiles; an "On this page" list beside the body from `lg` (plain anchor links, sticky with CSS, no script), above it below `lg`; the body with its warning callout; "More guides" cards linking the other two; the closing band. They stay static server components with no client component of their own and no script (spec 0024, INV-5, as AC-25 in child 0001 narrows it for the header's account slot). Their claims stay in spec 0024's register.
- **AC-12**: `/tool` keeps its four areas (A, L, B, C), their order and their identity (spec 0013, AC-14 to AC-17 and INV-5), every test id, role, accessible name and focus move (spec 0013, AC-20), and its single polite regions. Its look follows `08-tool-review.png` and `09-tool-states.png` without the preview and thumbnails (child 0002): the page sits on `subtle`; with no document, the drop zone card ("Drop a PDF to start", "or", the primary "Choose a PDF", the caps and device line) with the terms line under it; while reviewing, the Found items card styled like the mockup's right column ("Found items" with its count, the page warnings, the custom terms field, the groups with a ticked row on `accent-faint`), and under it the action panel styled like that column's foot (the ticked count, Untick all, the `lg` Redact button and the lock line); the result card (an icon tile, the title, three counts from `ResultCounts` through `countText`, the warning when the file is partly redacted, Download, the file name); a refusal card (the kind's words and its suggestion from `src/lib/flow-text.ts`, Open another PDF, and a link to `/security`). Every word comes from `src/lib/flow-text.ts`, `src/lib/page-findings.ts` and the records they already use (spec 0007, INV-3). The layout, from the owner's ruling after milestone 1 (replaces spec 0013 AC-16's two columns, AC-17's sticky top and INV-6's wording; spec 0013 AC-14 and AC-15 stand):
  - *One column.* From `lg` (still the grid's own container query, `@min-[61rem]`, so 200% text on a wide window counts as below `lg`), with a document on the page (`opening`, `reviewing`, `redacting`, `complete`, `lost`), the areas draw as one column, `grid-template-columns: minmax(0, 44rem)` (the `max-w-narrow` measure) with `justify-content: center`, so no block needs its own width, top to bottom: A (the file bar, as child 0001 AC-30 leaves it); L (the document card, and while a document opens or a run works, child 0003's progress card); B's head; C (the Found items card, from `reviewing` on), with B's action panel floating over C's foot. L is sized to what it holds (nothing stands beside it to stretch to), so spec 0013 AC-16's "centred down the room beside the rail" and the grid's `align-items: stretch` fall away for the column. While a document opens, L keeps spec 0013 AC-16's stacked phase line (a 40 pixel spinner with the line under it, 40 pixels of room above and below) until child 0003's progress card takes its place (task 7). With no document (`idle`, and `failed` after an open) the page is as spec 0013 AC-15 has it: A beside the rail. Below `lg` the column holds the page order and nothing is sticky, as today.
  - *B in two parts.* B (still `area-rail`, every test id kept) holds B's head (`data-testid="area-rail-head"`), rendered from B's first render in every step so neither it nor the plan card's region inside it ever remounts, holding in order the plan card (billing on), the idle steps, the lost callout, the run refusal, the result card at `complete`, and the lock line whenever no action panel shows (aligned as today: centred where the idle areas stack, at the start with a document on the page). After the head comes the action panel, mounted only while acting, as today; it is not a live region. When `compact` (a document on the page) and from `lg`, B is `display: contents` (its flex column classes and `[grid-area:b]` apply only otherwise), so the grid places the head and the panel apart: the head in its own area between L and C, and the panel in C's area (below). At idle and below `lg`, B is a column as today. B carries no role, name or landmark and must gain none, because `display: contents` drops an element's role in some browsers.
  - *Rows.* `toolGridAreas` takes one record of which areas hold something (A, L not quiet, B's head, C) and builds the column's template from those alone, so no empty row and no doubled gap opens: A may be empty once child 0001 AC-30 moves the file bar's buttons to the header, and B's head is empty while reviewing with billing off and no refusal. An empty A or head is also `hidden`, so it leaves the grid's flow. A unit test covers the template in each state (`opening` with and without a phase line, `lost`, `reviewing`, `redacting`, `complete`), billing on and off.
  - *The plan card* sits in B's head: under the document card, above the Found items card. The run refusal and the lost callout follow it there, and at `complete` the result card and the lock line take the head after the plan card, above the list, where Download is in reach without scrolling past it. The result card is never sticky.
  - *Order.* The page order, the reading order and the focus order are unchanged at every width: file bar, document card, plan card, run refusal, action panel, then the list (spec 0007 AC-5; spec 0013 AC-16). From `lg` the action panel is drawn after the list but reached before it, as today's rail is drawn right of the list and reached first. It floats at the window's foot whenever the column runs past it, so focus reaching it never jumps the page.
  - *The panel's room.* One custom property, `--tool-panel-room`, in `rem`, set on the tool grid from `lg` with a document on the page, is the room the panel needs: at least its height in its tallest form at `lg` (the count line, the waits line wrapped, the `lg` button and the lock line, with its padding and edge). C's bottom padding and every scroll margin below read it, so they never disagree.
  - *Sticky foot.* The action panel is a grid item placed in C's area with `align-self: end`, and C has a bottom padding of `--tool-panel-room`. At the list's end the panel rests in that padding, under the last row, covering none. It is `position: sticky` with `bottom: 0` from `lg` only, and only when the window is at least 36rem tall (a `min-height` media query, so a short window and browser zoom get a static panel), so the ticked count, Untick all, Redact or Cancel and the lock line stay at the window's foot over a long list. Sitting in C's area keeps it floating whether an engine bounds a sticky grid item by its own area or by the whole grid. Chromium bounds it by the whole grid (measured 2026-11-25), so there it can float over B's head and L when the column above the list is taller than the window. The panel has an opaque `surface` fill, a `border` edge and the card radius, and no shadow, flush to the window's foot, so a row passing under it never shows through and forced colours keep its edge. Nothing else on `/tool` is sticky.
  - *Focus never hidden when it moves* (WCAG 2.2, 2.4.11; replaces spec 0013 INV-6's wording). The panel can float over any block in the column, so whenever the panel is sticky every focusable control in the column (A, L, B's head and C, a heading that takes focus by script included) carries `scroll-margin-bottom: var(--tool-panel-room)`. A control focused by keyboard or by script then scrolls clear above the panel (Chromium honours it for Tab and `focus()`, measured 2026-11-25). The tool grid also carries one `focusin` handler, for engines that do not: when the panel is sticky (its computed `position`) and the focused control's box overlaps the panel's box, it calls `scrollIntoView({ block: "nearest", behavior: "instant" })` on the control, which honours the scroll margin. The overlap rule is a pure function of the two boxes (`coversFocus(control, panel)` in `src/app/tool/panel-room.ts`), unit tested: overlapping boxes scroll, touching or separate boxes do not. This holds focus moves only; a wheel or a page key can still scroll a focused control under the panel, which 2.4.11 allows. Nothing else moves focus or scrolls the page.
- **AC-13**: `/pricing`, `/security`, `/privacy`, `/terms`, the account pages, sign in and sign up, and the 404 take the new tokens, primitives, header and footer, and keep today's structure, order and words. Clerk's card takes the new tokens through `clerk-appearance.ts`, keeping spec 0013 AC-31's field edges (`border-strong`). Nothing new is invented for a page with no mockup.

*Rules that hold everywhere*

- **AC-14**: Neither content security policy changes, `/tool` loads no third party script, and no page makes a request to an outside origin. `/tool` makes no request it does not make today (spec 0013, AC-21). Nothing is written to browser storage (the account slot reads a cookie and writes none; child 0001, AC-19).
- **AC-15**: One rule in `globals.css` still sets every cursor (spec 0013, AC-33). It gains `[role="menuitem"]` for the account menu's items, and no component sets a cursor. Red stays for deleting an account only (spec 0013, INV-12).
- **AC-16**: WCAG 2.2 AA on every page: each page in spec 0013 AC-26's list, plus `/security`, the three search pages and the sign out page (child 0001), passes axe with spec 0003 AC-18's tags at desktop width, at 320 pixels and with forced colours; reflows at 320 pixels with no sideways scroll; clips nothing at 200% text; shows a visible focus ring on every control; and keeps every target at least 24 by 24 pixels. The account menu and the progress steps are walked by keyboard and with a screen reader's names in a test.
- **AC-17**: `node scripts/make-brand.mjs` is rerun and its output committed: the icon files take the new accent, and the product shot, the social cards and `polar-product.png` picture the new look (spec 0013, AC-28 and INV-8; spec 0024, AC-16).
- **AC-18**: `docs/design/design.md` is rewritten for the new direction (white and grey surfaces, teal accent, shadcn pattern under our tokens, CSS motion, the 14px floor), and specs 0003 and 0013 each carry a dated amendment line pointing here for the rules this spec changes.

## Decision

**Chosen option**: shadcn/ui's pattern under the project's own rules, CSS motion, the mockups' palette, every page in one feature; the signed in header built on a cookie gated plan check and a session token claim; the preview deferred; the progress shown as steps over today's phases.

The redesign restyles every page to the mockups through new tokens and `cva` based primitives (one Radix primitive, the dropdown menu), keeps every existing rule, and handles the three sensitive parts as the three child specs record.

**Implementation skills**: `frontend-design` (`anthropics/skills`, `.claude/skills/frontend-design/`) · `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.claude/skills/clerk-nextjs-patterns/`, for child 0001's sign out page). This spec and `design.md` win wherever a skill suggests otherwise.

**Amends**: spec 0003 (palette values, shadow tokens, the primitive list), spec 0013 (AC-2, AC-7, AC-8, AC-10, AC-11, AC-14 to AC-19 for the look, AC-16 and AC-17 for the layout as well, and INV-6's wording, all through AC-12; AC-22, AC-27, AC-29, AC-30), spec 0007 (`PHASE_TEXT` words, child 0003), spec 0011 INV-7 and spec 0024 INV-5 (the header's account slot, child 0001, AC-25), spec 0012 AC-1 (the entitlement answer gains `email`, child 0001, AC-21), and `docs/design/design.md`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no persistent data. Two typed records join the code: `NETWORK_ROWS` (AC-9) and the account menu's plan words (child 0001, AC-23). The `/api/entitlement` answer gains one field (child 0001, AC-21).

**API surface**: unchanged here; child 0001 changes `GET /api/entitlement`'s answer.

**Value sourcing**:
| Action | Value displayed | Source |
|---|---|---|
| Home hero, pricing cards, caps lines | free and paid page caps, term limit | `config` (`freePageCap`, `maxPages`, `maxCustomTerms`) through `countText` |
| Pricing cards | Pro's price line, plan names | `PRO_PLAN`, `FREE_PLAN` in `src/lib/plans.ts` |
| Looks for / Strips cards | the lists | `findsItems()`, `strippedItems()` (today's) |
| Network band | rows and their paths | `NETWORK_ROWS` in `home-text.ts`, paths from `routes.ts`; held by AC-9's test |
| Guides pages | every word | `SEARCH_PAGES` and `SEARCH_PAGE_TEXT` in `search-pages.ts` |
| Tool result card | removed, left in, stripped counts | `ResultCounts` (today's), through `countText` |
| Tool refusal card | what happened, what to try | the failure's kind in `flow-text.ts` (today's) |
| Header and footer words | link names | `NAV_TEXT`, `SEARCH_PAGES`, `src/lib/legal.ts` |
| Every colour, radius, shadow, duration | the value | `@theme` in `globals.css` |

**Key invariants**:
- No lint rule, contrast threshold or text floor is loosened to fit a mockup; the mockup gives way.
- Every line that describes the engine holds under spec 0018 AC-5 and spec 0024's claim register, whatever the mockup's draft said.
- `/tool`'s areas, ids, names, focus moves and live regions are unchanged (spec 0013, INV-5, AC-20). B's head is rendered in every step, so splitting B never remounts the plan card's region (AC-12).
- Nothing sticky hides a control as focus moves to it: only the action panel sticks, only from `lg` in a window at least 36rem tall, only at the window's foot, and every focusable control in the column scrolls clear of it (AC-12; replaces spec 0013 INV-6's wording).
- No page image, coordinate or page geometry leaves the worker (spec 0002, INV-2; child 0002).

**Security model**: unchanged by the look. Child 0001 holds the one change that touches personal data (the visitor's own email, shown to them only).

**Configuration required**: no new environment variable. Child 0001 needs a Clerk dashboard change (its AC-29).

**Critical test scenarios**:
- Contrast: every pairing in the contract passes at its threshold, `ink-subtle` on `muted` is absent, verifies **AC-1**.
- Reduced motion: with `prefers-reduced-motion: reduce` emulated, a menu opens and the bar fills with no transition, verifies **AC-2**.
- Lint and source: no `text-xs`, alpha modifier, `cursor-` class or oklch value under `src`, and the two new packages are the only new runtime dependencies, verifies **AC-3**, **AC-4**.
- Network list: open, redact and download record only listed requests, every row is seen, and no body carries the document, verifies **AC-9**, **AC-14**.
- Tool unchanged in behaviour: the existing component and e2e suites pass with only words, classes and the layout checks below changed, verifies **AC-12**.
- Tool column (e2e, `design-system.spec.ts`): at 1280 pixels while reviewing, each block that holds something (A, L, B's head, C) stacks top to bottom in that order, centred and no wider than 44rem, with the plan card below the document card and above the Found items card. In the page, B still comes before C (today's "rail first" check, by `compareDocumentPosition`). At `complete` the result card sits above the list and is `static`. While a document opens, L sits under the file bar with no stretch. This replaces spec 0013's two column checks, its opening layout check (L as tall as the rail, the line at L's centre) and every check that measures `area-rail`'s box, which has none under `display: contents`; those measure `area-rail-head` and `action-panel` instead. Verifies **AC-12**.
- Sticky foot (e2e, replacing the sticky top check): at 1280 by 720 pixels with a long list scrolled to its middle, the action panel is `sticky` with `bottom: 0px`, its bottom edge at the window's bottom and Redact in view. Scrolled to the list's end, its top is at or below the last row's bottom. At 1280 by 500 pixels, at 900 pixels, and at 1280 pixels with 200% text it is `static`, and nothing on the page is sticky. In its tallest form the test can hold (a stubbed paid answer with the waits line showing), the panel's height is at most `--tool-panel-room`. Verifies **AC-12**.
- Focus never hidden (e2e, Chromium): at 1280 by 720 pixels with a long list, Tab from the plan card through at least two windows' worth of rows. Each focused control's bottom edge stays at or above the panel's top edge. Verifies **AC-12**.
- Overlap rule (unit, `panel-room.test.ts`): `coversFocus` is true for boxes that overlap and false for boxes that touch or are apart, on every side. Verifies **AC-12**.
- Column template (unit): `toolGridAreas`'s template for each state, billing on and off, holds only the areas with something in them. The tool grid component test's two old templates are replaced. Verifies **AC-12**.
- B's nodes (component, `tool-client.test.tsx`): `area-rail`, `area-rail-head` and the plan card's region are the same nodes before a file is chosen, while reviewing and at `complete`, and B has no role. Verifies **AC-12**.
- Accessibility: axe, 320 pixels, forced colours, 200% text on every listed page, verifies **AC-16**.

## Build plan

Skateboard: the first slice ships the whole site in the new look (one token change reaches every page, so a half applied palette would look broken), then each page grows to its mockup, and the signed in header comes last because it needs a Clerk dashboard change and a privacy policy entry.

1. Tokens: palette, radius, shadow, motion and type scale in `@theme`; the reduced motion rule; the contrast contract and `contrast.test.ts` for every new pairing, satisfies **AC-1**, **AC-2**, **AC-3**
2. Add `class-variance-authority` and `@radix-ui/react-dropdown-menu` pinned exact; run `sync-legal` to confirm both licences; amend spec 0013 AC-29's line, satisfies **AC-4**, **AC-14**
3. Restyle every primitive in `src/ui` to `cva` variants on the new tokens, and add `Avatar`, `DropdownMenu` and `ProgressSteps`; component tests and axe for each, satisfies **AC-4**, **AC-16**
4. Mark and lockup: `icon.svg` fill, the accent tile in `BrandLockup`, `brand-files.test.ts`, satisfies **AC-7**
5. Header (signed out shape) and footer on every page, with `NAV_TEXT` words and the `#how-it-works` anchor; the cursor rule gains `[role="menuitem"]`, satisfies **AC-5**, **AC-6**, **AC-15**
6. `/tool` look and column: drop zone, Found items card, action panel, result and refusal cards; B split into its head and its panel, `display: contents` from `lg` with a document on the page, the one column template built in `toolGridAreas` from the areas that hold something, `--tool-panel-room`, the panel in C's area with the sticky foot, the column's scroll margins and the `focusin` fallback with `coversFocus` in `src/app/tool/panel-room.ts`; keep every id, name, focus move and region; replace spec 0013's two column, opening layout and sticky top checks with the column, sticky foot, focus walk, overlap rule and template checks, satisfies **AC-12**
7. Child 0003: progress steps on open and run, satisfies **AC-31** to **AC-36**
8. Home: hero, how it works, black box comparison, looks for and strips, closing band, words in `home-text.ts` with claim comments, owner's read of repeated ideas, satisfies **AC-8**
9. Pricing cards on `/` and `/pricing`, satisfies **AC-10**
10. Network band and `tests/e2e/network-list.spec.ts`, satisfies **AC-9**
11. The three search pages through the template, satisfies **AC-11**
12. Pricing, security, privacy, terms, account pages and the 404 restyled in place; `src/app/(account)/clerk-appearance.ts` moved to the new tokens with spec 0013 AC-31's field edges kept, satisfies **AC-13**
13. Child 0001: the signed in header, its entitlement change, the sign out page, the privacy policy entry and the Clerk setup, satisfies **AC-19** to **AC-30**
14. Accessibility sweep on every listed page, `/sign-out` included (axe, 320 pixels, forced colours, 200% text, keyboard walk of the menu and steps), satisfies **AC-16**
15. Rerun `scripts/make-brand.mjs` and commit its output, satisfies **AC-17**
16. Rewrite `design.md`; add the dated amendment lines to specs 0003, 0007, 0011, 0012, 0013 and 0024, satisfies **AC-18**

## Consequences

**Positive**:
- One coherent, current look on every page, with no rule weakened to get it.
- The progress steps show the visitor real work with no change to the worker.
- The network list becomes a tested claim instead of a picture.

**Negative / tradeoffs**:
- Two new runtime dependencies. `cva` is on every page; the Radix menu (about 20 to 25 KB gzip) loads only for a signed in visitor, as one more file from our own origin (child 0001, AC-23).
- The shared header now carries one client island on otherwise script free pages (billing on builds), so the "no script" checks and the policy lines that rely on them are narrowed by name (child 0001, AC-25 and AC-28).
- Many existing tests and component snapshots change their expected classes; words change only where this spec says.
- Every brand raster is regenerated, and the Polar product image must be uploaded again (spec 0012's Go live step 9).
- The mockups' small text grows to 14px, so some layouts are looser than drawn.
- On `/tool` from `lg` the floating action panel covers the rows under it (in Chromium, any block in the column) until the visitor scrolls; the scroll margin and the `focusin` fallback keep a focused control clear of it, but a row under it must be scrolled to before it can be clicked. The panel is drawn after the list but reached before it by keyboard, as today's rail is.
- Text and layout copied from the mockups need a claim pass, which slows the home and guide slices.

**Neutral**:
- `design.md` and specs 0003 and 0013 become partly historical; their amendment lines point here.

## Migration plan

**Strategy**: one branch, merged when every slice passes; no flag (the site has no flag system, and two palettes side by side would be worse than either).
**Phases**: slices 1 to 5 make the whole site new; 6 to 12 grow each page; 13 adds the signed in header; 14 to 16 prove and record it.
**Rollback**: revert the merge commit. Nothing stored changes, so a revert is complete. The Clerk session token claim (child 0001) can stay; nothing reads it after a revert.
**Risks**: a token change landing on a page no slice walked (held by the sweep in slice 14); the brand script's product shot running against an unfinished `/tool` (run it last).

## Follow-up

- [ ] The page preview and thumbnails (child 0002) stay with scope feature 14 (manual rectangle redaction), which already owes the preview and the INV-2 amendment; its `/architect` run starts from child 0002's leanings.
- [ ] `/pricing` and `/privacy` still scroll sideways at 320 pixels (scope Deferred). The restyle is a good moment to fix both and add them to `REFLOW_PAGES`.
- [ ] Record the decline of Agent Skills for Radix and `cva` in root `AGENTS.md`'s `Declined:` line (2026-11-25), so a later run does not offer them again.
- [ ] Root `AGENTS.md` rules to update at `/sync`: the two new dependencies, the `muted`, `ink-subtle`, `accent-faint`, `warning-ink` and `night` tokens, shadow tokens as the one alpha colour place, the motion rule, and the header's account slot as the one client island on static pages.
