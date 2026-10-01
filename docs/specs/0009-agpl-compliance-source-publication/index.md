# 0009. AGPL compliance and source publication

**Date**: 2026-10-01
**Status**: In Progress
**Updated**: 2026-10-01, wording only, after slices 1 to 3 were built and verified: AC-14 matches licence identifiers in any case, as SPDX does and as built; the verify step's `grep` is anchored so the header comment in `tag-deploy.yml` is not counted; and slice 4 (going public) is deferred to launch, after feature 20. No design changed.

## Summary

RedactNest ships MuPDF to every visitor's browser, so its own source is AGPL 3.0 or later and has to be offered to anyone who uses it. Every page's footer now carries a short licence notice and links to the exact commit that is running, to the licence, and to a third party notices file. The build works out the source link from the commit Vercel is building, so the link can never point at the wrong version. After each production deploy, a small separate workflow tags the commit, and it is the only workflow allowed to write to the repository. The notices are generated fresh at every build from what was installed, and MuPDF's own source (the complete Artifex archive for the pinned version) is linked next to the engine and in the notices. Before the repository goes public, you scan its whole history for secrets.

## Amends specs 0001 and 0003

Applied in place by the build (task 6).

- **Spec 0001**, *Configuration*: `NEXT_PUBLIC_SOURCE_URL` is derived on Vercel from the Git system variables and refused there when set by hand. Off Vercel it is still required in production, and in production it must end in `/tree/` and a full 40 character commit (AC-4 to AC-6). The Follow-up "Prepare the public repository and get the AGPL notices, licence file and source offer right before launch" is met by this spec once feature 18 is done. The Artifex commercial licence Follow-up stays open.
- **Spec 0003**, AC-14: "The footer keeps the AGPL source link, restyled in `ink-muted` and underlined" becomes "The footer carries spec 0009's licence notice (AC-1), its three links in `ink-muted` and underlined". The `SiteFooter` row: "none (reads nothing; the layout passes the notice and its links)". The value sourcing row "Footer | the source link" becomes "Footer | the notice and its three links | `src/lib/legal.ts`, `config.sourceUrl`, `LICENCE_PATH`, `NOTICES_PATH` (spec 0009)". No new colour pairing: the notice uses the footer's existing `ink-muted` on `canvas`.

## Requirements

**User stories**:
- As a visitor, I want to see who made RedactNest, under what licence, and get the exact source of the version I am using, so I can check what runs on my documents and use my rights under the AGPL.
- As Artifex, or anyone whose code ships inside RedactNest, I want our licence texts and MuPDF's corresponding source offered next to the code that ships, so our licences are honoured.
- As the maintainer, I want every production deploy tagged and its source link set without my help, so compliance cannot lapse on a busy day.
- As the maintainer, I want the history checked for secrets before the repository goes public.

**Acceptance criteria**:

*The notice (AGPL sections 5(d) and 13)*

- **AC-1**: Every page, `/tool` included, ends with a footer notice that reads, in this order: `© 2026 Heyrbiar Khan` · `Licensed under the GNU AGPL 3.0 or later, which lets you share and change it` · `No warranty` · `Source code for this version` · `Licence` · `Third party notices`. The last three are plain `a` links that open in the same tab, to `config.sourceUrl`, `/licence.txt` and `/third-party-notices.txt`. The `·` separators are hidden from assistive technology. Every word comes from `src/lib/legal.ts` and every path from `src/lib/routes.ts`, never from a literal in a component. (Section 5(d)'s four parts: a copyright notice, no warranty, that people may share the work under the licence, and how to read it.)
- **AC-2**: At 320 CSS pixels the notice wraps with no horizontal scrolling. Each link's target is at least 24 by 24 CSS pixels, and axe finds no violation on `/` or `/tool`. When a footer link is followed on `/tool` with ticked work, spec 0007's leave warning still appears, unchanged.
- **AC-3**: When there is no source link (a development build with neither the Vercel variables nor `NEXT_PUBLIC_SOURCE_URL`), the notice shows `Source code for this version (link set per deploy)` as plain text in place of the link. Everything else in AC-1 is unchanged.

*The source link*

- **AC-4**: When `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` is present (every Vercel build, production and preview), `config.sourceUrl` is `https://github.com/<NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER>/<NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG>/tree/<NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA>`, built in `src/config`. A fork deployed on Vercel therefore links to its own source.
- **AC-5**: Config fails at module load with a `ConfigError` (so `next build` fails) when, checked in this order: `NEXT_PUBLIC_SOURCE_URL` is set while the commit SHA is present; the SHA is present but the owner or slug is missing; the provider is not `github`; the SHA is not 40 lowercase hex characters; the owner or slug holds a character outside `A-Z a-z 0-9 . _ -`; or `VERCEL` is `1` and the SHA is missing (the "Automatically expose System Environment Variables" setting is off, or the deploy did not come from Git). For every variable here and in AC-6, an empty or whitespace only value counts as absent. Each error message names the variable it is about, which is what the tests match. The `VERCEL` rule can only fire where `VERCEL` is visible, at build and on the server. The browser never sees it, so there it reads as absent and that rule is skipped, by design.
- **AC-6**: Off Vercel, a production build still requires `NEXT_PUBLIC_SOURCE_URL`. Every production build, on Vercel or not, fails unless the final source link (derived or hand set, after `readUrl`'s normalising) is `https`, has no query and no hash, and has a path ending in `/tree/` followed by 40 lowercase hex characters. Uppercase hex fails. So a repository root or branch link can never ship. Development builds skip this check (spec 0001's rule, unchanged). Playwright's build value becomes `https://example.invalid/redactnest/tree/` plus a fixed 40 character hex string, defined once and imported by `playwright.config.ts` and the e2e specs.

*Deploy tags*

- **AC-7**: After each deployment status that is `success`, for an environment whose name starts with `Production` (Vercel may call it `Production` or `Production – <project>`), on a deployment created by `vercel[bot]`, the deployed commit carries an annotated tag `prod-YYYY-MM-DD-<sha7>`: the UTC date of that status and the first 7 characters of the SHA. Its tagger is `github-actions[bot]` (`41898282+github-actions[bot]@users.noreply.github.com`) at the time of writing. Its message is exactly three lines: `Production deploy of <full sha>`, `Deployed <status created_at, ISO 8601 UTC>`, and `Vercel <environment_url, else target_url, else "not reported">`. A commit that already carries a `prod-` tag gets no second one, so a redeploy, promotion or rollback of a tagged commit adds nothing. Any other status is skipped, with one log line naming its environment, state and creator.
- **AC-8**: That write lives only in `.github/workflows/tag-deploy.yml`. The workflow sets `permissions: {}`. Its one job sets `contents: write` and nothing else, checks out nothing, uses no third party action, and calls only `gh api` with `GITHUB_TOKEN`. Event values reach its script through `env:`, never through `${{ }}` inside `run`. `ci.yml` stays `contents: read`.
- **AC-9**: Run by hand (`workflow_dispatch`) with a full SHA, the same workflow tags that commit the same way, dated the day of the run. Its message is `Production deploy of <full sha>`, then `Added by hand <run time, ISO 8601 UTC>`. It refuses a SHA that is not 40 lowercase hex, or not reachable from `main`. This is how a missed tag is filled in later.
- **AC-10**: Preview deploys are never tagged. Their link names their own commit (AC-4). Only production commits are guaranteed to stay reachable (`main` is protected, AC-20). A preview link can 404 by design, for example after its branch is deleted unmerged.

*The licence*

- **AC-11**: The repository root holds `LICENSE`, the GNU AGPL 3.0 text verbatim, with LF line endings that `.gitattributes` pins (`LICENSE text eol=lf`, since `core.autocrlf` would otherwise rewrite it on Windows). `package.json` keeps `"license": "AGPL-3.0-or-later"`. No source file carries a licence header.
- **AC-12**: `/licence.txt` serves that file byte for byte, as `text/plain; charset=utf-8`, from our own origin. It is copied into `public/` before `dev` and `build`, and is gitignored.

*Third party notices*

- **AC-13**: `/third-party-notices.txt` is written before `dev` and `build`, is gitignored and never committed, and is served as `text/plain; charset=utf-8` from our own origin. It opens with a header saying what it covers and how it is made, then holds, in order: (1) the MuPDF section (AC-15); (2) libphonenumber-js's second licence: the package itself is MIT (its MIT text appears in section 4, like every package), but the phone number metadata it ships comes from Google's libphonenumber under Apache 2.0. The dependency walk sees only the package's MIT, so this hand written entry names libphonenumber-js at its installed version (1.13.14 today, read from its `package.json` by `sync-legal.mjs`, never written in the entry) as MIT plus Google's metadata under Apache 2.0, gives Google's attribution, and carries the full Apache 2.0 text; (3) fonts: Inter (OFL 1.1, served from our origin through `next/font`, which fetches it from Google Fonts at build time) and Carlito (OFL 1.1, from `scripts/fonts/OFL.txt`, shipped only in the repository and its test fixtures); (4) every package in the production dependency closure of the build: name, version, licence identifier, and the text of its licence and `NOTICE` files, sorted by name; (5) the licence files that Next.js vendors under `next/dist/compiled`, deduplicated by text. A package that declares a licence but ships no licence file is listed with its identifier, author and repository fields, and a line saying the package ships no licence file. That is not a failure. A package that declares no licence at all is a failure (AC-14).
- **AC-14**: Writing the notices fails (so `dev` and `build` both fail) when a package in the closure declares no licence, `UNLICENSED`, a `SEE LICENSE IN` value, or a licence expression that the allowlist does not satisfy. The expression is read by a small hand written parser in `scripts/lib/notices.mjs`. `AND` binds tighter than `OR`, and parentheses group. Operators and identifiers both match in any case, which is SPDX's own rule, so `mit` is `MIT`: an identifier is found on the SPDX list whatever its case, and the list's spelling is what the allowlist is checked against. Every term joined by `AND` must be allowed, and at least one term joined by `OR` must be allowed. These fail outright: any `WITH` exception, a `+` suffix, a `LicenseRef-` identifier, and an identifier not on the SPDX list (such as `BSD` or `Apache 2.0`). The legacy `{ "type": … }` object form is read through its `type`, and a legacy `licenses` array is read as its types joined by `OR`. The failure names the package, its version and its licence.
- **AC-15**: The MuPDF section gives the installed version, the AGPL 3.0 or later, Artifex's copyright, the complete source archive `https://mupdf.com/downloads/archive/mupdf-<version>-source.tar.gz` and the tagged tree `https://github.com/ArtifexSoftware/mupdf/tree/<version>` (whose `platform/wasm` folder builds the npm package). It then holds the licence text of everything compiled into that version's wasm: FreeType (the FreeType Licence, with its credit line), HarfBuzz (MIT style), jbig2dec (AGPL 3.0 or later, Artifex), libjpeg (the IJG licence, with "This software is based in part on the work of the Independent JPEG Group"), OpenJPEG (BSD 2 clause), zlib (zlib licence), lcms2mt (MIT), Gumbo (Apache 2.0), cmark-gfm (BSD 2 clause, with its MIT parts), ucdn (ISC), and the URW base 14 fonts (OFL 1.1). The wasm and its JS glue also carry Emscripten's runtime (MIT; the glue `mupdf-wasm.js` is Emscripten output) and musl libc as Emscripten ships it (MIT), so both texts are included too. Two more are named without a text: compiler-rt's builtins (Apache 2.0 with the LLVM exception, which waives the notice for compiled object code) and dlmalloc, Emscripten's allocator (public domain). The MuPDF library texts are copied from that version's source archive, and Emscripten's and musl's from Emscripten's own `LICENSE` and `system/lib/libc/musl/COPYRIGHT`, into the committed `scripts/legal/mupdf.txt`. Its first line is `mupdf <version>` and its second `sha256 <hex>`, the archive's SHA-256 (for 1.28.1, `dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3`), which the notices print beside the archive link so anyone can check their download. After those lines, each library is one block: a line of `=` characters, then `Name:`, `Licence:` and `Copyright:` lines, a blank line, and the full text. FreeType's block ends with the credit sentence FTL section 3 asks for, using the year from FreeType's own notice in the archive.
- **AC-16**: Writing the notices fails, and a unit test fails, when the version on the first line of `scripts/legal/mupdf.txt` differs from the installed `mupdf` version. A second unit test reads the installed `mupdf-wasm.wasm` and fails when a library in its signature table (below) is present but `mupdf.txt` does not cover it, when one that `mupdf.txt` covers is absent, or when no signature at all is found (a future build with its names stripped).
- **AC-17**: `public/engine/VERSION` keeps its three current lines (`mupdf <version>`, `AGPL-3.0-or-later`, Artifex's copyright) and gains two: `Source: <archive link>` and `Browse: <tagged tree link>`, built from the same version by the same helper as AC-15. Nothing reads this file today, so the new lines are safe to add. It sits in the same folder as the wasm and its glue, which makes these the "clear directions next to the object code" that AGPL section 6(d) asks for.

*The repository*

- **AC-18**: The README gains a Licence section with the copyright line, the AGPL 3.0 or later, no warranty, what `/licence.txt` and `/third-party-notices.txt` are and that the build writes them, the MuPDF source link, and that code contributions are not accepted yet while issues are welcome. A short `CONTRIBUTING.md` says the same.

*Going public (your steps, checked after)*

- **AC-19**: Before the repository becomes public, `gitleaks git` at version 8.30 or later, run over a fresh `git clone --mirror` (every ref, PR refs included), reports no finding. Any finding is either judged a false positive or rotated, then recorded. `git log --all` shows no `.env*` file except `.env.example`, no `*.pem`, and no PDF outside `tests/fixtures`. The scan's gitleaks version, ref count and finding count (counts only) go in the feature's pull request description.
- **AC-20**: Once public: GitHub secret scanning and push protection are on; a branch ruleset blocks force pushes and deletion on `main`; a tag ruleset blocks updating and deleting `prod-*`; this repository's git `user.email` is your GitHub noreply address, and "Block command line pushes that expose my email" is on; Vercel's "Automatically expose System Environment Variables" is on, `NEXT_PUBLIC_SOURCE_URL` is not set in any Vercel environment, and Vercel's Git Fork Protection is on, so a fork's pull request is never deployed without your approval.
- **AC-21**: On the first production deploy after the repository is public, the footer's source link returns 200 and shows that commit's tree. A `prod-` tag on that commit exists once the workflow has run. `/licence.txt`, `/third-party-notices.txt` and `/engine/VERSION` return 200 as text.

*Privacy*

- **AC-22**: The feature adds no request from any page to another origin, and the tool route's content security policy is unchanged. The licence, notices and `VERSION` files are written at build time, before any visitor exists, so nothing in them can come from a document.

## Decision

**Chosen option**: Option 1: the commit link derived at build time, tags written afterwards by a separate least privilege workflow, notices generated at every build (reasoning and the other options in `rationale.md`).

The source link is built in `src/config` from Vercel's Git variables and must name a full commit. A separate `tag-deploy.yml`, holding the repository's only write permission, tags each successful production deployment. `scripts/sync-legal.mjs` writes `/licence.txt` and `/third-party-notices.txt` at every `dev` and `build`, from the installed tree plus committed hand written entries, and MuPDF's section is tied to its version by a build check and two tests. MuPDF's source is offered as Artifex's complete archive for the pinned version, linked in the notices and in `public/engine/VERSION`.

**Implementation skills**: `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`), for the static files under `public/` and keeping config reads literal so `NEXT_PUBLIC_*` inlining works.

Settled in this design conversation, so `/develop` does not ask again:

| Question | Answer |
|---|---|
| Copyright holder | Heyrbiar Khan, year 2026 (first publication) |
| Outside contributions | Not yet: issues only, so you stay the only copyright holder and relicensing stays your call |
| Live already? | No. Launch waits for this feature |
| Link target | The commit tree, `/tree/<sha>` |
| Where the write lives | A separate `tag-deploy.yml` on Vercel's `deployment_status`, one job with `contents: write`, no checkout |
| Tag name | `prod-YYYY-MM-DD-<sha7>`, annotated, one per commit |
| Derivation | From Vercel's variables in `src/config`. A hand set value on Vercel fails the build |
| Notices | Generated at every build, never committed, with a licence allowlist |
| MuPDF libraries | Their texts included and tied to the version, checked against the real wasm |
| Where shown | A plain text file linked in the footer |
| MuPDF source | Upstream at the exact version: the complete archive plus the tagged tree |
| Footer wording | One line, every 5(d) part, without the word "free" (AC-1) |
| Licence link | Our own copy at `/licence.txt` |
| File headers | None |
| Footer links on `/tool` | Same tab, as today |
| Secret scan | gitleaks once over every ref, then GitHub secret scanning and push protection |
| Author email in history | Keep history as is. Use the noreply address from now on |
| Rulesets | Protect `main` and `prod-*` tags |
| Link format check | Require `/tree/<40 hex sha>` on every production build |

Calls made while writing (each with its runner up):

- **Where the words live**: `src/lib/legal.ts`, a frozen record, rendered by a small `LicenceNotice` component in `src/app/licence-notice.tsx` that takes `sourceUrl` as a prop, so a component test can render it without Next's font loader. Runner up: write it inline in `layout.tsx`, which can only be tested end to end.
- **The "is this Vercel" signal**: derive whenever the commit SHA variable is present, and read `VERCEL` (server only, read literally) only to fail when the SHA is missing. The browser never sees `VERCEL`, but its copy of config gets the same inlined Git values and derives the same link. Runner up: derive in `next.config.ts` through its `env` option, which moves a public URL out of `src/config` against AGENTS.md.
- **The closure walk**: start from `package.json` `dependencies`, then follow `dependencies` and installed `optionalDependencies` (never `peerDependencies`). Find each package's folder the way Node does (look for `node_modules/<name>` from the parent's real path upwards) rather than through `require.resolve("<name>/package.json")`, which a package's `exports` can block, as `mupdf`'s does. Runner up: `pnpm licenses list --prod --json`, which also lists Next's optional peers (Babel, Playwright) and needs a child process.
- **The allowlist**: `MIT`, `ISC`, `0BSD`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `Zlib`, `Unlicense`, `CC0-1.0`, `CC-BY-4.0`, `BlueOak-1.0.0`, `OFL-1.1`, `LGPL-3.0-or-later`, `AGPL-3.0-or-later`. This covers today's tree on both Windows and Linux. `LGPL-3.0-or-later` is there for sharp's `@img/sharp-*` binaries, which run only on the server and never reach a browser. Anything else, every GPL variant included, stops the build until a person has judged it compatible and added it. The constant lives in `scripts/lib/notices.mjs`, commented as a rule about compatibility with the AGPL, not a cap. Runner up: a denylist of known bad licences, which lets a new or misspelled identifier through silently.
- **Deterministic output**: the notices carry no date and no commit, so two runs over the same installed tree give byte identical files, which a test checks by running the builder twice. The output is never compared with a committed copy, because the tree differs between Windows and Linux. Runner up: stamp the commit in, which the footer link already shows.
- **Exact MuPDF pin**: `package.json` pins `"mupdf": "1.28.1"` instead of `^1.28.1`, as it already pins `libphonenumber-js`, so an upgrade is always a deliberate change that meets AC-16 head on. Runner up: keep the caret and rely on the lockfile, which a fresh install or `pnpm update` quietly moves past.
- **One helper for MuPDF's links**: `scripts/lib/mupdf-source.mjs` exports `mupdfSourceLinks(version)`, used by `sync-engine.mjs` and `sync-legal.mjs`, so the archive and tree URLs are spelled once.

## Rationale

Reasoning, options and evidence: see `rationale.md`.

## Feature design

**Data model sketch**: nothing is stored by the app. The durable records are:

| Record | Where | Fields |
|---|---|---|
| Deploy tag | git, `refs/tags/prod-YYYY-MM-DD-<sha7>` | annotated tag object: target commit (full SHA), message (full SHA, UTC time, deployment URL or "added by hand"), tagger (the token's bot identity) |
| Legal words | `src/lib/legal.ts` | `holder` "Heyrbiar Khan", `year` 2026, `licenceLine`, `warrantyLine`, `sourceLabel`, `licenceLabel`, `noticesLabel`, `sourcePending` (AC-3's text). Frozen |
| Paths | `src/lib/routes.ts` | `LICENCE_PATH = "/licence.txt"`, `NOTICES_PATH = "/third-party-notices.txt"` |
| MuPDF texts | `scripts/legal/mupdf.txt` (committed) | line 1 `mupdf <version>`, line 2 `sha256 <archive hex>`, then one block per library and font (a line of `=`, `Name:`, `Licence:`, `Copyright:`, a blank line, the full text), per AC-15 |
| Other hand written texts | `scripts/legal/libphonenumber-metadata.txt`, `scripts/legal/inter.txt` (committed) | the attribution line and the full licence text. Carlito reads `scripts/fonts/OFL.txt` where it already is |
| Generated files | `public/licence.txt`, `public/third-party-notices.txt` (gitignored), `public/engine/VERSION` (already gitignored) | the content in AC-12, AC-13, AC-17 |

**State transitions** (a deploy):

- commit reaches `main` → Vercel builds it. The source link is baked in at build. If a config rule fails, the build fails and the previous deploy stays live
- build passes → the deployment is live → Vercel posts `deployment_status` `success` for `Production`
- the workflow runs: commit already tagged → skip; otherwise → tagged
- the workflow fails (GitHub outage, API error) → the deploy stays live, and its link still works because it names the commit, not the tag → fill the tag in later by hand (AC-9)
- promote, rollback or redeploy of a tagged commit → skip

**API surface**:

| Surface | Trigger | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `config.sourceUrl` (`src/config/index.ts`) | module load, at build and in the browser | `NEXT_PUBLIC_VERCEL_GIT_PROVIDER`, `_REPO_OWNER`, `_REPO_SLUG`, `_COMMIT_SHA`; `VERCEL`; `NEXT_PUBLIC_SOURCE_URL` | the commit tree URL, or `""` in development | none | `ConfigError` per AC-5 and AC-6 |
| `scripts/sync-legal.mjs` | `predev`, `prebuild` (after `sync-engine.mjs`) | `LICENSE`, the installed tree, `scripts/legal/*`, `scripts/fonts/OFL.txt`, `node_modules/mupdf/package.json` | `public/licence.txt`, `public/third-party-notices.txt` | none | exit 1 on an allowlist failure (AC-14), a MuPDF version mismatch (AC-16), or a missing hand written file |
| `scripts/sync-engine.mjs` (extended) | `predev`, `prebuild` | the installed `mupdf` version | `VERSION` with `Source:` and `Browse:` lines | none | as today |
| `GET /licence.txt` | a visitor | none | the AGPL text, `text/plain; charset=utf-8` | public | none |
| `GET /third-party-notices.txt` | a visitor | none | the notices, `text/plain; charset=utf-8` | public | none |
| `GET /engine/VERSION` | a visitor | none | version, licence, copyright, `Source:`, `Browse:` | public | none |
| `tag-deploy.yml`, `deployment_status` | Vercel's status event | `github.event.deployment.sha`, `.deployment.environment` (starts with `Production`), `.deployment.creator.login`, `.deployment_status.state`, `.deployment_status.created_at`, `.deployment_status.environment_url` (else `.target_url`) | an annotated tag and its ref | `GITHUB_TOKEN`, `contents: write` | skip with a reason line; fail on an API error |
| `tag-deploy.yml`, `workflow_dispatch` | you | `sha` (string, required) | the same tag, dated today | anyone with write access (GitHub's own rule) | refuse a malformed SHA or one not on `main` |

The workflow's steps, all through `gh api` with `GH_TOKEN: ${{ github.token }}` and every event value passed in `env:`:

1. Decide: dispatch → validate `sha` (40 lowercase hex), then `GET repos/{repo}/compare/{sha}...main` must report `ahead` or `identical`. Event → skip unless state is `success`, the environment starts with `Production` (`startsWith(github.event.deployment.environment, 'Production')`) and the creator is `vercel[bot]`, logging the three values when it skips.
2. Already tagged? `GET repos/{repo}/tags` with `--paginate`, looking for a name starting `prod-` whose `commit.sha` is the SHA. Found → log and stop.
3. `POST repos/{repo}/git/tags` (tag name, AC-7's or AC-9's message, `object` the SHA, `type` commit, `tagger` as in AC-7 with the current UTC time), then `POST repos/{repo}/git/refs` with `refs/tags/<name>` at the new tag object. A 422 "already exists" counts as success only when that tag already points at the same commit. In that case the tag object just written is left unreferenced, which is harmless.
4. `concurrency: { group: tag-deploy-${{ github.event.deployment.sha || inputs.sha }}, cancel-in-progress: false }`, so two runs for one commit cannot race, whichever trigger started them.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Notice | holder, year, the three statements, the three labels, the pending text | `src/lib/legal.ts` (this spec, AC-1, AC-3) |
| Notice | source link href | `config.sourceUrl` (AC-4, AC-6) |
| Notice | licence and notices hrefs | `LICENCE_PATH`, `NOTICES_PATH` in `src/lib/routes.ts` |
| `config.sourceUrl` | owner, slug, commit | `NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER`, `_REPO_SLUG`, `_COMMIT_SHA` (Vercel system variables, inlined at build) |
| `config.sourceUrl` | host | `NEXT_PUBLIC_VERCEL_GIT_PROVIDER` must be `github`, so `https://github.com` |
| `config.sourceUrl` | "this is a Vercel build" | `VERCEL`, read literally, server side only |
| `config.sourceUrl` | off Vercel | `NEXT_PUBLIC_SOURCE_URL` |
| `/licence.txt` | the text | root `LICENSE` |
| Notices | the package list | the closure walk from `package.json` `dependencies` over the installed `node_modules` |
| Notices | each licence identifier | the package's `license` field, or the legacy `licenses` array treated as `OR` |
| Notices | each licence text | the package's `LICENSE*`, `LICENCE*`, `COPYING*` and `NOTICE*` files; none → `author` and `repository` fields |
| Notices | Next's vendored texts | `next/dist/compiled/*/LICENSE*` |
| Notices and `VERSION` | MuPDF version | installed `node_modules/mupdf/package.json` `version`, found as `sync-engine.mjs` already does |
| Notices and `VERSION` | MuPDF archive and tree links | `mupdfSourceLinks(version)` in `scripts/lib/mupdf-source.mjs` |
| Notices | MuPDF library and font texts | `scripts/legal/mupdf.txt`, copied from `mupdf-<version>-source.tar.gz`: `thirdparty/freetype/docs/FTL.TXT`, `thirdparty/harfbuzz/COPYING`, `thirdparty/jbig2dec/LICENSE`, the legal section of `thirdparty/libjpeg/README`, `thirdparty/openjpeg/LICENSE`, `thirdparty/zlib/LICENSE`, `thirdparty/lcms2/LICENSE`, `thirdparty/gumbo-parser/COPYING`, `thirdparty/cmark-gfm/COPYING`, the header of `source/fitz/ucdn.c`, `resources/fonts/urw/OFL.txt` |
| Notices | Emscripten and musl texts | `scripts/legal/mupdf.txt`, copied from Emscripten's `LICENSE` and `system/lib/libc/musl/COPYRIGHT` |
| Notices | the archive's checksum | line 2 of `scripts/legal/mupdf.txt` |
| Tag | tagger | `github-actions[bot]`, `41898282+github-actions[bot]@users.noreply.github.com`, the run's UTC time |
| Notices | libphonenumber metadata attribution and Apache 2.0 text | `scripts/legal/libphonenumber-metadata.txt`, with the attribution taken from libphonenumber's own licence notice |
| Notices | libphonenumber-js's version in that entry | the installed `libphonenumber-js` `package.json` `version`, found by the closure walk |
| Notices | Inter's copyright and OFL text | `scripts/legal/inter.txt`, copied from Inter's own `OFL.txt` (Google Fonts' `ofl/inter` folder) |
| Notices | Carlito's licence | `scripts/fonts/OFL.txt` |
| Tag | name date | `deployment_status.created_at`, UTC date part; for a dispatch, the run's UTC date |
| Tag | name `sha7`, target | `deployment.sha` or `inputs.sha` |
| Tag | message deployment URL | `deployment_status.environment_url`, else `target_url`; for a dispatch, "added by hand" |
| Tag | already tagged? | `GET repos/{repo}/tags`, `commit.sha` |
| Dispatch | on `main`? | `GET repos/{repo}/compare/{sha}...main` `status` |

**Signature table** for AC-16 (names the `-g2` build keeps in the wasm; counts measured on 1.28.1 in `rationale.md`):

| Library | Signature | In 1.28.1 | Covered by `mupdf.txt` |
|---|---|---|---|
| FreeType | `FT_Load_Glyph` | yes | yes |
| HarfBuzz | `hb_shape` | yes | yes |
| jbig2dec | `jbig2_ctx_new` | yes | yes |
| libjpeg | `jpeg_CreateDecompress` | yes | yes |
| OpenJPEG | `opj_decode` | yes | yes |
| zlib | `inflateInit` | yes | yes |
| lcms2mt | `cmsCreateContext` | yes | yes |
| Gumbo | `gumbo_` | yes | yes |
| cmark-gfm | `cmark_iter_new` | yes | yes |
| ucdn | `ucdn_get_script` | yes | yes |
| URW base 14 fonts | `(URW)++` | yes | yes |
| musl libc | `__stdio_write` | yes | yes |
| Emscripten runtime | `emscripten_builtin_malloc` | yes | yes |
| compiler-rt | `__multi3` | yes | named only (LLVM exception) |
| mujs | `js_newstate` | no | no |
| brotli | `BrotliDecoderCreateInstance` | no | no |
| extract | `extract_begin` | no | no |
| Tesseract | `TessBaseAPI` | no | no |
| Leptonica | `pixCreate` | no | no |
| ZXing | `ZXing` | no | no |
| zint | `zint_` | no | no |
| curl | `curl_easy` | no | no |

**Key invariants**:

- **INV-1**: No production build can ship a source link that is not one full commit (AC-6).
- **INV-2**: On Vercel the link is always the commit being built. Nothing set by hand can replace it (AC-5).
- **INV-3**: `tag-deploy.yml` is the only workflow with write access: one job, `contents` only, running no repository code (AC-8). GitHub only triggers `deployment_status` when the workflow exists on the default branch, but the copy that runs may be the deployed commit's own. So what really guards the write is who can get a commit deployed at all: branches need write access, and Vercel's Git Fork Protection holds a fork's pull request until you approve it, which you will not do while contributions are closed (AC-20).
- **INV-4**: A deploy tag, once written, never moves and is never deleted (the tag ruleset, AC-20).
- **INV-5**: The notices describe exactly the tree that was built, because that build writes them. They are never committed, so they cannot fall behind (AC-13).
- **INV-6**: A MuPDF upgrade cannot build until `scripts/legal/mupdf.txt` has been checked against the new version (AC-16).
- **INV-7**: `/licence.txt` is byte identical to `LICENSE` (AC-12).
- **INV-8**: `src/ui` stays presentation only. The words reach the footer as React text, through the layout and `LicenceNotice`, never by `SiteFooter` importing `@/lib/legal` or `@/config` (spec 0003, INV-7).
- **INV-9**: Production deploys come from Vercel's Git integration only, never `vercel --prod` from a working copy, whose uncommitted changes the commit link would not show. No check can see this: a CLI deploy still fills the Git variables from the local repository. It holds by process only, and AGENTS.md records it (Follow-up).

**Security model**: the three text files are public and static, and hold nothing secret or from a document. The write token exists only in `tag-deploy.yml`'s one job. That job runs only GitHub's own `gh` against values passed through `env:`, which closes the door to script injection from event fields, and it acts only on events from `vercel[bot]` for a production environment. Because the workflow file that runs may be the deployed commit's copy (INV-3), the real gate is who can get a commit deployed: you, and no fork without your approval. `workflow_dispatch` is limited by GitHub to people with write access, and it refuses commits not on `main`. Secrets: none are added. The history scan (AC-19) and push protection (AC-20) keep any from going public. No compliance scope beyond the licences themselves: no personal data is touched.

**Configuration required**: no new variable.

- `NEXT_PUBLIC_SOURCE_URL`: now only for builds off Vercel (CI, a local production build). It must never be set on Vercel (AC-5), and in production it must end in `/tree/<40 hex>` (AC-6). `.env.example` says so.
- Vercel project settings: "Automatically expose System Environment Variables" on, which AC-5 enforces by failing the build, and Git Fork Protection on, which only the runbook checks (AC-20).
- GitHub settings (AC-20): secret scanning and push protection; a branch ruleset on `main`; a tag ruleset on `prod-*`; email privacy.

**Critical test scenarios**:

- Happy path: a Vercel shaped environment (`VERCEL=1`, provider `github`, owner, slug, a 40 hex SHA) loads config and gives the commit tree URL. The footer renders all six parts in order with the three hrefs, verifies **AC-1**, **AC-4**.
- Failure case: config with `NEXT_PUBLIC_SOURCE_URL` set alongside the SHA throws, and so does `VERCEL=1` without the SHA, a `gitlab` provider, a short SHA, an owner holding `/`, and a production value ending `/tree/main`, verifies **AC-5**, **AC-6**.
- Failure case: a fake tree's packages give, in turn, fail for `GPL-2.0-only`, `UNLICENSED`, `MIT WITH Some-exception`, `LGPL-3.0+`, `LicenseRef-Custom`, `BSD`, and no licence at all; pass for `(MIT OR GPL-3.0-only)`, `mit or apache-2.0` (operators and identifiers in any case), `Apache-2.0 AND LGPL-3.0-or-later`, `{ "type": "MIT" }` and a legacy `licenses` array `[MIT, Apache-2.0]`; and `MIT AND GPL-2.0-only OR ISC` passes, because `AND` binds first, verifies **AC-14**.
- Failure case: `mupdf.txt` recording `1.28.0` against an installed `1.28.1` fails both the test and the script, verifies **AC-16**.
- Failure case: the signature scan, given a wasm buffer with `js_newstate` added, fails naming mujs. Given a buffer with no signature at all, it fails as stripped, verifies **AC-16**.
- Happy path, browser: `/licence.txt`, `/third-party-notices.txt` and `/engine/VERSION` return 200 from our origin as text (content type matched case insensitively, since `next start` and Vercel may differ in case). The notices contain "Independent JPEG Group", "Emscripten", libphonenumber-js under `MIT` in section 4 and its metadata entry under Apache 2.0 in section 2, "Inter", "Carlito", `mupdf-1.28.1-source.tar.gz` and its checksum, and the licence equals `LICENSE`, verifies **AC-12**, **AC-13**, **AC-15**, **AC-17**.
- Accessibility: axe on `/` and `/tool`, 320px reflow, separators hidden, verifies **AC-2**.
- Permission: a unit test reads every file in `.github/workflows` as text, with no YAML library. It checks that `tag-deploy.yml` has a top level `permissions: {}`, that `contents: write` appears exactly once across all workflows and only there, that `tag-deploy.yml` has no `uses:` line at all, that no line inside a `run:` block (tracked by indentation) contains `${{`, and that `ci.yml` keeps `contents: read`, verifies **AC-8**.
- Leave warning: on `/tool` with a match ticked, clicking the footer's "Licence" link raises the `beforeunload` dialog (Playwright's `dialog` event), verifies **AC-2**.
- Determinism: building the notices twice over the installed tree gives byte identical output, verifies **AC-13**.
- Live: the first production deploy after going public gets its tag, and its link resolves, verifies **AC-7**, **AC-21**.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest whole a visitor can use: the notice, the commit link, the licence and a notices file, all served from every page. Its notices still hold a placeholder where MuPDF's section goes, so slice 1 is usable but not yet complete. Slice 2 fills that section with what is inside MuPDF's wasm, the most exacting part. Slice 3 adds the deploy tags and the repository's own documents. Slice 4 is your manual run to go public, then the first deploy checked live. It is deferred to launch, after feature 20 (dense text layers over pictures), so slices 1 to 3 merge first and the repository stays private until then. Meanwhile a production deploy's source link points into a private repository and returns 404 to anyone else, which is acceptable only because nothing is launched. Nothing is launched before slice 4. Within slice 1, the files the footer links to exist before the footer does, so no task leaves a dead link.

**Slice 1: the notice and the commit link**

1. `LICENSE` at the root: the FSF's plain text GNU AGPL 3.0, verbatim, with LF endings. Check it is identical to `node_modules/mupdf/LICENSE`, which is a verbatim copy. `.gitattributes` gains `LICENSE text eol=lf`. Satisfies **AC-11**.
2. `scripts/lib/notices.mjs` (pure: the closure walk over an injected file reader, the hand written SPDX parser and its check against `LICENCE_ALLOWLIST`, the formatting) and `scripts/sync-legal.mjs` (the shell: real file system, writes both files). It copies `LICENSE` to `public/licence.txt`. Hand written sections 2 and 3 come from `scripts/legal/libphonenumber-metadata.txt`, `scripts/legal/inter.txt` and `scripts/fonts/OFL.txt`, and sections 4 and 5 from the walk. Section 1 is a placeholder line until slice 2. `.gitignore` gains `/public/licence.txt` and `/public/third-party-notices.txt`. `predev` and `prebuild` become `node scripts/sync-engine.mjs && node scripts/sync-legal.mjs`. `tests/unit/notices.test.ts` covers:
   - the walk: dependencies and optional ones followed, peers not, deduplication by name and version, and a package blocked by `exports` still found
   - the parser and allowlist: every expression case in the test scenarios
   - `NOTICE` files carried, a package with no licence file listed, and a package with no licence failing
   - determinism: two runs over the same tree give the same bytes

   Satisfies **AC-12**, **AC-13**, **AC-14**.
3. `src/lib/legal.ts` (the frozen words, AC-1's exact text) and `LICENCE_PATH`, `NOTICES_PATH` in `src/lib/routes.ts`. Satisfies **AC-1**, **AC-3**.
4. `src/config/index.ts`: `RAW` gains `NEXT_PUBLIC_VERCEL_GIT_PROVIDER`, `NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER`, `NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` and `VERCEL`, each read literally (the module's header explains why). A `readSourceUrl` trims each value, treats empty as absent, applies AC-5's rules in order, then passes the result, derived or hand set, through `readUrl` and AC-6's check. Its comment names this spec and INV-1, INV-2, and says the `VERCEL` rule is build only. In `tests/unit/config.test.ts`, `CONFIG_KEYS` gains the five new names, and so does the key list in `tests/unit/entitlement-route.test.ts`, so a CI or Vercel environment cannot leak into a case. Add one case per rule, an empty string case, and query, hash and uppercase cases. Move the existing source URL cases to 40 hex values. Satisfies **AC-4**, **AC-5**, **AC-6**.
5. `src/app/licence-notice.tsx`: `LicenceNotice({ sourceUrl })` renders AC-1's parts as one `<p>`, inline text and plain `a` links with `aria-hidden` separators, so it wraps at words inside `SiteFooter`'s flex row as a single item. When `sourceUrl` is empty it shows AC-3's text. `layout.tsx` passes `config.sourceUrl` and replaces the current link and its comment. `SiteFooter` is unchanged. Component test in `tests/component/app/licence-notice.test.tsx`: order, hrefs, hidden separators, the pending text, and `expectNoAxeViolations`. Satisfies **AC-1**, **AC-2**, **AC-3**.
6. Apply the amends to specs 0001 and 0003 (top of this spec), each with an `**Updated**` line naming spec 0009. Satisfies **AC-1**, **AC-4**.
7. Browser checks:
   - The fake 40 hex link is defined once (for example `tests/e2e/build-env.ts`) and imported by `playwright.config.ts`'s `BUILD_ENV` and by `tests/e2e/shell.spec.ts`, replacing its own `SOURCE_URL`.
   - `shell.spec.ts` checks the notice's words and the three hrefs on `/` and `/tool`. On `/tool` with a match ticked, clicking "Licence" raises the `beforeunload` dialog.
   - `tests/e2e/headers.spec.ts` checks that `/licence.txt` and `/third-party-notices.txt` return 200 from our origin, with a content type matching `text/plain` and `charset=utf-8` case insensitively, and that the licence matches `LICENSE`.
   - The design system spec's axe runs (`tests/e2e/design-system.spec.ts`, the tool page block) and its 320px reflow runs already cover the footer. Run them again.

   Satisfies **AC-2**, **AC-6**, **AC-12**, **AC-13**, **AC-22**.

**Slice 2: what is inside MuPDF**

8. `package.json` pins `"mupdf": "1.28.1"` exactly, and the lockfile is refreshed. Download `mupdf-1.28.1-source.tar.gz` (69 MB) and check its SHA-256 against AC-15's value. Copy each licence named in the value sourcing table into `scripts/legal/mupdf.txt` in AC-15's format: line 1 `mupdf 1.28.1`, line 2 the checksum, then the blocks. Take Emscripten's and musl's texts from Emscripten's repository, and name compiler-rt and dlmalloc without a text. Add the FreeType credit sentence and the IJG acknowledgement sentence. Say in the file's own heading that it covers the wasm and its glue only, and was checked against the signature table. Satisfies **AC-15**.
9. `scripts/lib/mupdf-source.mjs` (`mupdfSourceLinks`). `sync-legal.mjs` writes section 1: version, AGPL, Artifex's copyright, the archive link with its checksum, the tree link, then `mupdf.txt` after its two header lines. It fails first when line 1's version differs from the installed one. `sync-engine.mjs` adds the `Source: <url>` and `Browse: <url>` lines to `VERSION` after its existing three. Satisfies **AC-15**, **AC-16**, **AC-17**.
10. `tests/unit/mupdf-notices.test.ts`: the version check, and the signature scan over the installed wasm against the table in this spec, kept in the test as data. A pure helper is tested on small buffers for the mujs and stripped cases. `tests/e2e/headers.spec.ts` checks that `/engine/VERSION` carries the archive link, and the notices carry "Independent JPEG Group", "Emscripten" and the checksum. Satisfies **AC-16**, **AC-17**.

**Slice 3: deploy tags and the repository's documents**

11. `.github/workflows/tag-deploy.yml` per AC-7 to AC-10 and the steps above. A header comment says why the write lives here and not in `ci.yml`, and what really guards it, naming this spec and INV-3. `ci.yml`'s permissions comment gains one line pointing at it. `tests/unit/workflows.test.ts` is the text scan in the test scenarios, with no YAML dependency. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-10**.
12. README Licence section and `CONTRIBUTING.md` (AC-18's content). `.env.example`'s `NEXT_PUBLIC_SOURCE_URL` comment rewritten: off Vercel only, never set on Vercel, must end in `/tree/<full commit>`. Satisfies **AC-18**, **AC-5**, **AC-6**.

`deployment_status` only fires once the workflow file is on `main`, so slice 3 is proven after merge, by the first production deploy or a dispatch on the merge commit. That does not wait for slice 4: the workflow tags commits in a private repository the same way.

**Slice 4: going public (your steps, in this order, deferred to launch after feature 20)**

13. In a fresh folder: `git clone --mirror https://github.com/HeyrbiarKhan/redactnest.git`, then `gitleaks git -v <that folder>` with gitleaks 8.30 or later (the release binary or its Docker image, never added to the project). Then from your working copy: `git log --all --diff-filter=A --name-only --format=` filtered for `.env`, `.pem`, `.key` and `.pdf` outside `tests/fixtures` (today it shows only `.env.example` and the four PNG mockups). Look over `docs/design/references/*.png` and confirm you are happy to publish them. Record gitleaks' version, the ref count and the finding count in the pull request. Satisfies **AC-19**.
14. `git config user.email 146515280+HeyrbiarKhan@users.noreply.github.com` in this repository, and turn on "Block command line pushes that expose my email" in GitHub's email settings. In Vercel, confirm "Automatically expose System Environment Variables" and Git Fork Protection are on, and delete `NEXT_PUBLIC_SOURCE_URL` from every environment if it is there. Satisfies **AC-20**.
15. Make the repository public. Confirm secret scanning and push protection are on. Add the branch ruleset (`main`: block force pushes, restrict deletions) and the tag ruleset (`prod-*`: restrict updates, restrict deletions). Satisfies **AC-20**.
16. On the first production deploy after going public, check AC-21: the footer link opens that commit, the workflow's log shows the tag written, and the three text files return 200. Satisfies **AC-7**, **AC-21**.

## Consequences

**Positive**:
- The source link is right on every deploy without anyone setting it, and a fork on Vercel complies by default.
- The notices cannot fall behind the code, and an unknown licence stops a build instead of shipping unnoticed.
- A MuPDF upgrade forces a fresh look at what is inside the wasm, checked against the binary itself rather than its build flags.
- Write access is confined to one job that runs no repository code.

**Negative / tradeoffs**:
- Config now knows about Vercel and GitHub. Another host or forge means setting `NEXT_PUBLIC_SOURCE_URL` by AC-6's rules.
- A new dependency with an unlisted licence fails every build, `pnpm dev` included, even for an urgent fix, until someone judges it. That is on purpose.
- An exact `mupdf` pin means every MuPDF release has to be taken up by hand.
- The notices are over inclusive. The closure lists packages that only run at build or on the server (sharp, PostCSS, caniuse-lite), because telling them apart reliably costs more than listing them.
- The tag is written after the deploy, so for about a minute a live deploy has no tag. The link does not depend on it.
- If GitHub is down, the source link is down. The licence and notices still come from our origin.
- Every MuPDF upgrade now includes copying licence texts out of a 69 MB archive by hand.
- Section 6(d) keeps MuPDF's source availability our duty even though Artifex hosts it.
- The signature scan relies on the wasm keeping its function names (`-g2`). If Artifex strip them, the test fails and a new check is needed.
- Your hotmail address stays visible in 139 commits.

**Neutral**:
- No new environment variable. `NEXT_PUBLIC_SOURCE_URL` narrows to builds off Vercel.
- Two more gitignored files in `public/`, written by a second prebuild script beside the engine's.
- Specs 0001 and 0003 are amended (task 6).

## Follow-up

- [ ] `/sync`: add to root AGENTS.md's *Things that will trip you up*: never set `NEXT_PUBLIC_SOURCE_URL` on Vercel; production deploys only through the Git integration, never `vercel --prod` (INV-9); Vercel's system variables must stay exposed; a MuPDF upgrade means refreshing `scripts/legal/mupdf.txt` from the new source archive; `tag-deploy.yml` is the only workflow with write access; a licence outside the allowlist fails the build on purpose.
- [ ] On the first real event, read the workflow log's fields. If Vercel reports an environment that does not start with `Production`, or a creator other than `vercel[bot]`, correct the condition. AC-21 catches a miss.
- [ ] If outside contributions ever open, look again at INV-3 before approving any fork deployment: the workflow copy that runs may be the contributor's.
- [ ] At each MuPDF upgrade, check that the archive link for the new version resolves. If Artifex ever drop an archive we still ship, attach a copy as a release asset on our repository and point `mupdfSourceLinks` at it.
- [ ] Feature 9 (privacy policy and terms) reuses `src/lib/legal.ts` for the holder's name.
- [ ] Spec 0001's Follow-up to get an Artifex commercial licence quote stays open, unchanged by this spec.
