import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Spec 0012, AC-24 and task 16. The paid cap measure spec 0005 still owed:
 * how long a 50 page open takes with detection, and how long the slowest
 * single read runs, on a dense document in a real browser.
 *
 * `detect-dense.pdf` is a 50 page staff directory with 2,200 matches, the paid
 * cap's worth of a dense document. The entitlement is routed to the paid tier
 * so the page cap lets all 50 pages in.
 *
 * The open runs from the file input's `change` to the checklist's rows being
 * committed to the page, which is what a visitor waits through, the engine's
 * own load included.
 *
 * A read is the work between two of the engine's checkpoints: the yield and
 * the cancel check it takes after each page during inspection, and after each
 * of a page's three reads during detection (spec 0005, AC-11; spec 0006,
 * AC-29). A cancel is noticed only at a checkpoint, so the slowest read is how
 * long a cancel can wait. Nothing in the product exposes those checkpoints, and
 * nothing should, so the worker's bootstrap is served with a probe in front of
 * it: the probe notes when each `setTimeout(…, 0)` is asked for and when it
 * fires (the checkpoint's yield), and when each message leaves the worker, and
 * sends the notes out on a `BroadcastChannel` once the result is posted. The
 * worker's own code runs unchanged.
 *
 * Its own Playwright project runs it after every other test, on one worker
 * (`playwright.config.ts`), so nothing else competes for the page while it
 * times. Spec 0012's `rationale.md` records the figures, taken the same way.
 */

const FIXTURE = resolve("tests/fixtures/detect-dense.pdf");
const PAGES = 50;
const ROWS = 2_200;

/** AC-24's bar: Pro ships at 50 pages only if both hold. */
const OPEN_BUDGET_MS = 10_000;
const READ_BUDGET_MS = 1_000;

const CHANNEL = "redactnest-speed";

/** Turbopack's worker bootstrap, the first script the worker runs. */
const WORKER_BOOTSTRAP = /\/_next\/static\/chunks\/turbopack-worker-[^/?]+\.js(\?|$)/;

/**
 * Runs in the worker before the bootstrap loads anything, so the worker's own
 * code finds these wrappers in place of the globals it calls. Plain script
 * text, because it is served as part of the bootstrap.
 */
const WORKER_PROBE = `;(() => {
  const notes = [];
  const nativeSetTimeout = self.setTimeout.bind(self);
  self.setTimeout = (callback, delay, ...rest) => {
    if (delay) return nativeSetTimeout(callback, delay, ...rest);
    const askedAt = performance.now();
    return nativeSetTimeout((...args) => {
      notes.push({ kind: "yield", at: askedAt, resumedAt: performance.now() });
      return callback(...args);
    }, delay, ...rest);
  };
  const channel = new BroadcastChannel(${JSON.stringify(CHANNEL)});
  const nativePostMessage = self.postMessage.bind(self);
  self.postMessage = (message, ...rest) => {
    const kind = message && message.kind;
    const label = kind === "progress" ? message.phase : kind;
    notes.push({ kind: "post", label, at: performance.now() });
    if (kind === "result") channel.postMessage(notes.slice());
    return nativePostMessage(message, ...rest);
  };
})();
`;

type ProbeNote =
  | { readonly kind: "yield"; readonly at: number; readonly resumedAt: number }
  | { readonly kind: "post"; readonly label: string; readonly at: number };

declare global {
  interface Window {
    __redactnestOpen?: {
      chosenAt: number | null;
      resultAt: number | null;
      shownAt: number | null;
      notes: ProbeNote[] | null;
    };
  }
}

// A 10 MB engine download and a 50 page open with detection.
test.describe.configure({ timeout: 180_000 });

/** When the worker posted a message, by its kind or its progress phase. */
function postedAt(notes: readonly ProbeNote[], label: string): number {
  const note = notes.find((entry) => entry.kind === "post" && entry.label === label);
  if (note === undefined) throw new Error(`the worker never posted ${label}`);
  return note.at;
}

/**
 * Every read between two posts: from the first post to the first yield, from
 * each yield's return to the next yield, and from the last return to the
 * closing post. Each is a stretch the worker ran without a checkpoint.
 */
function readsBetween(
  notes: readonly ProbeNote[],
  from: string,
  to: string,
): readonly number[] {
  const start = postedAt(notes, from);
  const end = postedAt(notes, to);
  const yields = notes
    .filter(
      (note): note is Extract<ProbeNote, { kind: "yield" }> =>
        note.kind === "yield" && note.at > start && note.at < end,
    )
    .sort((a, b) => a.at - b.at);

  let resumed = start;
  const reads: number[] = [];
  for (const { at, resumedAt } of yields) {
    reads.push(at - resumed);
    resumed = resumedAt;
  }
  reads.push(end - resumed);
  return reads;
}

test("a 50 page dense open stays within AC-24's bar", async ({ page, context }) => {
  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: {
        tier: "paid",
        pageCap: PAGES,
        maxFileBytes: 26_214_400,
        account: "signed-in",
      },
    }),
  );

  let probed = false;
  await context.route(WORKER_BOOTSTRAP, async (route) => {
    const response = await route.fetch();
    probed = true;
    await route.fulfill({ response, body: WORKER_PROBE + (await response.text()) });
  });

  await page.addInitScript((channel) => {
    const timing = {
      chosenAt: null as number | null,
      resultAt: null as number | null,
      shownAt: null as number | null,
      notes: null as ProbeNote[] | null,
    };
    window.__redactnestOpen = timing;

    new BroadcastChannel(channel).addEventListener("message", (event) => {
      timing.notes = event.data as ProbeNote[];
    });

    document.addEventListener(
      "change",
      (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          timing.chosenAt = performance.now();
        }
      },
      true,
    );

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

    new MutationObserver((_, observer) => {
      if (timing.resultAt === null) return;
      if (!document.querySelector('[data-testid="checklist"] li')) return;
      observer.disconnect();
      timing.shownAt = performance.now();
    }).observe(document, { childList: true, subtree: true });
  }, CHANNEL);

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const timing = window.__redactnestOpen;
          return timing?.shownAt != null && timing.notes !== null;
        }),
      { timeout: 150_000 },
    )
    .toBe(true);
  await expect(page.getByTestId("checklist").locator("li")).toHaveCount(ROWS + 2);

  const timing = await page.evaluate(() => window.__redactnestOpen);
  if (!timing?.chosenAt || !timing.resultAt || !timing.shownAt || !timing.notes) {
    throw new Error("the open was not timed");
  }
  expect(probed, "the worker's bootstrap was never served through the probe").toBe(true);

  const notes = timing.notes;
  const inspecting = readsBetween(notes, "inspecting", "detecting");
  const detecting = readsBetween(notes, "detecting", "result");

  // The control: the probe saw the checkpoints it claims to time. Inspection
  // yields after every page, detection after each of a page's reads, and
  // every page of this fixture has matches, so has all three.
  expect(inspecting.length, "inspection's checkpoints").toBeGreaterThan(PAGES);
  expect(detecting.length, "detection's checkpoints").toBeGreaterThan(PAGES * 3);

  const posts = notes.filter(
    (note): note is Extract<ProbeNote, { kind: "post" }> => note.kind === "post",
  );
  const phasesMs = Object.fromEntries(
    posts
      .slice(0, -1)
      .map((note, at) => [note.label, Math.round(posts[at + 1].at - note.at)]),
  );

  const openMs = timing.shownAt - timing.chosenAt;
  const slowestInspectMs = Math.max(...inspecting);
  const slowestDetectMs = Math.max(...detecting);
  const report = {
    openMs: Math.round(openMs),
    toResultMs: Math.round(timing.resultAt - timing.chosenAt),
    phasesMs,
    slowestInspectMs: Math.round(slowestInspectMs),
    slowestDetectMs: Math.round(slowestDetectMs),
    inspectReads: inspecting.length,
    detectReads: detecting.length,
  };
  test.info().annotations.push({ type: "timing", description: JSON.stringify(report) });
  console.log(`paid cap timing ${JSON.stringify(report)}`);

  expect(openMs).toBeLessThanOrEqual(OPEN_BUDGET_MS);
  expect(slowestDetectMs).toBeLessThanOrEqual(READ_BUDGET_MS);
  expect(slowestInspectMs).toBeLessThanOrEqual(READ_BUDGET_MS);
});
