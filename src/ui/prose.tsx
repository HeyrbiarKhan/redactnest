import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

interface ProseProps {
  /** Long form text: sections, headings, paragraphs, lists and links. */
  readonly children: ReactNode;
  /** Layout only. */
  readonly className?: string;
}

/**
 * The rhythm of long form text, such as the privacy policy and the terms of
 * use (spec 0011). One wrapper that styles what it holds, so a page writes
 * plain `section`, `h2`, `h3`, `p`, `ul`, `ol` and `a` and reads the same as
 * every other page of prose.
 *
 * Sections stand well apart and their contents close together, so the h2s
 * carry the structure. Lists keep their markers, because a list is read as one
 * (WCAG 1.3.1). Links are underlined in the text colour, never told apart by
 * colour alone (INV-8), and take the focus ring from the global
 * `:focus-visible` rule. Only `ink` and `ink-muted` on `canvas`, so no new
 * pairing joins the contrast contract.
 */
const PROSE = cx(
  "flex flex-col gap-10 text-body text-ink",
  "[&_section]:flex [&_section]:flex-col [&_section]:gap-4",
  "[&_h2]:text-heading [&_h2]:text-ink",
  "[&_h3]:pt-2 [&_h3]:text-body [&_h3]:font-semibold [&_h3]:text-ink",
  // Margins rather than a flex gap: a list laid out as flex can lose its markers.
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:pl-1 [&_li+li]:mt-2",
  "[&_a]:rounded-sm [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-4",
  "[&_a:hover]:decoration-2 [&_a]:wrap-break-word",
);

export function Prose({ children, className }: ProseProps) {
  return <div className={cx(PROSE, className)}>{children}</div>;
}
