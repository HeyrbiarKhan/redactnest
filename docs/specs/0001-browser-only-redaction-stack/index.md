# 0001. Browser only redaction stack

**Date**: 2026-09-19
**Status**: Proposed

## Summary

RedactNest runs entirely in the visitor's browser. The PDF never leaves their machine, so "never stored" is structurally true rather than a promise anyone has to believe. The engine is MuPDF compiled to WebAssembly (code compiled to run at near native speed in a browser), which is the only browser capable library that genuinely removes text from a PDF rather than covering it. MuPDF is copyleft, so RedactNest itself is licensed AGPL 3.0 and its source is published at launch. The application is one Next.js 16 app in TypeScript on Vercel, with the engine walled off in a Web Worker and the tool page locked down so the browser itself refuses to let it send a document to anyone else.

## Decision

**Chosen option**: Option 1: Browser only, MuPDF WASM under AGPL, published open source.

Redaction runs client side in a Web Worker using MuPDF.js under AGPL 3.0, inside a single Next.js 16 application on Vercel whose own source is licensed AGPL 3.0 and published at launch.

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Processing boundary | The visitor's browser, inside a single dedicated Web Worker | The only arrangement where the privacy claim is verifiable by the customer rather than promised by the vendor |
| PDF engine | MuPDF.js (WebAssembly), AGPL 3.0 | The only browser capable library with a real redaction implementation; also removes image data under a region, which is feature 14 largely solved |
| Reading, rendering, text positions | MuPDF, the same engine | One parser for one document. A second parser would mean two libraries disagreeing about page geometry in the exact place correctness matters |
| Engine delivery | Self hosted from `public/`, fetched on first interaction with the drop area | Keeps the landing page light for feature 15, keeps the content security policy tight, and is usually finished before a file is chosen |
| Language | TypeScript, strict mode | Byte buffers, page indexes, coordinate quads and match offsets all cross module boundaries here, and a wrong type produces a file that looks redacted and is not |
| Framework | Next.js 16, App Router | Serves static marketing pages with the metadata and sitemap feature 15 needs and a client heavy tool route from one codebase, on the chosen host |
| Worker instantiation | A module worker, `new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })` | The pattern current bundlers understand. Turbopack support is a scaffold gate, see below |
| Tool route rendering | Prerendered static, entitlement fetched after load | The page that touches a customer's file has no server in its request path at all, which is a claim feature 16 can make and a customer can check |
| Response headers | Two regimes. Strict policy on the tool route, standard policy elsewhere. No cross origin isolation by default | Makes "your file never leaves your machine" enforced by the browser on the route that matters, without crippling features 10 and 11 everywhere else |
| Styling | Tailwind CSS with design tokens | Fastest route to the thin primitive set feature 4 needs, with a real place for its colour, spacing and type tokens |
| Primary database | None | Processing is local and feature 10 commits to no user table of your own. There is nothing to persist |
| File storage | None | Documents exist only in worker memory for the life of one tab |
| Auth | Deferred to feature 10, but the entitlement path is decided here | The tool route may load no third party auth script, so the pattern has to be settled now rather than discovered by feature 10 |
| Observability | Deferred to feature 11 | Constrained here to counts only, and to routing any third party call through the application's own origin or keeping it off the tool route |
| Hosting | Vercel | Chosen by the engineer, and the lowest friction path for Next.js server rendering, previews and per route headers |
| Configuration | Build time environment variables through one typed config module validated at module load | A missing or malformed cap fails `next build` rather than silently becoming undefined and removing the cap |
| Package manager | pnpm, Node version pinned in the repository | Strict by default, so an undeclared transitive dependency cannot be imported by accident on a product where an unnoticed dependency could be the thing that phones home |
| Testing | Vitest for logic, plus Playwright browser tests for the engine and the headers | Only a real browser can prove the engine loads in a worker, opens a file, and does it with the policy enforced |
| Repository structure | One application, the engine a walled internal module only the worker may import | Keeps the engine clean and extractable without paying for workspace tooling before anything has shipped |
| Licence | AGPL 3.0 for the whole application, source published at launch, tagged per deploy | Required once MuPDF is shipped to a browser, and the offer must resolve to the exact deployed version |
| Support target | Last two major versions of Chrome, Edge, Firefox and Safari on desktop. Mobile works where it works, and is not promised | iOS Safari enforces per tab memory limits that will kill a tab holding a document, and desktop is where this work actually happens |

### Content security policy

The policy is the enforcement point for the product's central claim, not a hardening extra. Two regimes, split by route.

**Tool route** (the page that holds a document):

```
default-src 'none';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
worker-src 'self';
connect-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self'
```

**Every other route**: the same shape, with the auth and analytics origins features 10 and 11 need added to `script-src` and `connect-src`.

Notes that matter when implementing this:

- **`'unsafe-inline'` in `script-src` is deliberate on the tool route.** The App Router injects inline hydration scripts, and the nonce alternative requires dynamic rendering, which is exactly what the prerendered static tool route rules out. Hashes are impractical because the injected payload changes per build and per page. The privacy guarantee rests on `connect-src` and the other fetch directives, which stay strict, not on `script-src`.
- **Do not mix `'unsafe-inline'` with a nonce or a hash.** A browser that sees a nonce ignores `'unsafe-inline'` entirely, which would break hydration.
- **`'wasm-unsafe-eval'` is required**, including on engines where streaming instantiation would otherwise seem to avoid it.
- **`worker-src`, not `script-src`, governs worker creation** under a strict policy. Omitting it breaks the worker with a confusing error.
- **Be honest about what `connect-src 'self'` buys.** It stops anything on the tool route reaching a third party origin, which is the exfiltration path that matters. It does not stop a same origin request, so the guarantee is "no third party ever receives your document", enforced by the browser, and "we operate no endpoint that accepts one", enforced by you.

### Worker boundary contract

The scaffold has to exercise a real protocol, so the minimal envelope is fixed here. Features 3 and 5 extend it; they do not redesign it.

- **Every message carries `id` and `kind`.** The `id` correlates a response to its request.
- **Main thread to worker**: `open`, `cancel`.
- **Worker to main thread**: `result`, `progress`, `error`.
- **The worker never throws across the boundary.** Every failure returns an `error` message carrying one of a closed set of kinds: `engine-unavailable`, `encrypted`, `password-required`, `corrupt`, `unsupported`, `too-large`, `too-many-pages`.
- **Error payloads carry a kind and nothing derived from the document.** No file name, no stack trace, no extracted text. This is what makes feature 11's scrubbing requirement achievable rather than aspirational.
- **This spec fixes the contract. Feature 8 owns what the user is told for each kind.**

**Key invariants** (rules that must always hold):

- Document bytes never reach a network socket. The tool route's `connect-src` names the application's own origin and nothing else, and no code on that route posts document content anywhere.
- Document bytes live only inside the Web Worker. The file is handed over by transferring its `ArrayBuffer`, which neuters the main thread's copy rather than duplicating it, so the main thread never holds document content. The redacted output transfers back the same way, and the worker drops its reference once the transfer completes. The main thread otherwise sees counts, match metadata and coordinate quads only.
- The engine is served from the application's own origin, never a public content delivery network, and the `.wasm` asset is served with `Content-Type: application/wasm`. A wrong media type silently degrades streaming instantiation or fails outright depending on the loader.
- No third party script loads on the tool route. Not auth, not analytics, not error reporting.
- One PDF parser only. Nothing else in the codebase parses or renders a PDF.
- Only the worker may import the engine module. Written down now, enforced by lint in feature 2.
- Every cap comes from the typed config module. No page or size limit is written as a literal anywhere else in the codebase.
- AGPL notices, the licence file and a source offer resolving to the exact deployed version ship with the product, not after it.

**Entitlement without a third party script** (decided here so feature 10 inherits a decision rather than a gap):

- **Authentication lives on ordinary routes.** Sign in, sign up and account management sit on routes with the standard policy, where an auth provider's client script may load normally.
- **The tool route loads no auth script at all.** It calls one same origin endpoint, `GET /api/entitlement`, with same origin credentials. That endpoint reads the session cookie server side and returns a small JSON payload: the tier and the caps that apply.
- **That endpoint accepts no document data and returns none.** It is the only thing `connect-src 'self'` needs to permit on that route.
- **Failure is closed, never open.** An absent, invalid or expired session returns the free tier. A failed fetch also falls back to the free tier. Nothing about a slow or broken network may hand someone the paid caps.
- **Session expiry is handled by refetching**, on window focus and again before starting a job that would exceed the free cap.
- **A running job finishes on the entitlement it started with.** The document is already in memory and the person already had the right when they began; the next job gets whatever the current entitlement says.
- **This pattern is provider agnostic.** Any auth provider with a server readable session satisfies it, so feature 10 keeps a free choice.

**Security model**:

- **Compliance scope is GDPR.** Under this architecture RedactNest is not a processor of document content on the redaction path, because that content never reaches its infrastructure. Features 9 and 17 should describe that reality rather than the usual processor language.
- **No authentication in this feature.** Feature 10 owns it, constrained by the entitlement pattern above.
- **The content security policy is the enforcement point.** Any later feature needing a third party call either proxies through the application's own origin or lives off the tool route. Features 10 and 11 inherit this.
- **The worker boundary is the containment point.** Feature 3 writes the full in memory session rules; this spec fixes the boundary that makes them possible rather than aspirational.
- **Audit logging, stated plainly rather than omitted.** There is deliberately no audit trail of document content, because an audit trail of what someone redacted would recreate the exposure the product exists to remove. Logging is counts only, per feature 11. Audit logging does apply to the billing and authentication surfaces, and feature 10 owns that. This is a conscious position, not a gap.

**Configuration required**:

- `NEXT_PUBLIC_FREE_PAGE_CAP`: pages an anonymous visitor may redact. Default `3`.
- `NEXT_PUBLIC_MAX_PAGES`: the paid ceiling. Default `50`, raised only after the real browser limit has been measured.
- `NEXT_PUBLIC_MAX_FILE_BYTES`: the paid size ceiling. Default `26214400` (25 MB).
- `NEXT_PUBLIC_SITE_URL`: canonical origin, for the metadata and sitemap work in feature 15. Defaults to `http://localhost:3000` in development, required in production.
- `NEXT_PUBLIC_SOURCE_URL`: the AGPL source offer link shown in the footer and on the tool page. Points at the **tag or commit for this deploy**, not the repository root, because section 13 requires source corresponding to the exact deployed version. Optional in development, required in production.

All are read through one typed config module that parses and validates them at module load, imported early enough that `next build` fails rather than shipping a bad value. Numeric values are parsed strictly and range checked, including that the free cap does not exceed the paid ceiling. A present but malformed value fails the build exactly as a missing one does; neither may become `NaN` or `undefined` at runtime. Changing a ceiling needs a redeploy but no code change, which is the relaxed form of the engineer's original "without a rebuild" requirement, accepted knowingly.

**What the scaffold must demonstrate** (this feature's done when, in checkable form):

- The application boots locally and the production build passes.
- A Playwright test drives a real browser, loads the engine inside the worker, opens a PDF and reads its page count. Running in Node does not count, because that is not where the engine lives.
- **The tool page hydrates and works with the policy enforced**, not in report only mode. This is the gate that catches the App Router inline script problem rather than discovering it in production.
- The response headers on the tool route are asserted, including the full directive set above.
- The `.wasm` asset is asserted to arrive with `Content-Type: application/wasm`. Vercel's static handler is expected to set it, and this checks that rather than assuming it.
- **Gate: does Turbopack bundle the module worker and the WASM asset?** Next.js 16 defaults to Turbopack and MuPDF's documentation assumes webpack or Vite. Settle it by observation. If it does not work, drop that build to webpack mode and record it, rather than fighting the bundler.
- **Gate: does MuPDF's browser build need cross origin isolation?** Settle by observation. If it does, revisit the header posture and check what it costs features 10 and 11 before building on top.
- Feature detection for WebAssembly, Web Workers and the File API runs at load, and an unsupported browser gets a plain explanation instead of a drop area. Corporate policy disabling WebAssembly is a real case, not a theoretical one.

## Consequences

**Positive**:

- The core product claim becomes structurally true and independently verifiable, which is the differentiator the whole scope rests on.
- Features 9, 16 and 17 get much easier and much more honest, because there is no document processing on RedactNest infrastructure to describe.
- Compute cost stays flat as usage grows, since the visitor's machine does the work. You pay for static assets.
- Feature 5's risk drops sharply: driving and verifying a proven redaction implementation instead of writing content stream surgery from scratch.
- Feature 14 arrives largely solved, since the same mechanism removes image data under a region.
- Feature 10 inherits a decided entitlement path rather than discovering that its provider's script cannot load where it is needed.
- Published source is a real trust asset with HR, legal and healthcare buyers.

**Negative / tradeoffs**:

- **The paywall is not enforceable.** Client side code plus published source means a determined free user can lift the page cap. Feature 10 has to be built and priced knowing this.
- **The application is copyleft.** A competitor may legally host the same code. The defensible position becomes brand, distribution and execution.
- **`'unsafe-inline'` on the tool route weakens cross site scripting protection there.** Accepted deliberately, because the alternative is giving up static rendering on the one route where having no server in the path is the point. The fetch directives carry the guarantee instead.
- **Two content security policy regimes to keep straight**, and a later feature that adds a third party origin to the wrong one quietly weakens the claim.
- **Browser memory is a hard ceiling**, and mobile is unreliable enough that it is explicitly not promised. Two open tabs means two engine instances against that same ceiling.
- **A multi megabyte engine download** before the first redaction, mitigated by fetching on intent but never eliminated.
- **Artifex enforce their licence**, and the source offer must resolve to the deployed version, which means tagging every production deploy rather than pointing at a repository.
- **Redaction granularity is geometric, not semantic.** Features 6 and 13 have to map matches to bounding quads, and a quad that overlaps a neighbouring glyph will take it too.

**Neutral**:

- No database, no object store, no cache, no queue. Unusual for a paid web product and worth stating plainly so nobody adds one out of habit.
- The engine module boundary rests on discipline until feature 2 installs the lint rule.
- Two scaffold gates, Turbopack worker bundling and cross origin isolation, are deliberately unresolved facts to be settled by observation rather than guessed at now.
- Root `AGENTS.md` does not exist yet. Feature 2 is where this stack gets captured for every later skill to read.

## Follow-up

- [ ] Prepare the public repository and get the AGPL notices, licence file and source offer right before launch. Tag every production deploy and point `NEXT_PUBLIC_SOURCE_URL` at the tag or commit, since a repository root link does not satisfy the corresponding source obligation. Artifex enforce, so this deserves care rather than a last minute commit.
- [ ] Get a commercial licence quote from Artifex and record it, so relicensing later is a known number rather than an emergency negotiation.
- [ ] Design feature 10 as an honesty based paywall. The page cap cannot be technically enforced under this architecture, and pricing, copy and expectations should reflect that.
- [ ] Write features 5, 6 and 13 knowing redaction is geometric. Feature 6 needs a text match to quad mapping, and feature 5's acceptance criteria should test the geometric edges rather than assume string level precision.
- [ ] Feature 8 owns the user facing treatment of every failure kind in the worker contract, including the encrypted and password protected cases that feature 7 does not cover.
- [ ] Decide the tool page's default state while the entitlement fetch is in flight. Assume the free cap, and settle whether the interface waits or shows the cap and corrects upward.
- [ ] Measure the real browser memory ceiling on a representative machine before raising `NEXT_PUBLIC_MAX_PAGES` above 50, accounting for more than one tab being open.
- [ ] Decide what mobile visitors actually see. Mobile is not promised, so feature 8 needs a deliberate answer rather than a silent failure.
- [ ] Run `/audit` (feature 2) once the scaffold exists, so root `AGENTS.md` records this stack for every later skill.
- [ ] Consider connecting a Playwright MCP server (for example `reason-machines/mcp-skills@playwright-mcp-server`) when you reach `/check verify`. It gives the agent live control of a real browser instead of assumptions about one, which matters most for proving the engine loads in a worker and for driving the redact flow in feature 8. Deferred deliberately, not overlooked.
- [ ] Record in root `AGENTS.md` when feature 2 runs: Agent Skills were searched for this stack and declined, so nothing offers them again. Nothing exists for MuPDF, PDF redaction or WebAssembly in a worker, which is where guidance would actually have helped.

## Rationale

Reasoning, the full options comparison, the landscape scan and references: see [rationale.md](rationale.md).
