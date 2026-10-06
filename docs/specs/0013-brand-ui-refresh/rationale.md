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

### Decided after your read of the built pages (task 20)

Your read of the built pages (2026-10-06) found seven things, with screenshots of `/`, `/tool`, sign in, sign up and the privacy policy:

- **Repetition.** "Redact" named the nav item, the header button, the hero button, the footer link and the tool's title. The lockup sat in the header, the sign in panel and the footer. "Your file never leaves your browser" or "in your browser" sat in the eyebrow, the hero lead, the first trio card, the tool rail and the footer line.
- **The finds and strips band** was a white strip of two paragraphs, the one part of `/` that did not look designed.
- **The idle steps** read as three separate lines, not a sequence.
- **Clerk's fields** had no visible edge at rest: Clerk draws them in a shade of `colorBorder`, and `border` against `surface` is about 1.3:1.
- **No feedback after Continue.** Clerk's `setActive` first runs a server action (`invalidateCacheAction`, through `window.__internal_onBeforeSetActive` in `@clerk/nextjs`), then navigates with the Next.js router, then refreshes. `/account` asks Polar live on every render, and Subscribe creates a checkout before it redirects, so the card sat still for that whole time.
- **The legal pages' list** scrolled away with the text, and following a link jumped.
- **Cursors were mixed.** Tailwind v4 leaves a `button` on the browser's default arrow, so `Button` showed the arrow while links showed the hand; only the checklist rows, `Checkbox` and the group `summary` set a pointer themselves, and Clerk's controls followed Clerk's own style.

You chose every word (see the table in `index.md`). These were decided while writing, then checked by an independent read on another model (2026-10-06), whose fixes you chose to apply: the tool page keeps `current="tool"` so its header still hides the button; the cursor selectors are written out and kept from overlapping; the status line has one condition and a named fallback; Clerk's field edge is a real border so forced colours keeps it; and the step line's geometry, the card lists' `role="list"`, the sign in grid and the scoped "Try it free" tests are pinned.

| Decision | Pick | Why | Runner up |
|---|---|---|---|
| Where the status line gets its signal | a client component below Clerk's card, shown once `useAuth()` leaves "loaded and signed out", with `useSignIn()` and `useSignUp()` reaching `complete` as the named fallback if the sandbox finds `useAuth()` changes too late | covers the whole wait after Clerk's own spinner ends, whatever page comes next, with Clerk's public state only | a `loading.tsx` over the account pages (it would stream every account page from its first byte, so Subscribe's `redirect()` calls would land after the shell and become client side redirects) |
| Field edge colour | `border-strong` on `formFieldInput` and `otpCodeFieldInput` | the only edge token above 3:1 on `surface` (WCAG 1.4.11), already a graphic pairing in the contract | darken `variables.colorBorder` (would darken every divider in Clerk's card too) |
| Step line colour | `border-strong`, 2 pixels | visible (above 3:1) and neutral; the steps are instructions, not progress | `accent` (reads as steps already done) |
| How the cursor rule wins | unlayered, `!important`, disjoint pointer and not-allowed sets, `cursor-` utilities banned by lint | one rule beats Clerk's unlayered style whatever its specificity, and nothing can compete with it | a layered base rule plus `CLERK_APPEARANCE.elements` cursors for Clerk (two places to keep in step, which is what you asked to avoid) |
| Smooth scrolling | the root, only while `main[data-smooth-scroll]` is present, only under `prefers-reduced-motion: no-preference` | the legal pages get it, every other page, `/tool`'s focus moves included, scrolls as today, and it is CSS only (spec 0011, INV-7) | `scroll-behavior: smooth` on every page |
| A tall section list | sticky with a capped height and its own scroll, padded for focus rings | the last links stay reachable on a short window | sticky only above a height media query (the list would stop sticking on many laptops) |
| The finds and strips layout | two `Card`s on `canvas` after the trio, each an `IconCircle`, an `h3` and an icon list | the reference's card language on the page's own background, built from existing primitives, with no new colour pairing | keep the white band and put `canvas` cards in it (`Card` is `surface`, so a new card variant) |
| The Subscribe line | "Signing you in, then on to Subscribe" (your pick after the cross check) | always true: Subscribe sends a visitor who already holds Pro, or whose payment is settling, to Account or Welcome | "then on to checkout" (untrue for those visitors) |
| Strips card icon | `FileMinus` | taking something out of a file, and unlike the trio's `Eraser` | `EyeOff` (says hiding, the opposite of removing) |

### Recorded during the build (tasks 26 and 27)

Checked in the Clerk development instance and the Polar sandbox on 2026-10-06, under `pnpm dev` (Clerk 7.9.10 for Next.js, whose interface loads from Clerk's servers), signing in as `walk-one` and signing up as a new throwaway, `walk-0013`, both `+clerk_test` addresses with code 424242.

**Task 26, Clerk's fields (AC-31).**

- Both element names exist, as AC-31 wrote them: `cl-formFieldInput` on the email field (sign in and sign up), and `cl-otpCodeFieldInput` on each code box. Both are also in this Clerk's `ElementsConfig` type.
- Clerk draws its own rest edge as a **box shadow over a 0 pixel border**, so the reset of the shadow AC-31 allowed for is needed, and it is in place.
- Clerk marks an invalid field with **`aria-invalid="true"`** on both elements ("false" otherwise), so the scope stands as written.
- The code boxes are **not inputs**: each `cl-otpCodeFieldInput` is a `div` drawn over one hidden `input`, so `:focus` never matches a box. Clerk marks the box being filled with `data-focus-within="true"` and rings it by that. Scoped to `:not(:focus)`, our edge sat on the focused box and hid Clerk's focus ring there (seen, then fixed), so the code boxes take their own scope, `&:not([data-focus-within="true"]):not([aria-invalid="true"])` (`CODE_BOX_AT_REST` in `clerk-appearance.ts`). The email field keeps `:not(:focus)`.
- Result: at rest and on hover each field and box shows a 1 pixel `border-strong` border and no shadow; focused, Clerk's own 4 pixel ring in `focus`; after a wrong code, Clerk's `danger-ink` edge on every box and "Incorrect code", with our status line still empty.
- The cursor rule (AC-33) reaches Clerk's card: Continue, the edit button and the footer's "Sign up" link show the pointer, Resend shows `not-allowed` while it counts down, and the email field and the code input keep the text cursor.

**Task 27, the signing in line (AC-32).** The signal is `useAuth()`, as AC-32 chose: in both walks it left "loaded and signed out" before the page changed, so the named fallback (`useSignIn()` and `useSignUp()`) was not needed. Times from the last digit of the code (Clerk submits on the sixth digit, so this is the press of Continue), in development mode, which is slower than a production build:

| Walk | Clerk's loading state shows | Clerk's loading state ends | Our line shows | The next page |
|---|---|---|---|---|
| Sign in, to Account | 21 ms | 1,570 ms | 1,924 ms (354 ms after) | `/account` at 3,111 ms |
| Sign up from Subscribe | 19 ms | 606 ms | 1,828 ms (1,222 ms after) | `/account/subscribe` at 4,606 ms, then Polar's sandbox checkout at 5,458 ms |

The sign up from Subscribe ended where Subscribe sends a new free account, Polar's checkout, never on Account by way of the sign up page's own signed in redirect. Each line showed once and stayed until the next page.

Open for your read: between the end of Clerk's loading state and our line there is a gap with no feedback, about 0.35 s on sign in and 1.2 s on sign up, in development mode. AC-32 names the fallback only for the case where `useAuth()` changes after the page does, which it did not, so the build keeps `useAuth()`. Closing the gap would mean showing the line from the sign in's or sign up's own `status` reaching `"complete"`, which likely comes at the end of Clerk's loading state; that is a change to AC-32 for `/architect`. Settled below, in *Decided after slice 6's report*.

### Decided after slice 6's report

Two points from slice 6's report, settled on 2026-10-06 before your read (task 32), each amending one criterion and its checks only.

- **The step line read as a tick.** With the steps 0.75rem apart, the line between two one line steps was 0.25rem long. You asked for at least about 1rem.
- **A silent gap after Clerk's spinner.** Task 27's walks showed nothing for about 0.35 s on sign in and 1.2 s on sign up, in development mode. Clerk's public source (`clerk/javascript`, read on 2026-10-06, so the walk stays the proof) says why: the attempt request's reply updates the sign in resource and fires its signal straight away, while `useAuth()` changes only once `setActive` has run `__internal_onBeforeSetActive` (the cache invalidating server action), touched the session and fetched a token. Before Clerk loads, `@clerk/react` 6.17.5's state proxy reports `needs_identifier` and `missing_requirements`, never `"complete"`, so the new signal cannot fire early.

Checked by an independent read on another model (2026-10-06), whose fixes you chose to apply. The line latches once shown, and a wrong code before a right one leaves it waiting. A failure after `"complete"` is recorded as a known limit in *Consequences*, not given new words. The 100 ms has a method (a scratch script on the page's frame clock in development mode, from Clerk's loading state gone to our line present) and three walks of each flow. The test mocks and AC-15's measurement are pinned.

| Decision | Pick | Why | Runner up |
|---|---|---|---|
| How the steps line grows | the steps 1.5rem apart, the line keeping its 0.25rem clearance at each circle, so 1rem long | a join you can see, with the clearance that keeps the circles distinct; the rail grows by 1.5rem | the steps 1rem apart with the line touching both circles (also about 1rem, but the line and the circles merge into one shape) |
| The signing in line's signal | the first of `signIn.status` or `signUp.status` becoming `"complete"` (the signal hooks `@clerk/nextjs` exports) and `useAuth()` leaving "loaded and signed out", with a 100 ms limit after Clerk's spinner, timed on both walks | the status is set the moment the code is accepted, before `setActive`'s slow steps, and the backstop keeps today's proven signal, so the line is never later than it is now | the legacy hooks in `@clerk/nextjs/legacy` (they read the client's sign in, which Clerk updates in place in the same reply, so likely the same timing; kept as the named fallback rather than adopting the API Clerk now calls legacy) |

### Recorded during the build (tasks 34 and 35)

Checked on 2026-10-06 under `pnpm dev` (Clerk 7.9.10 for Next.js; Clerk's servers loaded clerk-js 6.38.0), with a scratch script on the page's frame clock: each frame it read Clerk's spinner in the card, our line, the sign in and sign up signals (`Clerk.__internal_state`, what `useSignIn()` and `useSignUp()` return), and the session (what `useAuth()` follows). Times run from the keydown of the sixth digit, which submits the code. Signing in as `walk-one`; signing up as new throwaways `walk-0013b`, `walk-0013c` and `walk-0013d` from Subscribe, and `walk-0013e` with no landing, all `+clerk_test` with code 424242.

**Task 34, the steps line (AC-15).** On `/tool` at idle, 1280 pixels: each line is 16 pixels long (its `::after` height), starts 4 pixels below one circle and stops 4 pixels above the next, and the steps sit 24 pixels apart. The browser check now holds at least 16 pixels in all three runs (default text, forced colours, 200% text at 320 pixels).

**Task 35, the signing in line (AC-32).**

| Walk | Clerk's spinner | Status `"complete"` | Our line shows | Line blank again | Session moves (`useAuth()`) | Next page |
|---|---|---|---|---|---|---|
| Sign in to Account, 1 | 29 to 1,429 ms | 562 ms | 562 ms (867 ms before the spinner ends) | never | 1,812 ms | `/account` at 2,312 ms |
| Sign in to Account, 2 | 29 to 1,462 ms | 579 ms | 579 ms (883 ms before) | never | 1,795 ms | `/account` at 2,362 ms |
| Sign in to Account, 3 | 31 to 1,414 ms | 547 ms | 547 ms (867 ms before) | never | 1,847 ms | `/account` at 2,331 ms |
| Sign up from Subscribe, 1 | 32 to 615 ms | 615 ms | 615 ms (the same frame) | 1,498 ms | 1,899 ms | `/account/subscribe` at 4,665 ms, Polar's checkout at 5,591 ms |
| Sign up from Subscribe, 2 | 32 to 632 ms | 632 ms | 632 ms (the same frame) | 1,516 ms | 1,932 ms | `/account/subscribe` at 4,198 ms, Polar's checkout at 5,386 ms |
| Sign up from Subscribe, 3 | 30 to 630 ms | 630 ms | 630 ms (the same frame) | 1,497 ms | 1,880 ms | `/account/subscribe` at 4,047 ms, Polar's checkout at 4,702 ms |

Also walked once each, outside the six: a sign in from Subscribe (`walk-one` holds Pro, so it ended on `/account?notice=already-pro`), whose line showed at 565 ms and stayed; a sign up with no landing, whose line showed at 548 ms, the frame the spinner ended, and stayed until `/account`; and a wrong code then a right one on sign in: after "111111" the line stayed empty, Clerk showed "Incorrect code" with `aria-invalid="true"` on every box and the status stayed `needs_first_factor`, and the right code then showed the line at 595 ms, before the spinner ended at 1,479 ms.

- **The status signal fired first in every walk**, 1.2 to 1.3 s before the session moved, and our line showed in the same frame as it. The 100 ms limit holds on all six timed walks: the line never came after the spinner ended.
- **The legacy hooks would not help.** In every walk `Clerk.client.signIn.status` and `Clerk.client.signUp.status`, what the legacy hooks read, went straight from the pending status to `null` in the frame the signal reported `"complete"`, and never showed `"complete"` in any frame.
- **The network log** held only Clerk's flow and the page loads: Clerk's attempt request, the server action Clerk posts to the page, Clerk's session touch, the landing's fetches, and in development Clerk's catch all route check. Nothing went to Clerk's telemetry, and the line made no request.
- Each sign up from Subscribe ended where Subscribe sends a new free account, Polar's sandbox checkout.

**Open, for `/architect`: the line goes blank on a sign up from Subscribe.** On all three, the line showed on time and then the status region became a new element about 0.9 s later, with the address unchanged: Next.js's router committed a new tree for the same address (a `replaceState` from its own commit effect) about 6 ms after Clerk's session touch returned. The server action Clerk posts returned 200, so it is not a redirect from our page. It happens only on the sign up page with `redirect_url` in the address: there the action is posted to `/sign-up/verify-email-address?redirect_url=…` and the page is rebuilt in place, while with no query it is posted to `/sign-up`, the router pushes `/sign-up`, and the element survives. Sign in keeps its element with or without the query.

The new element starts over at "loading" and first sees Clerk loaded, signed out, and the sign up already `"complete"` (the signal keeps reporting it until the session is set). AC-32 arms the line only after seeing signed out with neither status complete, so the new element never arms, and the backstop cannot fire either. The line stays blank from about 1.5 s until the next page, 2.5 to 3.2 s in development mode. Before this amendment the remounted line armed again on `useAuth()` alone and showed at about 1.8 s (task 27's 1,828 ms), a 1.2 s gap; so the amendment closes the gap after the spinner but opens a longer one after the remount. Ways out seen during the walk, for `/architect` to weigh: let a line that mounts with Clerk already loaded arm on `"complete"` too (a page load always starts with Clerk loading, so only a mount partway through a flow sees it loaded); hold the latch above the page, in the account group's layout, which a rebuild of the page keeps; or stop the rebuild itself, if Clerk or Next.js offer a way. Task 35's code is built to AC-32 as written and its component test passes; it is not committed. Settled below, in *Decided after task 35's walks*.

### Decided after task 35's walks

Settled on 2026-10-06, wording only, no new design. You chose to remove AC-32 rather than take any of the ways out above: no status line below Clerk's card, so neither "Signing you in" nor "then on to Subscribe". After Continue, Clerk's own spinner on its button is the only feedback until the page changes (AC-23). Task 35's uncommitted code was not kept, and new task 36 deletes task 27's committed line (`signing-in.tsx`), its component test and the landing test's case for it. AC-31's field edges and task 34's step line stay. You chose to skip the cross check for this amendment.

The cost is the gap your read of task 20 first found: once Clerk's spinner stops, the card sits still until the next page. Task 35's walks put that at about 0.9 s on sign in and 3.4 to 4.1 s on a sign up from Subscribe, in development mode (recorded in `index.md`, *Consequences*).

| Decision | Pick | Why | Runner up |
|---|---|---|---|
| The wait after Continue | Clerk's own spinner only, nothing of ours below the card (your pick) | nothing on our page depends on when Clerk changes its state or on Next.js keeping the page's elements, so the blank line after a remount and the line outlasting a failed `setActive` both stop being possible | keep AC-32 and let a line that mounts with Clerk already loaded arm on `"complete"` too (the first way out task 35 saw; it closes the remount gap but keeps a client component tied to Clerk's timing) |

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
- `@clerk/nextjs` 7.9.10, `dist/esm/app-router/client/ClerkProvider.js` (what runs between a finished sign in and the next page: the cache invalidating server action, the router push, the refresh)
- `@clerk/react` 6.17.5 (under `@clerk/nextjs` 7.9.10): `dist/hooks-*.mjs` (`useSignIn()` and `useSignUp()` are signal hooks) and `dist/ClerkProvider-*.mjs` (the state proxy's statuses before Clerk loads); Clerk's `clerk/javascript` repository, `packages/clerk-js` (`Base.ts`, `Client.ts`, `SignIn.ts`, `clerk.ts`: when the sign in signal and `setActive`'s steps run), read 2026-10-06 (AC-32, after slice 6)
- `src/app/(account)/sign-out.tsx` (the spinner and status line pattern the signing in line follows), `tests/unit/engine-wall.test.ts` (where every zone's class patterns are proved)

**Practices and standards**:
- WCAG 2.2: 1.3.2 meaningful sequence and 2.4.3 focus order (the rail first), 1.4.1 use of colour (nav items), 1.4.10 reflow, 2.4.11 focus not obscured (the sticky panel and the sticky section list), 1.4.11 non text contrast (Clerk's field edges, the step line), 4.1.3 status messages (the signing in line)
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
