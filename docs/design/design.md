---
name: redactnest-calm-teal
source: image
references: "docs/design/references/01-tool-review.png, 02-upload-empty.png, 03-warnings.png, 04-landing-hero.png (visual style, and since spec 0013 layout and composition too; their logos, navigation items, copy and claims are not used)"
character: "Calm, careful and plain spoken. A warm off white page, white cards with quiet edges, one soft teal accent and Inter for every word. It should feel like a trustworthy tool a small business hands its most sensitive files to, never like a marketing page."
tokens: "real values live in src/app/globals.css (@theme); read them there, never duplicated here. The decision and the full token table are spec 0003."
contrast: "checked by tests/unit/contrast.test.ts on every run: body ink 14.97:1 on canvas, muted ink 5.91:1, white on accent 5.09:1, focus ring 7.96:1 on canvas. Light only."
---

**Updated**: 2026-10-06, from spec [0013](../0013-brand-ui-refresh/index.md): the references give layout and composition as well as visual style; the composition patterns describe the shell, the three area tool grid with its rail, and the landing hero; header nav items are the one link not underlined at rest; and the `frontend-design` skill yields to spec 0013 and spec 0003 wherever they pin a choice.

## Build mandate

You are a senior product designer shipping a real product surface, at the bar in the `/develop` UI guide: brand, real product copy, a considered layout, every state (empty, loading, error), and a footer. This product's version of complete is calm and uncluttered rather than busy. Every element earns its place, and nothing is added that the governing spec did not ask for. Compose from the primitives in `src/ui/`; a page that needs a piece they do not have adds it there, with its tests, rather than inline.

## Character & direction

- **Warm, not clinical.** The page is the warm off white `canvas`; content sits on white `surface` cards with a 1px `border` and the lightest shadow. Depth comes from edges, not from heavy shadows.
- **One accent, used sparingly.** Teal marks the primary action, a checked box, the drag over state, line icons and the highlighted match. It is never decoration and never a background for a whole section.
- **Honest type.** Inter only, one clear hierarchy: a bold display line on the home page, a semibold title on the tool, 16px body, 14px secondary text and nothing smaller.
- **Tone carries more than colour.** Every warning, note and error has its own icon shape and a hidden tone word; a highlighted match is also semibold; links are always underlined, except the header's nav items, which sit in a labelled row and mark the current page with `aria-current`, semibold text and a 2px accent bar (spec 0013, AC-7).

## Composition patterns

- **Shell.** Every page: skip link, a static white header (the lockup home on the left, then the Site nav, Account and one action at the right, wrapping below the lockup on a phone), `<main id="main">`, then the footer: a brand column and the Product and Legal groups, ending with the AGPL notice. The header never sticks. Spec 0013, AC-7 and AC-8.
- **Tool page.** `PageContainer wide`, the title, then one grid of three areas that keep their order in every step: A, the document (the full drop zone and terms line, or the file bar); B, the rail (the polite region, the plan card, the refusal or lost callout, then the action panel with the lock line, sticky from `lg`; or at idle the steps and the lock line); C, the found items in one card. From `lg` A sits beside B while nothing is open, then across the top with C left of B; on a phone it reads A, B, C. Spec 0013, AC-14 to AC-19.
- **Home page.** `PageContainer wide`, reference 04's hero: the eyebrow, the display headline, the lead, two large buttons and the cap line on the left, the real product shot (the one larger shadow on the site) on the right from `lg`; the feature trio; then one quiet band on `surface` saying what RedactNest finds and strips. Spec 0013, AC-10 to AC-13. Feature 15's search pages reuse the shell and `FeatureList`.
- **Other pages.** Pricing's two plan cards with Pro's accent edge; sign in's panel beside Clerk's card; the legal pages' On this page list beside a 44rem text column from `lg`. Spec 0013, AC-22 to AC-25.
- **Review (feature 8).** A card of `ChecklistGroup`s, each a `details` with rows of `ChecklistItem`. A "select all" for a group goes in the card header or as its first row, never in the summary.

## Component & usage rules (do's and don'ts)

- Do use a token for every colour. Don't use Tailwind's default palette (it is wiped), an arbitrary colour (`bg-[#…]`), or an alpha modifier (`text-ink/70`); lint rejects all three. A quieter text colour is `ink-muted`.
- Do add a new foreground and background pairing to spec 0003's contract and to `tests/unit/contrast.test.ts` in the same change that introduces it.
- Do use `Button` for anything that acts or navigates like a button: `primary` for the one main action in view, `secondary` beside it, `link` for inline actions. Heights are minimums (40px `md`, 48px `lg`), never fixed.
- Don't use `next/link` to enter or leave `/tool`. Leaving has to be a real page load so `pagehide` ends the session (spec 0002, INV-6), and entering should be one so the tool runs under its own strict content security policy.
- Radius: `rounded-lg` on controls, `rounded-xl` on cards, callouts and the drop zone, `rounded-full` on badges and icon circles, `rounded-md` on the checkbox. Card padding `p-5`, column gaps `gap-6`.
- Icons come from `lucide-react`, imported by name, 20px with a 1.75 stroke, and hidden from assistive technology unless they are the only label.
- Document derived text reaches a primitive only as a prop and renders only as React text. Never `dangerouslySetInnerHTML`, never `document.title`, never the URL.
- The `frontend-design` skill guides any axis these rules and the specs leave free. Where spec 0013 or spec 0003 pins a choice (Inter alone, the warm `canvas`, the one teal, rounded cards, the eyebrow), the spec wins.

## Responsive & accessibility direction

- WCAG 2.2 AA on the core path, proved in `tests/e2e/design-system.spec.ts`: axe, the keyboard walk, 320px reflow, 200% text, reduced motion and forced colours.
- Focus is a 2px `focus` outline with a 2px offset on every control, from the base `:focus-visible` rule. Only `main`, as the skip link's target, drops it.
- Every target is at least 24 by 24; in a checklist row the whole row is the checkbox's label and target.
- Motion is limited to 150ms colour transitions and the spinner, and both stop under `prefers-reduced-motion`.
- In forced colours mode, filled controls keep a transparent border so the system paints an edge, the checkbox returns to the native control, and the highlighted match uses the system `Highlight` pair.
- No text size in viewport units, and no fixed height on anything that holds text.
