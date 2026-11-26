# Review, feat/ui-redesign, 2026-11-26

**Reviewed by**: Sonnet 5.5 (author on Opus 5.5)
**Scope**: 190 files, branch vs main (merge base 1efec30)
**Verdict**: Approve with nits

## Summary
The branch restyles every page to the new mockups, adds the signed in header, the page preview drawn by the worker, and the step progress. I read the privacy and security sensitive parts in full (the entitlement email path, the worker draw path and its client, the engine draw and geometry code, the account slot, the lint zones, the config cap) and sampled the preview code. I found no blocker and no major. The two verify failures are fixed and the fixes hold. The findings below are small. This was a targeted read, not a line by line pass over every UI file.

## Minor
### 🟡 The worker trusts the size a draw asks for, `src/worker/engine.worker.ts:drawFields`
**Problem**: `drawFields` checks that `maxPixels` is a positive integer but gives it no ceiling, and `width` is only held to `CANVAS_SIDE_MAX`. A request can ask for a picture of up to 16384 by 16384 pixels (about 1 GB of RGBA) from the engine.
**Why it matters**: Today only our own page sends the ask and it clamps to `config.previewMaxPixels`, so it is not reachable by a visitor. But the config ceiling (16,777,216) exists to bound memory, and the worker does not enforce it, so a future caller or a bug in the preview could exhaust the worker's memory.
**Suggested fix**: Give the worker its own pixel ceiling as an engine rule (like `CANVAS_SIDE_MAX`), clamp or refuse an ask above it, and add a test beside `preview-engine.test.ts`.

### 🟡 Store is emptied after every draw, `src/engine/draw.ts:drawPageWith`
**Problem**: `mupdf.emptyStore()` runs in `finally` on every draw, including every thumbnail. That drops decoded fonts and images that the next draw of the same document will decode again.
**Why it matters**: A long document scrolled in the rail re-decodes shared fonts for each thumbnail. The comment explains the memory reason, which is sound, but the cost is not weighed in the file.
**Suggested fix**: Empty the store every N draws or when the heap grows past a mark, or note in the comment that `preview-speed.spec.ts` measured the cost and found it acceptable.

## Nits
- ⚪ `eslint.config.mjs`, `pnpm lint` exits 1 on a clean tree here because `.playwright-mcp/verify-0026/walk-tool.mjs:551` (git ignored scratch, not in CI) has a `no-this-alias` error. Adding `.playwright-mcp/**` to `globalIgnores` would make local runs match CI.
- ⚪ `src/app/tool/preview-rules.ts:PREVIEW_SIDE_MAX`, repeats `CANVAS_SIDE_MAX` because the wall forbids the import. It is held equal by `tests/unit/preview-rules.test.ts`, so this is fine, but a one line pointer to that test in the comment on `CANVAS_SIDE_MAX` would help the next editor.
- ⚪ `src/engine/geometry.ts`, imports `PageRect` from `@/worker/protocol`. It is type only and lint passes, but it is the engine reaching toward the worker. Worth a comment saying it is deliberate.
- ⚪ `src/app/tool/tool-client.tsx`, the verify notes say a grid comment still reads "A beside B while nothing is open". I did not find it again in a quick search, so confirm it was fixed.

## Strengths
- The email path is tight: `accountEmail` is shared by server and page, the address rides beside the snapshot and never inside it, the route sends `private, no-store`, and the account slot's lint zone bans every telemetry import.
- The worker draw path never carries text: a draw reply holds a bitmap and fractional rects keyed by `MatchId`, canvas export calls are banned by lint in every zone, and the client closes any picture it drops.
- No console, storage, `next/link` into the tool or account pages, arbitrary colours, `cursor-` classes or `any` showed up in the added lines. Draw settling (replacement, lost worker, release) always resolves with no picture rather than failing.
- Spec records are honest about as built behaviour, and the two verify fixes (41e5bdd, 098af0d) match the code.

## Test coverage
Coverage is broad and aimed at the risky parts: unit tests for the engine draw, worker draw, worker client settling, preview rules, tool layout, entitlement email handling, session claims, progress and protocol; component tests for the account slot, menu, sign out, page preview, tool preview and primitives; and Playwright specs for the account slot, network list (every request matched to a row, no body over 0 bytes), preview, preview speed and the privacy spec. The one gap is the worker having no test that refuses an oversized `maxPixels` (see the first minor). Known flakes (the account slot shift in the full parallel run, the stopwatch Vitest files) pass alone and are recorded in `verify.md`.
