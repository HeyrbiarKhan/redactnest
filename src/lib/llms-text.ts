/**
 * `/llms.txt`'s words, built from code like the sitemap, so the file cannot
 * drift from the site (the marketing brief of 2026-11-28, item 2). The route
 * in `src/app/llms.txt/route.ts` passes `config` in; this module never reads
 * it, so a test can build the file for billing on and off.
 *
 * The file describes RedactNest, so every line holds under spec 0018's AC-5
 * and spec 0024's claim register, and `tests/unit/llms-text.test.ts` runs both
 * lists in `tests/support/claim-phrases.ts` over it. The detectors come from
 * `lookedFor`, the plan names and Pro's price from `src/lib/plans.ts`, every
 * cap from the caller's `config`, and every path from `src/lib/routes.ts` and
 * the search pages' own records. Anything about Pro, and the link to Pricing
 * (a 404 with billing off, spec 0012, AC-23), shows only with billing on.
 */

import { lookedFor } from "@/lib/detectors";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { sectionId } from "@/lib/policy-sections";
import {
  PRICING_PATH,
  PRIVACY_PATH,
  SECURITY_PATH,
  TERMS_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import { SEARCH_PAGE_TEXT, SEARCH_PAGES } from "@/lib/search-pages";

/** What the file needs from `config`, which the route passes whole. */
export interface LlmsTextInput {
  readonly siteUrl: string;
  readonly sourceUrl: string;
  readonly billingEnabled: boolean;
  readonly freePageCap: number;
  readonly maxPages: number;
  readonly maxCustomTerms: number;
}

/**
 * The whole file, in the llms.txt layout: a title, a quoted summary, a
 * paragraph, then sections of bullets and links. `siteUrl` carries no
 * trailing slash (`config` normalises it), so a path joins straight on.
 */
export function llmsText(input: LlmsTextInput): string {
  const { siteUrl, sourceUrl, billingEnabled, freePageCap, maxPages, maxCustomTerms } =
    input;
  const at = (path: string) => `${siteUrl}${path}`;
  const canMiss = at(`${SECURITY_PATH}#${sectionId("whatItCanMiss")}`);

  /**
   * Row M1 (privacy claim C1, `/tool`'s `connect-src 'self'`), row M2 (the
   * self check's text part: "selectable" and "the page", removed first, then
   * marked) and row M3 (spec 0004, INV-2: no file leaves unless the check
   * passed on its bytes), as the site line says them.
   */
  const summary = `${LEGAL.brandLine} The PDF is processed in the tab and never uploaded. You tick what to remove; the selectable text you tick is taken out of the page, then marked, and every new file is checked before you can download it. If the check fails, you get no file.`;

  /**
   * "Looks for", never "finds" (spec 0018, AC-5), and the seeded tick is
   * only a suggestion (spec 0007, AC-7). No detector for names or postal
   * addresses (spec 0005, AC-14); with Pro, the visitor's own terms (row
   * M6, spec 0017, AC-1). A scan's words are a picture the text part never
   * reads (spec 0004, AC-13), and any value can be missed, which the
   * security page's What it can miss says.
   */
  const doesAndDoesnt = [
    `- It looks for ${lookedFor("conjunction")}, and lists each item for you to tick. A tick at the start is only a suggestion.`,
    billingEnabled
      ? `- It does not look for names or postal addresses by itself. With ${PRO_PLAN.name} you can add up to ${maxCustomTerms} of your own names, numbers or phrases, and RedactNest looks for them too.`
      : "- It does not look for names or postal addresses by itself.",
    "- Words that exist only as a picture, such as in a scan with no selectable text, are not read, so they can stay in the new file.",
    `- It can miss values. Review the whole document before you share it: ${canMiss}`,
  ];

  /** Every cap from `config` (spec 0012, INV-8), the price from `plans.ts`. */
  const plans = [
    `- ${FREE_PLAN.name}: up to ${freePageCap} pages per document, no account needed.`,
    ...(billingEnabled
      ? [
          `- ${PRO_PLAN.name}: ${PRO_PLAN.priceLine}, up to ${maxPages} pages per document and up to ${maxCustomTerms} custom terms. Payments are handled by Polar, the merchant of record.`,
        ]
      : []),
  ];

  /** The search pages in `SEARCH_PAGES` order, each by its own headline. */
  const pages = [
    `- [Security](${at(SECURITY_PATH)}): how the processing, the removal and the check work, what it strips, what it can miss and when it stops`,
    `- [Redact a PDF](${at(TOOL_PATH)}): the tool`,
    ...(billingEnabled ? [`- [Pricing](${at(PRICING_PATH)})`] : []),
    ...SEARCH_PAGES.map((kind) => {
      const { headline, path } = SEARCH_PAGE_TEXT[kind];
      return `- [${headline}](${at(path)})`;
    }),
    `- [${LEGAL.privacyLabel}](${at(PRIVACY_PATH)})`,
    `- [${LEGAL.termsLabel}](${at(TERMS_PATH)})`,
  ];

  /**
   * The footer's source link, the tree of the exact commit built (spec 0009,
   * AC-4). A development build has none (AC-3), so the section is left out.
   */
  const optional =
    sourceUrl === ""
      ? []
      : [
          "## Optional",
          "",
          `- [Source code](${sourceUrl}): the source of the version running`,
          "",
        ];

  return [
    `# ${LEGAL.tradingName}`,
    "",
    `> ${summary}`,
    "",
    "RedactNest is for small businesses that share documents with personal details in them, such as recruitment agencies, HR departments, law firms, insurance brokers and bookkeepers. It is open source under the GNU AGPL 3.0 or later.",
    "",
    "## What it does and doesn't do",
    "",
    ...doesAndDoesnt,
    "",
    "## Plans",
    "",
    ...plans,
    "",
    "## Pages",
    "",
    ...pages,
    "",
    ...optional,
  ].join("\n");
}
