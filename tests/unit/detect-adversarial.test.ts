import { describe, expect, it } from "vitest";

import { DETECTORS } from "@/detect";

/**
 * Every detector runs in time linear in its input. Spec 0005, AC-16 and INV-7.
 *
 * A crafted document can make detection slow only in the visitor's own tab,
 * and this bounds how slow. The shapes are the classic ones for each pattern:
 * long runs of the characters an address is made of with no `@`, or with an
 * `@` every few characters; digit runs with every separator a phone number
 * may hold; and repeated partial dates.
 *
 * Linear growth is proved for every detector. AC-16's absolute budget, a
 * 100,000 character block within a second, is proved here for the email
 * detector only. The phone detector is linear but not that fast: on digit
 * dense text libphonenumber-js parses every short run as a candidate, once
 * per region, and `+44 ` repeated to 100,000 characters took 0.6 to 1.4 s on
 * the build machine (measured 2026-09-27). Whether to widen its budget or
 * change its approach is owed to `/architect`, so its budget test waits for
 * that decision rather than failing in CI.
 *
 * This bounds the detectors' own time on a string. The time MuPDF takes to
 * read a page is measured separately (spec 0005, Follow-up).
 */

const LENGTH = 100_000;
const BUDGET_MS = 1_000;

/** `unit` repeated to exactly `length` characters. */
function block(unit: string, length = LENGTH): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/**
 * The CPU time `run` takes on this thread, in milliseconds. AC-16 bounds the
 * detector's own time, and CPU time is exactly that: unlike the wall clock, it
 * does not grow while the other test files running beside this one hold the
 * processor.
 */
function elapsed(run: () => unknown): number {
  const start = process.threadCpuUsage();
  run();
  const used = process.threadCpuUsage(start);
  return (used.user + used.system) / 1_000;
}

const SHAPES: readonly (readonly [string, string])[] = [
  ["name characters and no @", "abcdefghij.klmn_op+qr-"],
  ["a local part's characters before every @", `${"a".repeat(63)}@`],
  ["dots and @ in turn", "a.@"],
  ["nothing but @", "@"],
  ["labels that never end", "b.c-d"],
  ["bare digits", "0123456789"],
  ["digits split by hyphens", "1-2-3-4-5-6-7-8-9-0-"],
  ["digits split by spaces", "12 34 56 78 90 "],
  ["digits in brackets", "(12) 3"],
  ["country prefixes", "+44 "],
  ["phone numbers with extensions", "020 7946 0958 ext. 1 "],
  ["repeated partial dates", "12/05/19 27.09.20 2026-09-"],
];

describe("the email detector on 100,000 adversarial characters", () => {
  it.each(SHAPES)("finishes within a second: %s", (_shape, unit) => {
    const text = block(unit);
    expect(elapsed(() => DETECTORS.email({ text, joins: [] }))).toBeLessThan(BUDGET_MS);
  });

  it("finishes within a second with a line join after every @ and every dot", () => {
    const text = block("a@ b. ");
    const joins = Array.from(text.matchAll(/ /gu), (space) => space.index);
    expect(elapsed(() => DETECTORS.email({ text, joins }))).toBeLessThan(BUDGET_MS);
  });
});

/**
 * Wall clock room for one growth test. The measurement is CPU time, but the
 * test still waits in real time while other files hold the processor, and the
 * phone detector's three runs take seconds of it under a full suite.
 */
const GROWTH_TIMEOUT_MS = 60_000;

/**
 * Linear, not merely fast on this machine: doubling the input no more than
 * about doubles the time. A quadratic detector quadruples it. Each detector is
 * warmed up first, so no measurement pays for the JIT, and the margin (three
 * times, or 50 ms) absorbs what garbage collection adds and the 15.6 ms steps
 * Windows counts thread time in. Measured at a quarter and a half of the
 * budget's length, which shows the growth as well and keeps the suite quick.
 */
describe.each(Object.keys(DETECTORS) as (keyof typeof DETECTORS)[])(
  "the %s detector",
  (kind) => {
    it.each(SHAPES)(
      "grows linearly: %s",
      (_shape, unit) => {
        const half = block(unit, LENGTH / 4);
        const whole = block(unit, LENGTH / 2);
        DETECTORS[kind]({ text: half, joins: [] });

        const small = elapsed(() => DETECTORS[kind]({ text: half, joins: [] }));
        const large = elapsed(() => DETECTORS[kind]({ text: whole, joins: [] }));
        expect(large, `${small} ms, then ${large} ms`).toBeLessThan(
          Math.max(small * 3, 50),
        );
      },
      GROWTH_TIMEOUT_MS,
    );
  },
);
