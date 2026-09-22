/**
 * The first focusable thing on every page (AC-14). Hidden until a keyboard
 * reaches it, then shown in the primary button's colours, and it moves focus
 * past the header to `<main id="main" tabIndex={-1}>`.
 *
 * Every visible style sits behind `focus:`, so while it is hidden it has no box
 * at all rather than a clipped one with padding.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:inline-flex focus:min-h-10 focus:items-center focus:rounded-lg focus:border focus:border-transparent focus:bg-accent focus:px-4 focus:py-2 focus:text-small focus:font-medium focus:text-on-accent"
    >
      Skip to main content
    </a>
  );
}
