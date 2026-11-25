import { cx } from "@/lib/cx";

/** One line of a page drawing: its words, then a black box when `boxed`. */
export interface CoverLine {
  readonly text: string;
  readonly boxed?: true;
}

/**
 * Which side of the comparison a panel is: a box laid over text, or text
 * taken out. Only the `tinted` look reads it, to tint the panel's title and
 * copy red or teal; the words still carry the meaning.
 */
export type CoverTone = "covered" | "removed";

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
  /** The side it shows, for the `tinted` look. */
  readonly tone?: CoverTone;
}

/**
 * `framed`: each drawing in its own bordered box, the caption under the
 * panels (the security page and the guides). `tinted`: the home page's look
 * from `Main.dc.html`, each title a tinted chip, the drawing on the card
 * itself, the copy in a tinted monospace box, and no caption drawn, as the
 * mockup draws none: the caption names the figure through `aria-label`
 * instead, so no hidden text sits in the page.
 */
export type CoverLook = "framed" | "tinted";

/** Exported so a search page's record can hold its figure (spec 0024, *Data model sketch*). */
export interface CoverFigureProps {
  readonly panels: readonly CoverPanel[];
  /** Names the figure and says what the panels compare. */
  readonly caption: string;
  /** `framed` unless the page asks for the home page's `tinted` look. */
  readonly look?: CoverLook;
  /** Layout only. */
  readonly className?: string;
}

/** Each look's classes, keyed by part. */
const LOOK = Object.freeze({
  framed: Object.freeze({
    // 40rem, so the legal pages' 44rem column pairs them and 200% text stacks.
    grid: "grid grid-cols-1 gap-4 @min-[40rem]:grid-cols-2",
    panel:
      "flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card",
    title: "font-semibold text-ink",
    drawing:
      "flex flex-col gap-1 rounded-control border border-border bg-canvas px-4 py-3 text-small text-ink",
    reads: "flex flex-col gap-1 text-small",
    label: "text-ink-muted",
    copy: "block rounded-control border border-transparent bg-subtle px-3 py-2 font-sans text-ink",
    box: "h-4 w-32",
  }),
  tinted: Object.freeze({
    // 32rem, so the home page's 36rem column pairs them as drawn at 1440
    // pixels, and 200% text there (18rem) stacks them.
    grid: "grid grid-cols-1 gap-4 @min-[32rem]:grid-cols-2",
    panel: "flex flex-col gap-3.5 rounded-panel border bg-surface p-5 shadow-card",
    // A pill on one line, and a rounded box if a long title wraps.
    title: "self-start rounded-[0.875rem] px-2.5 py-1 text-small font-semibold",
    drawing: "flex flex-col text-small leading-[1.9] text-ink-soft",
    reads: "flex flex-col gap-1.5 border-t border-muted pt-3 text-small",
    label: "text-ink-subtle",
    copy: "block rounded-[0.375rem] border border-transparent p-2 font-mono",
    // In `ink`, though the drawn words around it are `ink-soft`.
    box: "h-4 w-22 text-ink",
  }),
});

/** The `tinted` look's colours by side: red for the box laid over, teal for removal. */
const TINT: Readonly<
  Record<
    CoverTone,
    { readonly edge: string; readonly chip: string; readonly copy: string }
  >
> = Object.freeze({
  covered: Object.freeze({
    edge: "border-border",
    chip: "bg-danger-bg text-danger-strong",
    copy: "bg-danger-bg text-danger-strong",
  }),
  removed: Object.freeze({
    edge: "border-accent-edge",
    chip: "bg-accent-faint text-accent-strong",
    copy: "bg-accent-faint text-accent-strong",
  }),
});

/**
 * Small page drawings side by side, each with a black box on one line and,
 * under it, what a copy of the page's text gives. Spec 0018, AC-8: the
 * security page draws a box laid over text next to real removal, which look
 * the same, so only the words under each drawing tell them apart.
 *
 * Each panel's meaning is in its visible words (its title and what a copy
 * gives), and the drawings are hidden from assistive technology, so a screen
 * reader hears every difference and nothing is told by the picture alone. The
 * copy is a `samp`, sample output: in Inter in the `framed` look, and in the
 * monospace stack in the `tinted` look, as `Main.dc.html` sets it (the
 * owner's call, 2026-11-25, amending spec 0003 INV-6 for this one place; the
 * element carries `data-mono`, which the fonts test reads).
 *
 * The box is an SVG filled with `currentColor` (`ink`), never a background, so
 * forced colours mode repaints it in the system's text colour rather than
 * dropping it. The copy's tinted box keeps a transparent border, so there the
 * system draws its edge in place of the dropped fill. Its length is in rem and no word sits under it, so it scales
 * with the visitor's text and hides nothing in the page itself.
 *
 * Side by side once the figure is wide enough, a container query on the
 * figure itself (40rem `framed`, 32rem `tinted`), so the panels pair by the
 * room the figure has, and at 200% text, or on a phone, they stack. Below the
 * switch the one column is `grid-cols-1` (`minmax(0, 1fr)`), never an
 * automatic track: an automatic column is never narrower than its longest
 * word, so at 320 pixels with 200% text one long word plus the panel's rem
 * padding pushed the figure past the window. The `framed` look uses only
 * `ink` and `ink-muted` on `surface`, `canvas` and `subtle`; the `tinted`
 * look adds `ink-soft` and `ink-subtle` on `surface`, `danger-strong` on
 * `danger-bg` and `accent-strong` on `accent-faint`, each in the contrast
 * contract (spec 0003, INV-2).
 *
 * Each panel takes `wrap-anywhere`, which every word inside it inherits (the
 * title, the drawn lines, the label and the copy), so a word wider than its
 * line breaks inside itself, with no hyphen, rather than widening the panel.
 * It replaces `wrap-break-word` on the copy, which breaks a long word too but
 * does not lower the narrowest width the column is sized from. Spec 0024,
 * *CoverFigure at narrow widths* and AC-14.
 */
export function CoverFigure({
  panels,
  caption,
  look = "framed",
  className,
}: CoverFigureProps) {
  const parts = LOOK[look];
  return (
    <figure
      aria-label={look === "tinted" ? caption : undefined}
      className={cx("@container flex flex-col gap-3", className)}
    >
      <div className={parts.grid}>
        {panels.map((panel) => {
          const tint = look === "tinted" ? TINT[panel.tone ?? "covered"] : undefined;
          return (
            <div
              key={panel.title}
              className={cx(parts.panel, tint?.edge, "wrap-anywhere")}
            >
              <p className={cx(parts.title, tint?.chip)}>{panel.title}</p>
              <div
                aria-hidden="true"
                data-testid="cover-drawing"
                className={parts.drawing}
              >
                {panel.lines.map((line, index) => (
                  <p key={`${index}-${line.text}`}>
                    {line.text}
                    {line.boxed && (
                      <>
                        {" "}
                        <CoverBox size={parts.box} />
                      </>
                    )}
                  </p>
                ))}
              </div>
              <p className={parts.reads}>
                <span className={parts.label}>{panel.readsLabel}</span>
                <samp
                  data-mono={look === "tinted" ? "" : undefined}
                  className={cx(parts.copy, tint ? tint.copy : undefined)}
                >
                  {panel.reads}
                </samp>
              </p>
            </div>
          );
        })}
      </div>
      {look === "framed" && (
        <figcaption className="text-small text-ink-muted">{caption}</figcaption>
      )}
    </figure>
  );
}

/** The black box: a filled shape the length of a short address, in the text's own colour. */
function CoverBox({ size }: { readonly size: string }) {
  return (
    <svg
      data-testid="cover-box"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 100 10"
      className={cx("inline-block max-w-full align-text-bottom", size)}
    >
      <rect width="100" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}
