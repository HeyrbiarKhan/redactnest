import { cx } from "@/lib/cx";

/**
 * The line joining one step to the next (spec 0013, AC-15), drawn on every
 * step but the last.
 *
 * The circles are 1.75rem and the steps sit 1.5rem apart (`GAP`), so a line
 * centred under a circle (`0.875rem`, less half its 2 pixels) that starts at
 * `2rem` and reaches `1.25rem` past the step's foot begins 0.25rem below one
 * circle and stops 0.25rem above the next: 1rem long between two one line
 * steps, a join rather than a tick. The line's `bottom` is the gap less
 * 0.25rem, so the two change together. It runs from the step's own box, so a
 * step whose words wrap at 200% text stretches it.
 *
 * A left border, never a background, so forced colours mode repaints it in
 * the system's text colour rather than dropping it. `border-strong` clears 3:1
 * on `canvas` and `surface`, a graphic pairing already in the contract; grey
 * rather than teal, because the steps are instructions, not progress, and a
 * teal line would read as steps already done.
 */
const LINE = cx(
  "not-last:after:absolute not-last:after:left-[calc(0.875rem_-_1px)]",
  "not-last:after:top-8 not-last:after:-bottom-5",
  "not-last:after:border-l-2 not-last:after:border-border-strong",
);

/** The space between steps, 1.5rem: the line's `bottom` above is this less 0.25rem. */
const GAP = "gap-6";

/**
 * A short sequence, each step numbered in a small circle and joined to the
 * next by a line. Spec 0013, AC-15.
 *
 * A real `ol`, so a screen reader hears the count and each step's place from
 * the list itself. The drawn numbers and the line repeat that, so they are
 * hidden from assistive technology rather than read twice (the line is a
 * pseudo element, which has no text to read). `accent-strong` digits on an
 * `accent-soft` circle, a pairing already in the contrast contract (5.66:1);
 * in forced colours the fill drops and the digits stay, as plain text.
 */
export function StepList({ steps }: { readonly steps: readonly string[] }) {
  return (
    <ol className={cx("flex flex-col", GAP)}>
      {steps.map((step, index) => (
        <li key={step} className={cx("relative flex items-start gap-3 text-ink", LINE)}>
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-small font-semibold text-accent-strong"
          >
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}
