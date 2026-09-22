/**
 * Join class names, dropping the ones a condition switched off.
 *
 * Deliberately not a merging library (spec 0003). The primitives never hand a
 * caller a class that fights one of their own, because `className` is for
 * layout only, so there is nothing to resolve and nothing to ship for it.
 */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" ");
}
