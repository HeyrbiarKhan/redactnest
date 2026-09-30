import { describe, expect, it } from "vitest";

import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
} from "@/lib/detectors";
import {
  DOWNLOADED_LINE,
  FAILURE_TEXT,
  failureText,
  isTickCaused,
  leftLine,
  LOST_TEXT,
  PHASE_TEXT,
  phaseLine,
  redactLabel,
  removedLine,
  RESULT_TERMS,
  resultTitle,
  RUN_REFUSAL_LEAD,
  SANITIZED_TEXT,
  strippedLine,
  tickCountLine,
} from "@/lib/flow-text";
import {
  ADVICE,
  ALL_CLEAR,
  CONCEALED_TEXT,
  CROOKED_LINE,
  DOWNLOAD_WARNING_TITLE,
  findingLine,
  OPEN_WARNING_TITLE,
  PARTLY_REASON,
  removedOffPageLine,
} from "@/lib/page-findings";
import {
  ENGINE_ERROR_KINDS,
  PAGE_FINDINGS,
  PROGRESS_PHASES,
  SANITIZED_KINDS,
  type DocumentSummary,
  type EntitlementSnapshot,
  type PageFinding,
  type ResultCounts,
} from "@/worker/protocol";

/**
 * Every word the redact flow shows. Spec 0007, AC-4, AC-6, AC-11 to AC-13 and
 * AC-16 to AC-18.
 *
 * The records are typed over the protocol's closed sets, so a kind without
 * words fails the compile; these prove each has words worth showing, and that
 * the words keep the obligations earlier specs set.
 */

const FREE: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
});
const PAID: EntitlementSnapshot = Object.freeze({
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 104_857_600,
});

/** Every failure's words, for both tiers. */
const EVERY_FAILURE = ENGINE_ERROR_KINDS.flatMap((kind) =>
  [FREE, PAID].map((entitlement) => ({ kind, text: failureText(kind, entitlement) })),
);

function counts(overrides: Partial<ResultCounts> = {}): ResultCounts {
  return {
    removedByType: {},
    untickedByType: {},
    blockedByType: {},
    blockedByReason: {},
    removedTotal: 0,
    sanitized: [],
    ...overrides,
  };
}

describe("failure copy (AC-16, AC-17)", () => {
  it("gives every kind a title, a body and a next step, on either tier", () => {
    expect(Object.keys(FAILURE_TEXT).sort()).toEqual([...ENGINE_ERROR_KINDS].sort());
    for (const { kind, text } of EVERY_FAILURE) {
      expect(text.title, kind).not.toBe("");
      expect(text.body, kind).not.toBe("");
      expect(text.next, kind).not.toBe("");
      // Each part ends as a sentence would, or is a title, and none trails off.
      expect(text.body, kind).toMatch(/[.)]$/);
      expect(text.next, kind).toMatch(/[.)]$/);
      expect(`${text.title}${text.body}${text.next}`, kind).not.toContain("…");
    }
  });

  /** INV-3: from the kind and the frozen caps alone. */
  it("carries no number but the job's own caps", () => {
    for (const { kind, text } of EVERY_FAILURE) {
      const numbers = `${text.title} ${text.body} ${text.next}`.match(/\d+/g) ?? [];
      for (const number of numbers) {
        expect(["3", "50", "25", "100"], `${kind}: ${number}`).toContain(number);
      }
    }
  });

  it("names the page cap and suggests splitting, in the free and the paid form", () => {
    expect(failureText("too-many-pages", FREE)).toEqual({
      title: "This PDF has more than 3 pages",
      body: "The free limit is 3 pages.",
      next: "Split it into parts of 3 pages or fewer in your PDF app, and redact each one.",
    });
    expect(failureText("too-many-pages", PAID)).toEqual({
      title: "This PDF has more than 50 pages",
      body: "RedactNest handles up to 50 pages.",
      next: "Split it into parts of 50 pages or fewer in your PDF app, and redact each one.",
    });
  });

  it("names the size cap in whole megabytes, and never 0 MB", () => {
    expect(failureText("too-large", FREE).body).toBe(
      "RedactNest takes files up to 25 MB.",
    );
    expect(failureText("too-large", PAID).body).toBe(
      "RedactNest takes files up to 100 MB.",
    );
    expect(failureText("too-large", { ...FREE, maxFileBytes: 1_000 }).body).toBe(
      "RedactNest takes files up to 1 MB.",
    );
  });

  it("explains how to save an unlocked copy, and never asks for a password", () => {
    for (const kind of ["encrypted", "password-required"] as const) {
      const text = failureText(kind, FREE);
      expect(text.next).toMatch(/save a copy without/);
      expect(`${text.body} ${text.next}`).not.toMatch(/enter (your|the) password/i);
    }
  });

  it("names a stamp or a picture as the likely cause of an overreach", () => {
    const { body } = failureText("redaction-overreach", FREE);
    expect(body).toContain("a stamp such as CONFIDENTIAL or DRAFT");
    expect(body).toContain("a picture under the item");
  });

  it("names the accent, the footnote marker and unrewritable lines for an incomplete check", () => {
    const { body } = failureText("redaction-incomplete", FREE);
    expect(body).toContain("an accent drawn as its own mark");
    expect(body).toContain("a small footnote marker straight after a ticked item");
    expect(body).toContain("lines this file writes in a way RedactNest can't rewrite");
    // True when nothing ticked survived: it blames the check, not a tick.
    expect(body).toContain("didn't match what it expected");
  });

  it("suggests straightening a scan before text recognition for slanted text", () => {
    expect(failureText("slanted-text", FREE).next).toContain(
      "straightening it before text recognition",
    );
  });

  it("allows for unrewritable lines and for content near a page's edge when it stopped to be safe", () => {
    const { body } = failureText("unsupported", FREE);
    expect(body).toContain("lines of text written in a way RedactNest can't rewrite");
    expect(body).toContain("content near a page's edge it couldn't prove it removed");
  });

  it("says every refusal of a run made no file (INV-5)", () => {
    for (const kind of [
      "redaction-overreach",
      "replacement-text",
      "slanted-text",
      "redaction-incomplete",
      "unsupported",
      "edge-text",
      "no-readable-text",
    ] as const) {
      expect(failureText(kind, FREE).body, kind).toMatch(/made no file|no file was made/);
    }
  });

  it("offers no button for exactly the four kinds a tick can cause (AC-14)", () => {
    expect(ENGINE_ERROR_KINDS.filter(isTickCaused).sort()).toEqual(
      [
        "redaction-incomplete",
        "redaction-overreach",
        "replacement-text",
        "slanted-text",
      ].sort(),
    );
  });

  it("gives a lost worker its own words, never the engine load failure's (AC-16)", () => {
    expect(LOST_TEXT.title).toBe("The PDF engine stopped");
    expect(LOST_TEXT.title).not.toBe(failureText("engine-unavailable", FREE).title);
    expect(LOST_TEXT.body).toContain("without choosing it a second time");
    expect(RUN_REFUSAL_LEAD).toBe("Your last run was stopped");
  });
});

/** AC-18. Text recognition may help; nothing promises it does. */
describe("text recognition is never promised (AC-18)", () => {
  const everyLine = [
    ...EVERY_FAILURE.flatMap(({ text }) => [text.title, text.body, text.next]),
    ADVICE,
  ];

  it("never says OCR will clear anything, or fixes anything", () => {
    for (const line of everyLine) {
      expect(line).not.toMatch(/OCR will|text recognition will|fixes/i);
    }
  });

  it("says it may help, in the advice and for a file with no readable text", () => {
    expect(ADVICE).toMatch(/\bmay\b/);
    expect(ADVICE).not.toContain("If you have the original");
    expect(failureText("no-readable-text", FREE).next).toMatch(/\bmay\b/);
  });

  /**
   * "No line anywhere": the page findings, the checklist's notes and the
   * result card too, not only the failures. `CROOKED_LINE` and the
   * `slanted-text` step credit straightening a scan *before* text
   * recognition, so they send nobody to it as the cure and are not held to
   * "may".
   */
  describe("across every line the page can show", () => {
    function summaryOf(...pages: (readonly PageFinding[])[]): DocumentSummary {
      return {
        pageCount: pages.length,
        pages: pages.map((findings) => ({ findings })),
      } as DocumentSummary;
    }

    const shown = [
      ...everyLine,
      LOST_TEXT.title,
      LOST_TEXT.body,
      ...Object.values(PHASE_TEXT),
      ...PAGE_FINDINGS.flatMap((finding) => [
        findingLine(summaryOf([finding]), finding),
        findingLine(summaryOf([finding], [finding]), finding),
      ]),
      removedOffPageLine(summaryOf(["off-page-content"])),
      CROOKED_LINE,
      ALL_CLEAR,
      OPEN_WARNING_TITLE,
      DOWNLOAD_WARNING_TITLE,
      PARTLY_REASON,
      ...Object.values(CONCEALED_TEXT),
      ...Object.values(BLOCKED_REASON_TEXT),
      COVERAGE_NOTE,
      COVERAGE_NOTE_PARTLY,
      NOTHING_FOUND.title,
      NOTHING_FOUND.helper,
      NOTHING_FOUND_PARTLY.helper,
      ...Object.values(RESULT_TERMS),
      ...Object.values(SANITIZED_TEXT),
      DOWNLOADED_LINE,
    ].filter((line): line is string => line !== null);

    /** A line that sends the visitor to text recognition as what to do next. */
    const sendsToOcr = shown.filter((line) =>
      /\b(run|running)\b[^.]*\bthrough text recognition\b/i.test(line),
    );

    it("never says text recognition will help, clears a warning or makes a file readable", () => {
      for (const line of shown) {
        expect(line).not.toMatch(/\b(OCR|text recognition)\)? will\b/i);
        expect(line).not.toMatch(/\bwill (let|help|make) RedactNest\b/i);
        expect(line).not.toMatch(/\bclears? (the|this|that|a|any|every) warning/i);
        expect(line).not.toMatch(
          /\bmakes? (it|the file|this file|them|those pages) readable/i,
        );
      }
    });

    it("says may wherever it sends somebody to text recognition", () => {
      // The advice and the no readable text step, at least, so this can fail.
      expect(sendsToOcr).toEqual(
        expect.arrayContaining([ADVICE, failureText("no-readable-text", FREE).next]),
      );
      for (const line of sendsToOcr) expect(line).toMatch(/\bmay\b/);
    });
  });
});

describe("phase copy (AC-4)", () => {
  it("gives every phase words, with no ellipsis of its own", () => {
    expect(Object.keys(PHASE_TEXT).sort()).toEqual([...PROGRESS_PHASES].sort());
    for (const phase of PROGRESS_PHASES) {
      expect(PHASE_TEXT[phase], phase).not.toBe("");
      expect(PHASE_TEXT[phase], phase).not.toContain("…");
    }
  });

  it("names what detection looks for, as the coverage note does", () => {
    expect(PHASE_TEXT.detecting).toBe("Looking for email addresses and phone numbers");
  });

  it("says a run with nothing ticked only strips hidden content", () => {
    expect(phaseLine("redacting", 0)).toBe("Stripping hidden content");
    expect(phaseLine("redacting", 3)).toBe("Removing what you ticked");
    expect(phaseLine("writing", 0)).toBe("Writing your clean file");
    expect(phaseLine("verifying", 2)).toBe("Checking every page of your clean file");
  });
});

describe("the action panel (AC-6)", () => {
  it.each([
    [2, 3, 4, "2 of 3 found items will be removed."],
    [1, 3, 3, "1 of 3 found items will be removed."],
    [1, 1, 1, "1 of 1 found item will be removed."],
    [0, 3, 3, "Nothing is ticked, so nothing will be removed."],
    [0, 0, 2, "None of the found items can be removed."],
  ])("counts %i ticked of %i tickable and %i found", (ticked, tickable, found, line) => {
    expect(tickCountLine(ticked, tickable, found)).toBe(line);
  });

  it("leaves the line out when nothing was found", () => {
    expect(tickCountLine(0, 0, 0)).toBeNull();
  });

  it("labels the action by what it will make", () => {
    expect(redactLabel(4)).toBe("Redact 4 items");
    expect(redactLabel(1)).toBe("Redact 1 item");
    expect(redactLabel(0)).toBe("Make a cleaned copy");
  });
});

describe("the result card (AC-11, AC-12)", () => {
  it("never titles a run that removed nothing as a redaction (INV-2)", () => {
    expect(resultTitle(counts({ removedTotal: 0 }))).toBe("Nothing was removed");
    expect(resultTitle(counts({ removedTotal: 2 }))).toBe("Your redacted file is ready");
  });

  it("lists what was removed by kind, in DETECTOR_KINDS order", () => {
    expect(removedLine(counts({ removedByType: { phone: 2, email: 4 } }))).toBe(
      "4 email addresses and 2 phone numbers",
    );
    expect(removedLine(counts({ removedByType: { email: 1 } }))).toBe("1 email address");
    expect(removedLine(counts())).toBe("Nothing");
  });

  it("says what is left in the file in up to two sentences", () => {
    expect(
      leftLine(
        counts({ untickedByType: { phone: 2 }, blockedByType: { email: 1, phone: 1 } }),
      ),
    ).toBe(
      "2 phone numbers you left unticked. 1 email address and 1 phone number RedactNest couldn't remove.",
    );
    expect(leftLine(counts({ untickedByType: { email: 3 } }))).toBe(
      "3 email addresses you left unticked.",
    );
    expect(leftLine(counts({ blockedByType: { email: 1 } }))).toBe(
      "1 email address RedactNest couldn't remove.",
    );
    expect(leftLine(counts())).toBe("Nothing RedactNest found.");
  });

  it("lists what was stripped in the order the run reported, capitalised", () => {
    expect(strippedLine(["document-info", "xmp-metadata", "annotations"])).toBe(
      "Document info, XMP metadata and annotations",
    );
    expect(strippedLine(["javascript"])).toBe("JavaScript");
    expect(strippedLine([])).toBe("Nothing else needed stripping.");
  });

  it("names every stripped kind, and says the tags as a loss", () => {
    expect(Object.keys(SANITIZED_TEXT).sort()).toEqual([...SANITIZED_KINDS].sort());
    for (const kind of SANITIZED_KINDS) expect(SANITIZED_TEXT[kind], kind).not.toBe("");
    expect(SANITIZED_TEXT["accessibility-tags"]).toBe(
      "accessibility tags (screen readers will read the clean file less well)",
    );
  });

  it("says the browser has the file once it is handed over (AC-13)", () => {
    expect(DOWNLOADED_LINE).toBe("Your browser has the file.");
  });
});
