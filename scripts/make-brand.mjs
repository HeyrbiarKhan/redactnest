/**
 * Make RedactNest's raster brand files from committed sources. Spec 0013,
 * AC-28 and INV-8.
 *
 *   node scripts/make-brand.mjs
 *
 * Writes the favicon and the Apple icon from `src/app/icon.svg`, then builds
 * and starts the production app and captures the social card and the Polar
 * product image from the built home page, and the home page's product shot
 * from the built tool page. The outputs are committed, like the
 * fixtures, and nobody edits one by hand. PNG bytes differ a little between
 * machines, so rerun this only when the look changes: the mark, the home
 * page's eyebrow or headline, or the tool's look.
 *
 * No new package: it drives the Chromium that `@playwright/test` installs. It
 * never imports a TypeScript module. Every colour it draws with is parsed from
 * `src/app/globals.css`, the mark from `icon.svg`, Playwright's build
 * environment from `playwright.config.ts` and `tests/e2e/build-env.ts` as
 * text, and every word from the running build, so nothing here can drift from
 * what the site shows. It prints only the paths it wrote, never page text.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const at = (...parts) => join(ROOT, ...parts);

const OUT = Object.freeze({
  favicon: at("src", "app", "favicon.ico"),
  appleIcon: at("src", "app", "apple-icon.png"),
  social: at("src", "app", "opengraph-image.png"),
  polar: at("docs", "design", "brand", "polar-product.png"),
  shot: at("src", "app", "product-review.png"),
});

/** The fictional document the product shot reviews (AC-12). */
const SAMPLE = at("tests", "fixtures", "sample-agreement.pdf");

/** The favicon's sizes (AC-3): what a tab and a bookmark ask for. */
const FAVICON_SIZES = Object.freeze([16, 32]);

/** The Apple icon (AC-3): 180 pixels, the mark across 62% of the width. */
const APPLE_ICON = Object.freeze({ size: 180, markShare: 0.62 });

/** The social card and the Polar image (AC-5, AC-6). */
const CARD = Object.freeze({ width: 1200, height: 630 });

/**
 * The product shot (AC-12): a 1280 by 800 window at device scale 2, and what
 * the sample agreement must show before it is captured.
 */
const SHOT = Object.freeze({ width: 1280, height: 800, scale: 2, ticked: 7 });

/** The engine's first download and compile, which a cold build pays once. */
const ENGINE_TIMEOUT_MS = 120_000;

/** How long the build and the first answer from the server may take. */
const SERVER_TIMEOUT_MS = 120_000;

/* Step 1: what the brand is drawn from. */

/**
 * Every colour token, by role, in the one form `tests/unit/contrast.test.ts`
 * also parses (`--color-<role>: #rrggbb;`). AC-27.
 */
async function readTokens() {
  const css = await readFile(at("src", "app", "globals.css"), "utf8");
  const tokens = Object.fromEntries(
    [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, role, hex]) => [
      role,
      hex.toLowerCase(),
    ]),
  );
  for (const role of ["canvas", "ink", "accent", "on-accent"]) {
    if (!tokens[role])
      throw new Error(`globals.css has no --color-${role} in #rrggbb form.`);
  }
  return Object.freeze(tokens);
}

/** The master mark, and its paths for the drawings that recolour it. */
async function readMark() {
  const svg = await readFile(at("src", "app", "icon.svg"), "utf8");
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => d);
  if (paths.length === 0) throw new Error("src/app/icon.svg holds no <path d> to draw.");
  return Object.freeze({ svg, paths: Object.freeze(paths) });
}

/* Playwright's build environment, read as text. */

/** The text between an opening bracket at `start` and its partner, strings skipped. */
function balanced(text, start) {
  const open = text[start];
  const close = { "{": "}", "[": "]", "(": ")" }[open];
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      index = text.indexOf(char, index + 1);
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, index);
    }
  }
  throw new Error(`Unbalanced ${open} in a build environment file.`);
}

/** Split an object or array body at its top level commas. */
function topLevel(body) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '"' || char === "'" || char === "`") {
      index = body.indexOf(char, index + 1);
      continue;
    }
    if ("{[(".includes(char)) depth += 1;
    if ("}])".includes(char)) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(body.slice(from, index));
      from = index + 1;
    }
  }
  parts.push(body.slice(from));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** One value: a string, a known name, or an array of strings joined by a string. */
function valueOf(expression, known) {
  const text = expression.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
  if (/^[A-Z_][A-Z0-9_]*$/.test(text) && typeof known[text] === "string")
    return known[text];
  const joined = /^\[([\s\S]*)\]\.join\(("(?:[^"\\]|\\.)*")\)$/.exec(text);
  if (joined) {
    return topLevel(joined[1])
      .map((part) => valueOf(part, known))
      .join(JSON.parse(joined[2]));
  }
  throw new Error(`make-brand cannot read the build environment value ${text}.`);
}

/** The entries of `const NAME = ...{ ... }` in a file, spreads resolved. */
function objectNamed(text, name, known) {
  const declared = new RegExp(`const ${name}\\b[^=]*=`).exec(text);
  if (!declared) throw new Error(`make-brand found no ${name} to read.`);
  const body = balanced(text, text.indexOf("{", declared.index));
  const entries = {};
  for (const part of topLevel(withoutComments(body))) {
    const spread = /^\.\.\.([A-Z_][A-Z0-9_]*)$/.exec(part);
    if (spread) {
      if (typeof known[spread[1]] !== "object") {
        throw new Error(`make-brand cannot spread ${spread[1]} into ${name}.`);
      }
      Object.assign(entries, known[spread[1]]);
      continue;
    }
    const entry = /^([A-Z_][A-Z0-9_]*)\s*:\s*([\s\S]+)$/.exec(part);
    if (!entry) throw new Error(`make-brand cannot read ${part} in ${name}.`);
    entries[entry[1]] = valueOf(entry[2], known);
  }
  return entries;
}

/**
 * The environment `playwright.config.ts` builds with: its own caps and site,
 * and from `tests/e2e/build-env.ts` the source link and the fake but complete
 * billing set, so billing is on and nobody is signed in (AC-12).
 */
async function readBuildEnv() {
  const shared = withoutComments(
    await readFile(at("tests", "e2e", "build-env.ts"), "utf8"),
  );
  const source = /export const SOURCE_URL\s*=\s*("(?:[^"\\]|\\.)*")/.exec(shared);
  if (!source)
    throw new Error("make-brand found no SOURCE_URL in tests/e2e/build-env.ts.");
  const known = { SOURCE_URL: JSON.parse(source[1]) };
  known.BILLING_ENV = objectNamed(shared, "BILLING_ENV", known);
  const config = withoutComments(await readFile(at("playwright.config.ts"), "utf8"));
  return objectNamed(config, "BUILD_ENV", known);
}

/* Step 2: the icons. */

/** A Windows icon file holding PNG images, which every current browser reads. */
function packIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

const page = (body, background) =>
  `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${background}}</style></head><body>${body}</body></html>`;

/**
 * The favicon is `icon.svg` itself, drawn by the browser at each size on a
 * transparent ground in the light scheme, so its accent fill applies.
 */
async function makeFavicon(browser, mark) {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
  });
  const tab = await context.newPage();
  const source = `data:image/svg+xml;base64,${Buffer.from(mark.svg).toString("base64")}`;
  const images = [];
  for (const size of FAVICON_SIZES) {
    await tab.setViewportSize({ width: size, height: size });
    await tab.setContent(
      page(
        `<img src="${source}" width="${size}" height="${size}" style="display:block">`,
        "transparent",
      ),
    );
    await tab.locator("img").evaluate((image) => image.decode());
    images.push({ size, png: await tab.screenshot({ omitBackground: true }) });
  }
  await context.close();
  await writeFile(OUT.favicon, packIco(images));
}

/**
 * The mark's paths in `on-accent` across 62% of a full `accent` square with
 * square corners, which iOS rounds itself (AC-3).
 */
async function makeAppleIcon(browser, mark, tokens) {
  const { size, markShare } = APPLE_ICON;
  const markSize = Math.round(size * markShare);
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const tab = await context.newPage();
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(
    page(
      `<div style="display:grid;place-items:center;width:${size}px;height:${size}px;background:${tokens.accent}">` +
        `<svg viewBox="0 0 64 64" width="${markSize}" height="${markSize}" fill="${tokens["on-accent"]}">` +
        mark.paths.map((d) => `<path d="${d}"/>`).join("") +
        `</svg></div>`,
      tokens.accent,
    ),
  );
  await tab.screenshot({ path: OUT.appleIcon });
  await context.close();
}

/* Step 3: the production app. */

/** A port nothing else is listening on, so a developer's own server is left alone. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Run a fixed command line to the end, its output kept quiet unless it fails.
 * Through the shell, so `pnpm` resolves on every platform; the line is
 * written here, never built from input.
 */
function run(commandLine, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      cwd: ROOT,
      env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${commandLine} failed:\n${output}`)),
    );
  });
}

/**
 * `next start` run by Node itself rather than through pnpm, so the process
 * this script holds is the server and stopping it stops the server, on
 * every platform. A server left behind would answer the next Playwright run.
 */
function startServer(port, env) {
  const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
  return spawn(process.execPath, [next, "start", "--port", String(port)], {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });
}

async function waitForServer(base, server) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("next start stopped before it answered.");
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`next start did not answer at ${base} in time.`);
}

function stopServer(server) {
  if (server.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    server.once("exit", () => resolve());
    server.kill();
  });
}

/** Fonts loaded and the page quiet, before any capture (AC-28). */
async function settle(tab) {
  await tab.waitForLoadState("networkidle");
  await tab.evaluate(() => document.fonts.ready.then(() => undefined));
}

/* Step 4: the social card and the Polar image. */

/**
 * The built home page with its body swapped for the card: the header's own
 * lockup, the home page's own eyebrow and headline, in the site's own Inter
 * and classes, on `canvas`. Nothing is typed here, so the card says what the
 * page says (AC-5).
 */
async function makeCards(browser, base, tokens) {
  const context = await browser.newContext({
    viewport: { width: CARD.width, height: CARD.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const tab = await context.newPage();
  await tab.goto(`${base}/`);
  await settle(tab);

  const found = await tab.evaluate(
    ({ width, height, colours }) => {
      const lockup = document.querySelector('header a[href="/"] > span');
      const eyebrow = document.querySelector('[data-testid="home-eyebrow"]');
      const headline = document.querySelector("main h1");
      if (!lockup || !eyebrow?.textContent?.trim() || !headline?.textContent?.trim()) {
        return false;
      }
      const card = document.createElement("div");
      card.style.cssText = `box-sizing:border-box;width:${width}px;height:${height}px;padding:88px 96px;display:flex;flex-direction:column;justify-content:space-between;background:${colours.canvas};border-bottom:12px solid ${colours.accent}`;

      const brand = lockup.cloneNode(true);
      brand.style.fontSize = "40px";
      brand.style.lineHeight = "1";

      const words = document.createElement("div");
      words.style.cssText = "display:flex;flex-direction:column;gap:28px";
      const small = eyebrow.cloneNode(true);
      small.style.cssText = "font-size:24px;line-height:1.2;margin:0";
      const big = headline.cloneNode(true);
      big.style.cssText = "font-size:84px;line-height:1.02;margin:0;max-width:16ch";
      words.append(small, big);

      card.append(brand, words);
      document.body.replaceChildren(card);
      document.body.style.margin = "0";
      return true;
    },
    { width: CARD.width, height: CARD.height, colours: tokens },
  );
  if (!found)
    throw new Error("The built home page has no lockup, eyebrow or headline to draw.");

  await tab.evaluate(() => document.fonts.ready.then(() => undefined));
  const card = await tab.screenshot();
  await writeFile(OUT.social, card);
  await mkdir(dirname(OUT.polar), { recursive: true });
  await writeFile(OUT.polar, card);
  await context.close();
}

/* Step 5: the product shot. */

/**
 * The real tool page from the production build, nothing stubbed and nothing
 * retouched (AC-12). Nobody is signed in, so the real `/api/entitlement`
 * answers free with `account: "none"` and the build's own caps. The sample
 * agreement goes in through the file input, and the capture waits for the
 * reviewing state: the all clear line, every row ticked, no phase line, fonts
 * loaded and the page quiet. Focus is taken off the file bar's button, so the
 * picture carries no focus ring.
 */
async function makeShot(browser, base) {
  const context = await browser.newContext({
    viewport: { width: SHOT.width, height: SHOT.height },
    deviceScaleFactor: SHOT.scale,
    colorScheme: "light",
  });
  const tab = await context.newPage();
  await tab.goto(`${base}/tool`);
  await tab.getByTestId("plan-line").getByRole("link").first().waitFor();

  await tab.getByTestId("file-input").setInputFiles(SAMPLE);
  await tab.getByTestId("all-clear").waitFor({ timeout: ENGINE_TIMEOUT_MS });
  await tab.waitForFunction(
    (count) =>
      document.querySelectorAll('input[type="checkbox"][id^="match-"]:checked').length ===
        count &&
      document.querySelectorAll('input[type="checkbox"][id^="match-"]:not(:checked)')
        .length === 0 &&
      document.querySelector('[data-testid="progress"]') === null,
    SHOT.ticked,
  );
  await tab.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await settle(tab);

  await tab.screenshot({ path: OUT.shot });
  await context.close();
}

/* The run. */

const written = [];
const tokens = await readTokens();
const mark = await readMark();
const env = { ...process.env, ...(await readBuildEnv()) };

const browser = await chromium.launch();
let server = null;
try {
  await makeFavicon(browser, mark);
  written.push(OUT.favicon);
  await makeAppleIcon(browser, mark, tokens);
  written.push(OUT.appleIcon);

  await run("pnpm build", env);
  const port = await freePort();
  const base = `http://localhost:${port}`;
  server = startServer(port, env);
  await waitForServer(base, server);

  await makeCards(browser, base, tokens);
  written.push(OUT.social, OUT.polar);
  await makeShot(browser, base);
  written.push(OUT.shot);
} finally {
  if (server !== null) await stopServer(server);
  await browser.close();
}

for (const path of written) {
  console.log(`[make-brand] ${relative(ROOT, path).replaceAll("\\", "/")}`);
}
