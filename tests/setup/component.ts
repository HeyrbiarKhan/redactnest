/**
 * What every component test gets before it runs. Wired by the `component`
 * project in `vitest.config.mts`; the `unit` project never loads this.
 */

// The DOM matchers (`toBeInTheDocument`, `toHaveAccessibleName`, and the rest).
// This entry point registers them with Vitest's `expect` and carries the type
// declarations that make them visible to `tsc`.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, expect } from "vitest";

// Testing Library unmounts between tests on its own only when the test globals
// are enabled. They are not here, because the existing tests import `describe`,
// `it` and `expect` from `vitest` explicitly and this project keeps to that. So
// the teardown is wired by hand: without it, every render stacks up in the same
// document and queries start matching the previous test's markup.
afterEach(cleanup);

/** Spec 0003, AC-18: the same rule tags the browser suite runs. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * axe over one rendered primitive, failing with every violation spelled out.
 *
 * Two rules are off, because jsdom computes no colour and no layout, so both
 * would report on nothing real. Contrast is the token test's job (AC-2), and
 * target size is checked in Playwright on the controls a page actually places.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const { violations } = await axe.run(container, {
    runOnly: { type: "tag", values: WCAG_TAGS },
    rules: {
      "color-contrast": { enabled: false },
      "target-size": { enabled: false },
    },
  });

  expect(
    violations,
    violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(" ")}`)
            .join("\n")}`,
      )
      .join("\n"),
  ).toEqual([]);
}
