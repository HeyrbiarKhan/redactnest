/**
 * Whether `/tool` may show the page preview (spec 0026 child 0002, AC-37):
 * the window fits, and the browser can show a transferred picture.
 *
 * Read through `useSyncExternalStore`, whose server answer is `false`, so the
 * prerendered page never holds a preview and hydration has nothing to
 * disagree about.
 */

/**
 * The narrowest window the preview fits, in the page's own `rem`: the rail,
 * a page worth reading and the 26.25rem column. At 200% text this is 2,048
 * pixels, so enlarged text keeps the one column. A rule about the layout,
 * not a cap on the visitor.
 */
export const PREVIEW_MIN_WIDTH_REM = 64;

/**
 * The shortest window, in `rem`: the `tall` variant's 36rem, where the action
 * panel sticks to the window's foot.
 */
export const PREVIEW_MIN_HEIGHT_REM = 36;

/**
 * And never under 576 pixels, the `tall` variant's 36rem at the default size,
 * which a media query reads whatever the root size is. So the preview never
 * shows where the action panel is not sticky.
 */
export const PREVIEW_MIN_HEIGHT_PX = 576;

/** One pure predicate decides it, from the window and the root size. */
export function previewFits(width: number, height: number, rootPx: number): boolean {
  return (
    width >= PREVIEW_MIN_WIDTH_REM * rootPx &&
    height >= Math.max(PREVIEW_MIN_HEIGHT_REM * rootPx, PREVIEW_MIN_HEIGHT_PX)
  );
}

/** The root's computed font size, in pixels: what `1rem` is on this page now. */
function rootSize(): number {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** The fit now, for `useSyncExternalStore`. */
export function readPreviewFit(): boolean {
  return previewFits(window.innerWidth, window.innerHeight, rootSize());
}

/**
 * Hear a resize and a root size change alike: the window's `resize`, and a
 * `ResizeObserver` on an element one `rem` wide, which changes size when the
 * root's does (text made larger in the browser's settings fires no resize).
 */
export function subscribePreviewFit(onChange: () => void): () => void {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;width:1rem;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => onChange()) : null;
  observer?.observe(probe);
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    observer?.disconnect();
    probe.remove();
  };
}

/**
 * Whether this browser can show a transferred picture: `createImageBitmap`
 * exists and a canvas gives a `bitmaprenderer` context. Probed once, since it
 * cannot change while the page is open; a module level cache, and nothing
 * else is kept.
 */
let supported: boolean | null = null;

export function previewSupported(): boolean {
  if (supported === null) {
    try {
      supported =
        typeof createImageBitmap === "function" &&
        document.createElement("canvas").getContext("bitmaprenderer") !== null;
    } catch {
      supported = false;
    }
  }
  return supported;
}
