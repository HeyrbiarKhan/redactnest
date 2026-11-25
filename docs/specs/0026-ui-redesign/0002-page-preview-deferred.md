# 0026.2. Page preview and thumbnails, deferred

Child of [0026. UI redesign](index.md). Status follows the umbrella.

## Summary

The mockups' page preview (the drawn page with a box on each match) and its thumbnails are not built in this feature. Drawing pages and boxes on the main thread would widen spec 0002 INV-2, which keeps coordinates and page geometry inside the worker, and that widening deserves its own spec. This feature lays out the review screen so a preview column can be added later without moving anything else.

## Decision

- Not built in 0026. No page picture, coordinate, quad or page geometry crosses the worker boundary (spec 0002, INV-2; spec 0013, INV-2), and `ReviewMatch` keeps "No quads, no offsets, no page geometry".
- The `/tool` review layout this feature builds (the tool header plus one centred panel, [index.md](index.md) AC-12, child 0001 AC-30) is the preview's right column in waiting: a later spec adds the thumbnail rail and the page area beside it without changing the four areas' order or identity.
- The per page badges in the mockup's rail (a count, a scan mark) are not built either; the page warnings keep their place in the panel.

## Leanings for the later spec

Settled in this conversation as preferences, not decisions. The later `/architect` run starts from them and confirms or changes each:

- **What it shows**: pages, thumbnails and a box on each listed match, widening INV-2 for display only. The case for it: INV-2's stated reason is that a stale or tampered box must never cause a wrong removal, and a run that still names matches by `MatchId` alone keeps that true. The widening adds document pixels and rectangles to the tab's memory, never to the network.
- **How pixels cross**: the worker renders a pixmap, makes an `ImageBitmap` and transfers it; the page draws it on a canvas and calls `close()` on release, replacement or zoom. No URL names the picture, and `/tool`'s policy needs no change.
- **Interaction**: look and jump only. Thumbnails move to a page; picking a checklist row scrolls to its box and outlines it; a box is not clickable, so the checklist stays the one place a tick changes. The canvas is hidden from assistive technology.
- **Small screens**: below `lg`, nothing is drawn (no memory spent) and the review is the single panel this feature builds.
- **Open questions for that spec**: memory and time on a 50 page file (render only what is in view), what a page that fails to render shows, zoom (render again or scale), how a scan's picture is marked, the security page lines that change, and the e2e proof that no picture or rectangle leaves the tab.

## Rationale

The brief asked to keep this part a decision of its own because it touches the privacy promise and `src/worker`. The owner chose to defer it, so the redesign ships without widening an invariant, and the widening gets its own options, threat walk and tests rather than riding inside a restyle. The cost is that `/tool` will not match `08-tool-review.png`'s left two columns until then.
