# src/ui

The design system primitives: twenty two small React components, each a thin layer over a native HTML element. The decision is [spec 0003](../../docs/specs/0003-design-system-ui-foundation/index.md), and the art direction is [`docs/design/design.md`](../../docs/design/design.md). A page that needs a piece these do not have adds it here, with its tests, rather than inline.

## Files

- One primitive per file, a named export, the file named in kebab case (`checklist-item.tsx` exports `ChecklistItem`).
- Class names are joined with `cx` from `src/lib/cx.ts`. The path into the tool is `TOOL_PATH` from `src/lib/routes.ts`.

## Conventions

- Render the native element: `button`, `a`, `input`, `details`, `section`, `mark`. No `div` plays a button, and no ARIA role repeats what the element already is. Spec 0003, INV-4.
- Server components by default. Only a primitive that holds state or a ref is a client component (today `Checkbox`, `ChecklistItem`, `ChecklistSelectAll` and `DropZone`).
- Each class list is a frozen `Record` keyed by variant or size, joined with `cx`. There is no class merging library, because a primitive's `className` is for layout only (margins, alignment, placement), never colour or size, so nothing needs resolving.
- Focus is always visible: never remove the outline without replacing it with a 2px outline at a 2px offset, and never rely on a box shadow alone, because forced colours mode drops it. Spec 0003, INV-5.
- On a focusable element, transition only the fill and the edge (`transition-[background-color,border-color]`), never `transition-colors`. That also fades `outline-color`, so the focus ring would arrive in the text colour. Every transition is 150ms with `motion-reduce:transition-none`.
- A disabled control takes the disabled button's look: the `subtle` fill, a `border` edge and `ink-muted` ink, with its accent styles behind `enabled:` (`enabled:checked:bg-accent`), so a disabled one never looks like it still acts. Use the native `disabled` attribute, which keeps it out of the tab order. Spec 0005 disables a blocked checklist row, and every row while a run is under way.
- Heights are minimums (`min-h-10`), never fixed, and no container that holds text has a fixed height, so a visitor's text spacing override grows the box instead of clipping it. Every interactive target is at least 24 by 24 CSS pixels.
- Icons are `lucide-react`, imported by name, `size-5` with `strokeWidth={1.75}`, and `aria-hidden="true"` unless the icon is the only label.
- Nothing is told apart by colour alone: a callout has its own icon shape and a hidden tone word, links are always underlined (header nav items aside, which the nav row, a bar, weight and `aria-current` mark instead, as spec 0013 narrows INV-8), and a highlighted match is also semibold. Spec 0003, INV-8.
- No primitive sets a cursor. One rule in `src/app/globals.css` does, `not-allowed` on a disabled control and a blocked row's label included, and lint rejects a `cursor-` utility. Spec 0013, AC-33, INV-10.
- A list drawn without markers keeps `role="list"` on its `ul` or `ol` (`StepList`, `FeatureList`, `LinkGroup`), because Safari drops a list's semantics once its markers are removed.
- `StepList` joins its steps with a line drawn as a pseudo element's left border, never a background, so forced colours keep it. Its `bottom` is the gap between steps less 0.25rem, so change the two together. Spec 0013, AC-15.
- `Button`'s `danger` and `danger-secondary` are for destroying an account and nothing else (spec 0013, INV-12). Its `busy` state is `aria-disabled`, never `disabled`, so focus stays on the pressed button: it shows the spinner in the icon's place, keeps its rest colours and drops every press before `onClick`, and the caller passes the working words as `children`. Spec 0013, AC-34, INV-13.
- `Spinner`'s `current` tone is the arc alone in the text colour around it, for a busy button. `IconCircle`'s `sm` size keeps the 20 pixel icon, and its `square` shape is the home page cards' tile. `Card`'s `spacious` form (28 pixels in, 24 between parts) is kept for those two cards; every other card keeps 20 and 16. Spec 0013, AC-11, AC-34.
- `BrandMark` draws `MARK_PATHS`, which `tests/unit/brand-files.test.ts` holds equal to `src/app/icon.svg`. Always in `currentColor` and hidden from assistive technology, because the name RedactNest sits beside it. Spec 0013, AC-1.
- A primitive sets no live region role of its own. The caller passes `role="alert"` when a callout appears because of something the visitor did.
- Document derived text reaches a primitive only as a prop and renders only as React text children. It never goes into `document.title` or the URL, because the browser writes both to history. Spec 0003, INV-7.
- `Button` with `href` renders `next/link`; add `reload` for a plain `a` whenever the link enters `/tool`. The `SiteHeader` lockup is a plain `a` for the way out, because only a real page load fires `pagehide`, which ends the session (spec 0002, INV-6).
- `DropZone` owns the file input, so it carries a privacy rule from spec 0002, AC-2: it clears `input.value` after every choice. It also keeps the test ids `drop-area`, `file-input` and `choose-file`, and the input stays `tabIndex={-1}` and `aria-hidden`, so the button is the only tab stop.
- `DropZone`'s `compact` form is the file bar (test id `file-bar`) shown once a document is chosen. It keeps the same input, the same cleared value and the `choose-file` button, and still takes a dropped file; the caller's `action` (Start over) sits beside the button. Spec 0007, AC-3.
- A primitive a page may move focus to takes a ref for that target (`Button`'s `ref`, `Card`'s `headingRef`, `Callout`'s `titleRef`, `DropZone`'s `buttonRef`). A heading gets `tabIndex={-1}` only when its ref is passed, so it takes focus without joining the tab order. Spec 0007, *Focus*.

## Tests

- Component tests live in `tests/component/ui/`, one file per primitive or family, and each one calls `expectNoAxeViolations(container)` from `tests/setup/component.ts`.
- The real browser proof is `tests/e2e/design-system.spec.ts`: axe, the keyboard walk, 320px reflow, 200% text, reduced motion and forced colours.
- A layout check never probes a window within 20 pixels of a threshold, because headless Chromium hides the scrollbar a person's browser draws, and that width moves every switch. Spec 0013, AC-11.
- The zone's lint rules are proved in `tests/unit/engine-wall.test.ts`, and every colour pairing in `tests/unit/contrast.test.ts`.

_Drafted by /sync from the introducing change, worth a quick human pass._
