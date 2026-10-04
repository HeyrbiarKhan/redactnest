import { LEGAL } from "@/lib/legal";

/**
 * The contact address, as a link that opens the visitor's mail. The account
 * pages' failure lines name it as the way forward when trying again is not
 * enough (spec 0012, AC-14, AC-17 and AC-25).
 */
export function ContactLink() {
  const address = LEGAL.contactEmail.trim();
  return <a href={`mailto:${address}`}>{address}</a>;
}
