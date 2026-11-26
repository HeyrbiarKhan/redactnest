"use client";

import { Minus, Plus } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { config } from "@/config";
import { countText } from "@/lib/count-text";
import { cx } from "@/lib/cx";
import { PREVIEW_TEXT } from "@/lib/flow-text";
import { pageMark, pageWarningLines } from "@/lib/page-findings";
import type {
  DocumentSummary,
  MatchBox,
  MatchId,
  PageDrawnMessage,
  PageRect,
  ReviewMatch,
} from "@/worker/protocol";
import type { DrawAsk } from "@/worker/client";
import { Callout } from "@/ui/callout";
import { Spinner } from "@/ui/spinner";

import {
  LETTER_SHAPE,
  pageAskWidth,
  PAGE_DRAWS_IN_FLIGHT,
  THUMB_BOX,
  THUMB_DRAWS_IN_FLIGHT,
  thumbAsk,
  thumbSize,
  ZOOM_SETTLE_MS,
  ZOOM_START,
  ZOOM_STEPS,
} from "./preview-rules";

/**
 * The page preview, P (spec 0026 child 0002). From `lg`, while you review, a
 * rail of page thumbnails and one page with a box over each item you can
 * tick, beside the found items column.
 *
 * Every picture comes from the worker as a transferred `ImageBitmap` and goes
 * straight into a canvas through its `bitmaprenderer` context, or is closed:
 * none is held in state, the session or a module variable (AC-47). The boxes
 * are display only. Nothing here ever reaches the worker but a draw's page,
 * purpose and size, so a run still names matches by `MatchId` alone (AC-50).
 *
 * P's own state (the page on show, the zoom, the pick, the boxes of the page
 * on show) lives here and dies with it. P holds no live region (AC-39).
 */

/** What the session's checklist hears: a row's checkbox picked (AC-43). */
export interface PreviewHandle {
  pick(id: MatchId): void;
}

interface PagePreviewProps {
  readonly ref?: Ref<PreviewHandle>;
  readonly summary: DocumentSummary;
  /** The checklist's rows, the rows version by identity (AC-50). */
  readonly matches: readonly ReviewMatch[];
  readonly ticked: ReadonlySet<MatchId>;
  /** A run started from review is working: no draw is sent (AC-45). */
  readonly running: boolean;
  /** One stable callback that asks the open session for a draw (AC-48). */
  readonly draw: (ask: DrawAsk) => Promise<PageDrawnMessage>;
}

/** A page draw, as asked: the page, its width in device pixels, and the rows. */
interface PageWant {
  readonly page: number;
  readonly width: number;
  readonly rows: readonly ReviewMatch[];
}

/** What the page's canvas shows for the page on show. */
interface PageFace {
  readonly page: number;
  readonly state: "empty" | "shown" | "failed";
}

/** The ids of the rows that can be ticked on `page`: the rows that have boxes. */
function tickableOn(rows: readonly ReviewMatch[], page: number): readonly MatchId[] {
  return rows
    .filter((row) => row.page === page && row.blocked === null)
    .map((row) => row.id);
}

/**
 * Does the page's last settled draw still serve what is wanted? The same
 * page at the same width, and no row the checklist can tick on it that the
 * draw's boxes could not hold (spec 0026 child 0002, AC-50 and task 9): a
 * term search that lands rows on the page on show asks again, and a removal
 * needs nothing, since boxes are kept only for listed ids.
 */
function serves(done: PageWant | null, want: PageWant): boolean {
  if (done === null || done.page !== want.page || done.width !== want.width) return false;
  if (done.rows === want.rows) return true;
  const had = new Set(tickableOn(done.rows, want.page));
  return tickableOn(want.rows, want.page).every((id) => had.has(id));
}

/** Let go of a canvas's picture and its pixels (AC-47). */
function release(canvas: HTMLCanvasElement): void {
  canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(null);
  canvas.width = 0;
  canvas.height = 0;
}

/** Show `picture` in `canvas`, taking its pixels without a copy, or close it. */
function showIn(
  canvas: HTMLCanvasElement | null | undefined,
  picture: ImageBitmap,
): boolean {
  const context = canvas?.getContext("bitmaprenderer");
  if (!context) {
    picture.close();
    return false;
  }
  context.transferFromImageBitmap(picture);
  return true;
}

/** The root size in pixels, for the pick's 1.5rem of room. */
function remPx(): number {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Scroll the page area, and only it, so `rect` on the page sits in view with
 * `room` pixels round it (AC-43). Never `scrollIntoView`, so the window, the
 * right column and the focused row never move.
 */
function bringIntoView(
  area: HTMLElement,
  page: HTMLElement,
  rect: PageRect,
  size: { readonly width: number; readonly height: number },
  room: number,
): void {
  const top = page.offsetTop + rect.y * size.height;
  const bottom = top + rect.height * size.height;
  const left = page.offsetLeft + rect.x * size.width;
  const right = left + rect.width * size.width;
  if (top - room < area.scrollTop) area.scrollTop = top - room;
  else if (bottom + room > area.scrollTop + area.clientHeight) {
    area.scrollTop = bottom + room - area.clientHeight;
  }
  if (left - room < area.scrollLeft) area.scrollLeft = left - room;
  else if (right + room > area.scrollLeft + area.clientWidth) {
    area.scrollLeft = right + room - area.clientWidth;
  }
}

export function PagePreview({
  ref,
  summary,
  matches,
  ticked,
  running,
  draw,
}: PagePreviewProps) {
  const pageCount = summary.pageCount;
  const [shown, setShown] = useState(1);
  const [zoom, setZoom] = useState(ZOOM_START);
  const [pick, setPick] = useState<{
    readonly id: MatchId;
    readonly serial: number;
  } | null>(null);
  const [areaWidth, setAreaWidth] = useState<number | null>(null);
  const [pixelRatio, setPixelRatio] = useState(() => window.devicePixelRatio || 1);
  const [settledAsk, setSettledAsk] = useState<number | null>(null);
  const [face, setFace] = useState<PageFace>({ page: 1, state: "empty" });
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState<{
    readonly page: number;
    readonly list: readonly MatchBox[];
  } | null>(null);
  const [shapes, setShapes] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [nearRail, setNearRail] = useState<ReadonlySet<number>>(() => new Set());
  const [drawnThumbs, setDrawnThumbs] = useState<ReadonlySet<number>>(() => new Set());
  const [settles, setSettles] = useState(0);
  const [railStop, setRailStop] = useState<number | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const thumbCanvases = useRef(new Map<number, HTMLCanvasElement>());
  const thumbButtons = useRef(new Map<number, HTMLButtonElement>());
  const aliveRef = useRef(false);
  const pageFlight = useRef<PageWant | null>(null);
  const pageDone = useRef<PageWant | null>(null);
  const thumbFlights = useRef(new Set<number>());
  const thumbDone = useRef(new Set<number>());
  const wantRef = useRef<PageWant | null>(null);
  const shownRef = useRef(shown);
  const faceRef = useRef(face);
  const matchesRef = useRef(matches);
  const scrolledFor = useRef(0);
  const anchorRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

  const zoomPercent = ZOOM_STEPS[zoom] ?? 100;
  const liveAsk = pageAskWidth(areaWidth, zoomPercent, pixelRatio);
  // A step stretches the picture at once and asks for a fresh one only once
  // the presses have settled (AC-44); the first ask goes out at once.
  const ask = settledAsk ?? liveAsk;
  const shape = shapes.get(shown) ?? LETTER_SHAPE;
  const size = useMemo(() => {
    const width = areaWidth === null ? 0 : (areaWidth * zoomPercent) / 100;
    return { width, height: width * shape };
  }, [areaWidth, zoomPercent, shape]);
  const listed = useMemo(() => new Set(matches.map((match) => match.id)), [matches]);
  const counts = useMemo(() => {
    const byPage = new Map<number, number>();
    for (const match of matches)
      byPage.set(match.page, (byPage.get(match.page) ?? 0) + 1);
    return byPage;
  }, [matches]);

  useLayoutEffect(() => {
    shownRef.current = shown;
    faceRef.current = face;
    matchesRef.current = matches;
    wantRef.current = ask === null ? null : { page: shown, width: ask, rows: matches };
  });

  /*
   * AC-47: every way out of P runs this one cleanup, before its canvases
   * leave the page. Each canvas is given `null` and sized to nothing, and a
   * picture arriving after it is closed (`aliveRef`).
   */
  useLayoutEffect(() => {
    aliveRef.current = true;
    const page = canvasRef.current;
    const thumbs = thumbCanvases.current;
    const done = thumbDone.current;
    return () => {
      aliveRef.current = false;
      if (page) release(page);
      for (const canvas of thumbs.values()) release(canvas);
      pageDone.current = null;
      done.clear();
    };
  }, []);

  // The page area's content width, for 100% (AC-44), heard on every resize.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAreaWidth(entry.contentRect.width);
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  // A change of pixel density asks for a fresh draw after the same wait (AC-44).
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const onChange = () => {
      setPixelRatio(window.devicePixelRatio || 1);
      listen();
    };
    function listen() {
      query?.removeEventListener("change", onChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener("change", onChange);
    }
    listen();
    return () => query?.removeEventListener("change", onChange);
  }, []);

  // AC-44: the fresh draw waits `ZOOM_SETTLE_MS` after the last change.
  useEffect(() => {
    if (liveAsk === null || liveAsk === settledAsk) return;
    const timer = window.setTimeout(() => setSettledAsk(liveAsk), ZOOM_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [liveAsk, settledAsk]);

  // Thumbnails are drawn once within one rail height of the rail's view (AC-45).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.page));
        if (near.length === 0) return;
        setNearRail((current) => {
          if (near.every((page) => current.has(page))) return current;
          return new Set([...current, ...near]);
        });
      },
      { root: rail, rootMargin: "100% 0px" },
    );
    for (const button of thumbButtons.current.values()) observer.observe(button);
    return () => observer.disconnect();
  }, [pageCount]);

  const askPage = useCallback(
    (want: PageWant) => {
      pageFlight.current = want;
      setBusy(true);
      void draw({
        page: want.page,
        purpose: "page",
        width: want.width,
        maxPixels: config.previewMaxPixels,
      }).then(({ picture, boxes: drawn }) => {
        pageFlight.current = null;
        if (!aliveRef.current) {
          picture?.close();
          return;
        }
        setBusy(false);
        setSettles((count) => count + 1);
        const now = wantRef.current;
        // AC-47 and AC-50: a picture for a page, a size or a rows version no
        // longer wanted is closed at once, and the wanted one asked for.
        if (
          now === null ||
          now.page !== want.page ||
          now.width !== want.width ||
          now.rows !== want.rows
        ) {
          picture?.close();
          return;
        }
        if (picture === null) {
          pageDone.current = want;
          setFace({ page: want.page, state: "failed" });
          return;
        }
        const ratio = picture.height / picture.width;
        if (!showIn(canvasRef.current, picture)) return;
        pageDone.current = want;
        setShapes((current) => new Map(current).set(want.page, ratio));
        setBoxes({ page: want.page, list: drawn });
        setFace({ page: want.page, state: "shown" });
      });
    },
    [draw],
  );

  const askThumb = useCallback(
    (page: number, thumb: { readonly width: number; readonly maxPixels: number }) => {
      thumbFlights.current.add(page);
      void draw({ page, purpose: "thumbnail", ...thumb }).then(({ picture }) => {
        thumbFlights.current.delete(page);
        if (!aliveRef.current) {
          picture?.close();
          return;
        }
        // A failed thumbnail keeps its empty place and is not asked again (AC-46).
        thumbDone.current.add(page);
        setSettles((count) => count + 1);
        if (picture === null) return;
        const ratio = picture.height / picture.width;
        if (!showIn(thumbCanvases.current.get(page), picture)) return;
        setShapes((current) => new Map(current).set(page, ratio));
        setDrawnThumbs((current) => new Set(current).add(page));
      });
    },
    [draw],
  );

  /*
   * AC-45's scheduling: at most one page draw and two thumbnail draws in
   * flight, the page first, and nothing at all while a run works; the wanted
   * draws go out once the session is back in `reviewing`.
   */
  useEffect(() => {
    if (running || ask === null) return;
    const want: PageWant = { page: shown, width: ask, rows: matches };
    const pagesInFlight = pageFlight.current === null ? 0 : 1;
    if (pagesInFlight < PAGE_DRAWS_IN_FLIGHT && !serves(pageDone.current, want)) {
      askPage(want);
    }
    const thumb = thumbAsk(pixelRatio, config.previewMaxPixels);
    for (const page of [...nearRail].sort((a, b) => a - b)) {
      if (thumbFlights.current.size >= THUMB_DRAWS_IN_FLIGHT) break;
      if (thumbDone.current.has(page) || thumbFlights.current.has(page)) continue;
      askThumb(page, thumb);
    }
  }, [running, ask, shown, matches, nearRail, pixelRatio, settles, askPage, askThumb]);

  /**
   * Show page `page`: the picture goes at once and the empty page shows until
   * the new one lands, never the last page's picture under this page's boxes
   * (AC-40). The page already on show, when its draw failed, is asked again
   * (AC-46). Focus never moves.
   */
  const showPage = useCallback((page: number) => {
    if (page === shownRef.current) {
      if (faceRef.current.state === "failed") {
        pageDone.current = null;
        setFace({ page, state: "empty" });
        setSettles((count) => count + 1);
      }
      return;
    }
    const canvas = canvasRef.current;
    canvas?.getContext("bitmaprenderer")?.transferFromImageBitmap(null);
    anchorRef.current = null;
    setShown(page);
    setFace({ page, state: "empty" });
    setBoxes(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      pick(id) {
        const match = matchesRef.current.find((row) => row.id === id);
        // A blocked row has no box and cannot be picked (AC-43).
        if (!match || match.blocked !== null) return;
        setPick((current) => ({ id, serial: (current?.serial ?? 0) + 1 }));
        showPage(match.page);
      },
    }),
    [showPage],
  );

  // The picked row's boxes, kept only while the checklist lists it (AC-43).
  const picked = pick !== null && listed.has(pick.id) ? pick.id : null;
  const pageBoxes = useMemo(
    () =>
      face.state === "shown" && face.page === shown && boxes?.page === shown
        ? boxes.list.filter((box) => listed.has(box.id))
        : [],
    [face, shown, boxes, listed],
  );

  // AC-43: once the picked row's page is in, the page area alone scrolls to it.
  useEffect(() => {
    if (pick === null || scrolledFor.current === pick.serial) return;
    const box = pageBoxes.find((entry) => entry.id === pick.id);
    const area = areaRef.current;
    const page = pageRef.current;
    if (!box || !box.rects[0] || !area || !page || size.width === 0) return;
    bringIntoView(area, page, box.rects[0], size, 1.5 * remPx());
    scrolledFor.current = pick.serial;
  }, [pick, pageBoxes, size]);

  /*
   * AC-44: across a zoom step, the picked box stays in view when its row is
   * on the page, and otherwise the point at the area's centre stays there.
   */
  const zoomTo = useCallback((next: number) => {
    const area = areaRef.current;
    const page = pageRef.current;
    if (area && page && page.offsetWidth > 0) {
      anchorRef.current = {
        x: (area.scrollLeft + area.clientWidth / 2 - page.offsetLeft) / page.offsetWidth,
        y: (area.scrollTop + area.clientHeight / 2 - page.offsetTop) / page.offsetHeight,
      };
    }
    setZoom(next);
  }, []);

  // Only a zoom step sets the anchor, so any other change finds none and
  // leaves the page area where it is.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const page = pageRef.current;
    const anchor = anchorRef.current;
    if (!area || !page || anchor === null || size.width === 0) return;
    anchorRef.current = null;
    const box =
      picked === null ? undefined : pageBoxes.find((entry) => entry.id === picked);
    if (box?.rects[0]) {
      bringIntoView(area, page, box.rects[0], size, 1.5 * remPx());
      return;
    }
    area.scrollLeft = page.offsetLeft + anchor.x * size.width - area.clientWidth / 2;
    area.scrollTop = page.offsetTop + anchor.y * size.height - area.clientHeight / 2;
  }, [size, picked, pageBoxes]);

  const tabStop = railStop ?? shown;
  const onRailKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, page: number) => {
      const next =
        event.key === "ArrowDown"
          ? Math.min(page + 1, pageCount)
          : event.key === "ArrowUp"
            ? Math.max(page - 1, 1)
            : event.key === "Home"
              ? 1
              : event.key === "End"
                ? pageCount
                : null;
      if (next === null) return;
      event.preventDefault();
      setRailStop(next);
      thumbButtons.current.get(next)?.focus();
    },
    [pageCount],
  );

  const keepButton = useCallback((page: number, button: HTMLButtonElement | null) => {
    if (button) thumbButtons.current.set(page, button);
  }, []);
  const keepCanvas = useCallback((page: number, canvas: HTMLCanvasElement | null) => {
    if (canvas) thumbCanvases.current.set(page, canvas);
  }, []);

  const levelId = useId();
  const warnings = pageWarningLines(summary, shown);
  const atLeast = zoom <= 0;
  const atMost = zoom >= ZOOM_STEPS.length - 1;
  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  return (
    <aside
      aria-label={PREVIEW_TEXT.label}
      data-testid="area-preview"
      className="min-w-0 [contain:size] [grid-area:p]"
    >
      <div className="sticky top-0 flex h-dvh min-h-0">
        <nav
          ref={railRef}
          aria-label={PREVIEW_TEXT.rail}
          data-testid="preview-rail"
          className="w-33 shrink-0 overflow-y-auto border-r border-border bg-surface"
        >
          <ol className="flex flex-col items-center gap-3.5 px-3 py-4">
            {pages.map((page) => (
              <li key={page}>
                <Thumb
                  page={page}
                  mark={pageMark(summary, page)}
                  count={counts.get(page) ?? 0}
                  current={page === shown}
                  tabStop={page === tabStop}
                  drawn={drawnThumbs.has(page)}
                  shape={shapes.get(page) ?? LETTER_SHAPE}
                  onShow={showPage}
                  onKey={onRailKey}
                  onFocusStop={setRailStop}
                  onButton={keepButton}
                  onCanvas={keepCanvas}
                />
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col bg-subtle">
          <div className="flex flex-col gap-3 px-7 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                data-testid="preview-page-of"
                className="text-small font-medium text-ink"
              >
                {PREVIEW_TEXT.pageOf(shown, pageCount)}
              </p>
              <div
                role="group"
                aria-label={PREVIEW_TEXT.zoom}
                className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
              >
                <ZoomButton
                  label={PREVIEW_TEXT.zoomOut}
                  unavailable={atLeast}
                  describedBy={levelId}
                  onPress={() => {
                    if (!atLeast) zoomTo(zoom - 1);
                  }}
                >
                  <Minus aria-hidden="true" className="size-4" strokeWidth={2} />
                </ZoomButton>
                <span
                  id={levelId}
                  data-testid="preview-zoom-level"
                  className="min-w-12 text-center text-small text-ink-muted"
                >
                  {PREVIEW_TEXT.level(zoomPercent)}
                </span>
                <ZoomButton
                  label={PREVIEW_TEXT.zoomIn}
                  unavailable={atMost}
                  describedBy={levelId}
                  onPress={() => {
                    if (!atMost) zoomTo(zoom + 1);
                  }}
                >
                  <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                </ZoomButton>
              </div>
            </div>
            {warnings.length > 0 && (
              <Callout tone="warning" data-testid="preview-warnings">
                {warnings.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </Callout>
            )}
          </div>

          <div
            ref={areaRef}
            role="region"
            aria-label={PREVIEW_TEXT.pageRegion(shown)}
            tabIndex={0}
            data-testid="preview-area"
            className="relative min-h-0 flex-1 overflow-auto p-7 [scrollbar-gutter:stable]"
          >
            <div
              ref={pageRef}
              data-testid="preview-page"
              aria-busy={busy ? "true" : undefined}
              className="relative mx-auto bg-surface shadow-sheet"
              style={{ width: size.width, height: size.height }}
            >
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                data-testid="preview-canvas"
                className={cx("absolute inset-0", face.state !== "shown" && "invisible")}
                style={{ width: size.width, height: size.height }}
              />
              <div aria-hidden="true" className="absolute inset-0">
                {pageBoxes.flatMap((box) =>
                  box.rects.map((rect, at) => (
                    <span
                      key={`${box.id}-${at}`}
                      data-box=""
                      data-ticked={ticked.has(box.id) ? "" : undefined}
                      data-picked={box.id === picked ? "" : undefined}
                      className={cx(
                        "pointer-events-none absolute border-[1.5px]",
                        ticked.has(box.id)
                          ? "border-solid border-accent bg-accent-soft mix-blend-multiply forced-colors:bg-transparent"
                          : "border-dashed border-border-strong",
                        box.id === picked && "outline-2 outline-offset-2 outline-focus",
                      )}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      }}
                    />
                  )),
                )}
              </div>
              {face.state === "failed" && face.page === shown && (
                <p
                  data-testid="preview-failed"
                  className="absolute inset-0 flex items-center justify-center p-6 text-center text-ink-muted"
                >
                  {PREVIEW_TEXT.failed}
                </p>
              )}
              {busy && (
                <span className="absolute inset-0 grid place-items-center">
                  <Spinner size="lg" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** A zoom button: unavailable at its end, through `aria-disabled`, so focus stays (AC-44). */
function ZoomButton({
  label,
  unavailable,
  describedBy,
  onPress,
  children,
}: {
  readonly label: string;
  readonly unavailable: boolean;
  readonly describedBy: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      aria-disabled={unavailable ? "true" : undefined}
      onClick={onPress}
      className={cx(
        "grid size-10 place-items-center rounded-full transition-[background-color,border-color]",
        unavailable ? "text-ink-subtle" : "text-ink hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One page in the rail (AC-41): its thumbnail, its count badge, its mark and
 * its label, as one button named "Page {n} · {mark}, {count} found", so the
 * visible label is part of the name. Memoised: a pick or a draw elsewhere in
 * the rail renders it again only when what it shows changes.
 */
const Thumb = memo(function Thumb({
  page,
  mark,
  count,
  current,
  tabStop,
  drawn,
  shape,
  onShow,
  onKey,
  onFocusStop,
  onButton,
  onCanvas,
}: {
  readonly page: number;
  readonly mark: string | null;
  readonly count: number;
  readonly current: boolean;
  readonly tabStop: boolean;
  readonly drawn: boolean;
  readonly shape: number;
  readonly onShow: (page: number) => void;
  readonly onKey: (event: KeyboardEvent<HTMLButtonElement>, page: number) => void;
  readonly onFocusStop: (page: number) => void;
  readonly onButton: (page: number, button: HTMLButtonElement | null) => void;
  readonly onCanvas: (page: number, canvas: HTMLCanvasElement | null) => void;
}) {
  const { width, height } = thumbSize(shape);
  return (
    <button
      ref={(button) => onButton(page, button)}
      type="button"
      data-page={page}
      data-testid="preview-thumb"
      tabIndex={tabStop ? 0 : -1}
      aria-current={current ? "page" : undefined}
      aria-label={PREVIEW_TEXT.thumb(page, mark, count)}
      onClick={() => onShow(page)}
      onKeyDown={(event) => onKey(event, page)}
      onFocus={() => onFocusStop(page)}
      className="flex flex-col items-center gap-1.5 rounded-item p-1"
    >
      <span
        className="relative grid place-items-center"
        style={{ width: THUMB_BOX.width, height: THUMB_BOX.height }}
      >
        <span
          className={cx(
            "relative overflow-hidden rounded-item",
            current ? "border-2 border-accent" : "border border-border",
            drawn ? "bg-surface" : "bg-muted",
          )}
          style={{ width, height }}
        >
          <canvas
            ref={(canvas) => onCanvas(page, canvas)}
            aria-hidden="true"
            className="absolute inset-0 size-full"
          />
        </span>
        {count > 0 && (
          <span
            aria-hidden="true"
            data-testid="preview-badge"
            className="absolute -top-2 -right-2 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-small leading-none font-semibold text-on-accent"
          >
            {countText(count)}
          </span>
        )}
        {mark !== null && (
          <span
            aria-hidden="true"
            data-testid="preview-mark"
            className={cx(
              "absolute -top-2 grid size-6 place-items-center rounded-full bg-warning-icon text-small leading-none font-bold text-on-accent",
              count > 0 ? "-left-2" : "-right-2",
            )}
          >
            !
          </span>
        )}
      </span>
      <span
        className={cx(
          "max-w-25 text-center text-small",
          current ? "font-semibold text-ink" : "text-ink-subtle",
        )}
      >
        {PREVIEW_TEXT.thumbLabel(page, mark)}
      </span>
    </button>
  );
});
