import { describe, expect, it } from "vitest";

import { dynamic, GET } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";
import { config } from "@/config";
import { lookedFor } from "@/lib/detectors";
import { llmsText, type LlmsTextInput } from "@/lib/llms-text";

import {
  CLAIM_BANNED_PHRASES,
  MARKETING_BANNED_PHRASES,
  phrasePattern,
} from "../support/claim-phrases";

/**
 * `/llms.txt` (the marketing brief of 2026-11-28, item 2): the brief's words,
 * built from code, with Pro and Pricing only on a build that sells Pro, and
 * every line held to both banned phrase lists, as a page that describes
 * RedactNest is (spec 0018, AC-5; spec 0024, AC-5).
 */

const SITE = "https://redactnest.test";
const SOURCE = `https://github.com/example/redactnest/tree/${"a".repeat(40)}`;

const ON: LlmsTextInput = Object.freeze({
  siteUrl: SITE,
  sourceUrl: SOURCE,
  billingEnabled: true,
  freePageCap: 3,
  maxPages: 50,
  maxCustomTerms: 50,
});

const OFF: LlmsTextInput = Object.freeze({ ...ON, billingEnabled: false });

describe("the file's words", () => {
  it("says the brief's text with billing on, the detectors from lookedFor", () => {
    expect(llmsText(ON)).toBe(
      [
        "# RedactNest",
        "",
        "> PDF redaction in your browser. The PDF is processed in the tab and never uploaded. You tick what to remove; the selectable text you tick is taken out of the page, then marked, and every new file is checked before you can download it. If the check fails, you get no file.",
        "",
        "RedactNest is for small businesses that share documents with personal details in them, such as recruitment agencies, HR departments, law firms, insurance brokers and bookkeepers. It is open source under the GNU AGPL 3.0 or later.",
        "",
        "## What it does and doesn't do",
        "",
        `- It looks for ${lookedFor("conjunction")}, and lists each item for you to tick. A tick at the start is only a suggestion.`,
        "- It does not look for names or postal addresses by itself. With Pro you can add up to 50 of your own names, numbers or phrases, and RedactNest looks for them too.",
        "- Words that exist only as a picture, such as in a scan with no selectable text, are not read, so they can stay in the new file.",
        "- It can miss values. Review the whole document before you share it: https://redactnest.test/security#what-it-can-miss",
        "",
        "## Plans",
        "",
        "- Free: up to 3 pages per document, no account needed.",
        "- Pro: $19 a month, up to 50 pages per document and up to 50 custom terms. Payments are handled by Polar, the merchant of record.",
        "",
        "## Pages",
        "",
        "- [Security](https://redactnest.test/security): how the processing, the removal and the check work, what it strips, what it can miss and when it stops",
        "- [Redact a PDF](https://redactnest.test/tool): the tool",
        "- [Pricing](https://redactnest.test/pricing)",
        "- [Redact a PDF without uploading it](https://redactnest.test/redact-pdf)",
        "- [Take text out of a PDF, not just cover it](https://redactnest.test/remove-text-from-pdf)",
        "- [A black box over text isn't redaction](https://redactnest.test/black-box-redaction)",
        "- [Privacy policy](https://redactnest.test/privacy)",
        "- [Terms of service](https://redactnest.test/terms)",
        "",
        "## Optional",
        "",
        `- [Source code](${SOURCE}): the source of the version running`,
        "",
      ].join("\n"),
    );
  });

  it("names today's detectors in the first bullet", () => {
    expect(llmsText(ON)).toContain(
      "- It looks for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers, and lists each item for you to tick.",
    );
  });

  /** With billing off there is no Pro to sell, and `/pricing` is a 404. */
  it("says nothing about Pro and leaves Pricing out with billing off", () => {
    const text = llmsText(OFF);

    expect(text).not.toMatch(/\bPro\b/);
    expect(text).not.toContain("/pricing");
    expect(text).not.toContain("Polar");
    expect(text).not.toContain("custom terms");
    expect(text).toContain(
      "- It does not look for names or postal addresses by itself.\n",
    );
    expect(text).toContain("- Free: up to 3 pages per document, no account needed.");
  });

  it("takes every cap from its input, never a literal", () => {
    const text = llmsText({ ...ON, freePageCap: 7, maxPages: 90, maxCustomTerms: 25 });

    expect(text).toContain("- Free: up to 7 pages per document");
    expect(text).toContain(
      "- Pro: $19 a month, up to 90 pages per document and up to 25 custom terms.",
    );
    expect(text).toContain("With Pro you can add up to 25 of your own names");
  });

  /** A development build has no commit to link to (spec 0009, AC-3). */
  it("leaves the Optional section out when there is no source link", () => {
    const text = llmsText({ ...ON, sourceUrl: "" });

    expect(text).not.toContain("## Optional");
    expect(text).not.toContain("Source code");
    expect(text.endsWith("[Terms of service](https://redactnest.test/terms)\n")).toBe(
      true,
    );
  });

  it("ends in one newline, billing on or off", () => {
    for (const input of [ON, OFF]) {
      expect(llmsText(input).endsWith("\n")).toBe(true);
      expect(llmsText(input).endsWith("\n\n")).toBe(false);
    }
  });
});

/**
 * Both lists in `tests/support/claim-phrases.ts`, as the security page and the
 * search pages are held: a line one of them catches is reworded by the owner,
 * and neither list is loosened.
 */
describe("the banned phrases", () => {
  const phrases = [...CLAIM_BANNED_PHRASES, ...MARKETING_BANNED_PHRASES];

  it.each([
    ["on", ON],
    ["off", OFF],
  ] as const)("holds none, billing %s", (_billing, input) => {
    const text = llmsText(input);
    expect(phrases.filter((phrase) => phrasePattern(phrase).test(text))).toEqual([]);
  });
});

describe("the route", () => {
  it("serves the file built from config as UTF-8 plain text, static", async () => {
    const response = GET();

    expect(dynamic).toBe("force-static");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(llmsText(config));
  });

  it("is not in the sitemap, which lists pages", () => {
    expect(sitemap().map(({ url }) => url)).not.toContain(
      new URL("/llms.txt", config.siteUrl).href,
    );
  });
});
