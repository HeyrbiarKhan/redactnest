import type { Representative, RepresentativesDecision } from "@/lib/legal";

/** Where each slot's representative acts for us, in the policy's words. */
const REGION = Object.freeze({
  eu: "the European Union",
  uk: "the United Kingdom",
});

/**
 * The representatives GDPR Article 27 may ask for, when the decision records
 * any. Spec 0011, AC-6.
 *
 * Each recorded one with their name, postal address and email. Nothing at all
 * while the decision is pending or names nobody, so the page says nothing
 * about representatives rather than "none". The privacy policy passes it
 * `LEGAL.representatives`; the component test feeds it each shape of decision
 * through the same seam.
 */
export function RepresentativesBlock({
  decision,
}: {
  readonly decision: RepresentativesDecision;
}) {
  if (decision.status === "pending") return null;

  const recorded = (["eu", "uk"] as const).flatMap((slot) => {
    const representative: Representative | null = decision[slot];
    return representative === null ? [] : [{ slot, representative }];
  });

  return recorded.map(({ slot, representative }) => {
    const email = representative.email.trim();
    return (
      <p key={slot} data-testid={`representative-${slot}`}>
        Our representative in {REGION[slot]} is {representative.name.trim()},{" "}
        {representative.postalAddress.trim()}. You can write to them about your data at{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </p>
    );
  });
}
