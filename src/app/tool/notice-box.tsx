import { Info, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/** Words a warning keeps behind one control until it is asked for. */
export interface MoreWords {
  /** The control's words, such as `ADVICE_LINK`. */
  readonly label: string;
  readonly text: string;
  readonly "data-testid": string;
}

interface WarningBoxProps {
  /** The heading, kept as an `h3` whether or not it shows. */
  readonly title: string;
  /**
   * The title is heard and listed as a heading but not drawn, so each
   * warning reads as one line (the open's warnings, `ToolReview.dc.html`).
   */
  readonly titleHidden?: boolean;
  /** One paragraph each, from `src/lib/page-findings.ts`. */
  readonly lines: readonly string[];
  /** Words after the lines that wait behind a control, or none. */
  readonly more?: MoreWords;
  /** Paragraphs after the lines, always shown. */
  readonly children?: ReactNode;
  readonly "data-testid": string;
}

/**
 * `/tool`'s warning, as the review and done mockups draw it: a compact
 * `warning-bg` box with a `warning-border` edge, which forced colours keep
 * (spec 0006, AC-27), its icon, and every word in `warning-ink` (8.75:1).
 * The hidden "Warning" word comes first, as `Callout`'s does, so the tone is
 * never told by colour alone.
 *
 * `more` is a disclosure: an underlined button at the end of the last line,
 * `aria-expanded`, controlling the paragraph it shows. Its box is 40 pixels
 * tall, so its ring reaches past the line it sits on. The paragraph stays
 * in the page, hidden, so its node is kept. Its focus ring sits on
 * `warning-bg`, a pairing in the contrast contract.
 */
export function WarningBox({
  title,
  titleHidden = false,
  lines,
  more,
  children,
  "data-testid": testId,
}: WarningBoxProps) {
  const moreId = useId();
  const [open, setOpen] = useState(false);
  const last = lines.length - 1;

  return (
    <div
      data-testid={testId}
      className="flex gap-2.5 rounded-control border border-warning-border bg-warning-bg px-3 py-2.5 text-small text-warning-ink"
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-warning-icon"
        strokeWidth={2}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 wrap-break-word">
        <span className="sr-only">Warning: </span>
        <h3 className={titleHidden ? "sr-only" : "font-semibold"}>{title}</h3>
        {lines.map((line, at) => (
          <p key={line}>
            {line}
            {more !== undefined && at === last && (
              <>
                {" "}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={moreId}
                  onClick={() => setOpen((shown) => !shown)}
                  // A 40 pixel button, as every button is (spec 0003, AC-7),
                  // its 10 pixels above and below given back by its margins,
                  // so the words stay on the warning's line.
                  className="-my-2.5 inline-flex min-h-10 items-center rounded-item font-semibold underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {more.label}
                </button>
              </>
            )}
          </p>
        ))}
        {more !== undefined && (
          <p id={moreId} data-testid={more["data-testid"]} hidden={!open}>
            {more.text}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * `/tool`'s untitled note (spec 0006, AC-21), in the warning's compact form:
 * an `info-bg` box with an `info-border` edge, its icon, the hidden "Note"
 * word, and the lines in `ink`.
 */
export function NoteBox({
  lines,
  "data-testid": testId,
}: {
  readonly lines: readonly string[];
  readonly "data-testid": string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex gap-2.5 rounded-control border border-info-border bg-info-bg px-3 py-2.5 text-small text-ink"
    >
      <Info
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-info-icon"
        strokeWidth={2}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 wrap-break-word">
        <span className="sr-only">Note: </span>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
