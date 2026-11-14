import { describe, expect, it, vi } from "vitest";

import {
  addTerms,
  focusAfterRemoving,
  linesOf,
  removeTerms,
  type CustomTerm,
} from "@/lib/terms";
import { asTermId, type TermId } from "@/worker/protocol";

/**
 * The tab's list of custom terms, as pure operations. Spec 0017, AC-3 to
 * AC-5 and INV-11. The panel's wiring is proved in
 * `tests/component/terms-flow.test.tsx`; these are the rules it leans on, so
 * a paste of any shape is held line by line here.
 */

const CAPS = { maxTerms: 3, maxTermChars: 10 };

/** Ids in mint order, so a test can say which line got which id. */
function minter(): () => TermId {
  let next = 0;
  return () => asTermId(`t${(next += 1)}`);
}

const term = (id: string, text: string): CustomTerm =>
  Object.freeze({ id: asTermId(id), text });

const ACME = term("acme", "Acme Ltd");
const JANE = term("jane", "Jane Doe");
const ZED = term("zed", "Zed Corp");

describe("linesOf (AC-3)", () => {
  it("ends a line at every line break a clipboard may carry", () => {
    expect(linesOf("a\nb\r\nc\rd e f")).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("reads a Windows line break as one break, never two", () => {
    expect(linesOf("Acme\r\nJane")).toEqual(["Acme", "Jane"]);
  });

  it("keeps empty lines, so addTerms can pass over them", () => {
    expect(linesOf("Acme\n\nJane\n")).toEqual(["Acme", "", "Jane", ""]);
  });

  it("gives the whole text as one line when it holds no break", () => {
    expect(linesOf("Acme Ltd")).toEqual(["Acme Ltd"]);
  });
});

describe("addTerms (AC-3, AC-4)", () => {
  it("adds each line in order at the end of the list, prepared", () => {
    const result = addTerms([ACME], ["  Jane \t Doe ", "Zed   Corp"], CAPS, minter());

    expect(result.added).toEqual([
      { id: "t1", text: "Jane Doe" },
      { id: "t2", text: "Zed Corp" },
    ]);
    expect(result.list).toEqual([ACME, ...result.added]);
    expect(result.refused).toEqual([]);
  });

  it("passes over an empty or blank line and never names it", () => {
    const mint = vi.fn(minter());
    const result = addTerms([], ["", "   ", "\t", "Acme"], CAPS, mint);

    expect(result.added.map(({ text }) => text)).toEqual(["Acme"]);
    expect(result.refused).toEqual([]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("names every refused line with its reason, in the order pasted (INV-11)", () => {
    const result = addTerms(
      [],
      ["a", "Acme", "x".repeat(11), "--", "ACME"],
      CAPS,
      minter(),
    );

    expect(result.added.map(({ text }) => text)).toEqual(["Acme"]);
    expect(result.refused.map(({ text, reason }) => [text, reason])).toEqual([
      ["a", "too-short"],
      ["x".repeat(11), "too-long"],
      ["--", "no-letter-or-digit"],
      ["ACME", "duplicate"],
    ]);
  });

  it("names the listed term a duplicate repeats, so its refusal can go with it (AC-4, as fixed)", () => {
    const result = addTerms([ACME, JANE], ["JANE DOE"], CAPS, minter());

    expect(result.refused).toEqual([
      { text: "JANE DOE", reason: "duplicate", duplicates: JANE.id },
    ]);
  });

  it("names the term the same paste just added when a paste repeats itself", () => {
    const result = addTerms([], ["José", "JOSE"], CAPS, minter());

    expect(result.added).toEqual([{ id: "t1", text: "José" }]);
    expect(result.refused).toEqual([
      { text: "JOSE", reason: "duplicate", duplicates: asTermId("t1") },
    ]);
  });

  it("names nothing it repeats for a refusal that is not a duplicate", () => {
    const result = addTerms([ACME], ["a", "x".repeat(11)], CAPS, minter());

    expect(result.refused.map(({ duplicates }) => duplicates)).toEqual([null, null]);
  });

  it("adds until the list is full, then refuses every further line as list full", () => {
    const result = addTerms([ACME], ["Jane", "Zed", "Kim", "Lee"], CAPS, minter());

    expect(result.list.map(({ text }) => text)).toEqual(["Acme Ltd", "Jane", "Zed"]);
    expect(result.refused.map(({ text, reason }) => [text, reason])).toEqual([
      ["Kim", "list-full"],
      ["Lee", "list-full"],
    ]);
  });

  it("still gives a full list's other reasons first, in TERM_REFUSALS order", () => {
    const result = addTerms([ACME, JANE, ZED], ["a", "acme ltd", "Kim"], CAPS, minter());

    expect(result.refused.map(({ reason }) => reason)).toEqual([
      "too-short",
      "duplicate",
      "list-full",
    ]);
  });

  it("never cuts an added term short, so a term at the length cap is kept whole", () => {
    const longest = "y".repeat(CAPS.maxTermChars);
    const result = addTerms([], [longest], CAPS, minter());

    expect(result.added).toEqual([{ id: "t1", text: longest }]);
  });

  it("mints an id for each added term and none for a refused one", () => {
    const mint = vi.fn(minter());
    addTerms([ACME], ["Jane", "a", "ACME LTD", "Zed"], CAPS, mint);

    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("leaves the list it was given as it was, and hands back frozen values", () => {
    const list = Object.freeze([ACME]);
    const result = addTerms(list, ["Jane", "a"], CAPS, minter());

    expect(list).toEqual([ACME]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.list)).toBe(true);
    expect(Object.isFrozen(result.added)).toBe(true);
    expect(Object.isFrozen(result.added[0])).toBe(true);
    expect(Object.isFrozen(result.refused)).toBe(true);
    expect(Object.isFrozen(result.refused[0])).toBe(true);
  });
});

describe("removeTerms (AC-5)", () => {
  it("takes the named terms out and keeps the rest in order", () => {
    expect(removeTerms([ACME, JANE, ZED], [JANE.id])).toEqual([ACME, ZED]);
    expect(removeTerms([ACME, JANE, ZED], [ACME.id, ZED.id])).toEqual([JANE]);
  });

  it("empties the list for Remove all", () => {
    expect(removeTerms([ACME, JANE], [ACME.id, JANE.id])).toEqual([]);
  });

  it("changes nothing for an id the list does not hold", () => {
    expect(removeTerms([ACME], [asTermId("gone")])).toEqual([ACME]);
  });

  it("hands back a frozen list", () => {
    expect(Object.isFrozen(removeTerms([ACME, JANE], [JANE.id]))).toBe(true);
  });
});

describe("focusAfterRemoving (AC-5)", () => {
  it("moves to the next term's remove button", () => {
    expect(focusAfterRemoving([ACME, JANE, ZED], JANE.id)).toBe(ZED.id);
    expect(focusAfterRemoving([ACME, JANE, ZED], ACME.id)).toBe(JANE.id);
  });

  it("moves to the previous one when the last term goes", () => {
    expect(focusAfterRemoving([ACME, JANE, ZED], ZED.id)).toBe(JANE.id);
  });

  it("moves to the field (null) when the only term goes", () => {
    expect(focusAfterRemoving([ACME], ACME.id)).toBeNull();
  });

  it("moves to the field (null) for a term the list no longer holds", () => {
    expect(focusAfterRemoving([ACME, JANE], asTermId("gone"))).toBeNull();
  });
});
