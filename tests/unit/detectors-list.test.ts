import { describe, expect, it, vi } from "vitest";

import { lookedFor } from "@/lib/detectors";

/**
 * `lookedFor` lists the detectors the British way. Spec 0013, AC-13, and spec
 * 0007, Follow-up nit 4.
 *
 * With today's two kinds a British and an American list read the same, so the
 * kinds are stretched to three here, repeating the real two, which is the one
 * case where they differ: no comma before the last part.
 */

vi.mock("@/worker/protocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/worker/protocol")>();
  return { ...actual, DETECTOR_KINDS: ["email", "phone", "email"] as const };
});

describe("lookedFor", () => {
  it("joins three or more kinds with no comma before and", () => {
    expect(lookedFor("conjunction")).toBe(
      "email addresses, phone numbers and email addresses",
    );
  });

  it("joins them with no comma before or", () => {
    expect(lookedFor("disjunction")).toBe(
      "email addresses, phone numbers or email addresses",
    );
  });
});
