import type { OutsideService } from "@/config/privacy";
import { SummaryList } from "@/ui/summary-list";

type Fact = "role" | "receives" | "purpose" | "location" | "safeguard" | "retention";

/** A service's facts and their labels, in the order AC-8 lists them. */
const FACTS: readonly (readonly [Fact, string])[] = Object.freeze([
  ["role", "What it does"],
  ["receives", "What it receives"],
  ["purpose", "Why"],
  ["location", "Where"],
  ["safeguard", "Safeguard"],
  ["retention", "How long"],
]);

/**
 * Every outside service, straight from the list it is given. Spec 0011, AC-8.
 *
 * The privacy policy passes it `OUTSIDE_SERVICES`, so a service added to that
 * list appears here with no other change, and the component test feeds it
 * sample services through the same seam. One h3 per service, its facts as a
 * definition list (a table reflows badly at 320 pixels), what it does with the
 * data for itself when it says, then its own privacy policy.
 */
export function ServicesSection({
  services,
}: {
  readonly services: readonly OutsideService[];
}) {
  return (
    <>
      {services.map((service) => (
        <div key={service.name} data-testid="service" className="flex flex-col gap-3">
          <h3>{service.name}</h3>
          <SummaryList
            items={FACTS.map(([fact, term]) => ({ term, description: service[fact] }))}
          />
          {service.ownUse !== undefined && <p>{service.ownUse}</p>}
          <p>
            <a href={service.policyUrl}>{`${service.name}’s privacy policy`}</a>
          </p>
        </div>
      ))}
    </>
  );
}
