/**
 * The room `/tool`'s floating action panel takes at the foot of the window,
 * and the one rule that keeps a focused control out from under it (spec 0026,
 * AC-12, *The panel's room* and *Focus never hidden when it moves*).
 */

/**
 * At least the panel's height in its tallest form at `lg`: the count line
 * with Untick all, the waits line wrapped, the `lg` button and the lock line,
 * with its padding and edge. C's bottom padding and every scroll margin in the
 * column read this one value (as `--tool-panel-room`), so they never
 * disagree. A rule about the panel's own size, not a cap on the visitor.
 *
 * Measured again in the page preview's 26.25rem column (spec 0026 child 0002,
 * AC-38), where the lines wrap more: 266 pixels at the default size, against
 * 256 in the 44rem column, so it takes the larger, with room to spare.
 */
export const PANEL_ROOM = "17rem";

/** A box as `getBoundingClientRect` gives it, in the window's coordinates. */
export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Whether the panel's box covers part of the focused control's box (WCAG 2.2,
 * 2.4.11). Boxes that only touch, on any side, do not overlap, so a control
 * resting right above the panel is left where it is.
 */
export function coversFocus(control: Box, panel: Box): boolean {
  return (
    control.top < panel.bottom &&
    control.bottom > panel.top &&
    control.left < panel.right &&
    control.right > panel.left
  );
}
