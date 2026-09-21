# 0003. Design system and UI foundation: rationale

The decision record for [index.md](index.md): the reasoning, the options weighed, and the evidence behind the colour values. A build does not need this file.

## Context

> ⚠️ Premise note: this feature builds the checklist row, the collapsible group and the count badge before feature 6 has decided its detector kinds and before feature 8 has decided the review flow. Primitives built ahead of their first real use tend to encode a guess about that use, and the guess then constrains the feature that should have made it. The mitigation is in the design rather than the timing: the primitives take plain strings and numbers, hold no flow logic, decide nothing about which matches start ticked or how groups are ordered, and leave the one flow decision they could have made (select all) to feature 8. The summary panel was deferred for exactly this reason, because its contents depend on what feature 5 reports.

The tool page today is a scaffold. Its controls are styled with `border-current/40` and its secondary text with `opacity-80`, the font is whatever the scaffold shipped, and the only design direction is four screenshots produced by an image tool. Features 6, 7 and 8 are about to put a checklist, warnings and a download step on that page, and feature 15 a landing page beside it. Without a shared vocabulary each of them invents its own card, its own warning colour and its own checkbox, and the product ends up with four slightly different teals, none of them checked for contrast.

WCAG 2.2 AA on the core path is a product commitment, not an aspiration. The buyers feature 16 is written for (HR, legal, healthcare) often have accessibility procurement requirements, and the people doing the redacting include keyboard only and screen reader users. The commitment has to be something a test proves, because a design system checked only by eye drifts out of compliance one reasonable looking colour at a time.

The platform narrows the choices sharply. The tool route's content security policy allows fonts, images and connections from our own origin only, so no web font CDN, no icon CDN and no remote image. Spec 0002 bans every form of browser storage, so no interface preference can be remembered between visits. The code style is functional with named exports only, and `src/` is organised by capability. The repository is public under AGPL, so every dependency's licence has to be compatible. And the scope row asks for this to stay thin enough not to eat the first week.

The reference colours are a direction, not a specification. The primary teal in the screenshots puts white text right at the 4.5:1 edge, the muted greys vary between images, and the warning amber's icon sits below 3:1 against its own card. Sampling them directly would ship failures.

## Options considered

### Option 1: Semantic tokens in Tailwind's theme, plus thin React primitives over native HTML

Colour roles in `@theme` with the default palette wiped, a contrast test over every pairing, and about a dozen small components in `src/ui/` rendering native elements, with no headless library and no class merging library.

**Pros**:
- Native elements carry keyboard, focus and screen reader behaviour, so there is very little accessibility code to own.
- Every colour is a tested token, and nothing else can generate.
- Three small packages, nothing third party at runtime, most primitives server components.

**Cons**:
- We write and maintain every primitive ourselves, small as they are.
- Native `details` and a restyled checkbox limit what feature 8 can do without a new decision (no interactive group headings, no animated collapse).

### Option 2: shadcn/ui components copied in, themed to our tokens

Copy the generated components (built on Radix primitives, `class-variance-authority`, `tailwind-merge` and `clsx`) into the repo and point their CSS variables at our roles.

**Pros**:
- A large, familiar set of ready made components with known accessibility behaviour.
- Copied source, so it can be edited freely.

**Cons**:
- Brings Radix, `cva`, `tailwind-merge` and `clsx` for two interactive widgets native HTML already covers.
- Its generated code assumes its own token names and a dark theme, so most of each file gets rewritten anyway.
- The class merging it relies on invites one off restyling of primitives, which is the drift this feature exists to prevent.

### Option 3: React Aria Components with our own styling

Adobe's accessibility focused component library for behaviour, styled with our tokens.

**Pros**:
- The most rigorous accessibility behaviour available, including for complex widgets.
- Consistent keyboard handling across browsers.

**Cons**:
- Its strength is widgets this product does not have (comboboxes, date pickers, grids). For a checkbox and a disclosure it adds a large dependency and an API to learn.
- Its components are client components, which pushes JavaScript onto pages that need none.

### Option 4: Tokens only, no primitive layer

Define the tokens and let each page style native elements directly with utility classes.

**Pros**:
- Nothing to build beyond the theme. The fastest start.
- No abstraction to learn.

**Cons**:
- Every feature derives the accessible structure again (icon hidden, count with its noun, label association, tone word), and the one that forgets it ships a failure.
- Button and card styles drift across pages within a few features.

## Rationale

Option 1, because the constraint that matters most is that AA has to be provable and stay proved, and the cheapest way to hold it is to own very little accessibility behaviour. Native elements already carry it. What they lack (the tone word on a callout, the noun on a count, the description on a checklist row, one tab stop on the file picker) is small and specific, and putting each of those in exactly one primitive means one test proves it for every page. Option 4 fails on exactly that point, and Options 2 and 3 solve a harder problem than this product has, at the cost of dependencies and client JavaScript on a route whose CSP and privacy claim reward having less.

Wiping the palette and linting arbitrary values turns "only tested colours" from a convention into a property of the build. That matters more here than in most products, because the repository is public and the core path is where an accessibility regression costs a sale.

Light only is the thin choice the scope row asks for, and it loses less than it seems. The references are light, a toggle could not remember its setting under spec 0002's storage ban, and semantic roles mean dark mode later is a second block of values rather than a rewrite of components.

**Calls made while writing, each with its runner up**:

- **The drop zone owns the file input and its button.** One tab stop (AC-8) becomes structural rather than something every caller has to remember. Runner up: a presentational drop zone with the input left in `tool-client.tsx`, which keeps spec 0002's `value` clearing next to the session code, but lets feature 8 or 15 rebuild the two tab stop problem.
- **The checkbox is a native input with `appearance-none` and a sibling tick icon, falling back to `appearance: auto` in forced colours.** This keeps native semantics and reaches the filled, rounded look of the references. Runner up: `accent-color` on an unstyled checkbox, which needs no CSS but renders small and differently in each browser, and cannot match the references.
- **The compact count badge keeps its noun in an `sr-only` span.** Runner up: `aria-label` on the `span`, which some screen readers ignore on an element with no role.
- **The context ellipsis appears whenever `before` or `after` is not empty.** Runner up: exact detection of a cut window, which needs `config.matchContextChars`, a value `src/ui` must not import, and would add two props for a cosmetic cue.
- **Display type is rem only, with one step at `md`.** Runner up: `clamp()` with viewport units, which scales more smoothly but does not respond to the visitor's own text size setting (the failure WCAG documents as F94).
- **`text-xs` is removed from the theme.** It is the only default size under the 14px floor the engineer set, so removing it enforces the floor instead of asking people to remember it. Runner up: the floor as a written rule only.
- **Tokens are hex.** Runner up: `oklch()`, Tailwind v4's own default notation and perceptually nicer to adjust, but the contrast test would need a colour space conversion to read it.
- **Container widths are theme tokens (`max-w-narrow`, `max-w-wide`)**, not arbitrary values in class names. Runner up: `max-w-[44rem]` inline, which works but scatters a layout decision across files.
- **Each page renders its own header. The layout renders the skip link and the footer.** The two pages need different header actions. Runner up: route groups with two layouts, which is more structure than two pages justify.
- **A callout takes its live region role from the caller.** Runner up: `role="alert"` built into the `danger` tone, which would announce a static error on page load and nest a second live region inside the existing polite status region, so some screen readers announce it twice.

## Contrast measurements

Measured with the WCAG 2.x relative luminance formula, the same one `tests/unit/contrast.test.ts` uses. The contract pairs are in [index.md](index.md). These are the extra measurements that shaped a rule rather than a value:

| Pair | Ratio | What it decided |
|---|---|---|
| `focus` touching `accent` | 1.68 | The 2px outline offset is mandatory, so the ring always sits against the page background (7.96 or more) |
| Reference primary teal, white text | about 4.6 | Too close to the edge to survive a small adjustment, so `accent` was darkened to `#1F7A7A` (5.09) |
| `border-strong` on `subtle` | 3.30 | Passes, so a control can sit on a `subtle` row hover without losing its edge |
| `accent` on `subtle` | 4.43 | Line icons stay visible on a `subtle` surface |
| `accent` on `accent-soft` | 4.18 | The icon inside its soft circle and the drag over edge on its fill both clear 3:1 |
