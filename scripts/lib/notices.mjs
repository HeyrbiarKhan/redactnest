/**
 * The third party notices, built from the installed tree. Spec 0009, AC-13 and
 * AC-14.
 *
 * Pure apart from the reader it is handed: every path is POSIX, every file is
 * read through `reader`, and the output carries no date and no commit. So two
 * runs over the same installed tree give the same bytes (INV-5), and a test can
 * build a whole tree in memory. `scripts/sync-legal.mjs` is the shell that hands
 * it the real file system and writes the result.
 *
 * A reader is `{ readText(path), listFiles(dir), listDirs(dir), realPath(path) }`.
 * `readText` returns `undefined` for a missing file, the listings return names
 * only (an empty array for a missing folder), and `realPath` resolves links,
 * which is how pnpm lays a package out.
 */

import { posix } from "node:path";

import { checkMupdfVersion, mupdfSection, readMupdfLegal } from "./mupdf-source.mjs";
import { NoticesError } from "./notices-error.mjs";

export { NoticesError };

/**
 * The licences a package in the closure may come under, as SPDX identifiers.
 *
 * A rule about compatibility with the AGPL, not a cap on anyone (spec 0009,
 * *The allowlist*). Anything else, every GPL variant included, stops the build
 * until a person has judged it compatible and added it here. An allowlist
 * rather than a denylist, so a new or misspelled identifier fails instead of
 * slipping through. `LGPL-3.0-or-later` is here for sharp's `@img/sharp-*`
 * binaries, which run only on the server and never reach a browser.
 */
export const LICENCE_ALLOWLIST = Object.freeze([
  "MIT",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "Zlib",
  "Unlicense",
  "CC0-1.0",
  "CC-BY-4.0",
  "BlueOak-1.0.0",
  "OFL-1.1",
  "LGPL-3.0-or-later",
  "AGPL-3.0-or-later",
]);

/** The files that carry a package's licence and notices, by name. */
const LICENCE_FILE = /^(licen[cs]e|copying|notice)/i;

const RULE = "-".repeat(80);
const SECTION_RULE = "#".repeat(80);

/** Code unit order, so the output never depends on the machine's locale. */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** One line ending, no trailing blank lines, whatever the package shipped. */
const tidy = (text) => text.replace(/\r\n?/g, "\n").replace(/\s+$/, "");

// --- SPDX identifiers --------------------------------------------------------

/**
 * The SPDX licence list, from `scripts/legal/spdx-licence-ids.txt`: a first
 * line naming the list's version, then one identifier per line.
 *
 * Keyed in lower case, because SPDX matches identifiers without regard to case,
 * so `mit` is `MIT`. The value is the list's own spelling, which is what the
 * allowlist is written in.
 */
export function readSpdxIds(text) {
  const [header, ...ids] = tidy(text).split("\n");
  if (!/^spdx-license-list \d/.test(header ?? "")) {
    throw new NoticesError(
      "scripts/legal/spdx-licence-ids.txt must start with its list version.",
    );
  }
  return new Map(ids.filter(Boolean).map((id) => [id.toLowerCase(), id]));
}

// --- Licence expressions -----------------------------------------------------

const OPERATORS = new Set(["and", "or", "with"]);

function tokenise(expression) {
  return expression.replace(/[()]/g, " $& ").split(/\s+/).filter(Boolean);
}

/**
 * A licence expression, read by hand rather than by a library.
 *
 * `AND` binds tighter than `OR` and parentheses group, as SPDX defines it.
 * Operators match in any case. Returns a tree of `{ kind: "licence", id, plus,
 * exception }`, `{ kind: "and", terms }` and `{ kind: "or", terms }`, or throws
 * a `NoticesError` when the text is not an expression at all (`Apache 2.0`).
 */
export function parseLicence(expression) {
  const tokens = tokenise(expression);
  let at = 0;

  const peek = () => tokens[at];
  const isOperator = (token, name) => token?.toLowerCase() === name;
  const fail = () => {
    throw new NoticesError(`not a licence expression: ${JSON.stringify(expression)}`);
  };

  const atom = () => {
    const token = tokens[at++];
    if (token === undefined || token === ")") fail();

    let node;
    if (token === "(") {
      node = or();
      if (tokens[at++] !== ")") fail();
    } else {
      if (OPERATORS.has(token.toLowerCase())) fail();
      const plus = token.endsWith("+");
      node = { kind: "licence", id: plus ? token.slice(0, -1) : token, plus };
    }

    if (isOperator(peek(), "with")) {
      at += 1;
      const exception = tokens[at++];
      if (exception === undefined || exception === "(" || exception === ")") fail();
      node = { ...node, exception };
    }
    return node;
  };

  const joined = (kind, next) => () => {
    const terms = [next()];
    while (isOperator(peek(), kind)) {
      at += 1;
      terms.push(next());
    }
    return terms.length === 1 ? terms[0] : { kind, terms };
  };

  const and = joined("and", atom);
  const or = joined("or", and);

  const tree = or();
  if (at !== tokens.length) fail();
  return tree;
}

/**
 * What stops a licence outright, wherever it sits in the expression, even as
 * one side of an `OR`: an exception, a `+`, a private `LicenseRef-`, and an
 * identifier the SPDX list does not hold (`BSD`). Each needs a person to read
 * the actual terms. Returns the reason, or `undefined`.
 */
function outright(node, spdxIds) {
  // Before the kind, because `(MIT OR ISC) WITH …` hangs the exception on a group.
  if (node.exception !== undefined)
    return `it carries an exception (WITH ${node.exception})`;
  if (node.kind !== "licence") {
    for (const term of node.terms) {
      const reason = outright(term, spdxIds);
      if (reason) return reason;
    }
    return undefined;
  }
  if (node.plus) return `it uses a "+" suffix (${node.id}+)`;
  if (/^licenseref-/i.test(node.id)) return `${node.id} is not a public licence`;
  if (!spdxIds.has(node.id.toLowerCase())) return `${node.id} is not on the SPDX list`;
  return undefined;
}

function satisfied(node, spdxIds, allowed) {
  if (node.kind === "licence") return allowed.has(spdxIds.get(node.id.toLowerCase()));
  if (node.kind === "and")
    return node.terms.every((term) => satisfied(term, spdxIds, allowed));
  return node.terms.some((term) => satisfied(term, spdxIds, allowed));
}

/**
 * Whether a declared licence lets the package ship with RedactNest.
 *
 * Every term joined by `AND` must be allowed, and at least one joined by `OR`.
 * Returns `{ allowed: true }` or `{ allowed: false, reason }`.
 */
export function judgeLicence(declared, spdxIds, allowlist = LICENCE_ALLOWLIST) {
  if (declared === undefined) return { allowed: false, reason: "it declares no licence" };
  if (/^unlicensed$/i.test(declared)) {
    return { allowed: false, reason: "it is UNLICENSED, so nobody may use it" };
  }
  if (/^see licen[cs]e in\b/i.test(declared)) {
    return {
      allowed: false,
      reason: "its licence is a custom file a person has to read",
    };
  }

  let tree;
  try {
    tree = parseLicence(declared);
  } catch (error) {
    if (error instanceof NoticesError) return { allowed: false, reason: error.message };
    throw error;
  }

  const reason = outright(tree, spdxIds);
  if (reason) return { allowed: false, reason };

  return satisfied(tree, spdxIds, new Set(allowlist))
    ? { allowed: true }
    : { allowed: false, reason: "the licence allowlist does not satisfy it" };
}

/**
 * The licence a manifest declares, as one expression, or `undefined`.
 *
 * The legacy `{ "type": … }` object is read through its `type`, and a legacy
 * `licenses` array is its types joined by `OR`. An empty value counts as none.
 */
export function declaredLicence(manifest) {
  const typeOf = (entry) =>
    typeof entry === "string"
      ? entry.trim()
      : typeof entry?.type === "string"
        ? entry.type.trim()
        : "";

  const single = typeOf(manifest.license);
  if (single) return single;

  if (Array.isArray(manifest.licenses)) {
    const types = manifest.licenses.map(typeOf).filter(Boolean);
    if (types.length === 1) return types[0];
    if (types.length > 1) return types.map((type) => `(${type})`).join(" OR ");
  }
  return undefined;
}

// --- The closure walk --------------------------------------------------------

function readManifest(dir, reader) {
  const text = reader.readText(posix.join(dir, "package.json"));
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new NoticesError(`${posix.join(dir, "package.json")} is not valid JSON.`);
  }
}

/**
 * Where a package named `name` is, seen from the real folder `from`, found the
 * way Node finds it: `node_modules/<name>` in `from` and then in each folder
 * above it, skipping any folder that is itself a `node_modules`. Not
 * `require.resolve("<name>/package.json")`, which a package's `exports` can
 * block, as mupdf's does. Returns the real path, or `undefined`.
 */
export function findPackage(name, from, reader) {
  let dir = from;
  for (;;) {
    if (posix.basename(dir) !== "node_modules") {
      const candidate = posix.join(dir, "node_modules", name);
      if (reader.readText(posix.join(candidate, "package.json")) !== undefined) {
        return reader.realPath(candidate);
      }
    }
    const parent = posix.dirname(dir);
    if (parent === dir || parent === ".") return undefined;
    dir = parent;
  }
}

/**
 * Every package the app needs to run, from `package.json` `dependencies`.
 *
 * Follows `dependencies` and the `optionalDependencies` that are installed,
 * never `peerDependencies`, which the package that declares them does not
 * bring. A missing dependency fails, because the notices would be short of it.
 * Deduplicated by name and version, and sorted, so the order is the tree's and
 * not the walk's.
 */
export function walkClosure(rootDir, reader) {
  const root = readManifest(rootDir, reader);
  if (root === undefined) throw new NoticesError(`no package.json in ${rootDir}`);

  const visited = new Set();
  const found = new Map();

  const visit = (dir, manifest, parent) => {
    for (const [names, mustExist] of [
      [Object.keys(manifest.dependencies ?? {}), true],
      [Object.keys(manifest.optionalDependencies ?? {}), false],
    ]) {
      for (const name of names) {
        const at = findPackage(name, dir, reader);
        if (at === undefined) {
          if (mustExist) {
            throw new NoticesError(
              `${name} is a dependency of ${parent} but is not installed. Run pnpm install.`,
            );
          }
          continue;
        }
        if (visited.has(at)) continue;
        visited.add(at);

        const child = readManifest(at, reader);
        const key = `${child.name}@${child.version}`;
        if (!found.has(key)) {
          found.set(key, {
            name: child.name,
            version: child.version,
            dir: at,
            manifest: child,
          });
        }
        visit(at, child, key);
      }
    }
  };

  visit(reader.realPath(rootDir), root, "package.json");

  return Object.freeze(
    [...found.values()].sort(
      (a, b) => byText(a.name, b.name) || byText(a.version, b.version),
    ),
  );
}

/** A folder's licence and notice files, each as `{ file, text }`, by name. */
export function licenceFiles(dir, reader) {
  return reader
    .listFiles(dir)
    .filter((file) => LICENCE_FILE.test(file))
    .sort(byText)
    .map((file) => ({ file, text: tidy(reader.readText(posix.join(dir, file)) ?? "") }));
}

/**
 * Stop the build on any package whose licence the allowlist does not satisfy,
 * naming every one at once so a person sees the whole list in one run.
 */
export function checkLicences(packages, spdxIds, allowlist = LICENCE_ALLOWLIST) {
  const refused = packages.flatMap((pkg) => {
    const declared = declaredLicence(pkg.manifest);
    const verdict = judgeLicence(declared, spdxIds, allowlist);
    return verdict.allowed
      ? []
      : [`${pkg.name} ${pkg.version} (${declared ?? "no licence"}): ${verdict.reason}`];
  });
  if (refused.length > 0) {
    throw new NoticesError(
      [
        "A package's licence is not on the allowlist in scripts/lib/notices.mjs.",
        "Judge whether it is compatible with the AGPL before adding it (spec 0009, AC-14):",
        ...refused.map((line) => `  ${line}`),
      ].join("\n"),
    );
  }
}

/**
 * The licence files Next.js carries for the code it vendors under
 * `dist/compiled`, one level down and two for a scope (`@babel/runtime`).
 * Deduplicated by text: each distinct text once, with every folder that has it.
 */
export function vendoredLicences(nextDir, reader) {
  const compiled = posix.join(nextDir, "dist", "compiled");
  const folders = reader
    .listDirs(compiled)
    .flatMap((entry) =>
      entry.startsWith("@")
        ? reader.listDirs(posix.join(compiled, entry)).map((inner) => `${entry}/${inner}`)
        : [entry],
    );

  const byLicence = new Map();
  for (const folder of folders.sort(byText)) {
    for (const { file, text } of licenceFiles(posix.join(compiled, folder), reader)) {
      if (!text) continue;
      const holders = byLicence.get(text) ?? [];
      byLicence.set(text, [...holders, `${folder}/${file}`]);
    }
  }

  return [...byLicence].map(([text, holders]) => ({ holders, text }));
}

// --- Formatting --------------------------------------------------------------

function section(number, title, body) {
  return [SECTION_RULE, `# ${number}. ${title}`, SECTION_RULE, "", body].join("\n");
}

function personOf(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return [value.name, value.email && `<${value.email}>`, value.url && `(${value.url})`]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function repositoryOf(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.url === "string") {
    return value.url.trim();
  }
  return "";
}

/** One package: its name, version and licence, then every licence file it ships. */
export function formatPackage(pkg, reader) {
  const files = licenceFiles(pkg.dir, reader);
  const head = [
    `${pkg.name} ${pkg.version}`,
    `Licence: ${declaredLicence(pkg.manifest)}`,
  ];

  if (files.length === 0) {
    const author = personOf(pkg.manifest.author);
    const repository = repositoryOf(pkg.manifest.repository);
    return [
      ...head,
      ...(author ? [`Author: ${author}`] : []),
      ...(repository ? [`Repository: ${repository}`] : []),
      "This package ships no licence file.",
    ].join("\n");
  }

  return [
    ...head,
    ...files.flatMap(({ file, text }) => ["", `File: ${file}`, "", text]),
  ].join("\n");
}

const HEADER = `RedactNest: third party notices

RedactNest is licensed under the GNU AGPL 3.0 or later, whose text is at
/licence.txt. It ships code and fonts that other people wrote, and this file
gives their licences.

The build writes this file fresh every time (scripts/sync-legal.mjs), from the
packages it installed and a few texts kept in the repository, so it covers
exactly the code behind the version you are using. It holds:

  1. MuPDF, the PDF engine, and what is compiled into it
  2. The phone number metadata inside libphonenumber-js
  3. Fonts
  4. Every package the app needs to run, with the packages they need in turn
  5. The licences Next.js carries for code it vendors

Section 4 lists more than reaches your browser: it also holds packages that
run only while building or on the server, because telling them apart reliably
costs more than listing them.`;

/**
 * The whole file, from what the shell gathered.
 *
 * `inputs` holds section 1's text (from `mupdfSection`), the installed libphonenumber-js
 * version, the hand written texts (`phoneMetadata`, `inter`, `carlito`), the
 * sorted packages and the vendored licences.
 */
export function formatNotices(inputs, reader) {
  const phone = [
    `libphonenumber-js ${inputs.phoneVersion}`,
    "Licence: MIT for the package itself, whose text is in section 4, and the",
    "Apache License 2.0 for the phone number metadata it ships, which comes from",
    "Google's libphonenumber.",
    "",
    tidy(inputs.phoneMetadata),
  ].join("\n");

  const fonts = [
    "Inter",
    "Licence: OFL-1.1",
    "The one typeface on every page. next/font fetches it from Google Fonts while",
    "the site is built, and this site serves it from its own origin.",
    "",
    tidy(inputs.inter),
    "",
    RULE,
    "Carlito",
    "Licence: OFL-1.1",
    "Shipped only in the repository and its test fixtures. No page serves it.",
    "",
    tidy(inputs.carlito),
  ].join("\n");

  const packages = inputs.packages
    .map((pkg) => formatPackage(pkg, reader))
    .join(`\n\n${RULE}\n`);

  const vendored = [
    "Next.js bundles these packages into its own files instead of installing",
    "them. Each distinct licence text appears once, after the folders that carry it.",
    "",
    inputs.vendored
      .map(({ holders, text }) =>
        [...holders.map((holder) => `next/dist/compiled/${holder}`), "", text].join("\n"),
      )
      .join(`\n\n${RULE}\n`),
  ].join("\n");

  return `${[
    HEADER,
    section(1, "MuPDF", tidy(inputs.mupdf)),
    section(2, "Phone number metadata", phone),
    section(3, "Fonts", fonts),
    section(4, "Packages", `${RULE}\n${packages}`),
    section(5, "Code vendored by Next.js", vendored),
  ].join("\n\n\n")}\n`;
}

// --- Putting it together -----------------------------------------------------

function required(path, reader) {
  const text = reader.readText(path);
  if (text === undefined) {
    throw new NoticesError(
      `${path} is missing. It is committed, so restore it from git.`,
    );
  }
  return text;
}

/**
 * The notices for the tree at `rootDir`, or a `NoticesError` saying why not.
 *
 * MuPDF's version is checked first, against `scripts/legal/mupdf.txt`, so an
 * upgrade stops here before anything else is judged (AC-16, INV-6).
 */
export function buildNotices(rootDir, reader) {
  const at = (path) => posix.join(rootDir, path);
  const spdxIds = readSpdxIds(required(at("scripts/legal/spdx-licence-ids.txt"), reader));

  const packages = walkClosure(rootDir, reader);

  const named = (name) => {
    const pkg = packages.find((candidate) => candidate.name === name);
    if (pkg === undefined) {
      throw new NoticesError(`${name} is not in the dependency closure.`);
    }
    return pkg;
  };

  const mupdf = readMupdfLegal(required(at("scripts/legal/mupdf.txt"), reader));
  checkMupdfVersion(mupdf, named("mupdf").version);
  checkLicences(packages, spdxIds);

  return formatNotices(
    {
      mupdf: mupdfSection(mupdf),
      phoneVersion: named("libphonenumber-js").version,
      phoneMetadata: required(at("scripts/legal/libphonenumber-metadata.txt"), reader),
      inter: required(at("scripts/legal/inter.txt"), reader),
      carlito: required(at("scripts/fonts/OFL.txt"), reader),
      packages,
      vendored: vendoredLicences(named("next").dir, reader),
    },
    reader,
  );
}
