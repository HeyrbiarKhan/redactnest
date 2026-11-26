/**
 * The tool grid's template from `lg` (spec 0026, AC-12). While nothing is
 * open the areas stack in one centred column too, A, then L while it speaks,
 * then B (`ToolStates.dc.html`'s empty state, the owner's call, 2026-11-26),
 * where spec 0013 AC-15 set A beside the rail.
 *
 * Returned as values, not class names, because the rows depend on which areas
 * hold something and a class built at run time is one Tailwind never sees.
 * The grid sets them as `--tool-columns`, `--tool-rows` and `--tool-areas`,
 * read by static classes under the grid's own `lg` container query.
 */

/** Which of the tool's areas hold something right now. */
export interface ToolAreas {
  /** A: the file bar, or the full drop zone. */
  readonly document: boolean;
  /** L: the polite region, unless it is quiet (visually hidden). */
  readonly live: boolean;
  /** B's head: the plan card, a callout, the result card or the lock line. */
  readonly head: boolean;
  /** C: the found items, from `reviewing` on. */
  readonly found: boolean;
  /**
   * P: the page preview, shown while it fits (spec 0026 child 0002, AC-37).
   * Absent or false everywhere else, where the template is AC-12's.
   */
  readonly preview?: boolean;
}

export interface ToolGridTemplate {
  readonly columns: string;
  readonly rows: string;
  readonly areas: string;
}

/**
 * One column, at the `max-w-narrow` measure, so no block needs its own width;
 * the grid centres it (AC-12, *One column*).
 */
const COLUMN = "minmax(0, 44rem)";

/**
 * While nothing is open, A, then L only while it has something to say, then
 * B, which always holds the lock line.
 *
 * With a document on the page, the areas that hold something stack in page
 * order, A, L, B's head (`h`), then C, and nothing else: an empty area is
 * hidden and out of the flow, so a row for it would only open a doubled gap
 * (AC-12, *Rows*). The action panel has no row of its own; it sits in C's.
 */
/**
 * The frame's columns while the preview shows (child 0002, AC-38): P takes
 * what is left, and the right column holds AC-12's blocks at 26.25rem.
 */
const FRAME_COLUMNS = "minmax(0, 1fr) 26.25rem";

export function toolGridAreas(compact: boolean, holds: ToolAreas): ToolGridTemplate {
  if (compact && holds.preview === true) return frameTemplate(holds);
  if (!compact) {
    return {
      columns: COLUMN,
      rows: "none",
      areas: holds.live ? "'a' 'l' 'b'" : "'a' 'b'",
    };
  }
  const rows = [
    holds.document && "a",
    holds.live && "l",
    holds.head && "h",
    holds.found && "c",
  ].filter((area): area is string => area !== false);
  return {
    columns: COLUMN,
    rows: "none",
    areas: rows.map((area) => `'${area}'`).join(" "),
  };
}

/**
 * The frame (child 0002, AC-38): P on the left, beside every row, and the
 * right column's areas that hold something stacked in page order, one `auto`
 * row each, the last taking the slack (`minmax(0, 1fr)`), so with a short
 * list the action panel, at the foot of C's area, rests at the window's foot.
 * P never sizes a row: its cell is `contain: size`.
 */
function frameTemplate(holds: ToolAreas): ToolGridTemplate {
  const right = [
    holds.document && "a",
    holds.live && "l",
    holds.head && "h",
    holds.found && "c",
  ].filter((area): area is string => area !== false);
  return {
    columns: FRAME_COLUMNS,
    rows: right
      .map((_, at) => (at === right.length - 1 ? "minmax(0, 1fr)" : "auto"))
      .join(" "),
    areas: right.map((area) => `'p ${area}'`).join(" "),
  };
}
