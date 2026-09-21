# 0002. Document session and privacy guarantee: rationale

The decision record for [index.md](index.md). Reasoning, the options weighed and the evidence behind them. A build does not need this file.

## Context

> ⚠️ Premise note: the topic reads as two things, a session shape and a privacy guarantee, but they are one decision and splitting them would be a mistake. The session's shape **is** the privacy mechanism: where the bytes live, what crosses the boundary and what ends a job are the same facts as "nothing is stored and nothing is sent". A spec that decided the data structure first and bolted rules on afterwards would produce rules that describe the structure rather than constrain it. Kept as one decision.
>
> A second, sharper problem. Spec 0001 asserts that "the main thread otherwise sees counts, match metadata and coordinate quads only", and feature 6 requires every match to be shown "with enough surrounding context to judge it". Both cannot hold. Left as it stands, a future engineer either breaks the invariant quietly, which is how a guarantee rots, or honours it and ships a checklist nobody can use. The invariant was aimed at the wrong target: what carries the guarantee is that nothing document derived is stored or sent, not which thread a string sits on. The main thread and the worker are the same machine, the same tab and the same origin. This spec replaces that wording with INV-1 and INV-2, which are both true, both enforceable, and in the case of quads stricter than 0001 assumed.

RedactNest's entire proposition is that a document never leaves the visitor's machine. Spec 0001 made that structurally possible: processing happens in the browser, the engine sits behind a Web Worker, and the tool route's content security policy stops the page reaching any third party origin. What 0001 deliberately did not settle is what happens in the gap between opening a document and downloading a redacted one. It said as much: "Feature 3 writes the full in memory session rules; this spec fixes the boundary that makes them possible rather than aspirational."

That gap is not small. The current code holds a document for the duration of one function call and destroys it before returning, which is safe and cannot support the product. The redact flow in feature 8 requires the document to stay open while somebody reads a checklist and ticks boxes, which may be several minutes. A job therefore has to exist as a thing with a lifetime, state and an owner, and every one of those choices is a place the guarantee can be lost. Two tabs, a browser restoring a page from its back forward cache, a worker killed under memory pressure, a half finished download: each is an ordinary web application concern that here becomes a question about whether a copy of somebody's document survives.

The forces in play are specific. Browser memory is a hard ceiling and MuPDF's WebAssembly heap grows to fit the largest document it has seen and never shrinks, so holding a session is not free and releasing one is not automatic. Compliance scope is GDPR, inherited from 0001, and the useful position is that RedactNest is not a processor of document content at all, which only stays true if no path writes or transmits that content. The repository will be public under AGPL, so the code is the evidence and anything that contradicts the marketing copy is visible to anyone who looks. And the real risk is not today's code, which is careful, but features 10, 11 and 15, each of which brings a reason to reach for a browser store or an error reporter out of ordinary habit.

The consequence of not deciding is the worst of the options: each later feature invents its own answer, the answers disagree, and the product's one differentiating claim becomes something nobody can state precisely enough to defend.

## Options considered

### Option 1: Stateful worker session, main thread review model

The worker holds the bytes and the open MuPDF document for the session's life, keyed by job id, plus a private map from match id to the geometry needed to redact. The main thread holds a reducer with the checklist, the tick set, a frozen entitlement snapshot and a `File` handle. A session ends either by terminating the worker (a release) or, when a second document arrives, in place inside the live worker so the loaded engine survives.

**Pros**:
- Document content stays in one place, and the one place is the thread with no access to the page.
- Ticking a box is instant, because review state is already where the interface is.
- Terminating the worker is the only mechanism that actually returns the WebAssembly heap, and it works even when the worker is wedged.
- Keeping geometry inside the worker means a wrong or stale quad on the main thread cannot cause a wrong removal, because there are none.

**Cons**:
- Two owners of session state means they can disagree, and the disagreement shows up as a redaction against a document that has moved on.
- The worker holds a document across user think time, so an abandoned tab holds memory indefinitely.
- Match text and context windows do cross to the main thread, which is a real loosening of 0001's wording and has to be stated rather than glossed.

### Option 2: Stateless worker, bytes shuttled per call

Keep the current shape. Each operation transfers the bytes in, does its work, and transfers whatever survives back out. No session exists in the worker at all.

**Pros**:
- Nothing is held anywhere between calls, which is the simplest possible sentence for a privacy policy.
- No session registry, no teardown path, no orphaned job ids.

**Cons**:
- The bytes have to live somewhere between calls, and the only somewhere left is the main thread. That directly breaks spec 0001's invariant that document bytes live only inside the worker, which is the invariant the whole architecture rests on.
- Every step reparses the document. On a 50 page file that is seconds of work repeated for each operation.
- Transferring an `ArrayBuffer` back and forth repeatedly multiplies the chance that one path copies instead of transferring, and a copy is exactly the failure this design exists to prevent.

### Option 3: Worker owns everything, main thread is a pure projection

The worker holds the document, the matches, the tick state and the entitlement. The main thread sends events and renders whatever the worker echoes back.

**Pros**:
- One source of truth, so the two halves cannot disagree.
- The main thread holds the least it possibly could, which is the purest reading of the guarantee.

**Cons**:
- Every tick becomes a message round trip, so a checklist of sixty matches means sixty round trips to render state the browser could have held locally.
- The interface cannot render optimistically without keeping a local mirror, at which point the two sources of truth are back, just undeclared.
- Worker state is much harder to test than a pure reducer, on the feature where exhaustive testing is most worth having.

### Option 4: Main thread owns the document, worker is a pure function

The main thread holds the bytes and calls the worker for engine work, passing what it needs each time.

**Pros**:
- The simplest mental model, and the one most web applications actually use.
- No session lifetime to manage, no orphaned worker state.

**Cons**:
- Puts document bytes on the thread that has network access, the DOM and every third party surface, which is the arrangement spec 0001 chose the worker specifically to avoid.
- Makes the content security policy the only thing standing between a document and a network request, rather than one of several layers.
- Would have to be undone before feature 14, which needs the engine to hold rendering state anyway.

### A second axis, walked separately

The four options above debate **who owns session state**. They do not debate **what format the review payload takes**, which is a distinct axis and the one that actually decides how much document content reaches the main thread. It was walked separately during the design conversation, and the choices were: the matched string plus a short text window (chosen), the matched string alone with no surrounding words, a rendered image crop of the region instead of any text, and nothing at all until a match is expanded.

The image crop deserves naming here because it looks like the privacy conscious answer and is not. A rendered picture of the line is more document content than a text snippet, not less, and it costs render time and a far heavier payload. What it genuinely buys is that the content is no longer machine readable text sitting in the main thread's JavaScript heap, which narrows what a browser extension or a future cross site scripting bug could scrape. That is a real benefit and it was weighed against an unusable, unsearchable, unscannable checklist and a slower first render. The text window won. If feature 16 later finds that the machine readable text on the main thread is the objection buyers actually raise, this is the decision to revisit, and the axis is recorded here so that revisit starts from the real tradeoff rather than from scratch.

## Rationale

Option 1 is chosen because it is the only arrangement that satisfies the load bearing force from Context, that document bytes live in exactly one place and that place is not the thread with network access, while still supporting a review step that takes minutes. Option 2 fails it outright: making the worker stateless does not remove the bytes, it relocates them to the main thread, which is the opposite of what 0001 decided and what the tool route's policy is built around. Option 4 fails it more directly still. Option 3 satisfies it but pays for purity with a round trip per tick and with worker held state that cannot be exhaustively tested, and the purity it buys is largely illusory once the main thread keeps a mirror to render from.

Terminating the worker at session end, rather than releasing the job and keeping the worker warm, follows from a memory fact rather than a preference. MuPDF's WebAssembly heap grows to fit the largest document it has parsed and never returns that memory to the operating system, so `destroy()` frees space inside the heap and nothing beyond it. On a product whose hard ceiling is browser memory, and whose next action after finishing one document is often opening another, keeping the worker means carrying the high water mark of the largest file for the tab's whole life. Terminating costs WebAssembly instantiation on the next file, which is measured in hundreds of milliseconds and happens while somebody is dragging a file in. It also has the property that matters most here: it makes "it is gone" literally rather than approximately true, which is the difference between a claim feature 16 can make and one it has to hedge.

Retaining the `File` handle is the one place this spec deliberately keeps something on the main thread that a stricter reading would drop. It is worth it because transferring an `ArrayBuffer` neuters the sender's copy, which means a worker killed under memory pressure takes the only copy of the bytes with it. Without the handle, a crash on a large document means asking somebody to find and choose that document again, which is the moment they decide the tool is unreliable. The handle is a pointer to a file already sitting on their disk, so it stores nothing new and costs almost no memory. It does grant the page the ability to re-read that file until the session ends, and that is stated in the Security model rather than left to be discovered, because a guarantee that turns out to have unstated fine print is worse than one that never claimed as much.

On enforcement: a written rule would not survive features 10, 11 and 15, each of which arrives with an ordinary reason to reach for a browser store. The lint zone lands the error in the editor as you type, which is where a habit gets interrupted, and it can be written in exactly the style the engine wall already uses in `eslint.config.mjs`, so it reads as the same idea applied to a second boundary rather than a new mechanism to learn. It is honestly incomplete, since it only bans the spellings we thought of, which is why it is paired with a browser test that runs a real redaction and then inspects the real stores. A runtime seal was considered and rejected on a concrete fact rather than on taste: the App Router uses `sessionStorage` itself for scroll restoration, so a blanket seal would break the framework and the carve outs needed to fix it would reopen the hole it was meant to close.

The typed payload rule is the same move applied to logging. A scrubber is a blocklist, and a blocklist is something you discover holes in after it ships. Making the payload types carry enumerated kinds and numbers with no string field at all means there is nowhere to put a file name, so the mistake cannot be made rather than being caught. The pattern already exists in the codebase: `ErrorMessage` carries `errorKind` and deliberately nothing else, and it works.

## Findings from the current code

Read while writing this spec, worth recording because two of them change what the build has to do.

**The free page cap is not enforced.** `src/worker/client.ts` sends `maxPages: config.maxPages`, which defaults to 50, while `src/app/tool/tool-client.tsx` tells the visitor "Up to 3 pages for now" from `config.freePageCap`. An anonymous visitor today can open a 50 page document. The entitlement snapshot decided here closes it, because the cap sent to the worker becomes the snapshot's `pageCap` rather than the paid ceiling, but it is a live gap until build plan task 8 lands and it is worth knowing that the tool is currently more permissive than it says.

**The document is destroyed before the call returns.** `inspectDocument` in `src/engine/index.ts` calls `doc.destroy()` in a `finally`, which is correct for a one shot inspection and incompatible with a session. Moving that call onto release is the single most invasive change in the build plan, and it is the one place a mistake leaks a document rather than breaking a feature.

**The worker is already a module singleton.** `src/worker/client.ts` holds `let worker: Worker | null` and a `pending` map, and it already has a `releaseEngine()` that terminates. The session work extends that shape rather than replacing it, and the existing `error` event handler that fails every pending job with `engine-unavailable` is already most of the `lost` state's trigger.

**The engine wall is the pattern to copy.** `eslint.config.mjs` enforces spec 0001's boundary with zoned `no-restricted-imports` and `no-restricted-syntax`, including selectors for the forms the import rule cannot see, and `tests/unit/engine-wall.test.ts` feeds spellings through the config to prove the selectors actually match. A dead selector fails silently, and that test exists because one did. The storage zone should be written the same way and proved the same way.

**`ProgressPhase` already has the right shape** for the three new values. `loading-engine`, `opening` and `inspecting` exist; `detecting`, `redacting` and `writing` slot in beside them without touching anything else.
