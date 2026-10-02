/**
 * Thrown at module load so the build fails instead of the browser.
 *
 * In a file of its own (spec 0011) so `src/config/privacy.ts` can throw it
 * without importing the module that reads the environment. `next.config.ts`
 * loads this file too, so it imports nothing and reads no environment
 * variable (INV-8).
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`[config] ${message}`);
    this.name = "ConfigError";
  }
}
