import { describe, expect, it } from "vitest";

import { lookedFor } from "@/lib/detectors";
import { SANITIZED_TEXT } from "@/lib/flow-text";
import { capLine, HOME_STRIPPED, HOME_TEXT, strippedList } from "@/lib/home-text";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { SANITIZED_KINDS } from "@/worker/protocol";

/**
 * The home page's words. Spec 0013, AC-10 to AC-13 and INV-1: every word true
 * of the product today, with the detectors, the stripped kinds, the caps and
 * the plan names read from where the product holds them.
 */

describe("the hero (AC-10)", () => {
  it("says what the spec settled, word for word", () => {
    expect(HOME_TEXT.eyebrow).toBe("PDF redaction in your browser");
    expect(HOME_TEXT.headline).toBe("Redaction that actually removes the text");
    expect(HOME_TEXT.redact).toBe("Redact a PDF");
    expect(HOME_TEXT.pricing).toBe("See pricing");
  });

  it("names exactly the detectors that exist, in the lead", () => {
    expect(HOME_TEXT.lead).toBe(
      `RedactNest finds ${lookedFor("conjunction")} in your PDF, lets you tick what to remove, and takes that text out of the file itself. Your file never leaves your browser.`,
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
        "Opened and redacted in your browser. Never uploaded, and nothing is stored.",
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

  it("claims the rest, in SANITIZED_KINDS order, in the result card's words", () => {
    expect(strippedList()).toBe(
      "Document info, XMP metadata, attachments, bookmarks, JavaScript, earlier versions and page thumbnails",
    );
    const claimed = SANITIZED_KINDS.filter((kind) => HOME_STRIPPED[kind]);
    let from = 0;
    for (const kind of claimed) {
      const at = strippedList()
        .toLowerCase()
        .indexOf(SANITIZED_TEXT[kind].toLowerCase(), from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at;
    }
  });
});

describe("the band (AC-11)", () => {
  it("names what RedactNest finds, and that nothing goes until it is ticked", () => {
    expect(HOME_TEXT.band.title).toBe("What RedactNest finds and strips");
    expect(HOME_TEXT.band.findsTitle).toBe("Finds");
    expect(HOME_TEXT.band.finds).toBe(
      "Email addresses and phone numbers. Nothing is removed until you tick it.",
    );
  });

  it("names what it strips, and says plainly what is flattened", () => {
    expect(HOME_TEXT.band.stripsTitle).toBe("Strips");
    expect(HOME_TEXT.band.strips).toBe(
      `${strippedList()}, whenever a file carries them. Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does.`,
    );
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

describe("INV-1: nothing the product does not have today", () => {
  it("names no team, customer, testimonial or history anywhere", () => {
    const words = JSON.stringify(HOME_TEXT);
    expect(words).not.toMatch(/\b(teams?|customers?|trusted|testimonials?|history)\b/i);
  });
});
