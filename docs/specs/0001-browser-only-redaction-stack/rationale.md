# 0001. Browser only redaction stack: rationale

The reasoning and evidence behind [index.md](index.md). `/develop` does not read this file.

## Context

> ⚠️ Premise note: two consequences of this decision land outside this feature, and both are better faced now than discovered later.
>
> **The page cap cannot be enforced.** Redaction runs in the visitor's browser, the tool page is a static asset, and after launch the source is public under AGPL. A free visitor who wants to redact more than three pages can edit the client code and do it, and there is no server in the path to stop them. This is not a flaw to fix. It is the unavoidable price of the guarantee the product sells, and the two cannot both be absolute. Feature 10 should therefore be designed as an honesty based paywall, priced and marketed on convenience, support and trust rather than on technical enforcement. If enforcement later turns out to matter commercially, the only real answer is moving processing to a server, which means giving up the claim this whole product rests on.
>
> **The engine choice reshapes features 5, 6, 13 and 14.** MuPDF redacts by geometry: you mark a rectangle or quad, and everything beneath it is removed from the content stream, image data included. Feature 5 therefore becomes "drive and verify a proven implementation" rather than "write content stream surgery from scratch", which is a large reduction in risk, and feature 14 gets most of its work for free. The cost is that redaction granularity is geometric, not semantic. Feature 6 has to map every text match back to its bounding quads before anything can be removed, and a quad that overlaps a neighbouring glyph will take that glyph too. Feature 13's matches that break across a line or a hyphenation become several quads rather than one. Those three specs should be written knowing this, and feature 5's acceptance criteria should test the geometric edges rather than assume string level precision.

RedactNest sells one thing: a PDF whose sensitive text is genuinely gone rather than hidden under a black rectangle. That claim is trivially easy to make and almost impossible for a buyer to check, which is exactly why the market is full of tools that draw boxes and call it redaction. The architecture therefore has to do more than work. It has to make the claim structurally true and, ideally, verifiable by a sceptical customer without taking anyone's word for it.

Four forces shape the decision. **Real redaction is specialist work.** Removing text from a PDF means reaching into the page content stream, understanding the text showing operators, the font encodings behind them and the glyph positions they produce, and rewriting the stream so the text is absent rather than covered. Getting that subtly wrong produces a file that passes a visual check and fails a copy and paste. **The library market has a licensing shape that constrains commercial use.** The one browser capable library with a real redaction implementation is copyleft; the permissively licensed alternatives either do not implement redaction or are effectively unmaintained. There is no free, permissive, maintained library that does this job. **This is a solo build with no revenue yet**, so a licence fee owed before a single customer exists is a genuine risk, and any choice that demands three new infrastructure components before launch is the wrong one. **The target buyers are HR, legal and healthcare**, who are precisely the audience that reads a security page carefully and asks for a data processing agreement.

Compliance scope is GDPR, and the boundary choice changes it fundamentally rather than marginally. If documents are uploaded, RedactNest is a processor handling special category personal data on behalf of its customers, and it inherits the full weight of that: a processing agreement with real obligations, a subprocessor list covering the host, breach notification duties, and a security posture that must hold up to scrutiny. If documents never leave the visitor's machine, none of the redaction path is processing on RedactNest's infrastructure at all, and features 9 and 17 become far smaller and far more honest documents.

Not deciding blocks everything. Features 5, 6, 7, 8 and 14 each depend on knowing where the work runs and which engine does it, and feature 3's whole privacy model is a description of a boundary that does not yet exist.

## Options considered

### Option 1: Browser only, MuPDF WASM under AGPL, published open source

Everything runs on the visitor's machine. MuPDF compiled to WebAssembly (code compiled to run at near native speed in a browser) does both the reading and the redaction inside a Web Worker. RedactNest's own source is licensed AGPL 3.0 and published at launch, which is what the licence requires once the engine is shipped to a browser.

**Pros**:
- The strongest privacy claim available, and one a customer can verify from their own network tab rather than trusting a policy page.
- The only library with a real redaction implementation, at no licence cost and with no negotiation before there is revenue.
- Handles image data under a rectangle, which is feature 14 largely solved in advance.
- Public source is a genuine trust asset for this specific audience, not just a licence obligation.
- No document processing on RedactNest infrastructure, so features 9 and 17 shrink and stop containing claims that need defending.

**Cons**:
- The whole application is copyleft, so a competitor may legally host the same code. The moat becomes brand, execution and distribution rather than the engine.
- Artifex actively enforce their licence, so notices, the source offer and the published repository have to be right rather than roughly right.
- Bound by browser memory, which sets a real ceiling and makes mobile unreliable.
- A multi megabyte engine download before the first redaction.
- The paywall is advisory, as the premise note sets out.

### Option 2: Browser only, permissively licensed engine, closed source

The same boundary, but built on `pdfjs-dist` (Apache 2.0) for reading and text positions plus a maintained fork of `pdf-lib` (MIT) for writing, with the content stream surgery written in house. RedactNest stays closed source.

**Pros**:
- No copyleft obligation, so the application stays proprietary and the engine work is a real moat.
- Both dependencies are permissive and can be vendored freely.
- Complete control over exactly what "removed" means, which is the thing being sold.

**Cons**:
- You write the content stream surgery yourself, which is the hardest work in the product and the easiest to get subtly and invisibly wrong.
- `pdf-lib` has had no release since November 2020 and is maintained only through a community fork, so the writing half of the stack rests on a dependency with real bus factor risk.
- Nothing helps with image redaction, so feature 14 stays fully unsolved.
- Slowest path to a first shippable redaction, which is the opposite of the Skateboard approach on record.

### Option 3: Server side processing, thin client

Documents are uploaded over TLS, redacted on a server by MuPDF or PyMuPDF, held only in memory, and the result returned and discarded.

**Pros**:
- No practical size or page ceiling, and no browser memory problem at all.
- Mobile works as well as desktop with no extra effort.
- One controlled runtime to debug, rather than every browser a visitor might bring.
- The engine binary never ships to the client, so the page is light and AGPL obligations are narrower.

**Cons**:
- Destroys the differentiator. "Never stored" becomes a policy promise a customer must simply believe, which is the same promise every competitor already makes.
- Makes RedactNest a GDPR processor of special category data, with the processing agreement, subprocessor list and breach duties that follow.
- Compute cost scales with usage rather than being paid by the visitor's own machine.
- The upload itself becomes the thing a security conscious buyer objects to.

### Option 4: Browser only, MuPDF under a paid Artifex commercial licence

Identical architecture to Option 1, but the engine is licensed commercially so RedactNest can stay closed source.

**Pros**:
- The best engine, the strongest privacy claim, and a proprietary product all at once.
- A real moat, since a competitor would have to pay the same fee to match the capability.
- A commercial relationship with Artifex brings support for a component that is load bearing.

**Cons**:
- A negotiated, non public fee, commonly in the thousands per year, owed before product market fit is proved. At $19 a month that is roughly two dozen subscribers working purely to pay for the engine.
- Introduces a vendor negotiation into the critical path of a build that has not shipped anything yet.
- Loses the trust value that inspectable source carries with exactly this buyer.

## Rationale

Option 1 wins because the force that dominates everything else in Context is that the claim must be structurally true rather than merely asserted. Options 3 loses on that single point regardless of its considerable practical advantages: the moment a file is uploaded, RedactNest is making the same unverifiable promise as everyone it is competing against, and the buyers being targeted are the ones most likely to notice.

Between the three browser only options, the deciding force is that real redaction is specialist work and this is a solo build. Option 2 is the intellectually attractive choice and it is the one that preserves a proprietary moat, but it asks a solo engineer to write correct content stream surgery, on top of an unmaintained writing dependency, before anything ships at all. That is the largest possible bet placed at the point of least information, and it sits badly against the Skateboard approach on record, which exists to get a thin usable whole into someone's hands early. Option 4 solves the same problem with money, but it asks for that money before there is evidence anyone wants the product, which is the wrong order.

One route out of the copyleft question was considered and rejected rather than overlooked. PDFium is permissively licensed and does expose page object removal, so a custom WebAssembly build exporting the mutation functions the product needs would give a permissive engine with no licence fee and no obligation. That is a real option, not a dead end. It was rejected because it puts a C++ build toolchain on the critical path of week one for a solo engineer who has not yet shipped anything, and because the resulting engine would still lack the region based image removal that feature 14 needs. It becomes worth revisiting only if the AGPL position later turns out to cost real revenue.

Option 1 spends the licence instead of spending cash or engineering risk, and the thing it spends is the one asset that is worth least right now: exclusivity over code that does not exist yet and has no users. The engineer weighed that directly and chose it, and the reasoning holds. A competitor forking a published codebase still has to build the hosting, the billing, the trust and the search presence that features 9 through 17 describe, and in a market where the core claim is verifiability, source anyone can inspect is closer to a feature than a concession.

Two supporting calls follow from the same forces. The engine runs in a single Web Worker rather than on the main thread, because with the file bytes confined to the worker the main thread never holds document content at all, which turns feature 3's privacy rules from a discipline into a structural property. And the tool route is prerendered static with a strict `connect-src` allowlist, because that combination makes the central claim enforced by the browser rather than promised by the vendor, which is the single most useful sentence feature 16 will ever have to work with.

One recorded preference was relaxed deliberately. The engineer originally asked for the size ceiling to be changeable without a rebuild, then chose build time environment variables once the tradeoff was explicit. The requirement is therefore recorded as "changeable without a code change", with a redeploy accepted as the mechanism.

## Landscape scan

Checked on 2026-09-19 with a capped web search. Full notes in `docs/.agent-cache/research/pdf-browser-stack.md`. Two findings in that scan were corrected from knowledge before being used here, and both corrections are recorded so a later reader does not re-inherit the error:

- The scan reported that only MuPDF can return text with position coordinates. That is wrong. `pdfjs-dist` returns text items with transform matrices, which is how Option 2 would locate a match. It simply cannot write PDFs.
- The scan described PDFium as render focused. That understates it. PDFium can remove page objects; the limitation is that the mutation surface exposed by the usual prebuilt browser bundles is narrow, not that the engine lacks the capability.

Findings used as given:

| Library | Licence | State | Redaction |
|---|---|---|---|
| MuPDF.js | AGPL 3.0, or a paid Artifex commercial licence | Actively maintained by Artifex | Real redaction API, geometric, removes image data too |
| `pdf-lib` | MIT | Last release v1.17.1, November 2020, effectively dormant | None. Object model access only, surgery written by hand |
| `@pdfme/pdf-lib` | MIT | Maintained fork, published within the last few weeks | Same as above |
| PDFium WASM | BSD 3 Clause | Maintained by the Chromium project | Page object removal, narrow surface in prebuilt browser bundles |
| `pdfjs-dist` | Apache 2.0 | Maintained by Mozilla | None. Reading, rendering and text positions only |

Framework majors current at the time of the scan: Next.js 16, Astro 7, Nuxt 4, React Router 7, TanStack Start 1.x. This space moves quickly, so treat these as a snapshot rather than a standing fact.

## References

**Project sources** (verifiable, in this repo):
- `docs/scope/scope.md`, the Skateboard build approach and the Beta workflow tier on the header line
- `docs/scope/scope.md`, feature 10, which commits to no usage counter and no user table of your own
- `docs/scope/scope.md`, features 9, 16 and 17, which are the documents this boundary choice shrinks
- `docs/.agent-cache/research/pdf-browser-stack.md`, the full landscape scan

**Practices & standards**:
- GDPR controller and processor distinction, which the processing boundary decides rather than influences
- AGPL 3.0 section 13, the network source offer obligation
- Defence in depth through content security policy, using `connect-src` as an enforced boundary rather than a hardening measure
- WCAG 2.2 AA, carried forward as the floor feature 4 builds on
- Monolith first, since a single deployable unit is correct for a solo build at this scale

**Links** (web verified during the landscape scan):
- Artifex licensing: https://artifex.com/licensing
- MuPDF.js: https://github.com/ArtifexSoftware/mupdf.js
- pdf-lib: https://github.com/Hopding/pdf-lib
- @pdfme/pdf-lib: https://www.npmjs.com/package/@pdfme/pdf-lib
- PDFium: https://github.com/chromium/pdfium
- Next.js releases: https://github.com/vercel/next.js/releases
- Astro releases: https://github.com/withastro/astro/releases
