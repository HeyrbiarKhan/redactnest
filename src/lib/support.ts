/**
 * Can this browser run RedactNest at all?
 *
 * Everything happens on the visitor's machine, so a browser missing any one of
 * these cannot do the work. Corporate policy disabling WebAssembly is a real
 * case, not a theoretical one, and an honest "this will not work here" beats a
 * drop area that fails after the file is chosen.
 */

export type SupportGap = "webassembly" | "web-workers" | "file-api";

export interface SupportReport {
  supported: boolean;
  /** Empty when supported. */
  missing: SupportGap[];
}

export function detectSupport(): SupportReport {
  const missing: SupportGap[] = [];

  if (!hasWebAssembly()) missing.push("webassembly");
  if (typeof Worker === "undefined") missing.push("web-workers");
  if (typeof File === "undefined" || typeof FileReader === "undefined") {
    missing.push("file-api");
  }

  return { supported: missing.length === 0, missing };
}

/**
 * Present and actually usable.
 *
 * A policy that blocks WebAssembly usually leaves the global object in place and
 * refuses at compile time, so checking for the global is not enough. Compiling
 * the eight byte empty module is the cheapest real test there is.
 */
function hasWebAssembly(): boolean {
  if (typeof WebAssembly !== "object" || typeof WebAssembly.Module !== "function") {
    return false;
  }
  try {
    const emptyModule = new WebAssembly.Module(
      Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00),
    );
    return emptyModule instanceof WebAssembly.Module;
  } catch {
    return false;
  }
}

let cached: SupportReport | null = null;

/**
 * Detect once, then reuse the same object.
 *
 * `useSyncExternalStore` compares snapshots by identity, so returning a fresh
 * object each call would re-render forever. Nothing here can change during a
 * page's life anyway.
 */
export function getSupport(): SupportReport {
  cached ??= detectSupport();
  return cached;
}

/** Plain explanations. Feature 8 may reword these; the reasons stay the same. */
export const SUPPORT_GAP_TEXT: Record<SupportGap, string> = {
  webassembly:
    "WebAssembly is unavailable. Some workplace browser policies switch it off. RedactNest does its work on your own machine, so it cannot run without it.",
  "web-workers":
    "Web Workers are unavailable. RedactNest keeps your document in a worker so it never touches the page itself, so it cannot run without them.",
  "file-api":
    "This browser cannot read local files in the way RedactNest needs. Try a current version of Chrome, Edge, Firefox or Safari on a desktop computer.",
};
