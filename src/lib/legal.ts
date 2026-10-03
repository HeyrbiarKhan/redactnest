/**
 * The legal words and facts, in one place. Spec 0009, AC-1 and AC-3, and spec
 * 0011, AC-4 to AC-6, AC-16 and AC-17.
 *
 * AGPL section 5(d) asks a program with an interactive interface to show four
 * things: a copyright notice, that there is no warranty, that people may share
 * the work under the licence, and how to read the licence. Section 13 adds an
 * offer of the source to everyone who uses it over a network. The footer shows
 * each of these from here, never from a literal in a component. The wording,
 * without the word "free", was settled in spec 0009's design.
 *
 * Spec 0011 adds who runs the service, how to reach them, the Article 27
 * record, and the words of the footer's Legal nav and the line under the drop
 * zone. Two of these facts moved one way, by hand, before launch (Launch
 * readiness steps 1 and 2, 2026-10-03): the contact from the placeholder to
 * the real address, and the representatives from `pending` to `decided`.
 * `checkLegalFacts` still stops a production deploy if either moves back
 * (INV-5).
 */

const holder = "Heyrbiar Khan";

/** The year of first publication. */
const year = 2026;

const tradingName = "RedactNest";
const country = "Pakistan";
const sellerName = "EdiventStudio";

/**
 * The contact the repository held until the domain was bought (Launch
 * readiness step 1). The `.invalid` top level domain is reserved and never
 * delivers mail, so the placeholder could not reach a stranger. Kept so the
 * production gate can name it if it ever comes back (AC-16).
 */
export const CONTACT_PLACEHOLDER = "privacy@redactnest.invalid";

/**
 * What a contact address must look like, tested on the trimmed value (AC-16).
 * Deliberately loose: it catches a typo or a blank, not every address the mail
 * standards allow. The placeholder passes it.
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One representative under GDPR Article 27, every field required (AC-17). */
export interface Representative {
  readonly name: string;
  readonly postalAddress: string;
  readonly email: string;
}

/**
 * The Article 27 record (Launch readiness step 2). `decided` with both slots
 * `null` means a lawyer advised that neither is required.
 */
export type RepresentativesDecision =
  | { readonly status: "pending" }
  | {
      readonly status: "decided";
      readonly eu: Representative | null;
      readonly uk: Representative | null;
    };

/** The two launch facts, typed wide so a test can feed real ones. */
export interface LaunchFacts {
  readonly contactEmail: string;
  readonly representatives: RepresentativesDecision;
}

/**
 * The real address, on the domain bought for launch, with its forwarding
 * tested (Launch readiness step 1, 2026-10-03).
 */
const contactEmail: string = "privacy@redactnest.com";

/**
 * Decided, with neither an EU nor a UK representative: not required, on a
 * lawyer's advice (Launch readiness step 2, 2026-10-03).
 *
 * Typed by `Object.freeze`'s type argument, never by an annotation on the
 * const. A const annotated with a union narrows to the member its value
 * matches, and `LEGAL` takes that narrow type, so a decided record here broke
 * the build wherever code asks which status it holds (AC-17).
 */
const representatives = Object.freeze<RepresentativesDecision>({
  status: "decided",
  eu: null,
  uk: null,
});

export const LEGAL = Object.freeze({
  holder,
  year,
  copyrightLine: `© ${year} ${holder}`,
  licenceLine:
    "Licensed under the GNU AGPL 3.0 or later, which lets you share and change it",
  warrantyLine: "No warranty",
  sourceLabel: "Source code for this version",
  licenceLabel: "Licence",
  noticesLabel: "Third party notices",
  /** AC-3: a development build has no commit to link to. */
  sourcePending: "Source code for this version (link set per deploy)",

  tradingName,
  country,
  /** Who runs the service, as both pages name it (spec 0011, AC-6, AC-10). */
  operatorLine: `${tradingName}, operated by ${holder}, an individual based in ${country}`,
  contactEmail,
  representatives,

  /** The footer's nav (spec 0011, AC-4). */
  legalNavLabel: "Legal",
  privacyLabel: "Privacy policy",
  termsLabel: "Terms of use",
  /**
   * The line under the drop zone, around its two links (spec 0011, AC-5): "By
   * choosing a PDF you agree to the Terms of use. The Privacy policy explains
   * what happens to your data."
   */
  toolNotice: Object.freeze({
    beforeTerms: "By choosing a PDF you agree to the ",
    betweenLinks: ". The ",
    afterPrivacy: " explains what happens to your data.",
  }),

  /**
   * The studio RedactNest is sold through, the name on a buyer's receipt and
   * card statement (spec 0012). A trading name of the operator above, so the
   * operator line does not change.
   */
  sellerName,
  /** Under Subscribe on Pricing (spec 0012, AC-13). */
  merchantLine: `Payments are handled by Polar, our merchant of record. Your receipt and card statement show ${sellerName}, the studio RedactNest is sold through.`,
  /**
   * Set by task 1's sandbox check (spec 0012, AC-13): Polar takes tax out of
   * the price in some countries and adds it on top in others, such as the US.
   */
  taxLine: "Tax may be added at checkout, depending on where you live.",
  /** "By subscribing you agree to the Terms of service.", around its link. */
  subscribeNotice: Object.freeze({
    beforeTerms: "By subscribing you agree to the ",
    afterTerms: ".",
  }),
});

const PRODUCTION_ADVICE = "in src/lib/legal.ts before deploying to production.";

/** The reserved top level domain that never delivers mail (RFC 2606). */
const NEVER_DELIVERS = ".invalid";

/** The host of an address, lowercased and without a trailing dot, which DNS ignores. */
function hostOf(email: string): string {
  return email
    .slice(email.lastIndexOf("@") + 1)
    .toLowerCase()
    .replace(/\.+$/, "");
}

/**
 * What is wrong with the contact address (AC-16, INV-5). Every build refuses
 * an address that is not one. Production also refuses any address on a
 * `.invalid` host, the placeholder in any case among them: an exact match let
 * `Privacy@redactnest.invalid`, or another `.invalid` name typed by hand, ship
 * a privacy contact that bounces.
 */
function contactProblem(contactEmail: string, production: boolean): string | null {
  const email = contactEmail.trim();
  if (!EMAIL_SHAPE.test(email)) {
    return `LEGAL.contactEmail must be an email address, got ${JSON.stringify(contactEmail)}.`;
  }
  if (!production || !hostOf(email).endsWith(NEVER_DELIVERS)) return null;

  return email.toLowerCase() === CONTACT_PLACEHOLDER
    ? `LEGAL.contactEmail is still the placeholder ${CONTACT_PLACEHOLDER}. Set the real contact address ${PRODUCTION_ADVICE}`
    : `LEGAL.contactEmail ${JSON.stringify(email)} is on a ${NEVER_DELIVERS} host, which never delivers mail. Set the real contact address ${PRODUCTION_ADVICE}`;
}

/** A recorded representative missing a field, or with an address that is not one. */
function representativeProblems(
  slot: "eu" | "uk",
  representative: Representative | null,
): readonly string[] {
  if (representative === null) return [];

  const where = `LEGAL.representatives.${slot}`;
  return [
    representative.name.trim() === "" ? `${where}.name is empty.` : null,
    representative.postalAddress.trim() === ""
      ? `${where}.postalAddress is empty.`
      : null,
    EMAIL_SHAPE.test(representative.email.trim())
      ? null
      : `${where}.email must be an email address, got ${JSON.stringify(representative.email)}.`,
  ].filter((problem) => problem !== null);
}

/**
 * Every problem with the two launch facts, for the build to report at once
 * (spec 0011, AC-16 and AC-17, INV-5).
 *
 * Pure, so a test can feed it a real address and a recorded decision while
 * this file still holds the placeholders. `src/config/index.ts` calls it at
 * module load with `VERCEL_ENV` and throws one `ConfigError` listing whatever
 * comes back. A malformed address or representative fails every build; an
 * address on a `.invalid` host (the placeholder among them) and a pending
 * decision fail only a production deploy, so previews, CI and development
 * still build and show the placeholder.
 */
export function checkLegalFacts(
  facts: LaunchFacts,
  vercelEnv: string | undefined,
): readonly string[] {
  const production = vercelEnv === "production";
  const decision = facts.representatives;

  return [
    contactProblem(facts.contactEmail, production),
    production && decision.status === "pending"
      ? `LEGAL.representatives is still pending. Record the Article 27 decision ${PRODUCTION_ADVICE}`
      : null,
    ...(decision.status === "decided"
      ? [
          ...representativeProblems("eu", decision.eu),
          ...representativeProblems("uk", decision.uk),
        ]
      : []),
  ].filter((problem) => problem !== null);
}
