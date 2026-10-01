# 0009. AGPL compliance and source publication: rationale

## Context

Spec 0001 chose MuPDF compiled to WebAssembly, under the AGPL 3.0 or later, and licensed RedactNest the same way. Two parts of the licence now bite. Section 13 says anyone who uses a modified version over a network must be offered its Corresponding Source (the source needed to build exactly what runs), so the offer has to resolve to the deployed version, not to a repository that has moved on. Section 6 covers conveying object code: every visitor's browser downloads MuPDF's wasm, so its source must be offered with clear directions next to it. Section 5(d) asks every interactive interface to show the Appropriate Legal Notices: a copyright line, no warranty, that the work may be shared under the licence, and how to read it. Artifex enforce their licence, so roughly right is not enough.

The rest of the browser bundle brings duties too. Next.js, React, lucide-react and libphonenumber-js are MIT or ISC, and all ask for their notice to travel with copies. libphonenumber-js's metadata comes from Google's libphonenumber under Apache 2.0. Inter is OFL 1.1 and is served from our own origin. Carlito, OFL 1.1, sits in the repository and inside the test fixtures. The wasm itself holds a dozen libraries, five font families and Emscripten's runtime and libc, each with its own licence, and the npm package ships none of their texts.

Five forces shaped the design. The repository is private today and becomes public in this feature, so its history is published in full. `ci.yml` was deliberately made read only, and tagging needs write access. Deploys are Vercel's Git integration, so the commit is known at build time, but a tag can only be written after the deploy succeeds. A single maintainer runs everything, so a step that relies on remembering will eventually be missed. And the product's pitch to HR, legal and healthcare buyers is verifiability: a source link that points at the wrong code undermines the claim the product rests on.

Not deciding means the obligation attaches at launch with nothing in place, or the link gets set by hand and drifts on the first busy deploy.

## Options considered

### Option 1: derive at build, tag afterwards, generate notices at every build (chosen)

`src/config` builds the commit link from Vercel's Git variables. A separate least privilege workflow tags each successful production deployment. A prebuild script writes the licence copy and the notices from the installed tree, plus hand written entries tied to the MuPDF version. MuPDF's source is Artifex's complete archive for that version, linked upstream.

**Pros**: the link is correct from the first second, with no tag dependency; the notices cannot drift; write access sits in one job that runs no repository code; forks on Vercel comply by default.
**Cons**: config is coupled to Vercel and GitHub; the notices are over inclusive; a tag lands about a minute after its deploy.

### Option 2: deploy from GitHub Actions, tag first, link to the tag

Actions runs CI, creates the tag, then deploys with the Vercel CLI (`vercel build`, then `vercel deploy --prebuilt --prod`), and the link names the tag.

**Pros**: nothing deploys unless CI is green; the tag exists before the deploy, so the link can name it; one place owns the whole release.
**Cons**: a `VERCEL_TOKEN` secret in a public repository's Actions; Vercel's Git deploys switched off and previews rebuilt by hand; the deploy workflow needs write access and runs repository code, which is the very combination `ci.yml` was kept read only to avoid.

### Option 3: by hand, committed

`NEXT_PUBLIC_SOURCE_URL` set in Vercel before each deploy, tags pushed by hand, and a committed `THIRD_PARTY_NOTICES.txt` kept current by a script and a CI check.

**Pros**: the fewest moving parts; the notices show up in pull request diffs, so a licence change is seen in review.
**Cons**: every deploy depends on remembering two steps, and the failure is silent; a committed file built from the installed tree differs between Windows and Linux (platform packages such as `@next/swc-win32-x64-msvc` and `@img/sharp-win32-x64`), so its CI check flaps unless it reads the lockfile instead.

### Option 4: host every source ourselves

As Option 1, but each MuPDF version's archive is mirrored as a release asset on our own repository, and each deploy's source archive is attached to its tag as a release.

**Pros**: no reliance on Artifex keeping old archives, which section 6(d) makes our duty either way.
**Cons**: about 70 MB uploaded at every MuPDF upgrade, plus a release per deploy, for a risk with no history behind it: Artifex have kept every MuPDF release available for years.

## Rationale

Option 1 is the only one where neither the link nor the notices depend on someone remembering a step, which is the force that matters most for a single maintainer under an enforcing licensor. Linking the commit rather than the tag removes the one real timing problem: the commit is known while building, the tag only after. The tag then does what tags do well, which is to keep the commit reachable and record what shipped, without anything resting on the moment it is written. Option 2 gets ordering right, but pays for it with a deploy secret and a workflow that holds write access and runs repository code. That is the risk `ci.yml` was locked down to avoid, and it is heavier still in a public repository. Option 3's silent failure mode is exactly the drift this feature exists to prevent. Option 4 can be taken up the day Artifex's archive ever disappears; the Follow-up records the trigger.

Generating the notices at every build follows the pattern `sync-engine.mjs` already set: generated, gitignored, and unable to drift from what ships. The cost is losing review diffs, and the allowlist buys back the part of review that matters, an incompatible licence entering the tree.

The derivation refuses a hand set value on Vercel, rather than letting it win. One forgotten project variable would otherwise bring back a stale link on every deploy, unnoticed, because a stale link still looks like a working link.

## Decisions taken in the design conversation

| Question | Answer | Why it matters |
|---|---|---|
| References | Sources plus web verified links | The facts below were checked once, and two subagent claims were corrected |
| Copyright holder | Heyrbiar Khan | Matches the git author; correct unless a company is formed |
| Contributions | Not yet, issues only | Keeps the single copyright holder, so spec 0001's relicensing route through an Artifex commercial licence stays open |
| Live now? | No | The build plan can run in order, with public last |
| Link target | Commit tree | Known at build time, with no tag dependency |
| Write location | Separate `tag-deploy.yml` | `ci.yml` keeps its promise |
| Tag name | `prod-YYYY-MM-DD-<sha7>` | Sorts by date, readable, one per commit |
| Derivation | From Vercel variables, refusing an override | A stale override cannot hide the commit |
| Notices | Generated each build | Cannot drift. The engineer asked for libphonenumber-js's metadata to be added by hand, because the tree walk sees only the package's MIT |
| MuPDF libraries | Texts included, tied to the version | The engineer asked for the list to be checked against the real wasm, since it might hold mujs, Gumbo, brotli or extract. It holds Gumbo (and cmark-gfm, ucdn, the URW fonts) but not the others, see *Evidence* |
| Where shown | Plain text file | No new page, nothing changes under the tool CSP |
| MuPDF source | Upstream at the exact version | The engineer asked to confirm the npm package is really built from that tag, and whether the old `mupdf.js` repository should be linked too. It is built from the main repository's tag, and the old repository is not its source, see *Evidence* |
| Footer wording | One line, without "free" | The engineer's own text, covering all four 5(d) parts |
| Licence link | `/licence.txt` | Our origin, tied to the release |
| File headers | None | One holder, no outside code |
| Footer on `/tool` | Same tab | The leave warning already guards work |
| Secret scan | gitleaks once, then GitHub's scanning | No new tool in the project |
| Author email | Keep history, noreply from now | Rewriting cannot reach GitHub's 10 pull request refs anyway |
| Rulesets | `main` and `prod-*` | The link and the tags stay valid |
| Format check | `/tree/<40 hex>` in production | No root link can ship from anywhere |

## Evidence

### What is inside MuPDF 1.28.1's wasm

Measured on 2026-10-01 by counting names in `node_modules/mupdf/dist/mupdf-wasm.wasm` (10,409,826 bytes). The build links with `-g2`, which keeps function names:

| Library | Name searched | Count |
|---|---|---|
| FreeType | `FT_Load_Glyph` / `ft_` | 5 / 129 |
| HarfBuzz | `hb_shape` | 10 |
| jbig2dec | `jbig2_` | 74 |
| libjpeg | `jpeg_` | 95 (and "Thomas G. Lane, Guido Vollbeding" in a copyright string) |
| OpenJPEG | `opj_` | 200 |
| zlib | `inflateInit` / `deflateInit` | 3 / 2 |
| lcms2mt | `cmsCreateContext` / `lcms2mt` | 1 / 22 |
| Gumbo | `gumbo_` | 25 |
| cmark-gfm | `cmark` | 81 |
| ucdn | `ucdn_` | 5 names |
| URW fonts | "(URW)++ Design & Development" | present; Nimbus Sans, Roman and Mono PS, Standard Symbols PS, Dingbats |
| mujs | `js_newstate` | 0 (the `js_dev_*` names are MuPDF.js's own device glue) |
| brotli | `BrotliDecoderCreateInstance` | 0 |
| extract | `extract_begin` | 0 |
| Tesseract / Leptonica | `TessBaseAPI` / `pixCreate` | 0 / 0 |
| ZXing / zint / curl | `ZXing` / `zint_` / `curl_easy` | 0 / 0 / 0 |
| Noto, Droid, Source Han font data | copyright strings | none; only names in lookup tables |
| musl libc (Emscripten's libc) | `__stdio_write` / `__towrite` | 1 / 1 |
| Emscripten runtime | `emscripten_` | 9 names (`emscripten_builtin_malloc`, `emscripten_resize_heap` and others); the JS glue `mupdf-wasm.js` is Emscripten output, minified, with no header |
| compiler-rt builtins | `__multi3` / `__trunctfdf2` / `__addtf3` | 1 / 1 / 1 |
| libc++ / libc++abi | `__cxa_` / `_Znwm` / `_ZNSt` | 0 / 0 / 0 |
| allocator | `dlmalloc` / `emmalloc` | 0 / 0 by name; `emscripten_builtin_malloc` is Emscripten's dlmalloc build |

The build script at the tag sets `FEATURES=brotli=no mujs=no extract=no xps=no svg=no html=no` and `DEFINES=-DTOFU -DTOFU_CJK_EXT -DFZ_ENABLE_HYPHEN=0`. Gumbo is linked even with `html=no`, because the story and Markdown layout code (`fz_new_story`, `fz_md_to_html`) still uses it. That is why AC-16 checks the binary rather than the flags.

### Where MuPDF's source lives

- `platform/wasm/package.json` at tag `1.28.1` of `ArtifexSoftware/mupdf` matches the installed `node_modules/mupdf/package.json` field for field (name, version, `repository: https://cgit.ghostscript.com/mupdf.git/`, the `prepack` script running `tools/build.sh`). The npm package is built from the main repository at that tag.
- `ArtifexSoftware/mupdf.js` is still live, but its tags stop at `v1.3.6`. It is the older, separate wrapper line, not the source of `mupdf@1.28.1`, so it is not linked.
- MuPDF's third party code is in git submodules, which GitHub's Download ZIP leaves out. Artifex's own archive `mupdf-1.28.1-source.tar.gz` (68,898,834 bytes, served from the `ArtifexSoftware/mupdf-downloads` releases through a redirect from `mupdf.com`) includes them all, with `platform/wasm/tools/build.sh`. That makes it the complete Corresponding Source.
- Licence files in the archive: `thirdparty/freetype/docs/FTL.TXT`, `thirdparty/harfbuzz/COPYING`, `thirdparty/jbig2dec/LICENSE` (AGPL 3.0 or later), `thirdparty/libjpeg/README` (asks for an acknowledgement in product documentation), `thirdparty/openjpeg/LICENSE`, `thirdparty/zlib/LICENSE`, `thirdparty/lcms2/LICENSE` (MIT, Marti Maria Saguer), `thirdparty/gumbo-parser/COPYING`, `thirdparty/cmark-gfm/COPYING` (BSD 2 clause, with MIT parts and a CC BY SA 4.0 spec text that is not compiled in), `source/fitz/ucdn.c` (ISC, Grigori Goronzy), `resources/fonts/urw/OFL.txt` (OFL 1.1, "Copyright 2016 by (URW)++ Design & Development").

### The production tree

`pnpm licenses list --prod` on this Windows machine lists 65 package versions: MIT (most), Apache 2.0 (`@swc/helpers`, `sharp`, and Next's optional peer Playwright), ISC (`lucide-react` and others), `CC-BY-4.0` (`caniuse-lite`), `BSD-3-Clause`, `0BSD`, `AGPL-3.0-or-later` (`mupdf`), and `Apache-2.0 AND LGPL-3.0-or-later` (`@img/sharp-win32-x64`). It includes Windows only packages and Next's optional peers (Babel, Playwright), which is why the walk follows `dependencies` from our own `dependencies` rather than using that list, and why the output is not committed. Three packages ship no licence file: `@next/env`, `@next/swc-*` and `client-only`, all MIT from Vercel. Three ship a `NOTICE` file (Playwright's packages), which Apache 2.0 section 4(d) requires to be passed on. Next.js vendors 119 licence files under `next/dist/compiled`, including the React copy the App Router actually ships.

### The history

149 commits on all refs: 139 authored with `heyrbiarkhan@hotmail.com`, 10 with the GitHub noreply address. GitHub holds 10 `refs/pull/*` refs that a rewrite of `main` cannot remove, so rewriting would hide the address only in a new repository. Files ever added that matter for publishing: `.env.example` (documentation, no secrets) and four PNG mockups in `docs/design/references` (RedactNest branded, with made up data). No `.env`, `.pem` or PDF outside `tests/fixtures`.

### What the cross check changed (2026-10-01)

An independent read only pass on another model found gaps the draft left to the builder. You accepted every recommended fix:

- Empty values count as absent. AC-5's rules have a fixed order and name their variable. AC-6's check runs on the final URL and refuses a query, a hash and uppercase hex.
- The two test key lists gain the new variables, and the fake source link is defined once.
- The workflow's concurrency expression, tagger and exact messages are fixed. The environment is matched by prefix, because Vercel can name it `Production – <project>`.
- **INV-3 was overclaimed.** The draft said `deployment_status` runs the default branch's workflow file. GitHub's docs say only that the file must exist there to trigger, while `GITHUB_SHA` is the deployed commit, so the copy that runs may be that commit's. The real guard is who can get a commit deployed, so Vercel's Git Fork Protection joins AC-20.
- **Emscripten and musl were missing.** The cross check pointed out that a wasm build links Emscripten's runtime and libc. The measurements above confirmed musl, the Emscripten runtime and compiler-rt, and ruled out libc++. AC-15 and the signature table gained them. compiler-rt is named only, because the LLVM exception waives notices for compiled code.
- The SPDX parser's rules, the workflow test's text scan (no YAML dependency), `mupdf.txt`'s format and the archive's SHA-256, a Playwright check of the leave warning, the notice as one `<p>`, `.gitattributes` for `LICENSE`, and an exact `mupdf` pin.
- Wording: the notices are written before the footer links to them; `VERSION`'s exact lines; a case insensitive content type check; INV-9 holds by process only; preview links may 404; the determinism test compares two runs; LGPL entries are server only; and `pnpm dev` fails on an unlisted licence too.

### Research corrections

A cheap research subagent reported that GitHub rulesets need a Team or Enterprise plan. GitHub's page on creating rulesets for a repository limits only organisation wide rulesets to those plans, so a personal public repository can use repository rulesets, tag rulesets included. It also reported `v1.28.1` as a `mupdf.js` tag "inferred"; the tags page shows none, as above.

## References

**Project sources**:
- Spec 0001: the AGPL choice, `NEXT_PUBLIC_SOURCE_URL` "tag or commit for this deploy", the Follow-up this spec meets
- Spec 0003: the footer (AC-14), `src/ui` as presentation only (INV-7, AC-19)
- AGENTS.md: every public URL from `src/config`; the engine copied to `public/engine` by `scripts/sync-engine.mjs`; `ci.yml` kept read only
- `scripts/sync-engine.mjs`: the generated, gitignored pattern and the `VERSION` file
- `node_modules/mupdf/LICENSE`: a verbatim copy of the AGPL 3.0
- `next-best-practices` skill: static files in `public/`, literal `NEXT_PUBLIC_*` reads

**Practices & standards**:
- GNU AGPL 3.0, sections 0 (Appropriate Legal Notices), 5(d), 6(d) and 13
- Apache License 2.0, section 4(d) (passing on `NOTICE` files)
- SPDX licence expressions (`AND`, `OR`, `WITH`)
- Least privilege for CI tokens, and passing event values through `env:` to avoid script injection in GitHub Actions

**Links** (web verified on 2026-10-01):
- Vercel for GitHub (deployment events and statuses): https://vercel.com/docs/git/vercel-for-github
- Vercel system environment variables: https://vercel.com/docs/environment-variables/system-environment-variables
- GitHub, events that trigger workflows (`deployment_status`): https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows
- GitHub, creating rulesets for a repository: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
- gitleaks: https://github.com/gitleaks/gitleaks
- MuPDF's wasm folder at 1.28.1: https://github.com/ArtifexSoftware/mupdf/tree/1.28.1/platform/wasm
- The wasm build script at 1.28.1: https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.28.1/platform/wasm/tools/build.sh
- MuPDF 1.28.1 complete source archive: https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz
- MuPDF.js tags (stopping at v1.3.6): https://github.com/ArtifexSoftware/mupdf.js/tags
