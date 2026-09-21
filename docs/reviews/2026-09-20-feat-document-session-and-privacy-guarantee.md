# Review, feat/document-session-and-privacy-guarantee, 2026-09-20

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 28 files, branch vs `main` (merge base `b37dda6`)
**Verdict**: Approve with nits

## Summary

This lands spec 0002's session model: a worker-side session registry keyed by `jobId`, a pure frozen-and-replaced reducer on the main thread (`src/lib/session.ts`), a fail-closed entitlement fetch, a download helper with correct revoke ordering, and an ESLint zone that bans every browser storage API across `src/**`. The privacy invariants (INV-1 through INV-9) are upheld everywhere I traced them: bytes are transferred not copied, geometry never leaves the worker's private `TargetMap`, error payloads carry only a closed-set kind, and the `redact` handler honestly refuses every request with `unsupported` rather than fabricate output feature 5 hasn't built yet. Test coverage is excellent — the reducer is tested exhaustively including every transition that must *not* exist, and there's a real `expectTypeOf` gate on `LoggablePayload` with its own canary. The one real bug found is a performance regression, not a privacy one: `tool-client.tsx` unconditionally tears down the engine worker on every file choice, including the very first one, which defeats the pre-warm optimisation spec 0001 designed around and doubles the WASM load cost on the product's one meaningful user action.

## Major

### 🟠 `handleFile` discards the pre-warmed worker on every file choice, including the first, `src/app/tool/tool-client.tsx:178`

**Problem**: `handleFile` calls `releaseEngine()` unconditionally before opening a document, regardless of whether a session already exists:

```ts
const handleFile = useCallback(async (file: File) => {
  if (hasUnsavedWork(sessionRef.current) && !window.confirm(REPLACE_WARNING)) {
    return;
  }
  // Choosing a file is a release trigger. The previous worker, and
  // everything it held, goes before the next document arrives.
  releaseEngine();
  ...
  await runOpen({ jobId, file, entitlement });
```

`releaseEngine()` calls `worker?.terminate(); worker = null;` (`src/worker/client.ts:292-298`). `warm()` (fired on `pointerenter`/`focus`/`dragover`, `src/app/tool/tool-client.tsx:116-119`) has, by design, already started a `Worker` and its WASM fetch/instantiation by the time a file is dropped. That live, possibly-still-loading worker is terminated here even when the prior session state is `idle` — i.e. on the very first file a visitor ever opens in the tab. `runOpen` → `openSession` → `getWorker()` then finds `worker === null` and constructs a brand new `Worker`, which starts the multi-megabyte engine fetch and WebAssembly instantiation completely from scratch (`src/engine/index.ts:68-83`, module-scoped `enginePromise` is per-worker-instance).

This also bypasses the session-eviction mechanism spec 0002 built specifically to avoid this cost: `engine.worker.ts`'s `handleOpen` already evicts any prior session in-place inside the *same* worker (`for (const existing of sessions.keys()) endSession(existing);`, `src/worker/engine.worker.ts:126`) precisely so replacing a document doesn't require re-instantiating the engine. The spec's own state diagram only routes `any state → release → idle` for the "new file / start over / pagehide" triggers when replacing an existing live session; the direct `idle → file chosen → opening` edge was not meant to imply a release.

**Why it matters**: Spec 0001 justifies the pre-warm pattern explicitly: "starting it on intent usually finishes it before a file has been chosen" and "[a] multi megabyte engine download before the first redaction, mitigated by fetching on intent but never eliminated." This code makes that mitigation a no-op for every single visit — the warm fetch is always thrown away and repeated, so every document open pays full engine-load latency (the e2e suite budgets 60s for exactly this cost, `tests/e2e/privacy.spec.ts:27`) instead of "usually paying nothing." It is not a privacy or correctness bug — the tool still works — but it is a real, easily-observed performance regression on the product's one primary action, and it silently defeats a documented architecture decision.

**Suggested fix**: Only call `releaseEngine()` in `handleFile` when replacing a *live* session (i.e. when `sessionRef.current.state !== "idle"`), or better, drop the explicit release entirely and let a fresh `open` message flow through the already-warmed worker — `engine.worker.ts`'s own eviction logic will retire the previous session (if any) without tearing down the WASM instance. Reserve `releaseEngine()` for the genuine release triggers: `handleStartOver` and `pagehide`, which already call it correctly.

## Minor

### 🟡 `tool-client.tsx`'s new branching logic has no unit test coverage, `src/app/tool/tool-client.tsx` (whole file)
This is the largest behavioural diff in the change (380 lines) and introduces real branching logic — the `hasUnsavedWork` confirm-to-replace gate, the retry path, the `beforeunload`/`pagehide`/`pageshow` effects, the `checkingEntitlement` window — none of which has a dedicated Vitest test (no `tool-client.test.tsx` was added). Coverage exists only via `tests/e2e/privacy.spec.ts`, which exercises a single happy path (drop → open), and several of the AC-1/AC-9/AC-13 scenarios in `docs/specs/0002-document-session-privacy-guarantee/verify.md` are still unchecked (`[ ]` for the replace-confirm and both `beforeunload` scenarios). The reducer this component drives is exhaustively tested, but the orchestration glue that calls it — including the bug above — is not, which is exactly the kind of gap that let the `releaseEngine()` regression through unnoticed. Since `TESTS = configured`, this is worth flagging; the project's own `AGENTS.md` splits logic to Vitest and browser-only behaviour to Playwright, and this component is browser-only enough that the fix is probably more Playwright scenarios (the unchecked verify.md boxes) rather than a component test harness.

## Nits

- ⚪ `eslint.config.mjs:105`, `STORAGE_GLOBALS` bans the bare identifier `caches` anywhere under `src/**` (`Identifier[name="caches"]`), which will false-positive on any future local variable or parameter legitimately named `caches` (e.g. a cache map unrelated to the Cache API). Acknowledged in the module's own comment as a known blunt edge ("bans the spellings we thought of"), so this is a heads-up rather than a request to change it.
- ⚪ `tests/unit/loggable.test.ts:64-75`, the `it.each([...4 labels])("holds for %s on its own", () => {...})` block ignores its parameter and runs the identical five `expectTypeOf` assertions four times regardless of which label is active. Harmless (the gate still holds) but the labels imply per-type isolation that isn't actually happening; either drop the `.each` or key the body off the label.
- ⚪ `src/lib/session.ts:224`, `redact-started` resets `outcome: null` even though it is already always `null` on every path that reaches `reviewing` (freshly opened, or reset by `tick-toggled`). Harmless belt-and-suspenders, not a bug.

## Strengths

- The reducer (`src/lib/session.ts`) and its test suite (`tests/unit/session.test.ts`) are a standout: every valid transition and, deliberately, every invalid one (`actions that do not belong in a state`, asserted by reference identity) is covered, plus frozen-and-replaced semantics and the `hasUnsavedWork` predicate in isolation.
- `tests/unit/loggable.test.ts` turns INV-4 into a real compile-time gate over `LoggablePayload` with a "would this even catch a bug" canary — a genuinely good pattern, not just a comment promising discipline.
- The worker's honest scaffolding: `handleRedact` in `src/worker/engine.worker.ts` unconditionally answers `unsupported` rather than fabricating output, and `tests/unit/engine-worker.test.ts` asserts this directly ("never hands back a file it has not actually redacted") — exactly the right call for feature 5 not being built yet.
- `src/lib/entitlement.ts`'s fail-closed matrix is exhaustively tested (`tests/unit/entitlement.test.ts`), including float/zero/negative/unknown-tier caps, and `tests/unit/entitlement-route.test.ts` closes the gap by testing the server side of the same contract, catching the class of bug where the two sides silently drift.
- `eslint.config.mjs`'s storage zone is honest about its own limits in its comments, and `tests/unit/engine-wall.test.ts` proves the selectors actually match rather than silently matching nothing (the same discipline already used for the engine-wall selectors).

## Test coverage

Excellent for the modules with the highest privacy stakes: the reducer, the protocol's closed sets, the worker's session registry and error-boundary behaviour, the entitlement fail-closed logic (both client and route), the download revoke ordering, and the `LoggablePayload` type gate are all covered thoroughly, including edge cases and negative assertions. `pnpm test` (357 tests / 12 files), `pnpm lint` and `pnpm typecheck` all pass clean as stated. The gap is `src/app/tool/tool-client.tsx`: its state-orchestration logic (release timing, retry, leave/restore handling) is exercised only by one e2e happy path, and several manual verify.md scenarios that would have caught the Major finding above are still unchecked.
