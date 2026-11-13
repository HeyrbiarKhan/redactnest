/**
 * A count as the page writes it: British, so 1,000 and more take a thousands
 * separator (`3,000`). Every count the redact flow shows goes through it, the
 * badges, the action panel, a group's select all, the result card and every
 * custom terms line, so one screen never shows `3000` beside `3,000` (spec
 * 0017, as built; spec 0007, AC-6, AC-7 and AC-11, as spec 0017 amends them).
 *
 * Imports nothing, so `src/ui`'s `CountBadge` may use it as `flow-text.ts` does.
 */

const COUNT = new Intl.NumberFormat("en-GB");

export function countText(count: number): string {
  return COUNT.format(count);
}
