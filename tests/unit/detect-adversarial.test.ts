import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DETECTORS, MAX_PARSES_PER_GROUP } from "@/detect";
import type { DetectorKind } from "@/worker/protocol";

/**
 * Every detector runs in time linear in its input. Spec 0005, AC-16 and INV-7.
 *
 * A crafted document can make detection slow only in the visitor's own tab,
 * and this bounds how slow. The shapes are the classic ones for each pattern:
 * long runs of the characters an address is made of with no `@`, or with an
 * `@` every few characters; digit runs with every separator a phone number
 * may hold; single and two digit groups, fixed and random; repeated `00`,
 * `011`, `(0)` and `+` prefixes; real numbers side by side; and repeated
 * partial dates.
 *
 * Three proofs. Each detector finishes a 100,000 character block of every
 * shape within its budget: a second for email, two for phone, whose every
 * candidate costs one parse by libphonenumber-js. Each grows linearly. And
 * the phone detector never asks libphonenumber-js for more than
 * `MAX_PARSES_PER_GROUP` parses per digit group, counted as real calls to the
 * parser rather than timed, so that bound holds on any machine.
 *
 * This bounds the detectors' own time on a string. The time MuPDF takes to
 * read a page is measured separately (spec 0005, Follow-up).
 */

// Wraps the real parser, so the detector runs exactly as it ships and the test
// counts what it asks for. No seam is added to the product code.
vi.mock("libphonenumber-js/max", async (importOriginal) => {
  const real = await importOriginal<typeof import("libphonenumber-js/max")>();
  return { ...real, parsePhoneNumberFromString: vi.fn(real.parsePhoneNumberFromString) };
});

const parses = vi.mocked(parsePhoneNumberFromString);

beforeEach(() => {
  parses.mockClear();
});

const LENGTH = 100_000;

/** AC-16's budget for each detector on `LENGTH` characters, in CPU time. */
const BUDGET_MS: Readonly<Record<DetectorKind, number>> = Object.freeze({
  email: 1_000,
  phone: 2_000,
});

const KINDS = Object.keys(DETECTORS) as DetectorKind[];

/** `unit` repeated to exactly `length` characters. */
function block(unit: string, length = LENGTH): string {
  return unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
}

/**
 * `LENGTH` characters of digit groups, each of `sizes` digits at random, each
 * followed by one of `separators` at random. Seeded, so every run of the suite
 * reads the same text. The memo cannot shorten these, since hardly any window
 * repeats, so they are what test the parse bound.
 */
function randomGroups(seed: number, sizes: number, separators: string): string {
  let state = seed;
  const next = (below: number) => {
    // Park and Miller's minimal standard generator: small, and enough here.
    state = (state * 48_271) % 2_147_483_647;
    return state % below;
  };

  let text = "";
  while (text.length < LENGTH) {
    const size = 1 + next(sizes);
    for (let digit = 0; digit < size; digit += 1) text += String(next(10));
    text += separators[next(separators.length)];
  }
  return text.slice(0, LENGTH);
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
  return cpuSince(start);
}

function cpuSince(start: NodeJS.CpuUsage): number {
  const used = process.threadCpuUsage(start);
  return (used.user + used.system) / 1_000;
}

/** The least CPU time one growth sample covers, in milliseconds. */
const SAMPLE_MS = 100;

/**
 * The CPU time one call of `run` takes, averaged over as many calls as fill
 * `SAMPLE_MS`. Windows counts thread time in 15.6 ms steps, a large share of
 * one fast run, so a single call can read as nearly double or nothing.
 * Averaged over 100 ms, the steps and a stray garbage collection are a small
 * share of what is measured.
 */
function perCall(run: () => unknown): number {
  const start = process.threadCpuUsage();
  let calls = 0;
  let used = 0;
  while (used < SAMPLE_MS) {
    run();
    calls += 1;
    used = cpuSince(start);
  }
  return used / calls;
}

const SHAPES: readonly (readonly [string, string])[] = [
  ["name characters and no @", "abcdefghij.klmn_op+qr-"],
  ["a local part's characters before every @", `${"a".repeat(63)}@`],
  ["dots and @ in turn", "a.@"],
  ["nothing but @", "@"],
  ["labels that never end", "b.c-d"],
  ["bare digits", "0123456789"],
  ["digits split by hyphens", "1-2-3-4-5-6-7-8-9-0-"],
  ["digits split by dots", "1.2.3.4.5.6.7.8.9.0."],
  ["digits split by spaces", "12 34 56 78 90 "],
  ["digits split by slashes", "12/34/56/78/90/"],
  ["digits in brackets", "(12) 3"],
  ["single digit groups", "2 "],
  ["single zeros", "0 "],
  ["two digit groups", "02 "],
  ["random one and two digit groups", randomGroups(1, 2, " ")],
  ["random groups of one to three digits", randomGroups(2, 3, " ")],
  ["random groups with every separator", randomGroups(3, 4, " -./()+")],
  ["repeated 00 prefixes", "00 "],
  ["repeated 011 prefixes", "011 "],
  ["repeated (0) groups", "(0) "],
  ["(0) groups glued together", "(0)"],
  ["repeated + signs", "+ "],
  ["country prefixes", "+44 "],
  ["UK numbers side by side", "020 7946 0958 "],
  ["US numbers side by side", "(212) 555-0123 "],
  ["phone numbers with extensions", "020 7946 0958 ext. 1 "],
  ["repeated partial dates", "12/05/19 27.09.20 2026-09-"],
];

/**
 * Wall clock room for one timed test. The measurement is CPU time, but the
 * test still waits in real time while other files hold the processor, and the
 * phone detector's runs take seconds of it under a full suite.
 */
const WALL_TIMEOUT_MS = 60_000;

describe.each(KINDS)("the %s detector on 100,000 adversarial characters", (kind) => {
  it.each(SHAPES)(
    "finishes within its budget: %s",
    (_shape, unit) => {
      const text = block(unit);
      expect(elapsed(() => DETECTORS[kind]({ text, joins: [] }))).toBeLessThan(
        BUDGET_MS[kind],
      );
    },
    WALL_TIMEOUT_MS,
  );
});

describe("the email detector with a line join after every @ and every dot", () => {
  it("finishes within its budget", () => {
    const text = block("a@ b. ");
    const joins = Array.from(text.matchAll(/ /gu), (space) => space.index);
    expect(elapsed(() => DETECTORS.email({ text, joins }))).toBeLessThan(BUDGET_MS.email);
  });
});

/**
 * Linear, not merely fast on this machine: eight times the input takes about
 * eight times as long, where a quadratic detector takes sixty four. The span
 * is wide on purpose. Garbage collection steps up where the heap crosses a
 * threshold, so one doubling can cost three and a half times as much
 * (measured on the phone detector between 50,000 and 100,000 characters of
 * `(0) `, on a curve that doubles from there on). Over an eightfold span such
 * a step is a small share. The margin is three times linear, 24 times, well
 * short of quadratic's 64 (the worst measured is 10, the phone detector on
 * `(0) `), or `FLOOR_MS` a call for a detector too quick to show any growth:
 * the email detector reads 100,000 digits in about a millisecond, where the
 * cache, not the detector, sets the ratio. Each detector is warmed up first,
 * so no measurement pays for the JIT, and each sample is averaged by
 * `perCall`.
 */
const GROWTH = 8;
const FLOOR_MS = 5;

describe.each(KINDS)("the %s detector", (kind) => {
  it.each(SHAPES)(
    "grows linearly: %s",
    (_shape, unit) => {
      const part = block(unit, LENGTH / GROWTH);
      const whole = block(unit, LENGTH);
      DETECTORS[kind]({ text: part, joins: [] });

      const small = perCall(() => DETECTORS[kind]({ text: part, joins: [] }));
      const large = perCall(() => DETECTORS[kind]({ text: whole, joins: [] }));
      expect(large, `${small} ms, then ${large} ms a call`).toBeLessThan(
        Math.max(small * GROWTH * 3, FLOOR_MS),
      );
    },
    WALL_TIMEOUT_MS,
  );
});

/**
 * AC-16 and INV-7, by counting: the phone detector's cost does not depend on
 * the machine. A digit group is one run of digits, bare or in brackets, which
 * is what the detector's units are made of, so a unit, and so a start, is at
 * least one group.
 */
describe("the phone detector's parses", () => {
  it("counts each real parse, and parses a number repeated in one block once", () => {
    DETECTORS.phone({ text: "020 7946 0958", joins: [] });
    expect(parses).toHaveBeenCalledTimes(1);

    parses.mockClear();
    DETECTORS.phone({ text: "020 7946 0958 and 020 7946 0958", joins: [] });
    expect(parses).toHaveBeenCalledTimes(1);
  });

  it.each(SHAPES)(
    `stay within MAX_PARSES_PER_GROUP per digit group: %s`,
    (_shape, unit) => {
      const text = block(unit);
      const groups = text.match(/\p{Nd}+/gu)?.length ?? 0;

      DETECTORS.phone({ text, joins: [] });
      expect(parses.mock.calls.length).toBeLessThanOrEqual(MAX_PARSES_PER_GROUP * groups);
    },
    WALL_TIMEOUT_MS,
  );
});
