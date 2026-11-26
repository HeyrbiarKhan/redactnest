import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PagePreview, type PreviewHandle } from "@/app/tool/page-preview";
import { config } from "@/config";
import { PREVIEW_TEXT } from "@/lib/flow-text";
import { pageWarningLines } from "@/lib/page-findings";
import type { DrawAsk } from "@/worker/client";
import {
  asMatchId,
  type DocumentSummary,
  type MatchBox,
  type MatchId,
  type PageDrawnMessage,
  type ReviewMatch,
} from "@/worker/protocol";

import { expectNoAxeViolations } from "../setup/component";

/**
 * The page preview, P (spec 0026 child 0002), in jsdom. The browser's picture
 * features are stubbed: a `bitmaprenderer` context that records what it is
 * given, a `ResizeObserver` the test fires with the page area's width, an
 * `IntersectionObserver` that reports every thumbnail near the rail, and
 * pictures with their `close` spied on. Each draw waits for the test to
 * answer it, so what is in flight is the test's to decide.
 *
 * Fake timers only around the zoom's settle wait, with `fireEvent` and
 * `act`, never `userEvent` (which never returns under them).
 */

interface FakePicture {
  readonly width: number;
  readonly height: number;
  readonly close: ReturnType<typeof vi.fn>;
}

function picture(width = 600, height = 776): FakePicture {
  return { width, height, close: vi.fn() };
}

/** Every `transferFromImageBitmap` call, by canvas. */
const shown = new Map<HTMLCanvasElement, unknown[]>();
let resize: ((width: number) => void) | null = null;

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    resize = (width) =>
      this.callback(
        [{ contentRect: { width } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
  }
  disconnect(): void {}
  unobserve(): void {}
}

class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    queueMicrotask(() =>
      this.callback(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      ),
    );
  }
  disconnect(): void {}
  unobserve(): void {}
}

/** A draw the test answers. */
interface Pending {
  readonly ask: DrawAsk;
  answer(picture: FakePicture | null, boxes?: readonly MatchBox[]): Promise<void>;
}

let pending: Pending[];

function drawer() {
  return vi.fn(
    (ask: DrawAsk) =>
      new Promise<PageDrawnMessage>((resolve) => {
        pending.push({
          ask,
          async answer(drawn, boxes = []) {
            await act(async () => {
              resolve({
                id: "draw",
                jobId: "job",
                kind: "page-drawn",
                page: ask.page,
                purpose: ask.purpose,
                picture: drawn as unknown as ImageBitmap | null,
                boxes,
              });
            });
          },
        });
      }),
  );
}

function pageDraws(): Pending[] {
  return pending.filter((entry) => entry.ask.purpose === "page");
}

beforeEach(() => {
  pending = [];
  shown.clear();
  resize = null;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== "bitmaprenderer") return null;
    const record = (canvas: HTMLCanvasElement, bitmap: unknown) =>
      shown.set(canvas, [...(shown.get(canvas) ?? []), bitmap]);
    return {
      transferFromImageBitmap: record.bind(null, this),
    } as unknown as ImageBitmapRenderingContext;
  } as typeof HTMLCanvasElement.prototype.getContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SUMMARY: DocumentSummary = {
  pageCount: 3,
  pages: [
    { findings: [] },
    { findings: ["scanned", "machine-read-text"] },
    { findings: [] },
  ],
};

function row(id: string, page: number, over: Partial<ReviewMatch> = {}): ReviewMatch {
  return {
    id: asMatchId(id),
    type: "email",
    term: null,
    termNotes: [],
    page,
    text: `${id}@example.com`,
    before: "",
    after: "",
    beforeCut: false,
    afterCut: false,
    tickedByDefault: true,
    blocked: null,
    concealed: null,
    ...over,
  };
}

const ROWS: readonly ReviewMatch[] = [
  row("a", 1),
  row("b", 1),
  row("c", 3),
  row("blocked", 3, { blocked: "slanted-text", tickedByDefault: false }),
];

const BOXES: readonly MatchBox[] = [
  { id: asMatchId("a"), rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }] },
  { id: asMatchId("b"), rects: [{ x: 0.1, y: 0.5, width: 0.3, height: 0.02 }] },
];

function renderPreview(
  over: Partial<{
    matches: readonly ReviewMatch[];
    ticked: ReadonlySet<MatchId>;
    running: boolean;
  }> = {},
) {
  const draw = drawer();
  const ref = createRef<PreviewHandle>();
  const props = {
    summary: SUMMARY,
    matches: ROWS,
    ticked: new Set([asMatchId("a")]) as ReadonlySet<MatchId>,
    running: false,
    ...over,
  };
  const view = render(<PagePreview ref={ref} draw={draw} {...props} />);
  const rerender = (next: Partial<typeof props>) =>
    view.rerender(<PagePreview ref={ref} draw={draw} {...props} {...next} />);
  return { ...view, draw, ref, rerender };
}

/** Give the page area its width, as the browser would once laid out. */
function layOut(width = 600): void {
  act(() => resize?.(width));
}

function pageCanvas(): HTMLCanvasElement {
  return screen.getByTestId("preview-canvas") as unknown as HTMLCanvasElement;
}

describe("the rail (AC-41)", () => {
  it("names each page by its number, its mark and its count, and marks the one on show", async () => {
    renderPreview();
    const rail = screen.getByRole("navigation", { name: PREVIEW_TEXT.rail });
    const buttons = within(rail).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Page 1, 2 found",
      "Page 2 · scan",
      "Page 3, 2 found",
    ]);
    expect(buttons[0]).toHaveAttribute("aria-current", "page");
    expect(buttons[1]).not.toHaveAttribute("aria-current");
    expect(within(buttons[1]).getByText("2 · scan")).toBeInTheDocument();
    expect(within(buttons[1]).getByTestId("preview-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // Blocked rows count too; a page with none carries no badge.
    expect(within(buttons[2]).getByTestId("preview-badge")).toHaveTextContent("2");
    expect(within(buttons[1]).queryByTestId("preview-badge")).toBeNull();
    await expectNoAxeViolations(document.body);
  });

  it("is one tab stop whose arrows, Home and End move focus without showing a page", () => {
    renderPreview();
    const buttons = within(screen.getByRole("navigation")).getAllByRole("button");
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);

    act(() => buttons[0].focus());
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1], { key: "End" });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2], { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    expect(screen.getByTestId("preview-page-of")).toHaveTextContent("Page 1 of 3");

    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.click(buttons[1]);
    expect(screen.getByTestId("preview-page-of")).toHaveTextContent("Page 2 of 3");
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("shows a page's warnings above it, in the findings' own words", () => {
    renderPreview();
    expect(screen.queryByTestId("preview-warnings")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page 2 · scan" }));
    expect(screen.getByTestId("preview-warnings")).toHaveTextContent(
      pageWarningLines(SUMMARY, 2)[0] ?? "a line",
    );
  });

  it("asks for each thumbnail near the rail, two at a time, and keeps what lands", async () => {
    renderPreview();
    layOut();
    await act(async () => {});
    const thumbs = pending.filter((entry) => entry.ask.purpose === "thumbnail");
    expect(thumbs.map((entry) => entry.ask.page)).toEqual([1, 2]);
    expect(thumbs[0].ask).toEqual({
      page: 1,
      purpose: "thumbnail",
      width: 84,
      maxPixels: 84 * 112,
    });
    const first = picture(84, 109);
    await thumbs[0].answer(first);
    expect(pending.filter((entry) => entry.ask.purpose === "thumbnail")).toHaveLength(3);
    const canvases = [...shown.keys()].filter((canvas) => canvas !== pageCanvas());
    expect(canvases).toHaveLength(1);
    expect(shown.get(canvases[0])).toEqual([first]);
  });
});

describe("the page and its boxes (AC-40, AC-42, AC-45)", () => {
  it("asks for page 1 at the area's width, busy until it lands, then shows it with its boxes", async () => {
    const { draw } = renderPreview();
    expect(draw).not.toHaveBeenCalled();
    layOut(600);

    const [first] = pageDraws();
    expect(first.ask).toEqual({
      page: 1,
      purpose: "page",
      width: 600,
      maxPixels: config.previewMaxPixels,
    });
    expect(screen.getByTestId("preview-page")).toHaveAttribute("aria-busy", "true");
    expect(pageCanvas()).toHaveClass("invisible");

    const drawn = picture();
    await first.answer(drawn, BOXES);
    expect(shown.get(pageCanvas())).toEqual([drawn]);
    expect(drawn.close).not.toHaveBeenCalled();
    expect(screen.getByTestId("preview-page")).not.toHaveAttribute("aria-busy");
    expect(pageCanvas()).not.toHaveClass("invisible");
    expect(pageCanvas().style.width).toBe("600px");

    const boxes = document.querySelectorAll("[data-box]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveAttribute("data-ticked");
    expect(boxes[0]).toHaveClass("border-accent", "bg-accent-soft", "mix-blend-multiply");
    expect(boxes[1]).not.toHaveAttribute("data-ticked");
    expect(boxes[1]).toHaveClass("border-dashed", "border-border-strong");
    expect((boxes[0] as HTMLElement).style.left).toBe("10%");
    expect(boxes[0].closest("[aria-hidden=true]")).not.toBeNull();
  });

  it("follows a tick at once, asking nothing of the worker", async () => {
    const { rerender } = renderPreview();
    layOut();
    await pageDraws()[0].answer(picture(), BOXES);
    const before = pending.length;
    rerender({ ticked: new Set([asMatchId("b")]) });
    const boxes = document.querySelectorAll("[data-box]");
    expect(boxes[0]).not.toHaveAttribute("data-ticked");
    expect(boxes[1]).toHaveAttribute("data-ticked");
    expect(pending).toHaveLength(before);
  });

  it("clears the picture at once on another page, and never shows the last page's boxes", async () => {
    renderPreview();
    layOut();
    await pageDraws()[0].answer(picture(), BOXES);

    fireEvent.click(screen.getByRole("button", { name: "Page 3, 2 found" }));
    expect(shown.get(pageCanvas())?.at(-1)).toBeNull();
    expect(document.querySelectorAll("[data-box]")).toHaveLength(0);
    expect(pageDraws().at(-1)?.ask.page).toBe(3);
  });

  it("shows the failure line when a page cannot be drawn, and asks again when shown again", async () => {
    renderPreview();
    layOut();
    await pageDraws()[0].answer(null);
    expect(screen.getByTestId("preview-failed")).toHaveTextContent(PREVIEW_TEXT.failed);
    expect(screen.getByTestId("preview-page")).not.toHaveAttribute("aria-busy");
    expect(pageDraws()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Page 1, 2 found" }));
    expect(pageDraws()).toHaveLength(2);
    expect(screen.queryByTestId("preview-failed")).toBeNull();
  });

  it("sends no draw while a run works, and the wanted one once it is over", async () => {
    const { rerender } = renderPreview({ running: true });
    layOut();
    await act(async () => {});
    expect(pending).toEqual([]);

    rerender({ running: false });
    await act(async () => {});
    expect(pageDraws()).toHaveLength(1);
  });

  it("closes a reply from an older rows version and asks again", async () => {
    const { rerender } = renderPreview();
    layOut();
    const [stale] = pageDraws();
    // A term search lands a row on page 1 while the draw is in flight.
    rerender({ matches: [...ROWS, row("term-row", 1, { type: "term" })] });
    const late = picture();
    await stale.answer(late, BOXES);
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(pageDraws()).toHaveLength(2);
  });

  it("asks again for the page on show when a term search lands rows on it, and not otherwise", async () => {
    const { rerender } = renderPreview();
    layOut();
    await pageDraws()[0].answer(picture(), BOXES);

    rerender({ matches: [...ROWS, row("other-page", 3, { type: "term" })] });
    await act(async () => {});
    expect(pageDraws()).toHaveLength(1);

    rerender({ matches: [...ROWS, row("this-page", 1, { type: "term" })] });
    await act(async () => {});
    expect(pageDraws()).toHaveLength(2);
  });

  it("lets go of a removed row's boxes at once", async () => {
    const { rerender } = renderPreview();
    layOut();
    await pageDraws()[0].answer(picture(), BOXES);
    rerender({ matches: ROWS.filter((match) => match.id !== asMatchId("b")) });
    expect(document.querySelectorAll("[data-box]")).toHaveLength(1);
  });
});

describe("the pick (AC-43)", () => {
  it("shows the picked row's page and rings its boxes", async () => {
    const { ref } = renderPreview();
    layOut();
    await pageDraws()[0].answer(picture(), BOXES);

    act(() => ref.current?.pick(asMatchId("c")));
    expect(screen.getByTestId("preview-page-of")).toHaveTextContent("Page 3 of 3");
    const boxC = {
      id: asMatchId("c"),
      rects: [{ x: 0.2, y: 0.8, width: 0.3, height: 0.02 }],
    };
    await pageDraws().at(-1)?.answer(picture(), [boxC]);
    expect(document.querySelector("[data-box][data-picked]")).toHaveClass(
      "outline-focus",
    );
  });

  it("picks no blocked row", () => {
    const { ref } = renderPreview();
    act(() => ref.current?.pick(asMatchId("blocked")));
    expect(screen.getByTestId("preview-page-of")).toHaveTextContent("Page 1 of 3");
  });
});

describe("the zoom (AC-44)", () => {
  it("stretches at once and asks for a fresh picture 150 ms after the last press", async () => {
    vi.useFakeTimers();
    renderPreview();
    layOut(600);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await pageDraws()[0].answer(picture(), BOXES);

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(screen.getByTestId("preview-zoom-level")).toHaveTextContent("150%");
    expect(pageCanvas().style.width).toBe("900px");
    expect(pageDraws()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(pageDraws()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pageDraws()).toHaveLength(2);
    expect(pageDraws()[1].ask.width).toBe(900);
  });

  it("stops at 50 and 200%, with the button unavailable and focus kept", () => {
    renderPreview();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(zoomIn).toHaveAccessibleDescription("100%");
    for (let press = 0; press < 5; press += 1) fireEvent.click(zoomIn);
    expect(screen.getByTestId("preview-zoom-level")).toHaveTextContent("200%");
    expect(zoomIn).toHaveAttribute("aria-disabled", "true");
    for (let press = 0; press < 8; press += 1) fireEvent.click(zoomOut);
    expect(screen.getByTestId("preview-zoom-level")).toHaveTextContent("50%");
    expect(zoomOut).toHaveAttribute("aria-disabled", "true");
    expect(zoomIn).not.toHaveAttribute("aria-disabled");
  });

  describe("a live change of pixel density (AC-44, AC-45)", () => {
    /**
     * Chromium's device emulation fires no `resolution` change (verify.md,
     * task 17's 1x then 2x step), so the switch is pinned here: a fake
     * `matchMedia` records each query and its listeners, and the test moves
     * `devicePixelRatio` and fires the one being listened to, as a window
     * dragged to a screen with another scale would.
     */
    interface FakeQuery {
      readonly media: string;
      readonly listeners: Set<() => void>;
    }
    let queries: FakeQuery[];

    function listening(): FakeQuery[] {
      return queries.filter((query) => query.listeners.size > 0);
    }

    function moveToScale(ratio: number): void {
      const [current] = listening();
      vi.stubGlobal("devicePixelRatio", ratio);
      act(() => {
        for (const listener of [...(current?.listeners ?? [])]) listener();
      });
    }

    beforeEach(() => {
      queries = [];
      vi.stubGlobal("devicePixelRatio", 1);
      vi.stubGlobal(
        "matchMedia",
        vi.fn((media: string) => {
          const query: FakeQuery = { media, listeners: new Set() };
          queries.push(query);
          return {
            media,
            addEventListener: (_type: string, listener: () => void) =>
              query.listeners.add(listener),
            removeEventListener: (_type: string, listener: () => void) =>
              query.listeners.delete(listener),
          };
        }),
      );
    });

    it("listens for the current density only, and moves its listener to the new one", () => {
      renderPreview();
      expect(listening().map((query) => query.media)).toEqual(["(resolution: 1dppx)"]);

      moveToScale(2);
      expect(listening().map((query) => query.media)).toEqual(["(resolution: 2dppx)"]);

      moveToScale(1.5);
      expect(listening().map((query) => query.media)).toEqual(["(resolution: 1.5dppx)"]);
    });

    it("stops listening when the preview goes", () => {
      const { unmount } = renderPreview();
      moveToScale(2);
      unmount();
      expect(listening()).toEqual([]);
    });

    it("asks for the page again at the new density 150 ms after the change, never at once", async () => {
      vi.useFakeTimers();
      renderPreview();
      layOut(600);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(pageDraws().map((entry) => entry.ask.width)).toEqual([600]);
      const first = picture(600, 776);
      await pageDraws()[0].answer(first, BOXES);

      moveToScale(2);
      expect(pageDraws()).toHaveLength(1);
      // The picture on show stays, stretched to the same CSS width.
      expect(pageCanvas().style.width).toBe("600px");
      expect(first.close).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(149);
      });
      expect(pageDraws()).toHaveLength(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(pageDraws()).toHaveLength(2);
      expect(pageDraws()[1].ask).toEqual({
        page: 1,
        purpose: "page",
        width: 1200,
        maxPixels: config.previewMaxPixels,
      });

      const sharper = picture(1200, 1552);
      await pageDraws()[1].answer(sharper, BOXES);
      expect(shown.get(pageCanvas())?.at(-1)).toBe(sharper);
      expect(pageCanvas().style.width).toBe("600px");
    });

    it("settles once after a run of changes, at the last density", async () => {
      vi.useFakeTimers();
      renderPreview();
      layOut(600);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await pageDraws()[0].answer(picture(), BOXES);

      moveToScale(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      moveToScale(3);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(pageDraws().map((entry) => entry.ask.width)).toEqual([600, 1800]);
    });

    it("keeps the thumbnails drawn at the old density rather than drawing them again", async () => {
      renderPreview();
      layOut();
      await act(async () => {});
      const thumbs = () => pending.filter((entry) => entry.ask.purpose === "thumbnail");
      expect(thumbs().map((entry) => entry.ask.width)).toEqual([84, 84]);
      await thumbs()[0].answer(picture(84, 109));
      expect(thumbs()[2].ask.page).toBe(3);

      // Page 2 is still in flight at 1x; the switch comes before it lands.
      moveToScale(2);
      await thumbs()[1].answer(picture(84, 109));
      await thumbs()[2].answer(picture(84, 109));
      await act(async () => {});
      // Every page has its thumbnail now, so none is asked again at 2x.
      expect(thumbs()).toHaveLength(3);
    });

    it("asks a thumbnail still waiting for its turn at the density it is asked under", async () => {
      renderPreview();
      layOut();
      await act(async () => {});
      const thumbs = () => pending.filter((entry) => entry.ask.purpose === "thumbnail");
      expect(thumbs().map((entry) => entry.ask.page)).toEqual([1, 2]);

      moveToScale(2);
      await thumbs()[0].answer(picture(168, 218));
      expect(thumbs()[2].ask).toEqual({
        page: 3,
        purpose: "thumbnail",
        width: 168,
        maxPixels: 84 * 112 * 4,
      });
    });

    it("sends no draw for a change of density while a run works, and the wanted one after", async () => {
      vi.useFakeTimers();
      const { rerender } = renderPreview();
      layOut(600);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await pageDraws()[0].answer(picture(), BOXES);

      rerender({ running: true });
      moveToScale(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(pageDraws()).toHaveLength(1);

      rerender({ running: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(pageDraws().map((entry) => entry.ask.width)).toEqual([600, 1200]);
    });
  });

  it("makes the page area a focusable region named for the page", () => {
    renderPreview();
    const region = screen.getByRole("region", { name: "Page 1" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("group", { name: "Zoom" })).toBeInTheDocument();
  });
});

describe("letting go (AC-47)", () => {
  it("gives every canvas nothing on unmount, and closes a picture that lands after", async () => {
    const { unmount } = renderPreview();
    layOut();
    await act(async () => {});
    const thumb = pending.find((entry) => entry.ask.purpose === "thumbnail");
    await thumb?.answer(picture(84, 109));
    const [page] = pageDraws();
    const canvases = [...document.querySelectorAll("canvas")] as HTMLCanvasElement[];

    unmount();
    for (const canvas of canvases) {
      expect(shown.get(canvas)?.at(-1)).toBeNull();
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    }
    const late = picture();
    await page.answer(late, BOXES);
    expect(late.close).toHaveBeenCalledTimes(1);
  });

  it("names the aside and holds no live region", () => {
    renderPreview();
    const aside = screen.getByRole("complementary", { name: PREVIEW_TEXT.label });
    expect(aside.querySelector("[aria-live]")).toBeNull();
  });
});
