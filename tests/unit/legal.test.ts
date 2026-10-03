import { describe, expect, expectTypeOf, it } from "vitest";

import {
  checkLegalFacts,
  CONTACT_PLACEHOLDER,
  EMAIL_SHAPE,
  LEGAL,
  type LaunchFacts,
  type Representative,
  type RepresentativesDecision,
} from "@/lib/legal";

/**
 * The two launch facts and the gate over them. Spec 0011, AC-16 and AC-17,
 * INV-5.
 *
 * `checkLegalFacts` is pure, so these cases feed it the placeholders and each
 * kind of decision whatever `src/lib/legal.ts` holds. The config test proves
 * the build actually calls it.
 */

const REAL_EMAIL = "privacy@redactnest.example";

const REPRESENTATIVE: Representative = {
  name: "Example Representation Ltd",
  postalAddress: "1 Example Street, Dublin, Ireland",
  email: "rep@example.eu",
};

/** What the repository held until Launch readiness steps 1 and 2. */
const PLACEHOLDERS: LaunchFacts = {
  contactEmail: CONTACT_PLACEHOLDER,
  representatives: { status: "pending" },
};

/** What a launch ready repository holds. */
const READY: LaunchFacts = {
  contactEmail: REAL_EMAIL,
  representatives: { status: "decided", eu: REPRESENTATIVE, uk: null },
};

describe("the facts the repository holds today", () => {
  /**
   * covers: AC-16, AC-17. Launch readiness steps 1 and 2, recorded 2026-10-03:
   * the real address, and no representative, not required on advice.
   */
  it("are the real address and the recorded Article 27 decision", () => {
    expect(LEGAL.contactEmail).toBe("privacy@redactnest.com");
    expect(LEGAL.representatives).toEqual({ status: "decided", eu: null, uk: null });
  });

  /** covers: AC-16, AC-17, INV-5. A production deploy builds with them. */
  it("pass the production gate", () => {
    expect(checkLegalFacts(LEGAL, "production")).toEqual([]);
  });

  /** covers: AC-6. The operator line both pages name. */
  it("name the operator as the spec settled it", () => {
    expect(LEGAL.operatorLine).toBe(
      "RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan",
    );
  });

  /** covers: AC-16. The placeholder passes the shape, so previews build. */
  it("include a placeholder that passes the address shape", () => {
    expect(CONTACT_PLACEHOLDER).toBe("privacy@redactnest.invalid");
    expect(EMAIL_SHAPE.test(CONTACT_PLACEHOLDER)).toBe(true);
  });

  it("are frozen", () => {
    expect(Object.isFrozen(LEGAL)).toBe(true);
    expect(Object.isFrozen(LEGAL.representatives)).toBe(true);
    expect(Object.isFrozen(LEGAL.toolNotice)).toBe(true);
  });
});

/**
 * Recording the decision is an edit to one line of `src/lib/legal.ts`, so
 * `LEGAL.representatives` has to keep the whole union whatever that line holds.
 * Typed only as the placeholder, a decided record broke `next build` wherever
 * code asks which status it has. Like `loggable.test.ts`, the type assertions
 * run at `pnpm typecheck`, not at `pnpm test`: what fails is the compile.
 */
describe("the type LEGAL gives the decision", () => {
  /** covers: AC-17 */
  it("is the whole union, not the pending placeholder alone", () => {
    expectTypeOf(LEGAL.representatives).toEqualTypeOf<RepresentativesDecision>();
  });

  /** covers: AC-17. EU only, UK only, both, and neither. */
  it("takes every decided record, and the production gate passes each", () => {
    const decided: readonly (typeof LEGAL)["representatives"][] = [
      { status: "decided", eu: REPRESENTATIVE, uk: null },
      { status: "decided", eu: null, uk: REPRESENTATIVE },
      { status: "decided", eu: REPRESENTATIVE, uk: REPRESENTATIVE },
      { status: "decided", eu: null, uk: null },
    ];
    for (const representatives of decided) {
      expect(checkLegalFacts({ ...READY, representatives }, "production")).toEqual([]);
    }
  });
});

describe("a production deploy", () => {
  /** covers: AC-16 */
  it("reports the placeholder address, naming LEGAL.contactEmail", () => {
    const problems = checkLegalFacts(
      { ...READY, contactEmail: CONTACT_PLACEHOLDER },
      "production",
    );
    expect(problems).toEqual([expect.stringMatching(/^LEGAL\.contactEmail .*real/)]);
  });

  /** covers: AC-16. Trimmed, so padding cannot slip the placeholder through. */
  it("reports the placeholder with spaces around it", () => {
    expect(
      checkLegalFacts(
        { ...READY, contactEmail: ` ${CONTACT_PLACEHOLDER} ` },
        "production",
      ),
    ).toEqual([expect.stringMatching(/^LEGAL\.contactEmail/)]);
  });

  /** covers: AC-16, INV-5. A hand edit to the case must not slip it through. */
  it.each([
    ["Privacy@redactnest.invalid"],
    ["PRIVACY@REDACTNEST.INVALID"],
    ["privacy@RedactNest.Invalid"],
  ])("reports the placeholder written as %s", (contactEmail) => {
    expect(checkLegalFacts({ ...READY, contactEmail }, "production")).toEqual([
      expect.stringMatching(/^LEGAL\.contactEmail is still the placeholder/),
    ]);
  });

  /** covers: AC-16, INV-5. Any `.invalid` address bounces, not only the placeholder. */
  it.each([
    ["hello@redactnest.invalid"],
    ["privacy@example.invalid"],
    ["privacy@mail.redactnest.INVALID"],
    ["privacy@redactnest.invalid."],
  ])("reports %s, which is on a .invalid host", (contactEmail) => {
    expect(checkLegalFacts({ ...READY, contactEmail }, "production")).toEqual([
      expect.stringMatching(/^LEGAL\.contactEmail ".*" is on a \.invalid host.*real/),
    ]);
  });

  /** covers: AC-16. Only the host's last label counts, not a lookalike. */
  it.each([
    ["privacy@invalid.redactnest.com"],
    ["privacy@redactnest.xinvalid"],
    ["me.invalid@redactnest.com"],
  ])("accepts %s, whose host does not end in .invalid", (contactEmail) => {
    expect(checkLegalFacts({ ...READY, contactEmail }, "production")).toEqual([]);
  });

  /** covers: AC-17 */
  it("reports a pending decision, naming LEGAL.representatives", () => {
    const problems = checkLegalFacts(
      { ...READY, representatives: { status: "pending" } },
      "production",
    );
    expect(problems).toEqual([expect.stringMatching(/^LEGAL\.representatives /)]);
  });

  /** covers: AC-16, AC-17. Every problem at once, not the first one found. */
  it("reports both placeholders together", () => {
    expect(checkLegalFacts(PLACEHOLDERS, "production")).toEqual([
      expect.stringMatching(/^LEGAL\.contactEmail/),
      expect.stringMatching(/^LEGAL\.representatives/),
    ]);
  });

  /** covers: AC-16, AC-17 */
  it("reports nothing once a real address and a decision are recorded", () => {
    expect(checkLegalFacts(READY, "production")).toEqual([]);
  });

  /** covers: AC-17. Neither representative is required, on advice. */
  it("accepts a decision with no representative at all", () => {
    expect(
      checkLegalFacts(
        { ...READY, representatives: { status: "decided", eu: null, uk: null } },
        "production",
      ),
    ).toEqual([]);
  });
});

describe("every other build", () => {
  /** covers: AC-16, AC-17. Previews, CI's build and development show the placeholder. */
  it.each([["preview"], ["development"], [undefined]])(
    "passes the placeholders when VERCEL_ENV is %s",
    (vercelEnv) => {
      expect(checkLegalFacts(PLACEHOLDERS, vercelEnv)).toEqual([]);
    },
  );

  /** covers: AC-16. The `.invalid` rule is production's alone. */
  it.each([["preview"], ["development"], [undefined]])(
    "passes any .invalid address, in any case, when VERCEL_ENV is %s",
    (vercelEnv) => {
      for (const contactEmail of [
        "Privacy@redactnest.invalid",
        "hello@example.invalid",
      ]) {
        expect(checkLegalFacts({ ...PLACEHOLDERS, contactEmail }, vercelEnv)).toEqual([]);
      }
    },
  );
});

describe("a malformed fact fails every build", () => {
  const ENVIRONMENTS = ["production", "preview", "development", undefined] as const;

  /** covers: AC-16 */
  it.each(ENVIRONMENTS)("refuses an address that is not one, in %s", (vercelEnv) => {
    for (const contactEmail of ["not-an-email", "", "   ", "a b@c.d", "a@b"]) {
      expect(checkLegalFacts({ ...READY, contactEmail }, vercelEnv)).toContainEqual(
        expect.stringMatching(/^LEGAL\.contactEmail must be an email address/),
      );
    }
  });

  /** covers: AC-17 */
  it.each(ENVIRONMENTS)(
    "refuses a recorded representative with a blank field, in %s",
    (vercelEnv) => {
      const cases: readonly [Partial<Representative>, RegExp][] = [
        [{ name: "  " }, /^LEGAL\.representatives\.uk\.name is empty/],
        [{ postalAddress: "" }, /^LEGAL\.representatives\.uk\.postalAddress is empty/],
        [{ email: "rep at example" }, /^LEGAL\.representatives\.uk\.email must be/],
      ];
      for (const [change, problem] of cases) {
        expect(
          checkLegalFacts(
            {
              ...READY,
              representatives: {
                status: "decided",
                eu: null,
                uk: { ...REPRESENTATIVE, ...change },
              },
            },
            vercelEnv,
          ),
        ).toEqual([expect.stringMatching(problem)]);
      }
    },
  );

  /** covers: AC-17. Each slot is checked, and named. */
  it("names the slot a bad representative sits in", () => {
    expect(
      checkLegalFacts(
        {
          ...READY,
          representatives: {
            status: "decided",
            eu: { ...REPRESENTATIVE, name: "" },
            uk: { ...REPRESENTATIVE, email: "" },
          },
        },
        "preview",
      ),
    ).toEqual([
      expect.stringMatching(/^LEGAL\.representatives\.eu\.name/),
      expect.stringMatching(/^LEGAL\.representatives\.uk\.email/),
    ]);
  });
});
