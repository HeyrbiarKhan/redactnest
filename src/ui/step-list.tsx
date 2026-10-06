/**
 * A short sequence, each step numbered in a small circle. Spec 0013, AC-15.
 *
 * A real `ol`, so a screen reader hears the count and each step's place from
 * the list itself. The drawn numbers repeat that, so they are hidden from
 * assistive technology rather than read twice. `accent-strong` digits on an
 * `accent-soft` circle, a pairing already in the contrast contract (5.66:1);
 * in forced colours the fill drops and the digits stay, as plain text.
 */
export function StepList({ steps }: { readonly steps: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step} className="flex items-start gap-3 text-ink">
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
