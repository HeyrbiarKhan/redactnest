# 0026. UI redesign: rationale

The decision record for [index.md](index.md) and its three children. `/develop` does not need this file.

## Context

The site's look comes from spec 0003 (the design system) and spec 0013 (the brand refresh): warm off white surfaces, a teal accent at `#1f7a7a`, and primitives written by hand in `src/ui`. The owner has new mockups (`docs/design/references/redesign/`) in a shadcn/ui idiom: white and zinc grey surfaces, teal 700, a header that knows who is signed in, a three column review screen with a drawn page, and a step list for the run.

The forces:

- **Rules the mockups break.** They set text at 9 to 13px (spec 0003 INV-6 says 14px), use `#a1a1aa` for text (under 4.5:1 on white), and shadcn's stock code uses `text-xs`, alpha modifiers, `cursor-` classes and oklch variables, all of which lint or the contrast test rejects. The repository's rules exist for accessibility and for claims staying true; a restyle is not a reason to loosen them.
- **The privacy architecture.** Pages are prerendered static; `/tool` loads no third party script under `connect-src 'self'`; Clerk's script runs only in the `(account)` group; the worker holds every document byte and all geometry (spec 0002, INV-2). A header that knows who is signed in, a drawn page with boxes, and a new progress signal each touch one of these.
- **Claims.** Every sentence about the engine is held to spec 0018 AC-5 and spec 0024's claim register, and `home-text.ts` deliberately never says "hidden data" as a whole (spec 0019, AC-12). The mockups' words are drafts written without those rules.
- **Delivery.** The project builds Skateboard. One token change reaches every page at once, so the thinnest usable whole is the whole site in the new look.

## Options considered

### The look

**shadcn as shipped** (its CLI and theme). Pros: least work to match the mockups; familiar code. Cons: needs the hex only token rule, the 14px floor, the alpha ban and the cursor rule changed first; brings a second theme system beside `@theme`.

**shadcn's pattern under our rules** (chosen). `cva` variants and Radix only where a widget needs managed focus, restyled to our tokens. Pros: shadcn's structure and Radix's keyboard behaviour with no rule loosened. Cons: two new runtime dependencies; each component is written, not pasted.

**Look only, no new packages**. Pros: smallest bundle on `/tool`; spec 0013 AC-29 untouched. Cons: the account menu's keyboard and focus behaviour written by hand, the part most likely to be subtly wrong.

### Motion

**CSS only** (chosen). Pros: nothing added to `/tool`; one reduced motion rule covers everything. Cons: no exit or layout animation (a row leaving the checklist just goes).
**The `motion` library**. Pros: enter, exit and layout animation. Cons: 30 to 40 KB on `/tool` for small effects; reduced motion handled per component.

### Text floor

**Keep 14px** (chosen). Pros: INV-6 and WCAG 1.4.4 hold. Cons: layouts looser than drawn.
**A 12px caption size**. Pros: closer to the mockups. Cons: amends INV-6; small text lands on badges and counts the visitor needs to read.

### Signed in header: how a page learns who is signed in

**Ask only when `__client_uat` says so** (chosen). Pros: one endpoint and one decision table (spec 0012); signed out visitors send nothing; `/tool` reuses its existing request. Cons: leans on a Clerk cookie name and on it not being `HttpOnly`, checked by the walk (child 0001, AC-29); a client island in the header of otherwise script free pages.
**Ask on every page view**. Pros: no cookie reading. Cons: a function call and a Polar check path for every anonymous visit.
**A lighter `/api/session`**. Pros: no Polar call on marketing pages. Cons: a second endpoint reading Clerk's cookie; the menu's plan line absent outside `/tool` and the account pages.
**Server rendered header**. Not viable: pages would stop being static, and `/tool` must stay prerendered for its policy.

### Signed in header: where the email comes from

**A session token claim** (chosen). Pros: read locally from a token the server already verifies, no extra call inside the tool's 4 second budget. Cons: a dashboard change outside the repository on two instances; the email travels in Clerk's cookie, which the privacy policy must say; an email change shows only once the token renews.
**A lookup at Clerk's backend**. Pros: nothing changes in Clerk's dashboard. Cons: a second outbound call per signed in check, and a new failure path.
**No email, a person icon**. Pros: no personal data reaches the page; no policy change. Cons: does not match the mockup the owner asked for.

### Signed in header: sign out

**A link to an `(account)` page that signs out** (chosen). Pros: Clerk's script stays in its group; one click from the menu. Cons: a new route; any link to it signs a visitor out (a nuisance, no data exposed, so accepted).
**Sign out only on `/account`**. Pros: no new route. Cons: two clicks, and the menu the mockup draws loses its last item.

### Page preview

**Pages, thumbnails and boxes**, **pages without boxes**, **a page list only**, and **defer** (chosen on 2026-11-25). Deferring keeps INV-2 whole in this feature and gives the widening its own spec. Cons: `/tool` does not match the mockup's left two columns yet. The other three were recorded in child 0002 (then `0002-page-preview-deferred.md`) with the owner's leanings. _Reversed on 2026-11-26 (the owner's call): pages, thumbnails and boxes, designed in [0002-page-preview.md](0002-page-preview.md); see *Amended for the page preview* below._

### Progress

**Add a `stripping` phase** (four true steps). Pros: matches the mockup's separate strip step truthfully. Cons: a protocol and engine change.
**Three steps on today's phases** (chosen). Pros: no change in `src/worker` or `src/engine`. Cons: the strip is not shown as its own step.
Bar: **by steps done** (chosen) over **by pages done** (a new protocol field and a message per page) and **no bar**.

## Rationale

The rules the mockups break are load bearing, not stylistic: the 14px floor and the contrast contract are accessibility commitments, and the claim rules are what make "Redaction that actually removes the text" safe to print. So the look comes in through shadcn's pattern rather than its theme, and the mockup gives way wherever it meets a rule. Radix enters for the one widget whose keyboard behaviour is easy to get wrong by hand; `cva` costs almost nothing and makes the variants explicit.

The three sensitive parts are each settled at the smallest change that keeps the promise intact. The header reuses the plan check that already exists and gates it on a cookie, so the only new data on any page is the visitor's own email, shown only to them, and `/tool`'s request count does not move. The preview, which would widen an invariant, waits for its own spec. The progress shows what the worker already says, worded so that no step claims more than its phase does.

Skateboard order follows from the token change: the first slice must restyle every page, or the site shows two palettes; the signed in header goes last because it alone needs a dashboard change, a privacy entry and a sandbox walk.

## Amended after milestone 1 (2026-11-25)

The build paused at task 6 because the first AC-12 asked for "one centred panel" with the action panel at its foot, while also keeping spec 0013 AC-17's sticky rail. Those two cannot both hold, so you ruled for one centred column with the panel sticky to the window's foot, keeping the areas' page order (A, L, B, C). That ruling replaces spec 0013 AC-16's two columns, AC-17's sticky top and INV-6's wording.

**The constraint.** B (plan card, refusal, action panel) comes before C (the list) in the page, and that order is what keeps the focus order and the live regions stable (spec 0013, INV-5). So the panel can only be drawn after the list if the grid can place B's blocks one by one. A sticky element also cannot leave the box it sits in, so a panel inside a B box drawn under the list could never float over the list.

**How B is placed** (options):
- **`display: contents` on B, with its head and its panel** (chosen). Pros: B keeps its node, and only classes change between steps. The grid places the head above the list and the panel at the list's foot. Cons: one wrapper (the head) joins B. `display: contents` drops an element's role in some browsers, which is harmless only while B has none, so the spec says B gains none.

  **Where the panel sits in the grid** (measured in Chromium on 2026-11-25 with a scratch page and the repo's Playwright; Firefox and WebKit are not installed). A sticky grid item in its own row after the list does float over the whole list in Chromium, because Chromium bounds a sticky grid item by the whole grid, not by its own area. A grid item's containing block is its grid area in the CSS Grid text, though, so another engine may bound it there, and then a panel in its own row would never float. The panel therefore sits in C's area with `align-self: end`, over a bottom padding on C of the panel's room, which floats under either reading. The cross check first called the own row placement blocking; the measurement showed that was wrong for Chromium but right to guard against. The same measurement showed Chromium lets the panel float above the list, over B's head and L, when the column above the list is taller than the window, so the focus rule covers the whole column, not only the list.
- **Subgrid, with B spanning the list's rows.** Pros: B keeps a box. Cons: B's box overlaps C, so painting and pointer order become a puzzle, for no gain.
- **A fifth area for the panel.** Pros: plain grid. Cons: changes the four areas spec 0013 INV-5 and spec 0026 AC-12 name, and moves the panel's node out of B.
- **Reordering the page** (A, L, B's head, C, panel). Pros: what is drawn matches what is focused. Cons: you ruled the order is kept, and it would move focus order and spec 0007 AC-5.

**Where the plan card goes** (options):
- **B's head, under the document card and above Found items** (chosen). Pros: the reading and focus order stay exactly as spec 0007 AC-5 and spec 0013 AC-16 have them. The plan sits beside the open document it governs, before the list. Cons: on a long list it scrolls away, which is fine, because it informs rather than acts.
- **Inside the sticky foot.** Pros: always in view. Cons: a taller floating panel covers more rows, and its polite region would float over the list.
- **Above the file bar.** Pros: first thing seen. Cons: changes the order spec 0013 moved it out of.

**The result card** goes in B's head at `complete`, above the list, so Download is in reach without scrolling past a long list. Spec 0007 already moves focus to its heading, and it is never sticky (spec 0013 AC-17).

**Which steps use the column.** The ruling named the review step. The column covers every step with a document on the page, because a two column open turning into one column when the list arrives would move the file bar and the polite region mid flow. Idle keeps spec 0013 AC-15 (the drop zone beside the rail), which the ruling did not touch.

**Focus.** A panel floating at the window's foot can hide a focused control, which WCAG 2.2, 2.4.11 forbids and spec 0013 INV-6 promised against. A scroll margin of the panel's room on every focusable control in the column keeps a focused control above the panel. Chromium honours it for Tab and for `focus()` (measured: every row stayed 24 pixels clear). The cross check recommended dropping the `focusin` fallback on that evidence; you kept it (2026-11-25), because Chromium is the only engine measured and the only Playwright project, and the panel's placement already plans for engines that read sticky differently, so Firefox and Safari must not be left to hide a focused control. The fallback scrolls only when the focused control's box overlaps the panel's box, a pure rule unit tested on its own, and the keyboard walk in Chromium stays the gate.

**Short windows.** In a window under 36rem tall the panel would take a third of the height or more, so it is static there. A `min-height` media query also turns it off under browser zoom, where the window's height in CSS pixels shrinks. The panel being drawn after the list while reached before it is today's arrangement turned on its side (the rail is drawn right of the list and reached first). Because the panel floats in view whenever the list is, focus reaching it never jumps the page (WCAG 2.4.3).

**Width.** `max-w-narrow` (44rem), the existing token the legal pages' text column uses, so no new token joins `@theme`. The runner up was the mockup's right column width, which is too narrow for context lines once small text grows to 14px.

**Recorded as built, no new design.** Milestone 1 made four small choices with no spec line, now recorded: Button keeps `link` beside the new `ghost` (an action that must read as a link, always underlined, INV-8); Button gains an `icon` size (the header's menu button); IconCircle gains a `solid` tone (the guide pages' step tiles); and on the night band the focus ring is `night-accent`, because `focus` measures 2.62:1 on `night`.

## Amended after the visual port (2026-11-26)

You ported `/` and the guides to `Main.dc.html`, `Guide.dc.html`, `06-home.png` and `10-guide.png` at 1440 pixels, section by section (c10756e to 418dd59), asking for the look to follow the mockups exactly, within hard limits: no lint rule, contrast pair, test threshold or 14 pixel floor loosened; engine words keeping today's meaning (a new claim meant stopping to ask); `src/engine`, `src/worker`, both content security policies, `/api` and the signed in header untouched; layout pins free to move, rule guards never weakened. Where a mockup met a rule, you ruled (2026-11-25 and 26). This section records those rulings; the index records the result as built. No new design was made.

**Repeats** (spec 0013, INV-11 and AC-30). The trust strip, the hero's card and the questions say claims the page already makes. INV-11 asks for your read before a repeat; you read each one and kept it. Holding each claim to an exact list of named places keeps what the rule is for (nothing repeats unread) while allowing the repeats you chose. The first draft's answer, leaving the strip and the questions out, was the other option.

**Monospace** (spec 0003, INV-6). You chose the mockup's monospace for the network table and the black box copies. Both show machine output (a request path, what a copy of the page's text gives), no font file is added (`ui-monospace` is the visitor's own), and `data-mono` with the fonts test's exact list keeps every other word in Inter.

**Teal shadows** (AC-2). You chose the mockup's accent tinted shadows for the drawn window and the Pro card. A shadow is depth, not a colour role, and never sits under text, so the contrast contract is untouched; the larger shadows list names both places.

**The sticky header.** The mockup's bar sticks. A sticky bar can hide a focused control (WCAG 2.4.11), so on `/` it holds only from `lg`, with a top scroll padding of its height (technique C43) and a browser test proving every focus stop clears it. Every other page keeps spec 0003 AC-14's static header.

**Get Pro to Pricing.** Home's Pro card opens `/pricing`, with no Polar, tax or terms line on home: those stay on the page that starts a checkout.

**The closing heading.** "Redact your next PDF", without the mockup's "in a minute": a 50 page Pro file can take longer.

**New lines.** You approved How it works' lead, the trust strip's AGPL line, the "+ Your own terms with Pro" chip and the closing caps line's "Nothing to install." On the guides: "Ready to redact?", "Your file stays on your device." (row M1, a repeat you read) and one More guides line per guide, each naming the guide's topic and claiming nothing.

**The guides' numbered list.** The How it works list went, and the three cards stand in for it. The cards carry no "STEP n" label, because they hold points, not steps. Spec 0024 AC-3 is amended to match.

**The network table's widest row.** From `xl` the page's files row wraps its name beside one line of paths; shortening the name was the other option.

## Amended for the page preview (2026-11-26)

You brought the preview back into this feature, so child 0002 became its design. It started from the leanings recorded on 2026-11-25 (pages, thumbnails and boxes; a transferred `ImageBitmap` on a canvas; look and jump only; nothing drawn below `lg`), and settled each open question below. You chose the recommendation every time.

**The forces.** INV-2 kept every coordinate in the worker for one stated reason: a stale or tampered box must never cause a wrong removal. INV-1 kept page pictures off the main thread because they are a new kind of document data there. A drawn page also costs memory in two places: pictures in the tab, and decoded pictures in a worker heap that never shrinks. `/tool`'s areas, focus order and single polite regions are fixed by spec 0013 INV-5 and AC-20, and AC-12's sticky foot and focus rules took a milestone to get right. Area L is the `aria-live` region itself, and a checklist row is a `label` around its checkbox, so clicking a row already toggles its tick.

### What was measured

Scratch tests ran MuPDF 1.28.1 in Node through the repository's own `prepareDocument`, on three 50 page US Letter documents built in the test: `cost.test.ts`'s dense text shape (60 lines a page), a 300 dpi grey scan with its own JPEG on each page, and a 300 dpi colour scan over ten JPEGs. Each draw is `toPixmap` to RGB with alpha, then a copy of the samples out of the heap, as a transfer would need. The machine's speed drifts between sessions, so these figures set the order of magnitude, not a budget.

| Draw | Device pixels | RGBA size | Dense text | Grey scan | Colour scan |
|---|---|---|---|---|---|
| Thumbnail at 1x (84 px across) | 84 by 109 | 0.03 MB | 1.2 ms | 26 ms | 0.4 ms (cached) to 55 ms |
| Thumbnail at 2x (168 px across) | 168 by 218 | 0.14 MB | 1.2 ms | 26 ms | 0.8 ms (cached) to 54 ms |
| Page 560 px across at 1x | 560 by 725 | 1.55 MB | 1.6 ms | 29 ms | 58 ms |
| Page 560 px across at 2x | 1120 by 1450 | 6.2 MB | 3.0 ms | 40 ms | 84 ms |
| The same at 200% | 2240 by 2899 | 24.8 MB | 11 ms | 78 ms | 158 ms |

Medians, with the slowest within about 10% except the cached colour thumbnails. All 50 thumbnails took 70 ms on text, 1.3 s on the grey scan and 0.55 s on the colour scan. Copying the samples out cost 1 to 7 ms a page.

The worker's heap, read with MuPDF's heap exposed as `device.test.ts` reads it, on the grey scan:

| Step | Store kept | Store emptied after each draw |
|---|---|---|
| Opened | 37 MB | 37 MB |
| 50 thumbnails at 2x | 53 MB | 37 MB |
| 50 pages at 2x | 159 MB | 44 MB |
| 10 pages at 200% | 190 MB | 65 MB |
| 10 pages at 400% (one 104 MB picture each) | 269 MB | 166 MB |

A WebAssembly heap never shrinks, so without `emptyStore` one look through a scan raises the worker's floor by over 100 MB for the rest of the session. With it, the heap grows once, by about one picture and one decoded image. The 400% row is why a picture needs a cap.

### The questions, the options and the calls

- **Page view.** *One page at a time* (chosen): as the mockup draws it, with one page picture alive, so "draw only what is in view" holds by construction. *Every page in one scroll*: reads like a PDF viewer, but each page's size must cross up front, pages are drawn and dropped as they scroll, and two or three pictures are alive at once.
- **Frame.** *Full window* (chosen): the mockup's frame, with the page column about 830 pixels at 1440. *Inside today's 1180 pixel container*: the h1 stays visible, but the page column is about 580 pixels at most.
- **How the full window frame scrolls.** First proposed as each column scrolling on its own. Working through the code showed that needs a wrapper around A, L, B and C (against spec 0013 INV-5) and would move AC-12's sticky foot and focus rules into a nested scroller. *The window scrolls and P sticks* (chosen): AC-12's right column is reused word for word, P is sticky at full window height beside it, and the footer is reached as now. *The right column as its own scroller*: closest to the mockup's code, at the cost of that wrapper and a second set of focus rules.
- **Between `lg` and `xl`.** *The same three columns* (chosen): about 400 pixels of page at a 1024 window, enough to find a box, and one layout to build and test. *Two columns with a page picker*: a bigger page, but a second shape of P. *No preview below `xl`*: simplest, but a laptop's window misses it.
- **Steps.** *Reviewing, and a run started from review* (chosen): nothing moves when Redact is pressed, and the pictures go at `complete` because they show the original, not the cleaned copy. A rerun from `complete` keeps the one column, so the layout never jumps twice in a few seconds. *Also at `complete`*: the original beside the result card, with a line saying so, which invites a misreading. *Reviewing only*: a layout jump on every Redact, Cancel and refusal.
- **Picking a row.** *Its checkbox taking focus* (chosen): no new control and no new tab stop, and it works for Tab and click alike. Changing the preview on focus is not a change of context (WCAG 3.2.1), since focus stays and nothing outside P moves. *A page button on each row*: explicit, but up to 3,000 more tab stops. *Both*: more controls for little gain.
- **Which rows get a box.** *Rows that can be ticked* (chosen): a box marks exactly the geometry the engine vouches for, since a blocked row is refused because its outline is unsound, slanted or reaches over a picture. *Every row with a place*: needs quads the engine now drops for blocked rows, and draws outlines the engine distrusts. *Ticked rows only*: an unticked find can't be seen.
- **Box look.** *By tick, with the picked row ringed* (chosen): the page shows what a run would remove. *One look for all*: simpler, says less. The mockup's `accent-bright` edge measures under 3:1 on white, so the edges take `accent` and a dashed `border-strong`, both already in the contract.
- **Rail badge.** *Rows listed on the page* (chosen): agrees with the list's page labels. *Ticked rows*: changes as you tick. *Tickable rows*: matches the boxes but not the list.
- **Scan mark.** *A rail mark plus a line by the page* (chosen): a box free scan page can't read as "nothing here", and the line reuses the warning's own words. *Rail mark only*: says it once. *Hatched overlay*: hard to read in forced colours.
- **Zoom steps.** *100% fits the column, 50 to 200%* (chosen): the mockup's single control with no Fit button. *100% as actual size, up to 300%*: a viewer's convention, with larger pictures at the top end.
- **Zoom method.** *Stretch at once, then draw again* (chosen): instant and then sharp, which 3 to 160 ms draws make affordable. *Draw again only*: a visible wait on a big scan. *Stretch only*: soft text from 125%.
- **Draw failure.** *A placeholder and one line, no retry* (chosen): a MuPDF failure is almost always the same next time, and moving away and back asks again. *With Try again*: a control that rarely helps. *Nothing said*: a blank page that may read as an empty page.
- **Page order.** *Last, after the list* (chosen): every existing order, id and test stays, and the place a tick changes comes first. *Before the panel, left to right*: matches the drawing but moves spec 0007 AC-5's order and puts a long rail before the checklist.
- **How boxes cross.** *With each drawn page* (chosen): no geometry crosses when nothing is drawn, and `ReviewMatch` stays free of geometry. *In every row at open*: simplest, but every position crosses on every screen.
- **Rail keys.** *One tab stop with arrow keys* (chosen): a 50 page file adds one tab stop. *Every thumbnail a tab stop*: 50 of them.
- **Proof.** *Extend the network list test* (chosen), with an export spy, the storage check and a lint ban: one walk proves no request, no URL and no store. *A separate spec*: the same checks apart from the list they prove. *Network list only*: misses a picture turned into a URL and never sent.
- **Privacy C3.** *Name the pictures, with a change entry* (chosen): a new kind of document data is better said than implied. *Leave it*: C3's "what RedactNest finds" arguably covers it.
- **Telemetry.** *No new count* (chosen): a failed draw changes neither the review nor the file. *Count draw failures*: a catalog change for a rare event.

### The calls made without a question

- **`bitmaprenderer` over a 2D canvas.** `transferFromImageBitmap` takes the picture's pixels with no copy, so the page holds each picture once, and `null` drops it. The runner up, `drawImage` then `close()`, holds a copy for a moment and needs the 2D context.
- **Draws outside the run queue, and none during a run.** A draw reads only the review copy, so the worker answers it at once, outside the run queue, and a draw during a review search waits at most one page read. The first draft also let P draw during a run, answered between the run's yields. The cross check showed that a run has stretches of seconds with no yield (the write, the self check), and that emptying MuPDF's store mid run throws away pictures the run had decoded, so P now sends no draw while `redacting`: it keeps its pictures, a zoom only stretches, and the wanted draws go out back in `reviewing`. The runner up, drawing during runs with the store left alone, keeps the preview live at the cost of a delayed Cancel and an unbounded store during the run.
- **`emptyStore` after every draw.** It keeps the heap flat, at the price of decoding a picture again when the same page is drawn twice. The runner up, MuPDF's own store limit, lets the heap grow by about the store's size first.
- **A cap of 8 million device pixels, configurable to Safari's 16.7 million.** It covers a fit width page at 200% on a 2x screen at 1024 pixels with room to spare, and holds one picture to about 32 MB. Above it CSS stretches the picture, a little soft.
- **The page area's own scroll, never `scrollIntoView`.** `scrollIntoView` scrolls every scrolling ancestor, the window included, which would move the focused row.
- **No new live region.** The zoom level is a description of its buttons, and the page shown is `aria-current` in the rail, so `/tool` keeps its single polite regions. A page change or a zoom step is silent to a screen reader, a shown limit.

### The cross check (2026-11-26)

An independent read on another model checked the first draft against the code and found gaps the build would have had to guess. Each claim was checked against the code before you ruled, and you chose to apply every recommended fix:
- A grid item 100dvh tall that spans every row would push its height into those rows. P's cell now takes `contain: size`, the grid's last row takes the slack, and the column gap is 0.
- `OpenDocument` keeps its MuPDF document private, so the draw is a method on it, backed by a `drawPageWith` seam.
- The client's three early drops, `retireOtherJobs`, the lost worker path and `releaseEngine` each needed a rule for a draw: close its picture, never cancel it, and settle it as `null`.
- No draw during a run, as above.
- The mark words, a support probe, picking on a tick change (a click does not focus a checkbox in Safari, or in Firefox on macOS), a rows version against a term search racing a draw, and the empty page on a page change.
- The tests as they can be written: the spy cannot reach the worker, Download already makes an object URL, and the speed file needs the trace off.

One finding was wrong and dropped: it took `/tool`'s header to be sticky from `lg`, but only `/`'s header sticks (`src/app/site-nav.tsx`), so P sticking at `top: 0` already clears it.

## Evidence: where the mockups meet the rules

| Mockup | Rule | Resolution |
|---|---|---|
| Text at 9, 10, 11, 12 and 13px (about 75 places across the `.dc.html` files) | spec 0003, INV-6 | all become `text-small` (AC-3) |
| `#a1a1aa` text on white | contrast contract, 4.5:1 | `ink-subtle` or `ink-muted` (AC-1) |
| `#71717a` text on `#f4f4f5` (4.4:1) | contrast contract | `ink-subtle` never on `muted` (AC-1) |
| Shadows in rgba | spec 0003, INV-1 | shadow tokens in `@theme` only (AC-2) |
| A different mark (three lines in a tile) | spec 0013, AC-1 | the nest mark kept, set in the tile (AC-7) |
| "Guides" nav item and breadcrumb link | no index page exists | no Guides item; the breadcrumb is text (AC-5, AC-11) |
| "Stripping hidden data" as a run step | spec 0019, AC-12; spec 0018, AC-5 | "Removing what you ticked" (child 0003, AC-32) |
| Highlight box on a match in the page | spec 0002, INV-2 | deferred on 2026-11-25; built as display only boxes from 2026-11-26, INV-2 widened (child 0002, AC-42, AC-50) |
| Box edge in `#14b8a6` | WCAG 1.4.11 (3:1 for a graphic that carries meaning) | `accent` for a ticked box, dashed `border-strong` for an unticked one (child 0002, AC-42) |
| Zoom pill under the page | P sticks at full window height from below the header, so its lower edge starts under the window's edge | the zoom control in a bar above the page (child 0002, AC-40) |
| Each column scrolls on its own | spec 0013 INV-5 (no wrapper around the areas), AC-12's tested sticky foot | the window scrolls the right column; P sticks beside it (child 0002, AC-38) |
| Network tab list `[real list to confirm]` | a claim with no gate | `NETWORK_ROWS` held by an e2e test (AC-9) |
| Trust strip and questions on home | spec 0013, INV-11 (said once) | left out in the first draft; built in the visual port by your read, each claim held to its named places (AC-8) |
| Network table and copy boxes in monospace | spec 0003, INV-6 (Inter only) | the named `data-mono` places only, held by the fonts test (AC-8, AC-9) |
| Window and Pro card shadows tinted teal | AC-2 (black shadows) | those two only, in the larger shadows list (AC-2) |
| Header sticky with a blur | spec 0003, AC-14 (static header) | `/` from `lg` only, with a top scroll padding and a focus test (AC-5) |
| Hero product shot as a screenshot | spec 0013, AC-12 | drawn in HTML from the tool's own words (AC-8) |
| "in a minute" on the closing heading | claims no wider than the code (a 50 page Pro file can take longer) | "Redact your next PDF" (AC-8) |
| A Pro button on home's plan card | the seller, tax and terms lines stay beside Subscribe on `/pricing` | "Get Pro" opens Pricing (AC-10) |
| No numbered How it works list on the guides | spec 0024, AC-3 (the list in the frame) | removed, the cards stand in; AC-3 amended (AC-11) |
