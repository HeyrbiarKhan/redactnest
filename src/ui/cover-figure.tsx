import { cx } from "@/lib/cx";

/** One line of a page drawing: its words, then a black box when `boxed`. */
export interface CoverLine {
  readonly text: string;
  readonly boxed?: true;
}

/** One panel: its name, its page drawing, and what a copy of that page gives. */
export interface CoverPanel {
  /** What the panel shows, in words, so nothing rests on the drawing. */
  readonly title: string;
  /** The page drawing, top to bottom. Decoration: hidden from assistive technology. */
  readonly lines: readonly CoverLine[];
  /** The words before `reads`, such as "A copy of the text gives". */
  readonly readsLabel: string;
  /** What a copy of the drawn page's text gives, word for word. */
  readonly reads: string;
}

interface CoverFigureProps {
  readonly panels: readonly CoverPanel[];
  /** Names the figure and says what the panels compare. */
  readonly caption: string;
  /** Layout only. */
  readonly className?: string;
}

/**
 * Small page drawings side by side, each with a black box on one line and,
 * under it, what a copy of the page's text gives. Spec 0018, AC-8: the
 * security page draws a box laid over text next to real removal, which look
 * the same, so only the words under each drawing tell them apart.
 *
 * Each panel's meaning is in its visible words (its title and what a copy
 * gives), and the drawings are hidden from assistive technology, so a screen
 * reader hears every difference and nothing is told by the picture alone. The
 * copy is a `samp`, sample output, in Inter like every word on the site.
 *
 * The box is an SVG filled with `currentColor` (`ink`), never a background, so
 * forced colours mode repaints it in the system's text colour rather than
 * dropping it. The copy's tinted box keeps a transparent border, so there the
 * system draws its edge in place of the dropped fill. Its length is in rem and no word sits under it, so it scales
 * with the visitor's text and hides nothing in the page itself.
 *
 * Side by side once the figure is 40rem wide, a container query on the figure
 * itself, so in the legal pages' 44rem reading column at the default text size
 * the panels pair up, and at 200% text, or on a phone, they stack. 40rem, not
 * less, so a 1280 pixel window at 200% text lands well clear of the switch. Only `ink` and
 * `ink-muted` on `surface`, `canvas` and `subtle`, so no new pairing joins the
 * contrast contract (spec 0003, INV-2).
 */
export function CoverFigure({ panels, caption, className }: CoverFigureProps) {
  return (
    <figure className={cx("@container flex flex-col gap-3", className)}>
      <div className="grid gap-4 @min-[40rem]:grid-cols-2">
        {panels.map((panel) => (
          <div
            key={panel.title}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs"
          >
            <p className="font-semibold text-ink">{panel.title}</p>
            <div
              aria-hidden="true"
              data-testid="cover-drawing"
              className="flex flex-col gap-1 rounded-lg border border-border bg-canvas px-4 py-3 text-small text-ink"
            >
              {panel.lines.map((line, index) => (
                <p key={`${index}-${line.text}`}>
                  {line.text}
                  {line.boxed && (
                    <>
                      {" "}
                      <CoverBox />
                    </>
                  )}
                </p>
              ))}
            </div>
            <p className="flex flex-col gap-1 text-small">
              <span className="text-ink-muted">{panel.readsLabel}</span>
              <samp className="block rounded-lg border border-transparent bg-subtle px-3 py-2 font-sans text-ink wrap-break-word">
                {panel.reads}
              </samp>
            </p>
          </div>
        ))}
      </div>
      <figcaption className="text-small text-ink-muted">{caption}</figcaption>
    </figure>
  );
}

/** The black box: a filled shape the length of a short address, in the text's own colour. */
function CoverBox() {
  return (
    <svg
      data-testid="cover-box"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 100 10"
      className="inline-block h-4 w-32 max-w-full align-text-bottom"
    >
      <rect width="100" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}
