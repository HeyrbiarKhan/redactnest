/**
 * What every component test gets before it runs. Wired by the `component`
 * project in `vitest.config.mts`; the `unit` project never loads this.
 */

// The DOM matchers (`toBeInTheDocument`, `toHaveAccessibleName`, and the rest).
// This entry point registers them with Vitest's `expect` and carries the type
// declarations that make them visible to `tsc`.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library unmounts between tests on its own only when the test globals
// are enabled. They are not here, because the existing tests import `describe`,
// `it` and `expect` from `vitest` explicitly and this project keeps to that. So
// the teardown is wired by hand: without it, every render stacks up in the same
// document and queries start matching the previous test's markup.
afterEach(cleanup);
