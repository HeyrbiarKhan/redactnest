import { cx } from "@/lib/cx";

export type SpinnerSize = "sm" | "md";
export type SpinnerTone = "accent" | "current";

const SIZE: Readonly<Record<SpinnerSize, string>> = Object.freeze({
  sm: "size-4",
  md: "size-5",
});

/**
 * A turning arc. Hidden from assistive technology, because the text beside it
 * says what is happening and a spinner on its own says nothing.
 *
 * It stops turning when the visitor asks for reduced motion (AC-16). The text
 * next to it still says the work is under way.
 *
 * `current` is the arc alone, in the text colour of whatever holds it, for a
 * spinner inside a busy button (spec 0013, AC-34): white on the red, teal on
 * Sign out's white. A track would need a paler shade of each, and a colour
 * made from opacity is banned (spec 0003, INV-3), so it has none.
 */
export function Spinner({
  size = "md",
  tone = "accent",
}: {
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      data-testid="spinner"
      className={cx("shrink-0 animate-spin motion-reduce:animate-none", SIZE[size])}
    >
      {tone === "accent" && (
        <circle cx="12" cy="12" r="9" strokeWidth="3" className="stroke-accent-soft" />
      )}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        strokeWidth="3"
        strokeLinecap="round"
        className={tone === "accent" ? "stroke-accent" : "stroke-current"}
      />
    </svg>
  );
}
