/**
 * Vitest's stand in for the `server-only` package (spec 0012).
 *
 * `src/billing` and `src/config/billing.ts` import `server-only` so a client
 * component that reached them would fail the build. Outside React's server
 * build that package throws on import, by design, so the unit tests that run
 * those modules in plain Node resolve it here instead. `vitest.config.mts`
 * wires the alias; the build itself never sees this file.
 */
export {};
