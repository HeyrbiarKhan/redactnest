/**
 * Every outside service RedactNest uses, and where to complain about one.
 * Spec 0011, AC-8, AC-9 and AC-13, INV-1 and INV-2.
 *
 * One list with three readers. The privacy policy renders it, entry by entry,
 * so a service added here appears on the page with no other change (AC-8).
 * `src/config/csp.ts` adds its origins to the standard content security
 * policy, which is the only way an outside origin gets there (AC-13). And the
 * tool route's policy never reads it at all, whatever it holds (AC-14), which
 * is what keeps spec 0001's guarantee as later features add to it.
 *
 * `next.config.ts` loads this file to build the policies, and it does not
 * resolve the `@/` alias. So this file imports only its neighbours, by relative
 * path, and reads no environment variable (INV-8).
 */

import { ConfigError } from "./error";

export interface OutsideService {
  readonly name: string;
  /** What it does for RedactNest. */
  readonly role: string;
  /** What it receives about a visitor. */
  readonly receives: string;
  readonly purpose: string;
  /** Where it processes data. */
  readonly location: string;
  /** What protects data sent outside the UK and the EU. */
  readonly safeguard: string;
  /** How long it keeps the data. */
  readonly retention: string;
  /** Anything it does with the data for itself, as a controller in its own right. */
  readonly ownUse?: string;
  /** Its own privacy policy, https. */
  readonly policyUrl: string;
  /**
   * The origins the standard policy must allow for it. A service names script
   * and connect origins only: whether one may also name frames, images or
   * styles is a later feature's decision, not something to slip in here.
   */
  readonly scriptOrigins: readonly string[];
  readonly connectOrigins: readonly string[];
}

export interface ComplaintAuthority {
  /** The words of the link. */
  readonly name: string;
  readonly url: string;
}

export const OUTSIDE_SERVICES: readonly OutsideService[] = Object.freeze([
  Object.freeze({
    name: "Vercel",
    role: "Hosts this site",
    receives:
      "Your IP address, browser and device type, the page or file asked for, and the time",
    purpose: "To deliver the site and keep it working and secure",
    location: "The United States and other countries where Vercel operates",
    safeguard:
      "The Data Privacy Framework between the EU and the US, and standard contractual clauses",
    // Vercel's runtime log retention on Pro, which spec 0011 decided.
    retention: "One day",
    ownUse:
      "Vercel may also use some of this data, such as for platform security, as a controller in its own right under its own privacy policy.",
    // The final address, checked to resolve with no redirect on 2 October
    // 2026. `/legal/privacy` redirects here, a courtesy Vercel may drop.
    policyUrl: "https://vercel.com/legal/privacy-notice",
    scriptOrigins: Object.freeze([]),
    connectOrigins: Object.freeze([]),
  }),
]);

/**
 * Where a visitor can complain (AC-9). Both addresses were checked to resolve
 * when they were written, on 2 October 2026.
 */
export const COMPLAINT_AUTHORITIES: Readonly<{
  uk: ComplaintAuthority;
  eu: ComplaintAuthority;
}> = Object.freeze({
  uk: Object.freeze({
    name: "Information Commissioner’s Office",
    url: "https://ico.org.uk/make-a-complaint/",
  }),
  eu: Object.freeze({
    name: "European Data Protection Board’s list of national authorities",
    url: "https://www.edpb.europa.eu/about-edpb/our-members_en",
  }),
});

/**
 * What a policy origin may look like: https only, a lowercase host with one
 * optional leading `*.`, an optional port, and nothing after it. A path, a
 * query, a hash or a trailing slash would make the browser read the source
 * differently from how a person reads it, and a bare `*` or a bare host would
 * let in far more than one service.
 */
const ORIGIN_SHAPE =
  /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

/** An origin the standard policy may carry. */
export const isPolicyOrigin = (origin: string): boolean => ORIGIN_SHAPE.test(origin);

/** An absolute https address. */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Every problem with a services list and the complaint authorities, for the
 * load check below and for its test, which feeds it lists that must fail.
 */
export function checkPrivacyConfig(
  services: readonly OutsideService[],
  authorities: Readonly<Record<string, ComplaintAuthority>>,
): readonly string[] {
  const serviceProblems = services.flatMap((service) => [
    ...(isHttpsUrl(service.policyUrl)
      ? []
      : [
          `${service.name}'s policyUrl must be an https address, got ${JSON.stringify(service.policyUrl)}.`,
        ]),
    ...[...service.scriptOrigins, ...service.connectOrigins]
      .filter((origin) => !isPolicyOrigin(origin))
      .map(
        (origin) =>
          `${service.name} names ${JSON.stringify(origin)}, which is not an https origin with a lowercase host and nothing after it.`,
      ),
  ]);

  const authorityProblems = Object.entries(authorities)
    .filter(([, authority]) => !isHttpsUrl(authority.url))
    .map(
      ([key, authority]) =>
        `COMPLAINT_AUTHORITIES.${key}.url must be an https address, got ${JSON.stringify(authority.url)}.`,
    );

  return [...serviceProblems, ...authorityProblems];
}

// At module load, so a bad entry fails the build rather than a page.
const problems = checkPrivacyConfig(OUTSIDE_SERVICES, COMPLAINT_AUTHORITIES);
if (problems.length > 0) {
  throw new ConfigError(problems.join(" "));
}
