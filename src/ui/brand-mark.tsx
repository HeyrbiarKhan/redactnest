import { cx } from "@/lib/cx";

/**
 * The mark's three shapes on a 64 unit grid: the redaction bar, then the
 * nest's outer and inner bands, each a filled outline. Spec 0013, AC-1.
 *
 * The same paths as `src/app/icon.svg`, which `tests/unit/brand-files.test.ts`
 * holds equal, so the favicon and the mark on the page cannot drift apart. At
 * 16 pixels the bar is 2.75 pixels tall and each band 1.5 pixels wide, with a
 * pixel of space between every shape, so it still reads in a browser tab.
 */
export const MARK_PATHS: readonly string[] = Object.freeze([
  "M22.5 13H41.5A5.5 5.5 0 0 1 41.5 24H22.5A5.5 5.5 0 0 1 22.5 13Z",
  "M4.642 36.453A33 33 0 0 0 59.358 36.453A3 3 0 0 0 54.384 33.098A27 27 0 0 1 9.616 33.098A3 3 0 0 0 4.642 36.453Z",
  "M12.932 30.861A23 23 0 0 0 51.068 30.861A3 3 0 0 0 46.094 27.506A17 17 0 0 1 17.906 27.506A3 3 0 0 0 12.932 30.861Z",
]);

/**
 * The mark alone, drawn inline in the colour of the text around it.
 *
 * `currentColor` rather than a fill of its own, so the caller picks the colour
 * with a token (`text-accent`) and forced colours mode repaints it in the
 * system's text colour, where a fixed fill would vanish (AC-26). Always
 * hidden from assistive technology: wherever it appears, the name RedactNest
 * is written beside it or carried by the link around it.
 */
export function BrandMark({
  size,
  className,
}: {
  /** A length for both sides, such as `1.4em`, so it can scale with the text. */
  readonly size: string;
  /** Layout only. */
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0", className)}
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export type LockupSize = "md" | "lg";

/**
 * The header and footer use `md`. `lg` is a larger stage for a page that
 * wants one; since the sign in panel dropped its lockup (spec 0013, AC-23),
 * no page does.
 */
const LOCKUP_SIZE: Readonly<Record<LockupSize, string>> = Object.freeze({
  md: "text-heading",
  lg: "text-title",
});

/**
 * The mark and the wordmark together. Spec 0013, AC-2.
 *
 * The wordmark is live text in Inter 700 with tight tracking, never an image,
 * so it scales with the visitor's font size and is read as the word it is.
 * The mark is sized in `em` from the same text, about 1.25 times its cap
 * height, so the two stay in proportion at every size and zoom.
 */
export function BrandLockup({ size = "md" }: { readonly size?: LockupSize }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[0.3em] font-bold tracking-[-0.02em] text-ink",
        LOCKUP_SIZE[size],
      )}
    >
      <span className="text-accent">
        <BrandMark size="1.4em" className="block" />
      </span>
      RedactNest
    </span>
  );
}
