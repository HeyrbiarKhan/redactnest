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
    expect(HOME_TEXT.eyebrow).toBe("PDF redaction in your browser");
    expect(HOME_TEXT.headline).toBe("Redaction that actually removes the text");
    expect(HOME_TEXT.primary).toBe("Remove text from a PDF");
    expect(HOME_TEXT.pricing).toBe("See pricing");
  });

  it("names exactly the detectors that exist, in the lead", () => {
    expect(HOME_TEXT.lead).toBe(
      `RedactNest finds ${lookedFor("conjunction")} in your PDF, lets you tick what to remove, and takes that text out of the file itself.`,
    );
    expect(HOME_TEXT.lead).toContain("email addresses and phone numbers");
  });

  it("gives the trio its three icons, titles and lines, in order", () => {
    expect(
      HOME_TEXT.features.map(({ icon, title, body }) => [icon.displayName, title, body]),
    ).toEqual([
      [
        "Laptop",
        "Stays on your device",
        "Never uploaded to us or to anyone else, and nothing is stored.",
      ],
      [
        "Eraser",
        "Removed, not covered",
        "Ticked text is taken out of the page, and hidden data such as metadata and attachments is stripped.",
      ],
      [
        "ShieldCheck",
        "Checked before you download",
        "Every page of the new file is checked. If RedactNest can't vouch for it, you get no file.",
      ],
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

  it("claims the rest, in SANITIZED_KINDS order, each capitalised", () => {
    expect(strippedItems()).toEqual([
      "Document info",
      "XMP metadata",
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
    ]);
    expect(findsItems()).toEqual(
      DETECTOR_KINDS.map((kind) => ({
        icon: DETECTOR_LABELS[kind].icon,
        label: DETECTOR_LABELS[kind].label,
      })),
    );
    expect(Object.isFrozen(findsItems())).toBe(true);
  });

  /** After task 32: each card's subtitle, and "Whenever a file carries them:" is Strips' own. */
  it("holds the words around the two lists", () => {
    expect(HOME_TEXT.band).toEqual({
      title: "What RedactNest finds and strips",
      finds: {
        title: "Finds",
        subtitle: "Sensitive details we can detect in your files.",
        line: "Nothing is removed until you tick it.",
      },
      strips: {
        title: "Strips",
        subtitle: "Whenever a file carries them:",
        note: "Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does.",
      },
    });
    expect(HOME_TEXT.band.strips).not.toHaveProperty("lead");
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
      `RedactNest. ${HOME_TEXT.eyebrow}. ${HOME_TEXT.headline}.`,
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
    const { eyebrow, socialAlt, ...rest } = HOME_TEXT;

    expect(eyebrow).toMatch(/browser/);
    expect(socialAlt).toMatch(/browser/);
    expect(JSON.stringify(rest)).not.toMatch(/browser/i);
    for (const item of [...strippedItems(), ...findsItems().map(({ label }) => label)]) {
      expect(item).not.toMatch(/browser/i);
    }
  });

  it("says never uploaded only in the first trio card", () => {
    const [first] = HOME_TEXT.features;

    expect(first?.body).toMatch(/never uploaded/i);
    expect(JSON.stringify(HOME_TEXT).match(/uploaded/gi)).toHaveLength(1);
  });
});

describe("INV-1: nothing the product does not have today", () => {
  it("names no team, customer, testimonial or history anywhere", () => {
    const words = JSON.stringify(HOME_TEXT);
    expect(words).not.toMatch(/\b(teams?|customers?|trusted|testimonials?|history)\b/i);
  });
});
