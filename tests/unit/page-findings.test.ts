import { describe, expect, it } from "vitest";

import {
  ADVICE,
  ALL_CLEAR,
  CONCEALED_TEXT,
  CROOKED_LINE,
  DOWNLOAD_WARNING_TITLE,
  FINDING_TONE,
  findingLine,
  isPartly,
  NOTE_FINDINGS,
  noteLines,
  OPEN_WARNING_TITLE,
  pageList,
  pagesWith,
  PARTLY_REASON,
  removedOffPageLine,
  showsAdvice,
  showsCrookedLine,
  WARNING_FINDINGS,
  warningLines,
} from "@/lib/page-findings";
import { PAGE_FINDINGS, type DocumentSummary, type PageFinding } from "@/worker/protocol";

/**
 * What the page readings mean in words. Spec 0006, *Page findings*, *Page
 * lists* and *Copy*, and INV-5: the name, the warnings and the qualifier all
 * come from these helpers over one summary.
 */

function summaryOf(...pages: readonly (readonly PageFinding[])[]): DocumentSummary {
  return { pageCount: pages.length, pages: pages.map((findings) => ({ findings })) };
}

describe("the tone of each finding", () => {
  it("makes the first seven warnings, then two notes, and blank quiet", () => {
    expect(WARNING_FINDINGS).toEqual([
      "covered-text",
      "hidden-text",
      "scanned",
      "drawn-only",
      "unreadable-text",
      "bare-picture",
      "off-page-picture",
    ]);
    expect(NOTE_FINDINGS).toEqual(["machine-read-text", "off-page-content"]);
    expect(FINDING_TONE.blank).toBe("quiet");
    expect(Object.keys(FINDING_TONE).sort()).toEqual([...PAGE_FINDINGS].sort());
  });
});

/** AC-23: the one predicate behind the name and the download warning. */
describe("partly redacted", () => {
  it.each(WARNING_FINDINGS)("is true when a page carries %s", (finding) => {
    expect(isPartly(summaryOf([], [finding]))).toBe(true);
  });

  it.each(["blank", "machine-read-text", "off-page-content"] as const)(
    "is never made true by %s",
    (finding) => {
      expect(isPartly(summaryOf([], [finding]))).toBe(false);
    },
  );

  it("is false for a document of typed pages", () => {
    expect(isPartly(summaryOf([], []))).toBe(false);
  });
});

describe("the pages carrying a finding", () => {
  it("are one based and ascending", () => {
    const summary = summaryOf(["scanned"], [], ["scanned", "bare-picture"], ["blank"]);
    expect(pagesWith(summary, "scanned")).toEqual([1, 3]);
    expect(pagesWith(summary, "bare-picture")).toEqual([3]);
    expect(pagesWith(summary, "covered-text")).toEqual([]);
  });
});

/** Spec 0006, *Page lists*: the examples it gives, and the pair rule. */
describe("page lists", () => {
  it.each([
    [[2], "Page 2"],
    [[2, 5], "Pages 2 and 5"],
    [[3, 4, 5, 6, 7, 8, 9], "Pages 3 to 9"],
    [[1, 3, 4, 5, 6, 7, 8, 9, 12], "Pages 1, 3 to 9 and 12"],
    [[2, 3], "Pages 2 and 3"],
    [[1, 2, 3], "Pages 1 to 3"],
    [[1, 2, 4, 5, 6], "Pages 1, 2 and 4 to 6"],
    [[9, 2, 2, 5], "Pages 2, 5 and 9"],
  ] as const)("reads %j as %s", (pages, words) => {
    expect(pageList(pages)).toBe(words);
  });

  it("lowers the first word when it follows another", () => {
    expect(pageList([4], { lower: true })).toBe("page 4");
    expect(pageList([1, 2], { lower: true })).toBe("pages 1 and 2");
  });
});

/** Spec 0006, *Copy*: each line's one page and many page forms. */
describe("the line for each finding", () => {
  it.each([
    [
      "covered-text",
      "Page 1 has text hidden under a box or shape drawn over it. It may look redacted, but the text is still in the file.",
      "Pages 1 and 2 have text hidden under a box or shape drawn over it. It may look redacted, but the text is still in the file.",
    ],
    [
      "hidden-text",
      "Page 1 has text you can't see, such as text the same colour as the page. It is still in the file.",
      "Pages 1 and 2 have text you can't see, such as text the same colour as the page. It is still in the file.",
    ],
    [
      "scanned",
      "Page 1 is a scanned image. Text in the image can't be found or removed.",
      "Pages 1 and 2 are scanned images. Text in the images can't be found or removed.",
    ],
    [
      "drawn-only",
      "Page 1 has no text RedactNest can read. Anything on it, such as words in a picture or drawn as shapes, can't be found or removed.",
      "Pages 1 and 2 have no text RedactNest can read. Anything on them, such as words in a picture or drawn as shapes, can't be found or removed.",
    ],
    [
      "unreadable-text",
      "Page 1 has text in a font RedactNest can't read, so that text can't be found or removed.",
      "Pages 1 and 2 have text in a font RedactNest can't read, so that text can't be found or removed.",
    ],
    [
      "bare-picture",
      "Page 1 has a picture with no text over it. Words inside a picture can't be found or removed.",
      "Pages 1 and 2 have pictures with no text over them. Words inside a picture can't be found or removed.",
    ],
    [
      "off-page-picture",
      "Page 1 has a picture that reaches outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file.",
      "Pages 1 and 2 have pictures that reach outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file.",
    ],
    [
      "machine-read-text",
      "Page 1 is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right.",
      "Pages 1 and 2 are scans with machine read text. RedactNest reads that text, so it can only find what the text recognition got right.",
    ],
    [
      "off-page-content",
      "Page 1 has text or drawings outside its visible area. RedactNest removes them when you redact, since nobody can see them.",
      "Pages 1 and 2 have text or drawings outside their visible area. RedactNest removes them when you redact, since nobody can see them.",
    ],
  ] as const)("words %s for one page and for several", (finding, one, many) => {
    expect(findingLine(summaryOf([finding], []), finding)).toBe(one);
    expect(findingLine(summaryOf([finding], [finding]), finding)).toBe(many);
  });

  it("has no line for blank, or for a finding no page carries", () => {
    expect(findingLine(summaryOf(["blank"]), "blank")).toBeNull();
    expect(findingLine(summaryOf([]), "scanned")).toBeNull();
  });
});

/** AC-20: one line per warning present, in order, a page named in each it carries. */
describe("the warning lines", () => {
  it("follow PAGE_FINDINGS order, and name a page carrying two warnings in both", () => {
    const summary = summaryOf(
      ["bare-picture"],
      ["scanned", "unreadable-text"],
      ["machine-read-text"],
      ["covered-text"],
    );

    expect(warningLines(summary)).toEqual([
      findingLine(summary, "covered-text"),
      findingLine(summary, "scanned"),
      findingLine(summary, "unreadable-text"),
      findingLine(summary, "bare-picture"),
    ]);
    expect(warningLines(summary)[1]).toMatch(/^Page 2 /);
    expect(warningLines(summary)[2]).toMatch(/^Page 2 /);
  });

  it("never holds a note", () => {
    expect(warningLines(summaryOf(["machine-read-text"], ["off-page-content"]))).toEqual(
      [],
    );
  });
});

describe("the advice line", () => {
  it.each(["scanned", "drawn-only", "unreadable-text", "bare-picture"] as const)(
    "follows %s, which text recognition can help with",
    (finding) => {
      expect(showsAdvice(summaryOf([finding]))).toBe(true);
    },
  );

  it.each([
    "covered-text",
    "hidden-text",
    "off-page-picture",
    "machine-read-text",
  ] as const)("does not follow %s alone", (finding) => {
    expect(showsAdvice(summaryOf([finding]))).toBe(false);
  });
});

describe("the fixed lines", () => {
  it("read as the spec writes them", () => {
    expect(ALL_CLEAR).toBe("RedactNest can read the text on every page.");
    expect(OPEN_WARNING_TITLE).toBe("Some pages can't be fully checked");
    expect(ADVICE).toBe(
      "If you have the original, run it through text recognition (OCR) first, then open the result here.",
    );
    expect(DOWNLOAD_WARNING_TITLE).toBe("Not every page was checked");
    expect(PARTLY_REASON).toBe("That is why the file's name ends in partly redacted.");
  });
});

/** AC-25: slanted on a machine read page, and never otherwise. */
describe("the crooked scan line", () => {
  const SCAN_AND_TYPED = summaryOf(["machine-read-text"], []);

  it("shows for a match blocked slanted-text on a machine read page", () => {
    expect(showsCrookedLine(SCAN_AND_TYPED, [{ page: 1, blocked: "slanted-text" }])).toBe(
      true,
    );
  });

  it.each([
    ["on a born digital page", [{ page: 2, blocked: "slanted-text" }]],
    [
      "for another block on a machine read page",
      [{ page: 1, blocked: "image-overreach" }],
    ],
    ["for an unblocked match on a machine read page", [{ page: 1, blocked: null }]],
    ["with no matches at all", []],
  ] as const)("does not show %s", (_label, matches) => {
    expect(showsCrookedLine(SCAN_AND_TYPED, matches)).toBe(false);
  });

  it("reads as the spec writes it", () => {
    expect(CROOKED_LINE).toBe(
      "Some items on scanned pages can't be removed because the scan is slightly crooked. Straightening the scan before text recognition (OCRmyPDF's --deskew option, for one) usually fixes this.",
    );
  });
});

/** AC-21: one line per note present, in order, the crooked line last. */
describe("the note lines", () => {
  it("follow PAGE_FINDINGS order, with the crooked scan line last", () => {
    const summary = summaryOf(["off-page-content"], ["machine-read-text"], ["scanned"]);

    expect(noteLines(summary, [{ page: 2, blocked: "slanted-text" }])).toEqual([
      findingLine(summary, "machine-read-text"),
      findingLine(summary, "off-page-content"),
      CROOKED_LINE,
    ]);
  });

  it("never holds a warning, and are empty when there is nothing to note", () => {
    expect(noteLines(summaryOf(["scanned"], ["blank"]), [])).toEqual([]);
  });
});

/** AC-24. A concealed row's line, one per concealment. */
describe("the concealed row lines", () => {
  it("read as the spec writes them", () => {
    expect(CONCEALED_TEXT).toEqual({
      covered: "Hidden under a box on the page.",
      hidden: "Not visible on the page.",
    });
  });
});

/** AC-22: what the trim removed, named at complete. */
describe("the removed off page line", () => {
  it("names the pages the trim removed text or drawings from", () => {
    expect(
      removedOffPageLine(summaryOf(["off-page-content"], [], ["off-page-content"])),
    ).toBe("Text and drawings outside the visible area of pages 1 and 3 were removed.");
    expect(removedOffPageLine(summaryOf([], ["off-page-content"]))).toBe(
      "Text and drawings outside the visible area of page 2 were removed.",
    );
  });

  it("is absent when the trim removed nothing, a picture outside included", () => {
    expect(removedOffPageLine(summaryOf(["off-page-picture"], []))).toBeNull();
  });
});
