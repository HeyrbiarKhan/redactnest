# Verify: AGPL compliance and source publication · spec 0009 · updated 2026-10-01
_Steps derived from spec 0009 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. "A production build" means `pnpm build && pnpm start` with Playwright's values (`NEXT_PUBLIC_SITE_URL=https://redactnest.test` and `NEXT_PUBLIC_SOURCE_URL` from `tests/e2e/build-env.ts`) unless a step says otherwise. Steps marked "after merge" prove slice 3's workflow and run once it is on `main`, while the repository is still private. Steps marked "at launch" are slice 4, your steps, deferred to launch after feature 20 (dense text layers over pictures)._

## UI / manual
- [x] On a production build, visit `/` → the footer reads "© 2026 Heyrbiar Khan · Licensed under the GNU AGPL 3.0 or later, which lets you share and change it · No warranty · Source code for this version · Licence · Third party notices", in that order, as one paragraph → AC-1 (Value sourcing: holder, year, the three statements and three labels from `src/lib/legal.ts`)
- [x] Same footer → "Source code for this version" links to the `tests/e2e/build-env.ts` address, "Licence" to `/licence.txt`, "Third party notices" to `/third-party-notices.txt`, each opening in the same tab; the `·` dots are `aria-hidden` → AC-1 (Value sourcing: `config.sourceUrl`, `LICENCE_PATH`, `NOTICES_PATH`)
- [x] Visit `/tool` → the same notice and links → AC-1
- [x] At 320 CSS pixels wide on `/` and `/tool` → the notice wraps with no sideways scroll, each link at least 24 by 24 pixels, a visible focus ring when tabbed to, and axe reports nothing → AC-2
- [x] On `/tool`, open `tests/fixtures/text-page.pdf`, untick "020 7946 0958", click the footer's "Licence" → the browser's leave warning appears; Cancel keeps you on `/tool` with the tick as you left it → AC-2
- [x] Run `pnpm dev` with no `NEXT_PUBLIC_SOURCE_URL` and no Vercel variables set → the footer shows "Source code for this version (link set per deploy)" as plain text, with "Licence" and "Third party notices" still links → AC-3
- [x] Production build with `VERCEL=1`, `NEXT_PUBLIC_VERCEL_GIT_PROVIDER=github`, `NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER=someone`, `NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG=fork` and a 40 character lowercase hex `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, with `NEXT_PUBLIC_SOURCE_URL` unset → the footer links to `https://github.com/someone/fork/tree/<that sha>` → AC-4 (Value sourcing: owner, slug, commit; host from the provider)
- [x] Same Vercel shaped build, changed one value at a time → each fails `pnpm build` naming its variable: `NEXT_PUBLIC_SOURCE_URL` set as well; owner unset; slug unset; provider `gitlab`; a 7 character or uppercase SHA; an owner holding `/`; and `VERCEL=1` with the SHA unset (or set to spaces) → AC-5 (Value sourcing: "this is a Vercel build" from `VERCEL`)
- [x] Production build off Vercel with `NEXT_PUBLIC_SOURCE_URL` set to the repository root, then `…/tree/main`, then a full commit in uppercase, then a full commit with `?x=1`, then with `#x` → each fails naming `NEXT_PUBLIC_SOURCE_URL`; `https://github.com/<owner>/redactnest/tree/<40 lowercase hex>` builds → AC-6 (Value sourcing: `config.sourceUrl` off Vercel)
- [x] Open `/licence.txt` → the AGPL 3.0 text, served as `text/plain; charset=utf-8`; saved, it is byte for byte the repository's `LICENSE` → AC-11, AC-12 (Value sourcing: `/licence.txt` from `LICENSE`)
- [x] Open `/third-party-notices.txt` → a header saying what it covers and that the build writes it, then sections 1 to 5 in order: MuPDF; libphonenumber-js at its installed version with the Apache 2.0 metadata entry and Google's attribution; Inter and Carlito under OFL 1.1; every production package sorted by name, `@next/env` listed with its author, repository and "This package ships no licence file."; and Next.js's vendored licences, each text once → AC-13 (Value sourcing: package list, identifiers, licence texts, Next's vendored texts, libphonenumber metadata and version, Inter, Carlito)
- [x] Notices section 1 → `mupdf 1.28.1`, AGPL 3.0 or later, Artifex's copyright, `https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz` with `SHA-256: dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3`, the tree `https://github.com/ArtifexSoftware/mupdf/tree/1.28.1`, then blocks for FreeType (ending with its 2026 credit sentence), HarfBuzz, jbig2dec, libjpeg (with "This software is based in part on the work of the Independent JPEG Group."), OpenJPEG, zlib, lcms2mt, Gumbo, cmark-gfm, ucdn, the URW base 14 fonts, the Emscripten runtime and musl libc, and compiler-rt and dlmalloc named without a text → AC-15 (Value sourcing: MuPDF version, archive and tree links, library texts, Emscripten and musl texts, the checksum)
- [x] Download the archive from that link and run `sha256sum` on it → matches the checksum the notices print → AC-15
- [x] Open `/engine/VERSION` → five lines: `mupdf 1.28.1`, `AGPL-3.0-or-later`, Artifex's copyright, `Source: <archive link>`, `Browse: <tree link>`, shown as text rather than downloaded → AC-17, AC-21 (Value sourcing: MuPDF version, archive and tree links)
- [x] Read the README's Licence section and `CONTRIBUTING.md` → the copyright line, AGPL 3.0 or later, no warranty, what `/licence.txt` and `/third-party-notices.txt` are and that the build writes them, MuPDF's source link, and that code contributions are closed while issues are welcome → AC-18
- [x] With the network panel open, load `/` and `/tool` → no request to another origin, and `/tool`'s content security policy is unchanged → AC-22
- [x] After merge: the first production deploy's `tag-deploy` run log shows "Tagged <sha> as prod-YYYY-MM-DD-<sha7>"; `git fetch --tags && git show prod-…` shows the three line message and the `github-actions[bot]` tagger; a redeploy of the same commit logs "Already tagged" → AC-7 (Value sourcing: tag name date, sha7, target, message URL, tagger, already tagged)
- [x] After merge: a preview deploy's run logs "Skipped: environment 'Preview', state 'success', created by 'vercel[bot]'." and adds no tag → AC-7, AC-10
- [ ] After merge: run the workflow by hand with a short SHA → refused; with a commit not on `main` → refused; with an untagged commit on `main` → tagged, message ending "Added by hand <time>" → AC-9 (Value sourcing: dispatch "on main?") · **Partly run (2026-10-07):** both refusals pass, and neither writes a tag. Run #21, given `b8cd99a`, logs "The sha must be a full commit, 40 lowercase hex characters." and exits 1. Run #22, given `28aa803f147804ad98f281121b7e769de8223140` (one commit past `main` on `feat/launch-records`), logs "28aa803f147804ad98f281121b7e769de8223140 is not on main (compared with main: behind)." and exits 1. The untagged commit case is not run, on purpose: a hand tag says "Production deploy of", so tagging a commit only to test it would record a deploy that never happened. Run it the first time a real production deploy misses its tag, then tick this row.
- [x] At launch: before going public, `gitleaks git -v` (8.30 or later) over a fresh `git clone --mirror` reports no finding, and `git log --all --diff-filter=A --name-only --format=` shows no `.env*` but `.env.example`, no `*.pem`, no PDF outside `tests/fixtures`; the counts go in the pull request → AC-19
- [x] At launch: secret scanning and push protection on; the `main` and `prod-*` rulesets in place; the noreply address set for this repository; Vercel's system variables exposed, `NEXT_PUBLIC_SOURCE_URL` absent from every Vercel environment, and Git Fork Protection on → AC-20
- [x] At launch: on the first production deploy after going public, the footer's source link returns 200 and shows that commit's tree, and `/licence.txt`, `/third-party-notices.txt` and `/engine/VERSION` return 200 as text → AC-21

## Commands
- [x] `pnpm test` → all pass, including `tests/unit/config.test.ts` (each AC-5 and AC-6 rule), `notices.test.ts` (the walk, the licence rules, determinism), `mupdf-notices.test.ts` (version and wasm signatures) and `workflows.test.ts` (the write access scan) → AC-4, AC-5, AC-6, AC-8, AC-13, AC-14, AC-16
- [x] `pnpm exec playwright test tests/e2e/shell.spec.ts tests/e2e/headers.spec.ts tests/e2e/design-system.spec.ts` → all pass → AC-1, AC-2, AC-12, AC-13, AC-15, AC-17, AC-22
- [x] `node scripts/sync-legal.mjs` twice, copying `public/third-party-notices.txt` aside between runs → the two copies are identical → AC-13, INV-5
- [x] Add a dependency whose `package.json` declares `GPL-2.0-only` (or edit an installed one's licence in `node_modules` for the test), then `node scripts/sync-legal.mjs` → exits 1 naming the package, its version and its licence; undo it → AC-14
- [x] Change line 1 of `scripts/legal/mupdf.txt` to `mupdf 1.28.0`, then `node scripts/sync-legal.mjs` and `pnpm exec vitest run tests/unit/mupdf-notices.test.ts` → both fail, naming 1.28.0 and 1.28.1; undo it → AC-16, INV-6
- [x] `git check-ignore public/licence.txt public/third-party-notices.txt public/engine/VERSION` → all three ignored; `git ls-files --eol LICENSE` → `i/lf w/lf` → AC-11, AC-12, AC-13
- [x] `grep -cE "^\s+contents: write" .github/workflows/*.yml` → 1 in `tag-deploy.yml`, 0 in `ci.yml` (anchored to an indented key, so the header comment on line 5 of `tag-deploy.yml` is not counted) → AC-8, INV-3

## Acceptance-criteria coverage
- AC-1 … the three footer steps, the browser command
- AC-2 … the 320 pixel step, the leave warning step, the browser command
- AC-3 … the `pnpm dev` step, the component test in `pnpm test`
- AC-4 … the Vercel shaped build step, the first command
- AC-5 … the Vercel failures step, the first command
- AC-6 … the off Vercel failures step, the first command
- AC-7 … the first tag step and the preview step (after merge)
- AC-8 … the workflow scan in the first command, the `grep` command
- AC-9 … the dispatch step (after merge)
- AC-10 … the preview step (after merge)
- AC-11 … the `/licence.txt` step, the `git ls-files --eol` command
- AC-12 … the `/licence.txt` step, the browser command
- AC-13 … the notices step, the determinism command, the browser command
- AC-14 … the allowlist command, the first command
- AC-15 … the section 1 step, the checksum step, the browser command
- AC-16 … the version mismatch command, the first command
- AC-17 … the `/engine/VERSION` step, the browser command
- AC-18 … the README and `CONTRIBUTING.md` step
- AC-19 … the gitleaks step (at launch)
- AC-20 … the settings step (at launch)
- AC-21 … the `/engine/VERSION` step, the live link step (at launch)
- AC-22 … the network panel step, the browser command
