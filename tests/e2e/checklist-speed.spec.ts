import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Spec 0007, AC-8 and task 13. The checklist on a dense document, timed in a
 * real browser: its first render after the open, and a single tick.
 *
 * `detect-dense.pdf` is a 50 page staff directory with 2,200 matches, every one
 * ticked, the paid cap's worth of a dense document. The entitlement is routed
 * to the paid tier so the page cap lets all 50 pages in.
 *
 * The first render runs from the moment the worker's `result` reply reaches
 * the page to the first paint after the checklist is in the page, so it holds
 * React's render and commit and the browser's layout and paint, and nothing of
 * the engine. The tick runs from the click to the next paint. Long tasks in
 * that window are recorded too, to see how much of the work comes after the
 * paint (the checkboxes' mount effects).
 */

const FIXTURE = resolve("tests/fixtures/detect-dense.pdf");
const ROWS = 2_200;

/** AC-8's two lines. */
const FIRST_RENDER_BUDGET_MS = 1_000;
const TICK_BUDGET_MS = 200;

// A 10 MB engine download and a 50 page open with detection come first.
test.describe.configure({ timeout: 180_000 });

declare global {
  interface Window {
    __redactnestTiming?: {
      resultAt: number | null;
      committedAt: number | null;
      paintedAt: number | null;
      longTasks: { start: number; duration: number }[];
    };
  }
}

test("the checklist renders a dense document and takes a tick within AC-8's lines", async ({
  page,
}) => {
  await page.route("**/api/entitlement", (route) =>
    route.fulfill({ json: { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400 } }),
  );

  await page.addInitScript(() => {
    const timing = {
      resultAt: null as number | null,
      committedAt: null as number | null,
      paintedAt: null as number | null,
      longTasks: [] as { start: number; duration: number }[],
    };
    window.__redactnestTiming = timing;

    // Heard before the page's own listener, which is added after construction.
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener("message", (event: MessageEvent<{ kind?: string }>) => {
          if (event.data?.kind === "result") timing.resultAt = performance.now();
        });
      }
    };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        timing.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });

    new MutationObserver((_, observer) => {
      if (timing.resultAt === null) return;
      if (!document.querySelector('[data-testid="checklist"] li')) return;
      observer.disconnect();
      timing.committedAt = performance.now();
      requestAnimationFrame(() =>
        setTimeout(() => {
          timing.paintedAt = performance.now();
        }, 0),
      );
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);

  await expect
    .poll(() => page.evaluate(() => window.__redactnestTiming?.paintedAt ?? null), {
      timeout: 150_000,
    })
    .not.toBeNull();
  await expect(page.getByTestId("checklist").locator("li")).toHaveCount(ROWS + 2);

  // Let any work queued after the paint finish before reading the long tasks.
  await page.waitForTimeout(1_000);
  const timing = await page.evaluate(() => window.__redactnestTiming);
  if (!timing?.resultAt || !timing.committedAt || !timing.paintedAt) {
    throw new Error("the first render was not timed");
  }
  const firstRender = timing.paintedAt - timing.resultAt;
  const afterPaint = timing.longTasks
    .filter((task) => task.start >= timing.paintedAt!)
    .reduce((total, task) => total + task.duration, 0);

  // A row far down the list, then the same row again, then one near the top.
  const ticks: number[] = [];
  for (const name of [
    "staff.0900@example.com",
    "staff.0900@example.com",
    "020 7946 0010",
  ]) {
    const box = page.getByRole("checkbox", { name, exact: true }).first();
    ticks.push(
      await box.evaluate(async (element) => {
        const start = performance.now();
        (element as HTMLInputElement).click();
        await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
        return performance.now() - start;
      }),
    );
  }

  const report = {
    firstRenderMs: Math.round(firstRender),
    toCommitMs: Math.round(timing.committedAt - timing.resultAt),
    longTaskMsAfterPaint: Math.round(afterPaint),
    tickMs: ticks.map(Math.round),
  };
  test.info().annotations.push({ type: "timing", description: JSON.stringify(report) });
  console.log(`checklist timing ${JSON.stringify(report)}`);

  expect(firstRender).toBeLessThan(FIRST_RENDER_BUDGET_MS);
  for (const tick of ticks) expect(tick).toBeLessThan(TICK_BUDGET_MS);
});
