/**
 * The visitor's own email address, as the signed in header shows it. Spec
 * 0026, child 0001, AC-21 and AC-22.
 *
 * One rule, read on both sides: `readSession` on the server narrows the
 * session token's `email` claim with it, and the page narrows
 * `/api/entitlement`'s answer with it, so the two never disagree about what
 * counts as an address. Imports nothing, so it can sit on either side.
 */

/**
 * The longest address taken: 320 characters, the most a mail path allows (64
 * before the `@`, 255 after it). A rule about addresses, not a cap on the
 * visitor, so it is named here for the one place that reads it.
 */
const EMAIL_MAX_CHARS = 320;

/**
 * A string holding exactly one `@` and at most 320 characters, or `null`.
 * Deliberately loose past that: the address comes from a token Clerk signed,
 * and it is shown only to the browser holding that token, so this guards the
 * shape a deploy could break, not the address's validity.
 */
export function accountEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > EMAIL_MAX_CHARS) return null;
  if (value.split("@").length !== 2) return null;
  return value;
}

/**
 * The avatar's letter (AC-22): the address's first grapheme, as a person sees
 * it, uppercased in British English, or `null` when there is no address and
 * the avatar shows the person icon instead.
 */
export function avatarInitial(email: string | null): string | null {
  if (email === null) return null;
  const segments = new Intl.Segmenter("en-GB", { granularity: "grapheme" }).segment(
    email,
  );
  for (const { segment } of segments) return segment.toLocaleUpperCase("en-GB");
  return null;
}
