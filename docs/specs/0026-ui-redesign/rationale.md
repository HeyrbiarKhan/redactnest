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

**Pages, thumbnails and boxes**, **pages without boxes**, **a page list only**, and **defer** (chosen). Deferring keeps INV-2 whole in this feature and gives the widening its own spec. Cons: `/tool` does not match the mockup's left two columns yet. The other three are recorded in [0002-page-preview-deferred.md](0002-page-preview-deferred.md) with the owner's leanings.

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
| Highlight box on a match in the page | spec 0002, INV-2 | deferred (child 0002) |
| Network tab list `[real list to confirm]` | a claim with no gate | `NETWORK_ROWS` held by an e2e test (AC-9) |
| Trust strip and questions on home | spec 0013, INV-11 (said once) | left out (AC-8) |
