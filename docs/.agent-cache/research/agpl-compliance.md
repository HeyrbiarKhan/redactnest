# AGPL Compliance Research

**Date:** 2026-10-01

## 1. Vercel Git Integration with GitHub

**Finding:** Vercel's GitHub integration creates GitHub Deployments via the Deployments API and sends `deployment_status` webhook events by default (can be disabled). The deployment environment name used is "Production" for production deployments and preview environments for other branches. The state field in deployment status events uses standard GitHub states: `pending`, `in_progress`, `queued`, `success`, `failure`, `error`, `inactive`. The creator is identified through the deployment's creator field via the GitHub Deployments API, typically `vercel[bot]` for automated deployments.

**Confirmation:** CONFIRMED - https://vercel.com/docs/git/vercel-for-github (states "By default, Vercel notifies GitHub of deployments using the deployment_status webhook event" and documents the Deployments API usage)

**Caveat:** Requires the Vercel GitHub App to be installed and the "Deployments" permission enabled in the app configuration.

---

## 2. Vercel System Environment Variables for Next.js

**Finding:** `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER`, `NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG`, `NEXT_PUBLIC_VERCEL_GIT_PROVIDER`, and `NEXT_PUBLIC_VERCEL_ENV` are available at both build time and runtime. These are automatically exposed when the "Enable access to System Environment Variables" project setting is enabled. The underlying system variables (without the NEXT_PUBLIC_ prefix) are `VERCEL_GIT_*` and are available at both build and runtime. For Vercel CLI deploys (without Git integration), `VERCEL_GIT_COMMIT_SHA` is set based on the current git working directory at deploy time.

**Confirmation:** CONFIRMED - https://vercel.com/docs/environment-variables/system-environment-variables and https://vercel.com/docs/git/vercel-for-github

---

## 3. GitHub Actions `deployment_status` Event

**Finding:** The `deployment_status` event receives the workflow file that runs from the repository's **default branch** (typically `main`). The `GITHUB_SHA` context variable contains the commit being deployed, NOT the commit that triggered the event. A job with `permissions: contents: write` can use GITHUB_TOKEN to create tags via the REST API (`POST /repos/{owner}/{repo}/git/refs` for lightweight tags or `POST /repos/{owner}/{repo}/git/tags` for annotated tags), but events created by GITHUB_TOKEN do not trigger further workflows.

**Confirmation:** CONFIRMED - https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows (states "The workflow file must exist on the default branch for this event to trigger a run" and confirms GITHUB_SHA contains the commit to be deployed)

---

## 4. MuPDF.js 1.28.1 Source

**Corrected on 2026-10-01 by the main thread (the subagent's original answer here was wrong).** `mupdf@1.28.1` is built from `platform/wasm` in the main MuPDF repository at tag `1.28.1` (https://github.com/ArtifexSoftware/mupdf/tree/1.28.1/platform/wasm), whose `package.json` matches the installed one field for field. `ArtifexSoftware/mupdf.js` is a separate older wrapper whose tags stop at `v1.3.6` (https://github.com/ArtifexSoftware/mupdf.js/tags). It is not the source of 1.28.1. The complete source with every submodule is Artifex's archive https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz (SHA-256 `dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3`). What the wasm really contains was measured from the binary, not inferred: see spec 0009, `rationale.md`, *Evidence*. In short, FreeType, HarfBuzz, jbig2dec, libjpeg, OpenJPEG, zlib, lcms2mt, Gumbo, cmark-gfm, ucdn, the URW base 14 fonts, musl, the Emscripten runtime and compiler-rt; not mujs, brotli, extract, Tesseract, Leptonica, ZXing, zint or curl.

**Confirmation:** CONFIRMED by fetching the pages above and inspecting the shipped wasm and the archive.

---

## 5. Gitleaks

**Finding:** Current version (as of 2026-10-01): **8.30.1**. The current command to scan a repository's full git history is `gitleaks git .` (or with verbosity: `gitleaks git -v .`). The older `gitleaks detect` command is deprecated. GitHub secret scanning for **public repositories** owned by personal accounts is free and enabled by default. Push protection (blocking commits with detected secrets) is also enabled by default.

**Confirmation:** CONFIRMED - https://github.com/gitleaks/gitleaks (latest releases show 8.30.1; documentation shows `gitleaks git` as the current command for scanning git history)

---

## 6. GitHub Rulesets for Personal Accounts

**Corrected on 2026-10-01 by the main thread (the subagent's original answer here was wrong).** Only rulesets for every repository in an organisation need GitHub Team or Enterprise. A personal account's public repository can create repository rulesets, including tag rulesets ("New tag ruleset") and branch rulesets that block force pushes and deletion.

**Confirmation:** CONFIRMED - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

---

## Summary Table

| Item | Confirmed/Inferred | Key Detail | URL |
|------|-------------------|-----------|-----|
| Vercel → GitHub Deployments | CONFIRMED | Uses Deployments API, sends `deployment_status` events, creator is typically `vercel[bot]` | https://vercel.com/docs/git/vercel-for-github |
| Vercel Env Vars | CONFIRMED | All five vars available at build+runtime with "Enable System Env Vars" setting | https://vercel.com/docs/environment-variables/system-environment-variables |
| GitHub deployment_status | CONFIRMED | Workflow file from default branch, GITHUB_SHA = commit to deploy, can create tags with GITHUB_TOKEN | https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows |
| MuPDF.js 1.28.1 | CONFIRMED (corrected) | built from ArtifexSoftware/mupdf tag 1.28.1, `platform/wasm`; complete source in Artifex's archive; contents measured in spec 0009 | https://github.com/ArtifexSoftware/mupdf/tree/1.28.1/platform/wasm |
| gitleaks | CONFIRMED | v8.30.1, command `gitleaks git .`, GitHub secret scanning free+default for public personal repos | https://github.com/gitleaks/gitleaks |
| GitHub Rulesets | CONFIRMED (corrected) | repository rulesets, tag rulesets included, work on a personal public repository; only organisation wide rulesets need Team or Enterprise | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository |
