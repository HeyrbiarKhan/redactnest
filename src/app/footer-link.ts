/**
 * A small link in muted text: the footer's Legal nav and licence notice, and
 * the line under the drop zone. Spec 0009, AC-2, and spec 0011, AC-4 and AC-5.
 *
 * Plain links, in the same tab. On `/tool` a plain link is a real page load,
 * so spec 0007's leave warning still guards ticked work. At least 24 pixels
 * tall, so each one is a large enough target (WCAG 2.5.8). One rule in one
 * place, so the pieces that sit side by side cannot drift apart.
 */
export const FOOTER_LINK_CLASS =
  "inline-flex min-h-6 items-center rounded-sm underline underline-offset-4 hover:text-ink";
