# 0026.2. Page preview and thumbnails

Child of [0026. UI redesign](index.md). Status follows the umbrella.

**Updated**: 2026-11-26, the owner's call: the preview comes back into this feature, and this child stops being a deferral and becomes its design (it was `0002-page-preview-deferred.md`, written 2026-11-25). Every leaning it recorded is now a decision below, and its open questions are settled with measured budgets. The same day, an independent cross check found gaps the first draft left to the build. They are closed here: P never sizes the grid's rows; the engine draws through the open document; the client's reply routing, cancel and release paths handle a draw; no draw is sent during a run; the mark words; a support probe; picking on a tick change too; races with custom terms; and the tests as they can be written. The reasoning, the measurements and the cross check are in [rationale.md](rationale.md), *Amended for the page preview*.

## Summary

From `lg`, while you review a document (and while a run you started from review works), `/tool` shows three columns, as `08-tool-review.png` draws them: a rail of page thumbnails, one page with a box over each item you can tick and a zoom control, and today's found items column with its sticky action foot. The worker draws each page as a picture (an `ImageBitmap`, a block of pixels moved to the page without a copy) and sends it with the boxes for that page as fractions of the page. Nothing goes back: a run still names matches by `MatchId` alone, so a stale or tampered box can never cause a wrong removal. Only the page on show and the thumbnails in view are drawn, never during a run. Each picture is capped at 8 million device pixels, and MuPDF's picture cache is emptied after every draw. Below `lg`, in a short window, at 200% text, or in a browser without the two picture features it needs, nothing is drawn at all.

## Requirements

**User stories**:
- As a visitor reviewing a document, I want to see where each found item sits on its page, so that I can judge a find by its place as well as its words.
- As a visitor, I want to see which pages are scans or carry another warning before I redact, so that I know where RedactNest can't look.
- As the owner, I want the pictures and boxes to stay in the tab like the match text does, with a test that proves it, so that the privacy promise stays true word for word.

**Acceptance criteria** (numbered once across the umbrella: AC-37 to AC-56 here):

*When it shows, and the frame*

- **AC-37**: P (the preview) shows while the session is `reviewing`, and through a `redacting` entered from `reviewing`, whenever three things hold.
  - The window fits: at least 64rem wide and at least the larger of 36rem and 576 pixels tall, in the page's own root size. The 576 pixel floor is the `tall` variant's 36rem at the default size, so P never shows where the action panel is not sticky. One pure predicate decides it, `previewFits(width, height, rootPx)` in `src/app/tool/preview-fit.ts`, unit tested. At 200% text, 64rem is 2048 pixels, so it does not fit. `ToolClient` reads it through a `useSyncExternalStore` subscription that answers `false` on the server (as the support check does), and hears a resize and a root size change alike (a `ResizeObserver` on an element sized in `rem`).
  - The browser can show a transferred picture: `createImageBitmap` exists and a canvas gives a `bitmaprenderer` context, probed once on the page.
  - The run was started from review. Where a run began is session state in `ToolClient`, set as `runRedaction` dispatches: `true` for Redact (`redact-started`), `false` for Make it again (`rerun`), and cleared in every other state. A Cancel and a refused run return to `reviewing` (spec 0007), so P stays through both.

  Everywhere else P is not rendered at all, with no canvas, no draw request and no box: at idle, `opening`, `complete`, `lost` and `failed`, through a rerun from `complete`, below `lg`, in a short window, at 200% text and without the two features. There `/tool` is exactly as AC-12 has it. When P stops showing, for any reason, it lets go of every picture in its cleanup, before its canvases leave the page (AC-47). The preview is the same for every plan.
- **AC-38**: While P shows, `/tool` is drawn full window under the header (which stays static on `/tool`, spec 0026 AC-5), as the mockup frames it.
  - *The page around it.* The page container's width cap and gutters and `main`'s top and bottom padding fall away, and "Redact a PDF" stays the page's `h1` but visually hidden. `src/app/tool/page.tsx` marks `main`, the container and the `h1` with data attributes (`data-tool-main`, `data-tool-frame`, `data-tool-title`), and one unlayered rule in `globals.css` acts on them through `:has([data-preview])`. Unlayered rules outrank Tailwind's utilities, so no `!important` is needed. `ToolClient` sets `data-preview` on the tool grid from AC-37.
  - *The grid.* Two columns, `minmax(0, 1fr) 26.25rem`, with `column-gap: 0` and today's row gap: P on the left spanning every row, and on the right today's column (A, L, B's head and C, with the action panel at C's foot) at 26.25rem. `toolGridAreas(compact, holds)` gains `preview` in `holds`. With it the columns are `minmax(0, 1fr) 26.25rem`. The rows are one `auto` per right column area that holds something, except the last, which is `minmax(0, 1fr)`. Each row's areas are `"p <area>"`. In the frame the grid is at least `100dvh` tall, so with a short list the last row takes the slack and the action panel (still `align-self: end` in C's area) rests at the window's foot, as the mockup draws it.
  - *P never sizes a row.* P's grid item has `contain: size`, so its content adds nothing to the rows it spans, and it stretches to fill its area. Its one child is the sticky box: `position: sticky`, `top: 0`, `height: 100dvh`, holding the rail (8.25rem wide, `surface`, a `border` on its right) and the page area (`subtle`, 1.75rem of padding). The rail and the page area each scroll on their own inside it. The sticky box stops at the grid's end, so the footer is reached as now. At scroll 0, P's lower edge sits one header's height below the window's edge, until the window scrolls.
  - *The right column.* It reads as one `surface` panel with a `border` on its left. The grid paints both itself (a background layer and an edge 26.25rem from its right, through the theme's colour variables), because the column's blocks are separate grid items (B is `display: contents`); each block keeps its own padding. The window scrolls the right column as today, so the action panel keeps AC-12's sticky foot, scroll margins and `focusin` fallback word for word. `--tool-panel-room` is measured again for the panel's tallest form at 26.25rem and takes the larger of that and today's value, so it holds the panel at either width. The scroll margin rule in `globals.css` leaves P's controls out (`:not([data-testid="area-preview"] *)`). The tool grid's `focusin` fallback also hears focus inside P, which is harmless: `coversFocus` needs the focused box to overlap the panel's, and the panel sits in the other column.
  - *Between `lg` and `xl`* the columns keep these widths and the page area takes what is left (about 400 pixels of page at a 1024 pixel window with a classic scrollbar). No column folds.
- **AC-39**: P is a fifth area, an `aside` named "Page preview" (`PREVIEW_TEXT.label`, `data-testid="area-preview"`), rendered after C in the page. It is drawn on the left but reached last, so the page order, the reading order and the focus order before it are unchanged (spec 0007, AC-5; spec 0013, AC-16; AC-12). Inside P the focus order is the rail (one tab stop), Zoom out, Zoom in, then the page area. P holds no live region and joins none, so `/tool` keeps its single polite regions (spec 0013, AC-20). A page change and a zoom step are therefore silent to a screen reader beyond the focused control's own state, a shown limit (the checklist carries every find as text). This amends spec 0013 INV-5: the areas become five (A, L, B, C, P), and P keeps its order and identity whenever it is rendered.

*The page and the rail*

- **AC-40**: The page area shows one page at a time.
  - Above the page, a bar holds "Page {n} of {total}" (through `countText`) and the zoom control (AC-44). When the page on show carries a warning finding (one in `WARNING_FINDINGS`), the bar is followed by one line per such finding, in `PAGE_FINDINGS` order, in a `warning` callout. Each line is `FINDING_TEXT`'s `one` form for that page alone, through a new `pageWarningLines(summary, page)` in `src/lib/page-findings.ts` beside `findingLine`, so it adds no new words.
  - Below the bar sits the page's picture on a `surface` page with a small shadow. The bar sits above the page, not under it as the mockup draws it, because P's lower edge starts under the window's edge (AC-38).
  - The page on show starts as page 1 when P first shows, and is kept while P shows: across a zoom, a refusal, a Cancel and a run started from review.
  - Showing another page clears the picture at once and shows the empty page (AC-45) until the new picture lands, never the previous page's picture under the new page's boxes.
- **AC-41**: The rail is a `nav` named "Pages" holding a list with one button per page, in page order. Each button holds the page's thumbnail (AC-45), its count badge, its mark and its label.
  - The badge is the number of rows the checklist lists for that page, blocked rows included, through `countText`, in `on-accent` words on `accent`, shown only above 0.
  - On a page carrying a warning finding, the mark is a `warning-icon` disc holding an exclamation in `on-accent` (decorative, `aria-hidden`; the pairing joins the contrast contract at 3:1). The label under the thumbnail reads "{n} · {mark}", where `{mark}` is `FINDING_MARK` for the page's first warning finding in `PAGE_FINDINGS` order. Otherwise the label is "{n}". The label may wrap to two lines.
  - `FINDING_MARK` is a record over `PageFinding` in `page-findings.ts`, so a finding added without a decision fails `pnpm typecheck`. Its words are drafts for the owner's read at build: `covered-text` "covered", `hidden-text` "hidden", `scanned` "scan", `drawn-only` "no text", `unreadable-text` "unreadable", `bare-picture` "picture", `off-page-picture` "off page", `marked-descriptions` "descriptions", and `null` for `machine-read-text`, `off-page-content` and `blank`.
  - The shown page's button has a 2 pixel `accent` edge and `aria-current="page"`; the others have a `border` edge.
  - Each button's name is "Page {n}", then " · {mark}" when marked, then ", {count} found" when counted (`PREVIEW_TEXT.thumb`), so the visible label is part of the name (WCAG 2.5.3).
  - The rail is one tab stop, through a roving tab index: the button last focused in the rail holds it, starting on the shown page's button. Up and Down move focus to the previous and next button, and Home and End to the first and last, without showing a page. Enter, Space or a click shows that page. Showing a page never moves focus.
- **AC-42**: Over the page's picture there is one box per rectangle of every row on that page that can be ticked (`blocked === null`); a blocked row has none.
  - Each box is an `aria-hidden` element placed by its rectangle's fractions of the page (AC-50), so it follows a zoom with no new draw. Boxes take no pointer and no focus (`pointer-events: none`): the checklist stays the one place a tick changes.
  - A ticked row's box has an `accent-soft` fill drawn with `mix-blend-mode: multiply` (the text shows through, and no colour carries alpha) and a 1.5 pixel solid `accent` edge. An unticked row's box has a 1.5 pixel dashed `border-strong` edge and no fill, so the two differ by more than colour (WCAG 1.4.1).
  - The picked row's boxes (AC-43) also carry a 2 pixel `focus` ring 2 pixels out.
  - A box follows its row's tick at once, from the tick set the page already holds; nothing is asked of the worker.
  - Both edges clear 3:1 on white (`accent` and `border-strong` on `canvas`, pairs already in the contract), so the mockup's `accent-bright` edge gives way (WCAG 1.4.11). On a dark or grey page picture the contrast is not guaranteed, and the checklist carries every box's information as text. In forced colours the fills go and the edges and the ring take system colours.
- **AC-43**: A row is picked when its checkbox takes focus (by Tab, a click where the browser focuses it, or script) or changes its tick. A click does not focus a checkbox in Safari, or in Firefox on macOS, so a tick change picks too. A group's select all checkbox never picks, and leaves the pick as it is.
  - Picking shows the row's page if it is not on show, as the rail would. Once that page's picture and boxes are in, the page area scrolls to bring the row's first box into view with 1.5rem of room, and the row's boxes carry the ring.
  - The scroll sets only the page area's own scroll position, never `scrollIntoView`, so the window, the right column and the focused row never move, and focus never leaves the row.
  - The pick holds until another row is picked or the row leaves the list, and its ring stays after focus moves on (to Redact, say), which is intended. Showing another page through the rail keeps the pick, and its ring returns with its page.
  - `ChecklistItem` gains an `onFocus` prop, and `ReviewChecklist` hands each row a stable `onPick(id)`. The pick itself is never passed to the rows, which are memoised (`ReviewRow`), so a pick renders no row again.
  - A blocked row's checkbox is disabled, and every checkbox is disabled during a run, so neither is ever picked; a blocked row's page is reached through the rail.

*Drawing*

- **AC-44**: The zoom control is a group named "Zoom", holding "Zoom out" and "Zoom in" (icon buttons showing − and +, with those names) and the level between them in `ink-muted`, both buttons described by the level.
  - The steps are 50, 75, 100, 125, 150 and 200% (`ZOOM_STEPS`), where 100% is the page's width fitting the page area. It starts at 100% and is kept while P shows. Zoom out is unavailable at 50% and Zoom in at 200% (`aria-disabled`, so focus stays).
  - A step stretches the current picture with CSS at once, then asks for a fresh draw at the new size 150 ms after the last press (`ZOOM_SETTLE_MS`), and the fresh picture replaces the stretched one when it lands. A change of the page area's width (a window resize) or of `devicePixelRatio` asks for a fresh draw after the same wait.
  - Across a step the page area keeps the picked box in view when the picked row is on the page, and otherwise keeps the point at its centre under its centre.
  - The page area is a focusable region named "Page {n}" (`tabindex="0"`, `PREVIEW_TEXT.pageRegion`), so the keyboard can scroll it: a page at its column's width is usually taller than the window, and past 100% it scrolls both ways.
- **AC-45**: Only the page on show is drawn for the page area, and only thumbnails near the rail's view.
  - *The page.* Asked at its displayed width times `devicePixelRatio`, rounded, in device pixels, capped at `config.previewMaxPixels` (8,388,608 device pixels by default, about 32 MB). Above the cap the worker draws at the cap and CSS covers the rest. Its canvas is always given an explicit CSS size (the zoomed width, and the height from the picture's own proportions), because a `bitmaprenderer` canvas otherwise takes the picture's size, which the cap can make smaller than the page shown.
  - *Thumbnails.* Each is drawn when its button comes within one rail height of the rail's view (`IntersectionObserver`), asked at a `width` of 84 times `devicePixelRatio`, rounded, with `maxPixels` the smaller of the config cap and 84 times 112 times `devicePixelRatio` squared. It is shown in an 84 by 112 CSS pixel box, kept whole (contain). Drawn thumbnails are kept while P shows: about 0.15 MB each at 2x, 7.5 MB for 50 pages.
  - *Scheduling.* At most one page draw and two thumbnail draws are in flight. A newer wanted page or size replaces a page draw still waiting, page draws go before thumbnails, and a reply nobody wants any more is closed at once (AC-47). While `redacting`, P sends no draw at all: it keeps its pictures, a zoom step only stretches, a page shown through the rail shows its empty place, and the wanted draws go out when the session is back in `reviewing`. At `complete` P is gone anyway (AC-37).
  - *Waiting.* Until a picture lands, its place shows an empty `surface` page (`muted` for a thumbnail), in the page's last known shape, or US Letter's when none is known. While a page draw is in flight, the page's place carries `aria-busy="true"` and a `Spinner` at its centre.
  - `ZOOM_STEPS`, `ZOOM_SETTLE_MS`, the 84 by 112 box and the one and two draws in flight are rules about the preview's layout and scheduling, not caps on the visitor. They live in `src/app/tool` beside the preview, each commented as such, as the detectors' and the page reading's constants are.
- **AC-46**: When the worker answers a draw with no picture, the page area shows a plain page shaped placeholder (US Letter's shape when none is known) with "RedactNest couldn't show this page. Its items are still listed." (`PREVIEW_TEXT.failed`) centred in `ink-muted`. A failed thumbnail keeps its empty place. There is no retry button: showing the page again (through the rail or a pick) or a zoom asks again. Review, ticks and runs are untouched, and no failure state, polite line or count follows.
- **AC-47**: Pictures are held once and let go on every way out.
  - Every picture is shown through a canvas's `bitmaprenderer` context (`transferFromImageBitmap`), which takes the picture's pixels without a copy. A new picture for a canvas replaces the old one's pixels.
  - A picture that arrives for a page, size, rows version (AC-50) or session no longer wanted is closed at once (`ImageBitmap.close()`). So is every picture the client drops before it reaches P (AC-48).
  - When P stops showing, for any reason (`complete`, Start over, a second document, a lost worker, leaving the page, the window shrinking or text growing past AC-37's bounds), its cleanup gives every canvas in P `null` (`transferFromImageBitmap(null)`) and sizes it to 0 before P unmounts, and the boxes go with P.
  - No picture is ever held in React state, in the session reducer or in a module variable: each goes from the reply straight into its canvas, or is closed.

*Worker and engine*

- **AC-48**: A new request and reply join the protocol.
  - `draw` (`DrawRequest`: `page`, one based; `purpose`, `page` or `thumbnail`; `width`, in device pixels; `maxPixels`) joins `RequestMessage`.
  - `page-drawn` (`PageDrawnMessage`: `page`; `purpose`; `picture`, an `ImageBitmap` transferred, or `null`; and `boxes`) joins `ResponseMessage`.
  - *The worker* answers a draw at once, outside the run queue: a draw reads only the review copy, which a run never touches (spec 0004, INV-1) and a review search only reads. It narrows every field from `unknown`: a page in range, a positive whole `width` no wider than `CANVAS_SIDE_MAX`, and a positive whole `maxPixels`. Any doubt, a session that is gone, a worker with no `createImageBitmap`, or a throw while drawing answers `picture: null` with no boxes, never an `error` message, so a draw never fails a session. `cancel` never names a draw, so a draw's id never enters the worker's cancelled set. `WorkerScope.postMessage` widens its transfer list to take an `ImageBitmap` beside an `ArrayBuffer`.
  - *The client.* `OpenedSession` gains `draw(request): Promise<PageDrawnMessage>`, which fills in the session's own `jobId`. `page-drawn` joins `Settling` and the listener's switch. The listener's three early drops (a reply from a worker no longer current, one with no pending operation, one for another job) close any picture the reply carries. `retireOtherJobs` settles a pending draw as `picture: null` and posts no `cancel` for it, and a lost worker (`failAll`) and `releaseEngine` settle a pending draw the same way, never as an `EngineError`. `ToolClient` hands P one stable callback that reads the opened session from its ref when called, never in render.
  - P sends no draw before `reviewing` or while `redacting` (AC-45), so the open's time and a run's are unchanged.
- **AC-49**: The engine draws through the open document.
  - `OpenDocument` gains `drawPage(pageIndex, { width, maxPixels })`, built in `open.ts` over the review copy it already holds. It is backed by `drawPageWith(mupdf, pdf, pageIndex, options)` in a new step file, `src/engine/draw.ts`, the seam a test calls with the loaded module, as the other steps do. Only the worker calls `drawPage`.
  - It loads the page from the review copy, which is prepared and trimmed, so the picture shows what detection read. Its frame is `page.getBounds()`, in the same page space as the target quads.
  - It draws with `page.toPixmap(Matrix.scale(s, s), ColorSpace.DeviceRGB, false, true)`: opaque RGB on white, annotations drawn, at the scale `s` that puts `width` device pixels across the frame. `s` is reduced so the picture's width times height stays within `maxPixels`, and so neither side passes `CANVAS_SIDE_MAX`.
  - It expands the RGB samples into a fresh straight RGBA `Uint8ClampedArray` (alpha 255) outside MuPDF's heap in one pass, and destroys the pixmap and the page in a `finally`.
  - It calls `emptyStore()` after every draw, so decoded pictures never pile up in the worker's heap, which never shrinks. Measured: a 50 page 300 dpi scan drawn page by page grew the heap from 53 to 159 MB without it, and stayed at 44 MB with it. `emptyStore` is called after a draw and nowhere else.
  - It hands back `{ width, height, pixels, frame }`. The worker wraps `pixels` in `ImageData`, makes an `ImageBitmap` with `createImageBitmap` and transfers it. At the cap the worker briefly holds about 100 MB (the pixmap, the RGBA copy and the picture), once.
  - `CANVAS_SIDE_MAX` (16,384, the longest canvas side browsers allow) lives in `draw.ts` under the engine's exception: a rule about canvases, not a cap on the visitor.
- **AC-50**: A `page` draw's reply carries one `MatchBox` (`id`, `rects`) for every row on that page whose id is in the worker's target map, which is exactly the rows that can be ticked.
  - Each target quad becomes one `PageRect` (`x`, `y`, `width`, `height`, each a fraction of the frame's width or height, clamped to 0 to 1, with anything not finite dropped). The rectangle is the quad's upright bounds, less the frame's origin, over the frame's size, computed by `quadRects(frame, quads)`, a pure function in `geometry.ts`. So a box sits on its glyphs on a cropped, offset or turned page.
  - A thumbnail's reply carries no boxes, and nothing else of a target crosses: no quad corner, no offset, no text.
  - Boxes are for display only. No type the main thread sends the worker holds a `PageRect` or a `MatchBox`, a run names matches by `MatchId` alone, and the worker resolves each against its own target map (spec 0002, INV-2 as amended here).
  - *Rows version.* P keeps a version of the rows, bumped by every `terms-found` and every term removal. Each page draw remembers the version it was asked at (on the page only, never in the request). A reply older than the current version is closed and asked again, so a draw in flight when a term search lands never leaves new rows without boxes. P keeps boxes only for ids the checklist still lists, so a row a removed term drops loses its boxes at once.

*Privacy and proof*

- **AC-51**: No picture or rectangle goes into a URL, storage, a request, a console line, telemetry or an error payload.
  - Lint bans `toDataURL`, `toBlob`, `convertToBlob`, `getImageData` and `transferToImageBitmap` in every zone, added by `zone()` beside the storage ban.
  - `PageRect`, `MatchBox` and `PageDrawnMessage` stay out of `LoggablePayload`, held by `tests/unit/loggable.test.ts`.
  - `/tool`'s content security policy is unchanged, since a transferred picture shown in a canvas needs no source.
  - No telemetry event is added.
- **AC-52**: `tests/e2e/network-list.spec.ts` gains a preview walk at 1280 by 800, on a fixture with finds on two pages: wait for the page's picture and the thumbnails in view, zoom in twice and out once, show the other page through the rail, then pick a row on the first page by focusing its checkbox.
  - The test fails on any request made during the walk, on any request in the whole test that matches no row, and on any body but the counts post that is longer than 0 bytes.
  - The test records only `http` and `https` requests, so a picture turned into a `blob:` or `data:` URL is caught by an init script instead. The script fails the test if `HTMLCanvasElement.prototype.toDataURL` or `toBlob` is called at any time, or `URL.createObjectURL` during the walk (from the list appearing until Download is pressed; Download itself makes one, `src/lib/download.ts`). It also fails if an `img`, a `source` or a CSS image in P names a `blob:` or `data:` URL. A script cannot reach inside the worker, so `convertToBlob` there is held by the lint ban alone.
  - `tests/e2e/privacy.spec.ts`'s storage check runs once with the preview drawn.
- **AC-53**: `tests/e2e/preview.spec.ts` (the `chromium` project; it times nothing) runs on a 50 page document built in the test. An init script wraps the `Worker` constructor's message listening, to count every picture a `page-drawn` carries, and wraps `ImageBitmapRenderingContext.prototype.transferFromImageBitmap` and `ImageBitmap.prototype.close`. After showing page 1, zooming to 200%, showing pages 2 to 10 through the rail and scrolling the rail end to end:
  - the page area holds exactly one canvas with a picture, within `previewMaxPixels`;
  - every thumbnail canvas is within 84 times 112 times `devicePixelRatio` squared;
  - every picture received was shown in a canvas or closed;
  - after Start over, and again after a second document opens, P is gone and no canvas with a picture is left.

  The same file holds the frame. At 1280 by 800, P sits left at the window's height and stays there while the list scrolls; the right column is 26.25rem wide with the action panel sticky at its foot; with a short list the panel rests at the window's foot; "Redact a PDF" is visually hidden; and Tab reaches P after the list. At 1024 pixels the page at 100% is at least 25rem wide. At 900 pixels, at 1280 by 500 and at 1280 with 200% text there is no P and the worker is sent no `draw`, and none is sent while a run works.
- **AC-54**: Time budgets run in the `speed` project, in `tests/e2e/preview-speed.spec.ts`. The file records no trace (`test.use({ trace: "off" })` at its top, as `terms-speed.spec.ts` does), runs at `deviceScaleFactor` 2, and joins the `SPEED_SPEC` pattern in `playwright.config.ts`. Each budget is the slowest of three runs at 1280 by 800:
  - on a 50 page dense text document of `cost.test.ts`'s shape, the first page picture lands within 1,000 ms of the Found items list appearing;
  - picking a row on page 50 rings its box within 500 ms;
  - after the last press that reaches 200%, the fresh draw lands within 750 ms;
  - on a 50 page 300 dpi grey scan built in the test, each page with its own JPEG, a page shown through the rail lands within 1,000 ms, and every thumbnail in the rail's first view within 3,000 ms.

  These sit at three to ten times what the scratch measurement found (rationale.md, *Amended for the page preview*), so they hold the design without timing the machine.

*Words and records*

- **AC-55**: Every word P shows lives in `PREVIEW_TEXT` in `src/lib/flow-text.ts` (the aside's name, the rail's name, the thumbnail's name, "Page {n} of {total}", the zoom group, its buttons and level, the page region's name and the failure line) or in `page-findings.ts` (`FINDING_MARK`, `pageWarningLines`). Counts go through `countText`. No line carries document text, the file name or a coordinate, and no `aria-label` in P names a landmark with the file name (child 0001, AC-30). Any colour pairing P uses that is not already in spec 0003's contrast contract joins it and `tests/unit/contrast.test.ts` in the same change.
- **AC-56**: `/security`'s first section gains, after the worker paragraph, a paragraph saying three things. On a wide screen, while you review, the worker draws pictures of your pages for the page to show, with a box where each item you can tick sits. No step of the page puts them in a link or sends them, and the tool page's content security policy lets it reach only its own server. Nothing the page draws goes back to the worker, so a removal is always worked out from the worker's own copy. "When it ends" gains that the page lets go of the pictures when the review ends (a finished run, Start over, another PDF, leaving the page). Each paragraph carries a source comment naming this child's criteria, and `SECURITY_CHANGES` gains an entry dated the day it is built. The privacy policy's C3 names "the pictures of your pages it shows you" among what stays on your device, with an entry at the top of `src/lib/policy-changes.ts` dated the day it is built. Spec 0011's claims register names AC-52 as a gate for C3, and AC-47 and AC-53 for C4 (amended 2026-11-26).

## Decision

Pages, thumbnails and display only boxes, drawn by the worker and shown full window from `lg`, one page at a time:

- The worker draws one page per request through the open document's new `drawPage` (MuPDF's `toPixmap` on the review copy) into a transferred `ImageBitmap`, and empties MuPDF's store after every draw.
- Boxes cross only with a drawn page, as fractions of it, keyed by `MatchId`, for the rows that can be ticked. Nothing crosses back, and no draw is sent while a run works.
- The frame keeps AC-12's right column whole. P is a fifth area, reached last and sized out of the grid's rows, that sticks beside the column at full window height.
- Picking is a row checkbox taking focus or changing its tick. Zoom is a CSS stretch, then a fresh draw.
- The proof is the network list walk, the export spy, the memory test and the speed budgets.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`, for the draw scheduling, the memoised rows and the canvas refs) · `frontend-design` (`anthropics/skills`, `.claude/skills/frontend-design/`, for the rail and the page area). This spec and `design.md` win wherever a skill suggests otherwise.

**Amends**:
- spec 0002, INV-1 and INV-2 (page pictures and display boxes cross; nothing crosses back);
- spec 0013, INV-2 (the same, for `/tool`) and INV-5 (a fifth area, P);
- spec 0011's claims register, C3 and C4 (AC-56);
- this umbrella's AC-12, whose one column now holds only where P does not show.

## Feature design

**Data model sketch**: no persistent data. The protocol gains these types (in `src/worker/protocol.ts`):

```ts
export const DRAW_PURPOSES = Object.freeze(["page", "thumbnail"] as const);
export type DrawPurpose = (typeof DRAW_PURPOSES)[number];

/** A place on a drawn page, each value a fraction of its width or height (0 to 1). Display only. */
export interface PageRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** One tickable row's boxes on a drawn page. Never sent to the worker. */
export interface MatchBox { readonly id: MatchId; readonly rects: readonly PageRect[] }

export interface DrawRequest extends Envelope {
  readonly kind: "draw";
  readonly page: number;          // one based, as ReviewMatch.page
  readonly purpose: DrawPurpose;
  readonly width: number;         // device pixels wanted across
  readonly maxPixels: number;     // config.previewMaxPixels, or a thumbnail's box
}

export interface PageDrawnMessage extends Envelope {
  readonly kind: "page-drawn";
  readonly page: number;
  readonly purpose: DrawPurpose;
  readonly picture: ImageBitmap | null;   // transferred; null when it could not be drawn
  readonly boxes: readonly MatchBox[];    // empty for a thumbnail and for a null picture
}
```

The engine gains `OpenDocument.drawPage(pageIndex, { width, maxPixels })`, returning `{ width, height, pixels: Uint8ClampedArray, frame }` with `pixels` a fresh buffer outside MuPDF's heap, backed by `drawPageWith` in `draw.ts`, and `quadRects(frame, quads): readonly PageRect[]` in `geometry.ts`. The client gains `OpenedSession.draw`. The preview's own state (the page on show, the zoom step, the pick, the rows version, the boxes of the page on show) lives in the preview component and dies with it, never in the session reducer. `ToolClient` holds where a run began as state.

**State transitions**: P is on while `previewFits` holds, the browser passes the probe, and the session is `reviewing`, or `redacting` with the run begun from `reviewing`. P is off in every other state. Turning off always runs P's one cleanup (AC-47), whatever caused it.

| Session state | P | Draws |
|---|---|---|
| `idle`, `opening`, `failed`, `lost`, `complete` | not rendered | none |
| `reviewing` (also after a Cancel or a refused run) | shown when it fits | sent as wanted |
| `redacting`, begun by Redact | shown when it fits | none; wanted draws wait for `reviewing` |
| `redacting`, begun by Make it again | not rendered | none |

**API surface** (the worker's messages and the client, not HTTP):
| Message or method | Direction | Key inputs | Key outputs | Rules | Failures |
|---|---|---|---|---|---|
| `OpenedSession.draw` | P to client | `page`, `purpose`, `width`, `maxPixels` | `Promise<PageDrawnMessage>` | adds the session's `jobId`; never cancelled | settles `picture: null` on a replacement, a lost worker or a release |
| `draw` | client to worker | the same, with `id` and `jobId` | `page-drawn` | answered at once, outside the run queue; never sent before `reviewing` or while `redacting` | any doubt or throw: `picture: null`, no boxes |
| `page-drawn` | worker to client | | `picture` (transferred), `boxes` | boxes only for `purpose: "page"`, only ids in the target map, only on that page | none; a dropped reply's picture is closed by the client |
| `redact` | client to worker | `matchIds` | unchanged | ids only, as today: no geometry may be added | unchanged |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| P shows or not | the window's width and height, the root size | `window.innerWidth`, `window.innerHeight`, the root's computed font size, through `previewFits` and its subscription |
| P shows or not | the browser's support | the page's probe for `createImageBitmap` and a `bitmaprenderer` context |
| P shows or not | the step and where a run began | the session state; the run's origin, `ToolClient` state set in `runRedaction` |
| Page bar | "Page {n} of {total}" | the page on show (P's state); `summary.pageCount` |
| Page bar | the warning lines for the page on show | `pageWarningLines(summary, n)`, from `FINDING_TEXT`'s `one` form over `WARNING_FINDINGS` |
| Page picture | the picture and its proportions | `page-drawn.picture` (its `width` and `height`) |
| Page draw request | `width` | the page area's content width times the zoom step times `devicePixelRatio`, rounded |
| Page draw request | `maxPixels` | `config.previewMaxPixels` |
| Thumbnail draw request | `width` | 84 times `devicePixelRatio`, rounded |
| Thumbnail draw request | `maxPixels` | the smaller of `config.previewMaxPixels` and 84 times 112 times `devicePixelRatio` squared |
| Boxes | each rectangle | `page-drawn.boxes`, kept only for ids the checklist lists and only from a reply at the current rows version |
| Box look | ticked or not, picked or not | the page's tick set (today's); the pick (P's state, from `onPick`) |
| Thumbnail badge | the count | the checklist's rows with `page === n`, through `countText` |
| Thumbnail mark and label | the mark word | `FINDING_MARK` for the first of `summary.pages[n - 1].findings` in `WARNING_FINDINGS` |
| Thumbnail name | the name | `PREVIEW_TEXT.thumb(n, mark, count)` |
| Zoom | the level and the steps | `ZOOM_STEPS` and P's step index |
| Failure | the line | `PREVIEW_TEXT.failed` |
| Worker | the draw's scale | `width` over the frame's width, reduced to keep width times height within `maxPixels` and each side within `CANVAS_SIDE_MAX` |
| Worker | the boxes | the session's target map (`RedactionTarget.page` and `quads`), through `quadRects` and the draw's frame |

**Key invariants**:
- A run names matches by `MatchId` alone. No type the page sends the worker holds a `PageRect`, a `MatchBox` or any coordinate (spec 0002, INV-2 as amended).
- Pictures and boxes cross only with a drawn page, only while P shows and never during a run, so below `lg` no picture and no geometry crosses at all.
- No picture is held anywhere but a canvas, and only while P shows. Every way out of P runs its one cleanup, and every picture the client drops is closed (AC-47, AC-48).
- `drawPage` reads the review copy only, and `emptyStore` follows every draw and nothing else.
- A draw never fails a session, never joins the run queue, is never cancelled and never sends an `error`.
- P never sizes the grid's rows, and the right column keeps AC-12's sticky foot and focus rules word for word.
- Picking never moves focus and never scrolls the window.
- P is reached after the list, holds no live region, and changes no existing order, id, name or focus move.
- The canvas, the boxes and the badges' decoration are hidden from assistive technology; every box's information is in the checklist as text.

**Security model** (the threat walk):
- *A stale or tampered box causes a wrong removal*: impossible by construction. Nothing drawn goes back, and the worker resolves ids against its own map, held by a type level test over `RequestMessage`.
- *A picture leaves the tab*: no request (AC-52's walk), no URL (the export spy and the lint ban), no storage (`privacy.spec.ts`), no telemetry and no log (the `LoggablePayload` gate and the console ban).
- *A picture outlives the session*: AC-47's cleanup, the client's closes and AC-53's count, under privacy claim C4.
- *A third party script reads the canvas*: `/tool` loads none, and its policy is unchanged. A browser extension that can read the page is already among what no website can control (`/security`).
- *The pictures show more than the list does*: they show what the visitor's own document draws, on their own screen, including text RedactNest can't find, which is why the scan mark and the warning lines sit beside them.

No regulated data scope is added: the document stays on the device as before.

**Configuration required**:
- `NEXT_PUBLIC_PREVIEW_MAX_PIXELS`: the most device pixels one page picture may hold. Default 8,388,608 (about 32 MB), floor 1,048,576, ceiling 16,777,216 (the largest canvas area Safari allows). It is read by `readInt` in `src/config/index.ts` as `config.previewMaxPixels`, joins the `RAW` environment map there, and gets a line in `.env.example`. It is a memory limit, like spec 0002 INV-9's context ceiling, so a typo can't ask for a picture no browser can show.

**Critical test scenarios**:
- Fit predicate (unit, `preview-fit.test.ts`): 64rem by 36rem fits at a 16 pixel root, a pixel less in either does not, a 32 pixel root needs twice the window, and at a 12 pixel root the height still needs 576 pixels. Verifies **AC-37**.
- Grid template (unit, `tool-layout.test.ts`): with `preview`, the columns, the rows (the last `minmax(0, 1fr)`) and the areas (`p` beside each right column area that holds something), billing on and off. Verifies **AC-38**.
- Rectangles (unit, `geometry.test.ts`): `quadRects` maps through an identity frame, an offset frame and a turned frame, clamps to 0 to 1 and drops anything not finite. Verifies **AC-50**.
- Boxes on glyphs (unit, the real engine through `drawPageWith`, `preview-engine.test.ts`): for every target on `detect-email.pdf`, `offset-cropbox.pdf`, `rotated-page.pdf` and `trim-rotated.pdf`'s three turned pages, the drawn picture's pixels inside each rectangle hold ink and the page's blank margin holds none. Verifies **AC-49**, **AC-50**.
- Drawing (unit): the size follows `width`, the cap and `CANVAS_SIDE_MAX` hold on a page far larger than a sheet, every pixel's alpha is 255, the page's empty area is white, a page that throws is an `EngineFailure`, and with MuPDF's heap exposed (as `device.test.ts` does) drawing every page of a 50 page scan leaves the heap within one picture of where it began. Verifies **AC-49**.
- Worker (unit, `engine-worker.test.ts`): a draw is answered while a review search waits at a checkpoint; a draw for a gone session, a page out of range, a bad width or no `createImageBitmap` answers `null`; a page draw's boxes hold exactly the target ids on that page; a thumbnail holds none; a draw's id never enters the cancelled set. A type level test holds that no `RequestMessage` member can carry a `PageRect` or `MatchBox`. Verifies **AC-48**, **AC-50**.
- Client (unit or component): `draw` resolves with the reply; each of the listener's three early drops closes the picture; a replacement, a lost worker and a release settle a pending draw as `null` and post no `cancel` for it. Verifies **AC-47**, **AC-48**.
- Loggable gate (unit): `PageRect`, `MatchBox` and `PageDrawnMessage` are not assignable to `LoggablePayload`. Verifies **AC-51**.
- P in the page (component, jsdom with a mocked `bitmaprenderer` context and probe):
  - P renders only when it fits, passes the probe and is in its steps, and a rerun from `complete` keeps it off;
  - the rail's names, badges, marks, `aria-current` and roving keys, and the warning lines;
  - a focused row checkbox and a tick change each show the row's page and ring its boxes, while a disabled one and a group's select all pick nothing, and a pick renders no row again;
  - no draw is sent while `redacting`, and the wanted draw goes out on the return to `reviewing`;
  - a reply at an older rows version is closed and asked again;
  - the zoom steps, ends and settle wait (fake timers, with `fireEvent` and `act`, never `userEvent`);
  - the failure line, and `aria-busy` while a draw is in flight;
  - on unmount every canvas is given `null` and every picture arriving late is closed.

  Verifies **AC-37**, **AC-39** to **AC-47**, **AC-50**, **AC-55**.
- Network list walk and export spy (e2e). Verifies **AC-51**, **AC-52**.
- Memory and frame (e2e, `preview.spec.ts`). Verifies **AC-37**, **AC-38**, **AC-39**, **AC-45**, **AC-47**, **AC-53**.
- Speed (e2e, `speed` project). Verifies **AC-54**.
- Accessibility (e2e, `design-system.spec.ts`): axe with P drawn at 1280 pixels and in forced colours, and a keyboard walk from the list into the rail, the zoom and the page region. Verifies **AC-39**, **AC-41**, **AC-44**.
- Words and contrast (unit): `FINDING_MARK` covers every `PageFinding`, `pageWarningLines` gives each warning's `one` form for one page, `PREVIEW_TEXT` holds no literal page number, and every new pairing passes in `contrast.test.ts`. Verifies **AC-40**, **AC-41**, **AC-55**.
- Policy pages (component): C3's new words, the security page's new paragraphs with their source comments, and the banned phrase list still passing. Verifies **AC-56**.

## Build plan

Skateboard: the first slice draws one page with its boxes in the frame, the thinnest preview a visitor can use, then the rail, the zoom and the failure path grow it, and the proofs and the words close it. The umbrella runs this as task 17, before its tasks 14 to 16, whose accessibility sweep, brand rerun and records then cover it.

1. Protocol and engine: `DrawPurpose`, `PageRect`, `MatchBox`, `DrawRequest` and `PageDrawnMessage`; `drawPageWith` in `src/engine/draw.ts` with the RGBA expansion, `CANVAS_SIDE_MAX` and `emptyStore`; `OpenDocument.drawPage` in `open.ts`; `quadRects` in `geometry.ts`; the engine tests (size, cap, opaque pixels, the heap left flat, boxes on glyphs on the cropped, offset and turned fixtures), satisfies **AC-49**, **AC-50**
2. Worker and client: `handleDraw` outside the run queue, narrowing, `null` on any doubt, boxes from the target map, the widened `postMessage`; `OpenedSession.draw`, `page-drawn` in `Settling` and the switch, closing pictures in the three early drops, and draws settled as `null` (never cancelled) by `retireOtherJobs`, `failAll` and `releaseEngine`; the worker and client tests, the type level test and the loggable gate, satisfies **AC-47**, **AC-48**, **AC-50**, **AC-51**
3. `config.previewMaxPixels` with its floor, ceiling, `RAW` entry and `.env.example` line, and the lint ban on the five canvas calls in `zone()`, satisfies **AC-45**, **AC-51**
4. The thinnest whole: `previewFits` with its subscription and the support probe; the run's origin as state; the `page.tsx` hooks and the full window rule; `data-preview`; `toolGridAreas` with `preview`; P's `contain: size` cell and sticky box; the grid's right column panel; `--tool-panel-room` measured again at 26.25rem; the scroll margin rule leaving P out; P with page 1 at 100% and its boxes by tick; the `bitmaprenderer` canvas with its explicit size, closing late pictures, and the cleanup on every way out; component tests, satisfies **AC-37**, **AC-38**, **AC-39**, **AC-42**, **AC-47**
5. Picking: `ChecklistItem`'s `onFocus`, a stable `onPick(id)` from `ReviewChecklist`, a pick on focus or on a tick change of a row checkbox only; the page area's own scroll and the ring, satisfies **AC-43**
6. The rail and the page bar: thumbnails near the view, badges, `FINDING_MARK` with its drafted words, names, roving keys and `aria-current`; "Page {n} of {total}" and `pageWarningLines`; `PREVIEW_TEXT`; any new contrast pairing, satisfies **AC-40**, **AC-41**, **AC-55**
7. Zoom and scheduling: the steps, the stretch then the fresh draw, the settle wait, resize and `devicePixelRatio` redraws, the page region, the empty page on a page change, `aria-busy` and the spinner, at most one page and two thumbnail draws in flight, and no draw while `redacting`, satisfies **AC-44**, **AC-45**
8. The failure placeholder, satisfies **AC-46**
9. Custom terms: the rows version, a page draw asked again after a `terms-found` with rows on the page on show, and the boxes of rows a removed term drops let go, satisfies **AC-50**
10. The proofs: the network list walk and the export spy, `privacy.spec.ts` with the preview drawn, `preview.spec.ts` (memory and frame), `preview-speed.spec.ts` (trace off, 2x, in `SPEED_SPEC`), and axe, forced colours and the keyboard walk in `design-system.spec.ts`, satisfies **AC-38**, **AC-39**, **AC-41**, **AC-44**, **AC-45**, **AC-51** to **AC-54**
11. The words on the record: `/security`'s two paragraphs with source comments and a `SECURITY_CHANGES` entry, and the privacy policy's C3 with a `policy-changes.ts` entry, both dated the build day; the owner reads the mark words and the new paragraphs, satisfies **AC-41**, **AC-56**

## Consequences

**Positive**:
- `/tool` matches all three columns of `08-tool-review.png`. A find can be judged by where it sits, and a scan is marked on its own page as well as in the list.
- The renderer and the frame mapping are the base feature 14 builds on, with the direction of travel its own decision.
- The widening is as narrow as the feature allows: pictures and boxes cross only when drawn, only from `lg`, never during a run, and never back.
- A run's time and a Cancel's reach are untouched, since no draw competes with a run.

**Negative / tradeoffs**:
- A new kind of document data sits on the main thread: pictures of pages and the rectangles of tickable finds. Each is held in a canvas or P's state only while P shows, but each is one more thing the tests must keep proving gone.
- Memory: up to about 40 MB of pictures on the page (one page at the 8 million pixel cap, plus 50 thumbnails at 2x). The worker's heap grows once by about one picture and one decoded image (measured +7 MB at 100% and +28 MB at 200% on a 2x screen), and at the cap the worker briefly holds about 100 MB while one picture is made.
- Emptying MuPDF's store after every draw means a page drawn twice is decoded twice.
- During a run the preview draws nothing new: a page shown through the rail, or a zoom, waits for the run to end.
- `/tool` has two layouts from `lg`, the frame and AC-12's column, chosen by state, window and support, so its layout tests double. P is sized out of the grid's rows with `contain: size`, one more layout rule a later change must keep.
- The right column narrows from 44rem to 26.25rem, so rows and their context lines wrap more, and `--tool-panel-room` must hold the panel at both widths.
- P is drawn on the left but reached last by keyboard. That is right for a supplementary view, but it is not the visual order. A page change or a zoom step is silent to a screen reader, since P may hold no live region.
- The zoom control sits above the page rather than under it as the mockup draws it, and box edges use `accent` rather than the mockup's lighter teal.
- Box edges can't be guaranteed to clear 3:1 against a dark or grey page picture.
- A blocked row gets no box and can't be picked; its page is found through the rail.
- The picture shows the prepared review copy (layers settled at open, annotations drawn in), which can differ slightly from what a PDF viewer shows.
- A browser without `createImageBitmap` or a `bitmaprenderer` context gets no preview at all.
- A fifth area amends spec 0013 INV-5, and every later change to the tool grid must place P.

**Neutral**:
- `/tool`'s requests, policy and storage are unchanged. The network list needs no new row, because a draw makes no request.
- A run from `complete` (Make it again) keeps the one column, since the pictures were let go at `complete`.

## Follow-up

- [ ] Feature 14 builds on `drawPage` and `quadRects`. Its boxes travel from the page to the worker, the direction this child never allows, so that widening of INV-2 is its own decision.
- [ ] If the paid page cap rises above 50, drop thumbnails that leave the rail's view rather than keeping them (today's bound is about 0.15 MB a page at 2x).
- [ ] Add a count of failed draws only if visitors report blank pages (spec 0016's catalog, C14 and the page budget looked at again).
- [ ] For `/sync`: root `AGENTS.md` gains the display only widening of INV-2, P as the fifth area, `PREVIEW_TEXT` and `FINDING_MARK` among the word records, the canvas call ban in `zone()`, and `NEXT_PUBLIC_PREVIEW_MAX_PIXELS` among the caps. `src/engine/AGENTS.md` gains `draw.ts`, `drawPage` reading the review copy only, `CANVAS_SIDE_MAX` under the engine's exception, and `emptyStore` after a draw and nowhere else.

## Rationale

The owner brought the preview back on 2026-11-26 and chose every recommendation in the design conversation.
- *One page at a time* keeps one picture alive and matches the mockup.
- *A sticky P beside AC-12's untouched right column* reuses the tested sticky foot and focus rules rather than nesting a scroller, and `contain: size` keeps P out of the rows.
- *Boxes cross only with a drawn page*, so no geometry crosses when nothing is drawn, and nothing crosses back, so INV-2's reason (no wrong removal) still holds.
- *A stretch then a fresh draw* is instant and sharp, which the measured draw times (3 to 160 ms) make affordable.
- *Emptying MuPDF's store after each draw* keeps a heap that never shrinks from growing by 100 MB over one scan.
- *No draws during a run* was a call made at first the other way and reversed after the cross check: a run has stretches of seconds with no checkpoint, and emptying the store mid run would throw away pictures the run had decoded.

The options weighed for each question, the measurements and the cross check are in [rationale.md](rationale.md), *Amended for the page preview*.
