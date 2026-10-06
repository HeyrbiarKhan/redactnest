import { describe, expect, it } from "vitest";

import { PRIVACY_SECTIONS, sectionId, TERMS_SECTIONS } from "@/lib/policy-sections";

/** Each h2's id, from its key. Spec 0013, AC-25. */
describe("sectionId", () => {
  it("turns a key into its hyphenated id", () => {
    expect(sectionId("yourDocuments")).toBe("your-documents");
    expect(sectionId("checkingTheResult")).toBe("checking-the-result");
    expect(sectionId("payments")).toBe("payments");
  });

  it("gives every section on a page an id of its own", () => {
    for (const sections of [PRIVACY_SECTIONS, TERMS_SECTIONS]) {
      const ids = Object.keys(sections).map(sectionId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
