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
   * The origins the standard policy must allow for it. A service names script,
   * connect and image origins only: whether one may also name frames or styles
   * is a later feature's decision, not something to slip in here. Images joined
   * with spec 0012 (AC-21), for the avatars Clerk's sign in shows.
   */
  readonly scriptOrigins: readonly string[];
  readonly connectOrigins: readonly string[];
  readonly imageOrigins: readonly string[];
}

/**
 * Clerk's Frontend API in production: a subdomain of ours, set up by DNS
 * (spec 0012, Go live step 1). A Vercel production build refuses any other
 * publishable key host (AC-23), so this is also what `src/config/billing.ts`
 * checks the key against.
 */
export const CLERK_PRODUCTION_ORIGIN = "https://clerk.redactnest.com";

/**
 * Every origin Clerk's script and its calls may come from: production, and a
 * development instance's host (spec 0012, AC-21). A publishable key whose host
 * none of these covers fails the build (AC-23), so sign in can never be pointed
 * at an origin the policy does not name.
 */
export const CLERK_ORIGINS: readonly string[] = Object.freeze([
  CLERK_PRODUCTION_ORIGIN,
  "https://*.clerk.accounts.dev",
]);

/** Whether an origin from the list above, wildcard included, covers a host. */
export function originCoversHost(origin: string, host: string): boolean {
  const pattern = origin.replace(/^https:\/\//, "");
  if (!pattern.startsWith("*.")) return host === pattern;
  const parent = pattern.slice(1);
  return host.endsWith(parent) && host.length > parent.length;
}

export interface ComplaintAuthority {
  /** The words of the link. */
  readonly name: string;
  readonly url: string;
}

// Spec 0012. Each fact below was read from Polar's privacy policy (effective
// 8 September 2026), its buyer terms (updated 25 March 2026) and its DPA
// (updated 9 June 2026) on 3 October 2026. Polar sells Pro as merchant of
// record and reseller; checkout and the billing portal are Polar's own pages,
// reached by a redirect, so it names no origin for any policy here. Named, so
// the privacy policy's Payments section links Polar's own policy from here
// rather than from a literal (task 14).
export const POLAR_SERVICE: OutsideService = Object.freeze({
  name: "Polar",
  role: "Sells Pro to you as our merchant of record, under the name EdiventStudio, and takes your payment",
  receives:
    "Your email address, billing address, payment details and IP address, and your RedactNest account id",
  purpose:
    "To sell and renew Pro, charge your card, work out tax, send receipts and handle refunds",
  location:
    "The United States, Canada and other countries outside the UK and the EU where Polar and its payment processor Stripe operate",
  safeguard:
    "Standard contractual clauses, with the UK’s International Data Transfer Addendum",
  retention:
    "While you have an account or subscription with Polar, and longer where tax and accounting law requires",
  ownUse:
    "Polar also uses this data for fraud protection and security, and keeps the records tax and accounting law requires, under its own privacy policy. Its payment processor, Stripe, takes your card details.",
  // The final address, checked to resolve with no redirect on 3 October 2026.
  policyUrl: "https://polar.sh/legal/privacy-policy",
  scriptOrigins: Object.freeze([]),
  connectOrigins: Object.freeze([]),
  imageOrigins: Object.freeze([]),
});

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
    imageOrigins: Object.freeze([]),
  }),
  // Spec 0012. Each fact below was read from Clerk's privacy policy (updated
  // 15 June 2026), its Data Privacy Framework notice and its DPA (updated 26
  // November 2024) on 3 October 2026. Clerk acts as our processor: "the
  // customer is the controller and we act as a processor". Its script loads
  // on the sign in and account pages only (AC-9), never on /tool (INV-1).
  Object.freeze({
    name: "Clerk",
    role: "Runs sign in and accounts",
    receives:
      "Your email address, and for each sign in your IP address, browser and device type, and the time",
    purpose:
      "To sign you in with an emailed code and keep you signed in on the account pages",
    location:
      "The United States and other countries where Clerk and its providers operate, hosted mainly by Google Cloud and Cloudflare",
    safeguard:
      "The Data Privacy Framework between the EU and the US, with its UK Extension, and standard contractual clauses where that does not apply",
    retention: "Until you delete your account, which you can do in Account",
    // The final address, checked to resolve with no redirect on 3 October 2026.
    policyUrl: "https://clerk.com/legal/privacy",
    scriptOrigins: CLERK_ORIGINS,
    connectOrigins: CLERK_ORIGINS,
    imageOrigins: Object.freeze(["https://img.clerk.com"]),
  }),
  POLAR_SERVICE,
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
    ...[...service.scriptOrigins, ...service.connectOrigins, ...service.imageOrigins]
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
