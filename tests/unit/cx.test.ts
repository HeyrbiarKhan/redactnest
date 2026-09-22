import { describe, expect, it } from "vitest";

import { cx } from "@/lib/cx";

/**
 * Every primitive in `src/ui` builds its class list through this. Spec 0003
 * chose a plain join over a merging library, so what is pinned here is exactly
 * that: switched off parts vanish, and nothing is reordered, merged or deduped.
 */
describe("cx", () => {
  it("joins class names with single spaces", () => {
    expect(cx("flex", "gap-2", "text-ink")).toBe("flex gap-2 text-ink");
  });

  it("drops the parts a condition switched off", () => {
    const disabled = false;

    expect(cx("rounded", disabled && "opacity-50", null, undefined, "px-4")).toBe(
      "rounded px-4",
    );
  });

  it("drops an empty string rather than leaving a double space", () => {
    expect(cx("a", "", "b")).toBe("a b");
  });

  it("is an empty string when nothing survives", () => {
    expect(cx()).toBe("");
    expect(cx(false, null, undefined, "")).toBe("");
  });

  it("keeps order and duplicates, because it resolves nothing", () => {
    expect(cx("p-2", "p-4", "p-2")).toBe("p-2 p-4 p-2");
  });
});
