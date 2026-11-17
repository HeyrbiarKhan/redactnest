import { gateFixtures } from "../support/redaction-gate";

/**
 * Part 4 of 4 of the gate over every committed fixture: nothing drawn
 * changes, and nothing new is refused (spec 0019, AC-7). The gate itself is in
 * `tests/support/redaction-gate.ts`.
 */
gateFixtures(3, 4);
