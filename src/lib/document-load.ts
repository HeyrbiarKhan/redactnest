import { TOOL_PATH } from "@/lib/routes";

/**
 * Which URL did the browser load the current document at?
 *
 * The tool page uses this to refuse a file in a document that was not loaded at
 * `/tool` (spec 0003, AC-21 and INV-10). A content security policy belongs to
 * the document it arrived with, so a client side navigation into the tool would
 * keep the policy, and the scripts, of the page it came from. The navigation
 * entry records the load itself, and a client side navigation never changes it,
 * which is exactly why it is the right thing to read here and `location` is not.
 */

/** Unread until the first call, then fixed for the life of the document. */
let cached: string | null | undefined;

function readLoadedAt(): string | null {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return null;
  }

  const [entry] = performance.getEntriesByType("navigation");
  if (!entry) return null;

  try {
    return new URL(entry.name).pathname;
  } catch {
    return null;
  }
}

/**
 * The path the current document was loaded at, or `null` when the browser does
 * not say. `null` lets the page work as it always has, rather than locking out a
 * browser that simply does not report it.
 *
 * Read once and then reused, like `getSupport()`: `useSyncExternalStore`
 * compares snapshots, and nothing here can change while the document lives.
 */
export function loadedAt(): string | null {
  if (cached === undefined) cached = readLoadedAt();
  return cached;
}

/**
 * The address bar's path, right now.
 *
 * Never cached, unlike `loadedAt()`: a client side navigation changes this and
 * nothing else, and that difference is what the guard reads.
 */
export function currentPath(): string {
  return location.pathname;
}

export type LoadGuard = "ok" | "reload" | "wrong-url";

/**
 * What the tool page does about where its document came from. Spec 0003, AC-21
 * and INV-11.
 *
 * A document the browser loaded at `/tool` is under the tool's own policy,
 * whatever the address bar says later, so it passes; so does one the browser
 * says nothing about. Otherwise a reload fixes it only when the address bar
 * already reads `TOOL_PATH`, because a reload loads the address bar's URL and
 * only a load at `/tool` can pass. Anywhere else a reload would come back to
 * the same answer forever, so the page waits for a click instead. That is what
 * makes a loop impossible rather than merely unlikely. Exact matches, so
 * `/tool/` is a wrong URL too.
 */
export function loadGuard(loadedAtPath: string | null, address: string): LoadGuard {
  if (loadedAtPath === null || loadedAtPath === TOOL_PATH) return "ok";
  return address === TOOL_PATH ? "reload" : "wrong-url";
}

/**
 * Load the current URL again, as a real page load.
 *
 * Its own function so tests can replace it at the module boundary: jsdom defines
 * `location.reload` as a property nothing can redefine or spy on.
 */
export function reloadDocument(): void {
  location.reload();
}
