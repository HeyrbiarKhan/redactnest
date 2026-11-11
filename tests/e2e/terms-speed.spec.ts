import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * The names and addresses `detect-dense.pdf` holds, as `denseRow` in
 * `scripts/lib/detection-fixtures.mjs` writes them. Written out here because
 * Playwright's loader cannot import the fixture script's modules; if the
 * fixture's names change, change these with them.
 */
const DENSE_FIRST =
  "Alex Bea Cai Dana Eli Fay Gus Hana Ivo Jo Kit Lior Mae Nia Oli Pia Rex Sol Tam Uma".split(
    " ",
  );
const DENSE_LAST =
  "Abbot Bryce Chen Dunn Evans Ford Garcia Hughes Iqbal Jones Khan Lopez Moss Nowak Okafor Patel Quinn Reyes Shaw Tran".split(
    " ",
  );

function denseRow(index: number): { name: string; email: string } {
  return {
    name: `${DENSE_FIRST[index % 20]} ${DENSE_LAST[Math.floor(index / 20) % 20]}`,
    email: `staff.${String(index).padStart(4, "0")}@example.com`,
  };
}

/**
 * Spec 0017, AC-28. Custom terms on the paid cap's dense document, in a real
 * browser: an open with 50 kept terms, from the file input's `change` to the
 * rows committed, the engine's load included, for three lists; a pasted batch
 * during review, from the paste to its rows committed; and the slowest single
 * read in any of them. The page break carry (AC-33) is on throughout.
 *
 * Each list is kept the way a visitor keeps one: pasted into the review of a
 * small file, then Start over, which ends the worker and keeps the list, so
 * the next open loads the engine again and searches the kept list in the
 * same read as detection.
 *
 * A read is the work between two of the engine's checkpoints, timed by the
 * same worker probe as `paid-cap-speed.spec.ts`, which notes each message the
 * worker receives and posts and each yield, and sends its notes out once a
 * `result` or `terms-found` is posted. The worker's own code runs unchanged.
 *
 * Its own Playwright project runs it after every other test, on one worker
 * (`SPEED_SPEC` in `playwright.config.ts`).
 */

const DENSE = resolve("tests/fixtures/detect-dense.pdf");
const SMALL = resolve("tests/fixtures/text-page.pdf");

const OPEN_BUDGET_MS = 5_000;
const PASTE_BUDGET_MS = 3_000;
const READ_BUDGET_MS = 1_000;

const CHANNEL = "redactnest-terms-speed";
const WORKER_BOOTSTRAP = /\/_next\/static\/chunks\/turbopack-worker-[^/?]+\.js(\?|$)/;

const WORKER_PROBE = `;(() => {
  let notes = [];
  const nativeSetTimeout = self.setTimeout.bind(self);
  self.setTimeout = (callback, delay, ...rest) => {
    if (delay) return nativeSetTimeout(callback, delay, ...rest);
    const askedAt = performance.now();
    return nativeSetTimeout((...args) => {
      notes.push({ kind: "yield", at: askedAt, resumedAt: performance.now() });
      return callback(...args);
    }, delay, ...rest);
  };
  self.addEventListener("message", (event) => {
    notes.push({ kind: "post", label: "received-" + (event.data && event.data.kind), at: performance.now() });
  });
  const channel = new BroadcastChannel(${JSON.stringify(CHANNEL)});
  const nativePostMessage = self.postMessage.bind(self);
  self.postMessage = (message, ...rest) => {
    const kind = message && message.kind;
    const label = kind === "progress" ? message.phase : kind;
    notes.push({ kind: "post", label, at: performance.now() });
    if (kind === "result" || kind === "terms-found") {
      channel.postMessage(notes);
      notes = [];
    }
    return nativePostMessage(message, ...rest);
  };
})();
`;

type ProbeNote =
  | { readonly kind: "yield"; readonly at: number; readonly resumedAt: number }
  | { readonly kind: "post"; readonly label: string; readonly at: number };

declare global {
  interface Window {
    __redactnestTerms?: {
      chosenAt: number | null;
      resultAt: number | null;
      shownAt: number | null;
      searchEndAt?: number;
      notes: ProbeNote[][];
    };
  }
}

test.describe.configure({ timeout: 400_000 });

function postedAt(notes: readonly ProbeNote[], label: string): number {
  const note = notes.find((entry) => entry.kind === "post" && entry.label === label);
  if (note === undefined) throw new Error(`the worker never posted ${label}`);
  return note.at;
}

/** Every stretch the worker ran without a checkpoint, between two notes. */
function readsBetween(notes: readonly ProbeNote[], from: string, to: string): number[] {
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

/** Each distinct word of the dense fixture, by fold, with how often it appears. */
function denseWords(): Map<string, { word: string; count: number }> {
  const words = new Map<string, { word: string; count: number }>();
  const add = (text: string) => {
    for (const [word] of text.matchAll(/\p{L}+/gu)) {
      const fold = word.toLowerCase();
      const seen = words.get(fold);
      words.set(fold, { word: seen?.word ?? word, count: (seen?.count ?? 0) + 1 });
    }
  };
  for (let index = 0; index < 1_100; index += 1) {
    const { name, email } = denseRow(index);
    add(`${name} ${email}`);
  }
  for (let page = 0; page < 50; page += 1) add("Staff directory");
  return words;
}

function mostFrequent(min: number, max: number, limit: number): string[] {
  return [...denseWords().values()]
    .filter(({ word }) => word.length >= min && word.length <= max)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit)
    .map(({ word }) => word);
}

/** 50 terms of 100 characters, found nowhere in a staff directory. */
const NOWHERE = Array.from({ length: 50 }, (_, index) =>
  `Nowhere ${index} ${"quixotic zephyr vellum ".repeat(5)}`.slice(0, 100).trim(),
);

async function routePaid(page: Page): Promise<void> {
  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400, account: "signed-in" },
    }),
  );
}

async function installProbe(page: Page): Promise<void> {
  await page.context().route(WORKER_BOOTSTRAP, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: WORKER_PROBE + (await response.text()) });
  });
  await page.addInitScript((channel) => {
    const timing = {
      chosenAt: null as number | null,
      resultAt: null as number | null,
      shownAt: null as number | null,
      notes: [] as ProbeNote[][],
    };
    window.__redactnestTerms = timing;
    new BroadcastChannel(channel).addEventListener("message", (event) => {
      timing.notes.push(event.data as ProbeNote[]);
    });
    document.addEventListener(
      "change",
      (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          timing.chosenAt = performance.now();
          timing.resultAt = null;
          timing.shownAt = null;
        }
      },
      true,
    );
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener("message", (event: MessageEvent<{ kind?: string }>) => {
          if (event.data?.kind === "result") timing.resultAt = performance.now();
        });
      }
    };
    new MutationObserver(() => {
      if (timing.resultAt === null || timing.shownAt !== null) return;
      if (!document.querySelector('[data-testid="checklist"] li')) return;
      timing.shownAt = performance.now();
    }).observe(document, { childList: true, subtree: true });
  }, CHANNEL);
}

/** Paste `lines` into the terms field, as a clipboard holding them would. */
async function paste(page: Page, lines: readonly string[]): Promise<number> {
  await page.getByRole("textbox", { name: "Add a name, number or phrase" }).focus();
  return page.evaluate((text) => {
    const input = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const at = performance.now();
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return at;
  }, lines.join("\n"));
}

/** Wait until the search in flight has landed and Add is no longer busy. */
/**
 * Wait until all `count` terms are listed and searched: every chip says how
 * its search went, and none is searching. A paste lands in one render, so the
 * chips are there before Add shows busy, and waiting on Add alone would read
 * its state from before the search began.
 */
async function searched(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId("term-chip")).toHaveCount(count, { timeout: 120_000 });
  await expect(page.getByTestId("terms-status")).not.toContainText("Searching", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("terms-add")).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
}

/**
 * When Add stops being busy, timed in the page: the render that lands a
 * search's rows is the one that ends it (spec 0017, AC-19).
 */
async function watchSearchEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const add = document.querySelector('[data-testid="terms-add"]');
    const timing = window.__redactnestTerms;
    if (!add || !timing) throw new Error("nothing to watch");
    let busy = false;
    new MutationObserver((_, observer) => {
      if (add.getAttribute("aria-disabled") === "true") busy = true;
      else if (busy) {
        timing.searchEndAt = performance.now();
        observer.disconnect();
      }
    }).observe(add, { attributes: true, attributeFilter: ["aria-disabled"] });
  });
}

/** Keep `terms` for the tab, end the worker, then time the dense open. */
async function timedOpen(page: Page, terms: readonly string[]) {
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(SMALL);
  await expect(page.getByTestId("terms-panel")).toBeVisible({ timeout: 120_000 });
  // A paste with no line break is ordinary text in the field (AC-3), so one
  // term is typed and entered instead.
  if (terms.length === 1) {
    const field = page.getByRole("textbox", { name: "Add a name, number or phrase" });
    await field.fill(terms[0]);
    await field.press("Enter");
  } else {
    await paste(page, terms);
  }
  await searched(page, terms.length);
  await page.getByTestId("start-over").click();
  await expect(page.getByTestId("terms-kept")).toBeVisible();

  const before = await page.evaluate(() => window.__redactnestTerms?.notes.length ?? 0);
  await page.getByTestId("file-input").setInputFiles(DENSE);
  await expect
    .poll(() => page.evaluate(() => window.__redactnestTerms?.shownAt != null), {
      timeout: 150_000,
    })
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__redactnestTerms?.notes.length ?? 0))
    .toBeGreaterThan(before);

  const timing = await page.evaluate(() => window.__redactnestTerms);
  if (!timing?.chosenAt || !timing.shownAt) throw new Error("the open was not timed");
  const notes = timing.notes.at(-1) ?? [];
  const reads = [
    ...readsBetween(notes, "inspecting", "detecting"),
    ...readsBetween(notes, "detecting", "result"),
  ];
  return { openMs: timing.shownAt - timing.chosenAt, slowestReadMs: Math.max(...reads) };
}

test("50 kept terms open with the dense document within AC-28's bar, and a pasted batch lands within it", async ({
  page,
}) => {
  await routePaid(page);
  await installProbe(page);

  const found = mostFrequent(4, 12, 50);
  const [twoLetters] = mostFrequent(2, 2, 1);
  const report: Record<string, unknown> = {
    foundWords: found.length,
    twoLetterWord: twoLetters,
  };

  for (const [name, terms] of [
    ["nowhere", NOWHERE],
    ["found", found],
    ["twoLetters", [twoLetters]],
  ] as const) {
    const { openMs, slowestReadMs } = await timedOpen(page, terms);
    report[name] = {
      openMs: Math.round(openMs),
      slowestReadMs: Math.round(slowestReadMs),
    };
    expect(openMs, `${name}: the open`).toBeLessThanOrEqual(OPEN_BUDGET_MS);
    expect(slowestReadMs, `${name}: the slowest read`).toBeLessThanOrEqual(
      READ_BUDGET_MS,
    );
  }

  // A pasted batch during review: the found words, on the dense document
  // opened with no list kept, from the paste to the rows committed.
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(DENSE);
  await expect(page.getByTestId("terms-panel")).toBeVisible({ timeout: 150_000 });
  const before = await page.evaluate(() => window.__redactnestTerms?.notes.length ?? 0);
  await watchSearchEnd(page);
  const pastedAt = await paste(page, found);
  await searched(page, found.length);
  const landedAt = await page.evaluate(() => window.__redactnestTerms?.searchEndAt ?? 0);
  await expect
    .poll(() => page.evaluate(() => window.__redactnestTerms?.notes.length ?? 0))
    .toBeGreaterThan(before);
  const notes = (await page.evaluate(() => window.__redactnestTerms?.notes.at(-1))) ?? [];
  const pasteReads = readsBetween(notes, "received-find-terms", "terms-found");
  const pasteMs = landedAt - pastedAt;
  report.paste = {
    pasteMs: Math.round(pasteMs),
    slowestReadMs: Math.round(Math.max(...pasteReads)),
  };

  test.info().annotations.push({ type: "timing", description: JSON.stringify(report) });
  console.log(`terms timing ${JSON.stringify(report)}`);

  expect(pasteMs).toBeLessThanOrEqual(PASTE_BUDGET_MS);
  expect(Math.max(...pasteReads)).toBeLessThanOrEqual(READ_BUDGET_MS);
});
