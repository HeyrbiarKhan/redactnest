import { describe, expect, it } from "vitest";

import { DETECTOR_LABELS, lookedFor } from "@/lib/detectors";
import { SANITIZED_TEXT } from "@/lib/flow-text";
import {
  capLine,
  findsItems,
  HOME_STRIPPED,
  HOME_TEXT,
  strippedItems,
} from "@/lib/home-text";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { DETECTOR_KINDS, SANITIZED_KINDS } from "@/worker/protocol";

/**
 * The home page's words. Spec 0013, AC-10 to AC-13 and INV-1: every word true
 * of the product today, with the detectors, the stripped kinds, the caps and
 * the plan names read from where the product holds them.
 */

describe("the hero (AC-10)", () => {
  it("says what the spec settled, word for word", () => {
    expect(HOME_TEXT.eyebrow).toBe("Runs in your browser. Never uploaded.");
    expect(HOME_TEXT.headline).toBe("Redaction that actually removes the text");
    expect(HOME_TEXT.primary).toBe("Remove text from a PDF");
    expect(HOME_TEXT.howItWorks).toBe("See how it works");
    // Spec 0026, AC-8: the self check named by its result, row M3.
    expect(HOME_TEXT.shotCard).toBe("No pass, no file");
  });

  /**
   * Spec 0019, AC-12: "looks for" says what RedactNest does and claims nothing
   * about what it finds, and the lead leaves removal to the headline and the
   * "Removed, not covered" card.
   */
  it("names exactly the detectors that exist, in the lead", () => {
    expect(HOME_TEXT.lead).toBe(
      `RedactNest looks for ${lookedFor("conjunction")} in your PDF and lets you tick what to remove.`,
    );
    expect(HOME_TEXT.lead).toBe(
      "RedactNest looks for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers in your PDF and lets you tick what to remove.",
    );
    expect(HOME_TEXT.lead).not.toMatch(/\bfinds\b/i);
  });

  /** Spec 0026, AC-8: How it works, three cards in the order of the tool. */
  it("gives How it works its three titles and lines, in order", () => {
    expect(HOME_TEXT.steps.eyebrow).toBe("How it works");
    expect(HOME_TEXT.steps.title).toBe("Three steps to a redacted PDF");
    expect(HOME_TEXT.steps.items.map(({ title, body }) => [title, body])).toEqual([
      ["Open a PDF", "Drop it on the page, or choose it from your files."],
      [
        "Tick what to remove",
        "Each item found is listed with the words around it. A tick at the start is only a suggestion.",
      ],
      [
        "Download your new file",
        "Checked before you download: every page of the new file is checked, and if RedactNest can't vouch for it, you get no file.",
      ],
    ]);
  });

  /**
   * Spec 0026, AC-8, row M2: "selectable" and "the page", never "the file",
   * and removed first, then marked.
   */
  it("says the black box section's claim behind the self check's text part", () => {
    expect(HOME_TEXT.blackBox.eyebrow).toBe("Removed, not covered");
    expect(HOME_TEXT.blackBox.title).toBe("A black box is not redaction");
    expect(HOME_TEXT.blackBox.body).toContain(
      "RedactNest takes the selectable text you tick out of the page first, then marks where it was.",
    );
    expect(HOME_TEXT.blackBox.body).not.toMatch(/out of the file|from the file\b(?!:)/);
    expect(HOME_TEXT.blackBox.panels.map(({ reads }) => reads)).toEqual([
      "Contact: jane.doe@example.com",
      "Contact:",
    ]);
  });
});

describe("the cap line (AC-10)", () => {
  it("names both plans and both caps with billing on", () => {
    expect(capLine(true, 3, 50)).toBe(
      `${FREE_PLAN.name} up to 3 pages a document. ${PRO_PLAN.name} goes up to 50.`,
    );
    expect(capLine(true, 3, 50)).toBe(
      "Free up to 3 pages a document. Pro goes up to 50.",
    );
  });

  it("names the one cap and no plan with billing off", () => {
    expect(capLine(false, 5, 50)).toBe("Up to 5 pages a document.");
  });

  it("takes every figure from its arguments, never a literal", () => {
    expect(capLine(true, 7, 90)).toBe(
      "Free up to 7 pages a document. Pro goes up to 90.",
    );
  });
});

describe("what the home page says is stripped (AC-11)", () => {
  it("decides every kind, so a new one fails the compile until someone does", () => {
    expect(Object.keys(HOME_STRIPPED).sort()).toEqual([...SANITIZED_KINDS].sort());
  });

  it("never claims the four kinds that are flattened, refused or a loss", () => {
    for (const kind of [
      "annotations",
      "form-fields",
      "hidden-layers",
      "accessibility-tags",
    ] as const) {
      expect(HOME_STRIPPED[kind]).toBe(false);
    }
  });

  /**
   * Spec 0025, AC-11, as it amends spec 0019's AC-12: a picture RedactNest
   * leaves as stored (written inline, under a chain of filters, or any other
   * it does not take apart) keeps its own XMP and details, so "whenever a file
   * carries them" would hold for neither, and the card claims neither.
   */
  it("claims neither XMP metadata nor picture details while a picture left as stored can carry them", () => {
    expect(HOME_STRIPPED["xmp-metadata"]).toBe(false);
    expect(HOME_STRIPPED["picture-details"]).toBe(false);
    expect(strippedItems()).not.toContain("XMP metadata");
    expect(strippedItems().join(" ").toLowerCase()).not.toContain("picture details");
  });

  it("claims the rest, in SANITIZED_KINDS order, each capitalised", () => {
    expect(strippedItems()).toEqual([
      "Document info",
      "Attachments",
      "Bookmarks",
      "JavaScript",
      "Earlier versions",
      "Page thumbnails",
    ]);
  });

  it("says each kind in the result card's own words", () => {
    const claimed = SANITIZED_KINDS.filter((kind) => HOME_STRIPPED[kind]);

    expect(strippedItems().map((item) => item.toLowerCase())).toEqual(
      claimed.map((kind) => SANITIZED_TEXT[kind].toLowerCase()),
    );
    expect(Object.isFrozen(strippedItems())).toBe(true);
  });
});

describe("the finds and strips cards (AC-11)", () => {
  it("lists one item per detector, with the checklist's own icon and name", () => {
    expect(findsItems().map(({ icon, label }) => [icon.displayName, label])).toEqual([
      ["Mail", "Email addresses"],
      ["Phone", "Phone numbers"],
      ["Calendar", "Dates"],
      ["CreditCard", "Card numbers"],
      ["Landmark", "Bank account numbers (IBAN)"],
      ["IdCard", "US Social Security numbers"],
      ["IdCard", "UK National Insurance numbers"],
    ]);
    expect(findsItems()).toEqual(
      DETECTOR_KINDS.map((kind) => ({
        icon: DETECTOR_LABELS[kind].icon,
        label: DETECTOR_LABELS[kind].label,
      })),
    );
    expect(Object.isFrozen(findsItems())).toBe(true);
  });

  /**
   * After task 32: each card's subtitle, and "Whenever a file carries them:" is
   * Strips' own. Spec 0019, AC-12, as built: "looks for" in the heading and the
   * first card's title, and a closing line that reaches no further than the
   * self check's text part, selectable characters wholly inside a page's
   * visible area (a scan's ink beside a ticked item can be blanked with it).
   */
  it("holds the words around the two lists", () => {
    expect(HOME_TEXT.band).toEqual({
      title: "What RedactNest looks for and strips",
      finds: {
        title: "Looks for",
        subtitle: "Sensitive details we can detect in your files.",
        line: "No selectable text wholly inside a page's visible area is removed unless you tick it.",
      },
      strips: {
        title: "Strips",
        subtitle: "Whenever a file carries them:",
        note: "Comments and form fields are flattened into the page: what showed stays, and the comments and fields themselves are removed, with a note's hidden text and any attached file.",
      },
    });
    expect(HOME_TEXT.band.strips).not.toHaveProperty("lead");
  });

  /**
   * Spec 0019, AC-12: lines that claimed more than a gate holds stay gone.
   * "Finds" as a heading claims every value is found; "Nothing is removed
   * until you tick it" reached hidden data and the trim, which need no tick;
   * "on the page" reached a character crossing the visible edge; and
   * "hidden data such as" read as all hidden data.
   */
  it("keeps the words that claimed more than their gates off the page", () => {
    // The page's words only: code names such as `band.finds` stay (AC-12).
    const strings = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value !== null
          ? Object.values(value).flatMap(strings)
          : [];
    const words = strings(HOME_TEXT).join("\n");

    expect(words).toContain("Looks for");
    expect(words).not.toMatch(/\bfinds\b/i);
    expect(words).not.toContain("Nothing is removed until you tick it");
    expect(words).not.toContain("No text on the page");
    expect(words).not.toContain("hidden data such as");
    expect(words).not.toContain("nothing hidden behind them");
  });
});

describe("the pictures' words (AC-5, AC-12)", () => {
  it("describes the product shot", () => {
    expect(HOME_TEXT.shotAlt).toBe(
      "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them.",
    );
  });

  it("describes the social card without naming a detector", () => {
    expect(HOME_TEXT.socialAlt).toBe(
      `RedactNest. ${HOME_TEXT.eyebrow} ${HOME_TEXT.headline}.`,
    );
    expect(HOME_TEXT.socialAlt).not.toMatch(/email|phone/i);
  });
});

describe("AC-30: each thing said once", () => {
  /**
   * The document's privacy is "in your browser" in the eyebrow alone, and the
   * social card's alt text, which describes that eyebrow. Every other word on
   * the page says it another way, once, or not at all.
   */
  it("says browser only in the eyebrow and the social card's alt text", () => {
    // The site line is the head's description, outside the main content this
    // rule counts (spec 0024, AC-11), as the social card's alt text is.
    const { eyebrow, socialAlt } = HOME_TEXT;
    const rest = Object.entries(HOME_TEXT).filter(
      ([key]) => !["eyebrow", "socialAlt", "siteLine"].includes(key),
    );

    expect(eyebrow).toMatch(/browser/);
    expect(socialAlt).toMatch(/browser/);
    expect(JSON.stringify(rest)).not.toMatch(/browser/i);
    for (const item of [...strippedItems(), ...findsItems().map(({ label }) => label)]) {
      expect(item).not.toMatch(/browser/i);
    }
  });

  /**
   * Spec 0026, AC-8: each of the trio's claims lands in exactly one place,
   * "never uploaded" in the eyebrow chip, "removed, not covered" in the black
   * box section's eyebrow and "checked before you download" in the third
   * step card. The site line is the head's and the social card's alt text
   * describes the eyebrow, both outside the main content (spec 0024, AC-11).
   */
  const MAIN = JSON.stringify(
    Object.entries(HOME_TEXT).filter(([key]) => !["siteLine", "socialAlt"].includes(key)),
  );

  it("says never uploaded only in the eyebrow chip", () => {
    expect(HOME_TEXT.eyebrow).toMatch(/never uploaded/i);
    expect(MAIN.match(/uploaded/gi)).toHaveLength(1);
  });

  it("says removed, not covered only in the black box section's eyebrow", () => {
    expect(HOME_TEXT.blackBox.eyebrow).toBe("Removed, not covered");
    expect(MAIN.match(/not covered/gi)).toHaveLength(1);
  });

  it("says checked before you download only in the third step card", () => {
    expect(HOME_TEXT.steps.items[2]?.body).toMatch(/^Checked before you download/);
    expect(MAIN.match(/checked before you download/gi)).toHaveLength(1);
  });
});

describe("INV-1: nothing the product does not have today", () => {
  it("names no team, customer, testimonial or history anywhere", () => {
    const words = JSON.stringify(HOME_TEXT);
    expect(words).not.toMatch(/\b(teams?|customers?|trusted|testimonials?|history)\b/i);
  });
});
