# 0011. Privacy policy and terms of use

**Date**: 2026-10-02
**Status**: Accepted
**Updated**: 2026-10-02, wording only: C5, the Children outline and terms outline item 3 now match the narrower page wording. The tool page asks our server one question apart from loading the page and its own files (and C5 now names the test that holds that), the site asks no one for personal details, and RedactNest warns about parts it cannot read. No design changed. Later the same day, wording only, as built: AC-16 and INV-5 refuse any contact address on a `.invalid` host in production, in any letter case, not only the exact placeholder; AC-17 says a representative's email meets AC-16's shape rule alone; and the Vercel privacy notice link in `rationale.md` is its final address. No design changed.
**Updated**: 2026-10-03, from spec [0012](../0012-billing-paid-plan/index.md), two decisions changed. First, money may be taken before the full lawyer review: a tech lawyer advised keeping both pages as they are and revisiting the legal side once RedactNest has 100+ users, so the review (Launch readiness steps 3 and 4) waits until then and no longer gates feature 10. Second, the repository goes public under the AGPL (spec 0001, 2026-10-02), so the change record row, its Follow-up and the rationale no longer argue it may stay private under an Artifex licence. The rule that neither page mentions the repository (AC-19, INV-6) stands, for the reason now given. Spec 0012 also owes this spec its billing claims, sections and the rename to "Terms of service", made as built.

## Summary

RedactNest gets two plain language pages, a privacy policy at `/privacy` and terms of use at `/terms`, linked from every page's footer and from one line under the drop zone on `/tool`. The policy makes only claims that a test or a build check already holds, so a later feature cannot make one false in silence. The outside services it names come from one list, which also feeds the content security policy (the browser's rule about which sites a page may talk to) everywhere except `/tool`. A Vercel production deploy refuses to ship until the real contact address and the Article 27 decision (whether you must name a representative in the EU and the UK) are in, and three legal questions stay open for a lawyer once RedactNest has 100+ users.

## Requirements

**User stories**:
- As a visitor about to open a sensitive document, I want a privacy policy that says exactly what happens to my file and what the site learns about me, so I can decide whether to trust it.
- As a buyer at a UK or EU small business, I want the policy written to UK GDPR and EU GDPR, naming who runs the service and how to reach them, so I can clear the tool with my own compliance checks.
- As a visitor using the free tool, I want plain terms that tell me what I agree to when I choose a file, including that checking the result is my job.
- As the operator, I want each claim the policy makes held by a test or a gate, so a later feature cannot make it false without a build failing.
- As the operator, I want a production deploy to refuse a placeholder contact address and an undecided Article 27 question, so the pages never go live unfinished.

**Acceptance criteria** (the contract):

*The pages*
- **AC-1**: `/privacy` and `/terms` are prerendered static pages under the standard content security policy. Each has the shell every page has (skip link, header with the "Redact a PDF" button as a real page load, `main#main`, footer), a narrow reading column, an h1 ("Privacy policy", "Terms of use"), a "Last updated" line under it, then the outline's h2 sections (Feature design) in order, each heading word for word from `src/lib/policy-sections.ts`. The last, "Changes", lists dated entries, newest first. Both paths come from `PRIVACY_PATH` and `TERMS_PATH` in `src/lib/routes.ts`.
- **AC-2**: "Last updated" shows the newest entry of that page's change list as a British date (`2 October 2026`) inside a `<time dateTime="YYYY-MM-DD">`, as does each entry in the list. Each list holds at least one entry, every date is a real calendar date written `YYYY-MM-DD` (one that survives a round trip through `Date.UTC`, so `2026-02-30` fails), and entries run strictly newest first. A list that breaks any of these fails `pnpm test`.
- **AC-3**: Each page sets its own metadata title ("Privacy policy", "Terms of use", shown through the layout's `%s · RedactNest` template) and a one sentence description, and is indexable (no `noindex`).
- **AC-4**: Every page's footer, `/tool` included, holds a `nav` labelled "Legal" with two plain `a` links, "Privacy policy" to `PRIVACY_PATH` and "Terms of use" to `TERMS_PATH`, opening in the same tab, placed before spec 0009's licence notice, which is unchanged. Every word comes from `src/lib/legal.ts`. At 320 CSS pixels the footer wraps with no horizontal scrolling, each link target is at least 24 by 24 CSS pixels, and axe finds no violation on `/`, `/tool`, `/privacy` or `/terms`. On `/tool` with ticked work, following either link raises spec 0007's leave warning.
- **AC-5**: On `/tool`, whenever the full drop zone shows, one line directly under it reads "By choosing a PDF you agree to the Terms of use. The Privacy policy explains what happens to your data.", where "Terms of use" and "Privacy policy" are plain `a` links to `TERMS_PATH` and `PRIVACY_PATH` in the same tab. It is `text-small` in `ink-muted`, sits outside the polite live region, and goes once the compact file bar replaces the drop zone. Every word comes from `src/lib/legal.ts`.

*What the privacy policy says*
- **AC-6**: The privacy policy names the operator as "RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan", says that this is the controller (the one who decides how personal data is used), and gives `LEGAL.contactEmail` as a `mailto:` link. When `LEGAL.representatives` records an EU or a UK representative, the page names each with their name, postal address and email. When it records none, the page says nothing about representatives.
- **AC-7**: The privacy policy states every claim in the claims register (Feature design), in plain words, and states no claim about data handling outside it.
- **AC-8**: The privacy policy lists every entry of `OUTSIDE_SERVICES` (today, Vercel only): what it does, what it receives, why, where it processes data, the transfer safeguard, how long it keeps the data, and a link to its own privacy policy. It renders straight from the list, so an entry added to the list appears on the page with no other change.
- **AC-9**: The privacy policy covers the GDPR Article 13 items in the outline (Feature design): purposes, the legal basis (legitimate interests), recipients, transfers and their safeguards, retention, the six rights, the right to complain (the ICO for the UK, the visitor's own national authority for the EU, both linked), that request data is needed to load a page at all, and that there is no automated decision making or profiling.

*What the terms say*
- **AC-10**: The terms of use name the same operator and contact, and make each point in the terms outline (Feature design) in its order. Among them: you check the cleaned file; the software licence is separate and nothing in the terms limits it; liability is capped at the greater of what you paid in the 12 months before the claim or US$100, with the carve outs; consumers keep their statutory rights; Pakistani law and the courts of Pakistan, with UK and EU consumers keeping their own country's mandatory protection and courts.

*Claims held by tests and gates*
- **AC-11**: No page sets a cookie. After a full run on `/tool` (open, tick, redact, download) and a visit to `/`, `/privacy` and `/terms`, the browser context holds no cookie and no response carried `Set-Cookie`.
- **AC-12**: Every request `/privacy` and `/terms` make, fonts included, goes to our own origin (spec 0003 AC-20's check, extended to both pages).
- **AC-13**: `OUTSIDE_SERVICES` in `src/config/privacy.ts` is the only source of outside origins in the standard policy. Every directive of the standard policy holds only its fixed sources (plus the development only ones under `next dev`), and `script-src` and `connect-src` add exactly the union of the services' origins. No other directive takes an outside origin until a later feature decides how a service names one. With `default-src 'none'` blocking the rest, no page can reach an outside origin the list does not name.
- **AC-14**: `/tool`'s policy takes nothing from `OUTSIDE_SERVICES`, whatever the list holds. In production its `connect-src` is exactly `'self'` and its `script-src` exactly `'self' 'unsafe-inline' 'wasm-unsafe-eval'`. A unit test builds both policies from a list holding sample origins and fails if any of them appears anywhere in the tool policy.
- **AC-15**: `console`, `process.stdout` and `process.stderr` are banned by lint in every zone (`no-console: error`, plus a syntax ban on the two streams, both added through `zone()`), so RedactNest's own code writes no log. Using any of them anywhere under `src` fails `pnpm lint`.

*Gates before launch*
- **AC-16**: `LEGAL.contactEmail` holds the placeholder `privacy@redactnest.invalid` until the real address is set. An address that, once trimmed, does not match `^[^\s@]+@[^\s@]+\.[^\s@]+$` fails every build (the placeholder matches). A build where `VERCEL_ENV` is `production` also fails while the address is on a `.invalid` host, in any letter case: its host (what follows the last `@` of the trimmed address), lowercased and with any trailing dots dropped, ends in `.invalid`. That refuses the placeholder however it is written (`Privacy@redactnest.invalid`) and any other `.invalid` address typed by hand (`hello@example.invalid`, `privacy@mail.redactnest.INVALID`, `privacy@redactnest.invalid.`), and lets through a host that only contains the word (`invalid.redactnest.com`, `redactnest.xinvalid`) and a local part that does (`me.invalid@redactnest.com`). The error names `LEGAL.contactEmail` and says to set the real address: it calls the placeholder, in any letter case, the placeholder, and names any other such address as being on a `.invalid` host, which never delivers mail. A malformed address reports only the shape problem. Previews, `pnpm build` off Vercel (CI's Playwright build) and `pnpm dev` build with any `.invalid` address and show it. A build with `VERCEL=1` fails when `VERCEL_ENV` is missing or is anything but `production`, `preview` or `development`, because it cannot tell whether it is production (Vercel's custom environments report `preview`). Every problem found goes into one `ConfigError` that lists them all.
- **AC-17**: `LEGAL.representatives` records the Article 27 decision: `pending`, or `decided` with an EU representative or none and a UK representative or none. A build where `VERCEL_ENV` is `production` fails while it is `pending`, with an error naming `LEGAL.representatives`. Every other build passes. A recorded representative whose name or postal address is empty once trimmed, or whose email fails AC-16's shape rule, fails every build. The `.invalid` rule is the contact address's alone.

*Quality*
- **AC-18**: `/privacy` and `/terms` hold WCAG 2.2 AA: axe finds no violation, headings run h1, h2, h3 with no level skipped, links are underlined with the visible focus ring, and at 320 CSS pixels and at 200% text nothing scrolls sideways.
- **AC-19**: Neither page states a page or size limit as a number, mentions the repository or its history, or ships a script of its own (both are server components with no client component). The terms' "US$100" and "12 months" are not limits on the visitor and are allowed.

## Decision

**Chosen option**: Option 1: Hand written static pages, with the facts kept as data and every claim held by a test or a gate.

RedactNest writes its own two pages in its own code. The operator facts, the change lists and the outside services live in typed modules the pages read, the content security policy is built from the same services list (never on `/tool`), and a Vercel production deploy fails until the launch facts are real.

**Implementation skills**: `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`) for metadata and static route conventions.

What was settled with you:

| Question | Decision |
|---|---|
| Operator | "RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan" (a trading name over you) |
| Law the policy is written to | UK GDPR and EU GDPR (they reach services offered to people there, Article 3(2)), plus Pakistan's law, where no general data protection act is in force |
| Coverage | Only what ships today. Features 10 and 11 add their own sections in the change that adds what they describe |
| Who writes the words | `/develop`, from this spec's outlines and claims register. You review every word. A lawyer reviews both pages once RedactNest has 100+ users, on a tech lawyer's advice (2026-10-03); feature 10 may take money before then (spec 0012) |
| Paths and names | `/privacy` "Privacy policy", `/terms` "Terms of use" |
| Layout | The shell, a narrow reading column, h1, "Last updated", h2 sections, then the dated change list. A new `Prose` primitive in `src/ui` |
| Change record | "Last updated" is the newest entry of a dated change list shown at the bottom of each page. The repository is never mentioned: the list is the page's own record of what changed, so a reader never needs the repository's history, and the footer's source link (spec 0009) is the one way to the code |
| Footer | A `nav` labelled Legal, before the licence notice, same tab |
| Agreeing to the terms | One line under the full drop zone on `/tool`. Feature 10 adds a tick box at checkout |
| Audience | Anyone, with consumer rights kept |
| Liability | Capped at the greater of 12 months' fees or US$100, with the carve outs no law lets you exclude |
| Law and courts | Pakistani law, the courts of Pakistan (a city left to your lawyer). UK and EU consumers keep their own mandatory protection and courts |
| Contact | One constant, `LEGAL.contactEmail`, a placeholder until you buy the domain |
| The gates | A Vercel production deploy fails on a contact address on a `.invalid` host (the placeholder, in any letter case, among them) and on an undecided Article 27 question. Previews, CI and dev still build |
| Article 27 | Optional EU and UK representative slots plus a recorded decision. A lawyer question before launch |
| Host plan | Vercel Pro from launch, so request logs are kept one day. Observability Plus, log drains, Web Analytics and Speed Insights stay off |
| Accuracy | A claims register, each claim held by a named test or gate. Outside services as one list that feeds the standard policy only. A test fails if a listed origin ever reaches `/tool`'s policy |
| Console | Banned by lint in every zone |
| Indexing | Indexed, each page with its own title and description. No sitemap yet (feature 15) |
| Before launch steps | A new Release 2 scope feature, Launch readiness (listed below) |
| Workflow tier | Alpha, raised from Prototype, so `/check verify` checks each claim against the running app |

Decided while writing (runner up in brackets):
- **Change lists** live in `src/lib/policy-changes.ts`, beside the type, the order check and the date format, so both pages share one rule. (A module beside each page: two copies of the same rules.)
- **The gate check** is a pure `checkLegalFacts(legal, vercelEnv)` in `src/lib/legal.ts`, returning the problems it finds. `src/config/index.ts` calls it at module load and throws one `ConfigError` listing all of them, so the build fails as it does for a bad cap. A pure function lets tests feed it a real address and a recorded decision while the repository still holds the placeholders. (A check in `scripts/sync-legal.mjs`: it would have to parse TypeScript to read the constant.)
- **The policy builder** moves out of `next.config.ts` into a pure `buildPolicies({ services, dev })` in `src/config/csp.ts`, so AC-14's test can hand it sample origins. Today the list holds no origin, so a test of the real list alone would pass whatever the code did. (Keep it in `next.config.ts` and test only the real headers: no meaningful test until feature 10.)
- **`ConfigError`** moves to `src/config/error.ts` and `src/config/index.ts` exports it again, so `src/config/privacy.ts` can throw it without importing the module that reads the environment.
- **The placeholder** is `privacy@redactnest.invalid`. The `.invalid` top level domain is reserved and never delivers mail, so the placeholder cannot reach a stranger. (An empty string: a blank `mailto:` in dev and previews.) Production refuses every `.invalid` host, not only the exact placeholder, because an exact match let a hand edit such as `Privacy@redactnest.invalid`, or another `.invalid` name, ship a privacy contact that bounces.
- **Fail closed**: `VERCEL=1` with `VERCEL_ENV` missing fails the build, the same stance as spec 0009's source link rule.
- **Legal basis** for the host's request data is legitimate interests (GDPR Article 6(1)(f)): a page cannot load without it, the data is minimal and gone in a day. (Consent: it cannot be refused, so it would not be real consent.)
- **Each service** renders as an h3 with a `SummaryList` of its facts, then its policy link. (A table: it reflows badly at 320 pixels.)
- **Vercel's own use**: the Vercel entry says Vercel may also use some of this data, such as for platform security, as a controller in its own right under its own policy. Vercel's DPA treats "service generated data" that way, and whether request logs count is a Launch readiness question.
- **Complaint links**: the ICO's complaints page and the EDPB's list of member authorities live in `src/config/privacy.ts` as `COMPLAINT_AUTHORITIES`, because every public address comes from `src/config`. `/develop` confirms both addresses resolve when it writes them.
- **First change entry**: `First published.`, dated the day `/develop` writes the pages. Launch readiness folds every entry made before launch into one, dated launch day.
- **No numbers in the terms**: "the limits shown in the tool", because the caps live in `src/config` and change by environment.

## Feature design

**Data model sketch**: no stored data. These typed, frozen modules are the whole model:

| Module | Holds | Shape |
|---|---|---|
| `src/lib/legal.ts` (extended) | Spec 0009's notice words, plus the operator facts, the contact, the representatives, and the footer and notice words | `tradingName: "RedactNest"`, `country: "Pakistan"`, `operatorLine` (derived from `tradingName`, `holder`, `country`), `contactEmail: string`, `representatives: RepresentativesDecision`, `legalNavLabel: "Legal"`, `privacyLabel: "Privacy policy"`, `termsLabel: "Terms of use"`, `toolNotice: { beforeTerms, betweenLinks, afterPrivacy }`. Exports `CONTACT_PLACEHOLDER`, `EMAIL_SHAPE` (`^[^\s@]+@[^\s@]+\.[^\s@]+$`, tested on the trimmed value) and `checkLegalFacts` |
| `RepresentativesDecision` | The Article 27 record | `{ status: "pending" }` or `{ status: "decided"; eu: Representative \| null; uk: Representative \| null }`. `decided` with both `null` means "not required, on advice" |
| `Representative` | One representative | `{ name: string; postalAddress: string; email: string }`, all required |
| `src/lib/policy-changes.ts` | Both change lists | `PolicyChange = { date: string /* YYYY-MM-DD */; summary: string }`. `PRIVACY_CHANGES` and `TERMS_CHANGES`, each `readonly [PolicyChange, ...PolicyChange[]]` (at least one), newest first. `lastUpdated(list)`, `isCalendarDate(date)` (a round trip through `Date.UTC`) and `formatPolicyDate(date)` (`en-GB`, day, long month, year, in UTC). Each date is a literal `/develop` writes on the day, never computed at build |
| `src/lib/policy-sections.ts` (new) | Every h2 heading, in order | `PRIVACY_SECTIONS` and `TERMS_SECTIONS`, readonly records of the outline names below, word for word, read by the pages and by the browser test |
| `src/config/privacy.ts` (new) | Outside services and complaint authorities | `OutsideService = { name; role; receives; purpose; location; safeguard; retention; ownUse?: string; policyUrl; scriptOrigins: readonly string[]; connectOrigins: readonly string[] }`. `OUTSIDE_SERVICES`, `COMPLAINT_AUTHORITIES = { uk: { name, url }, eu: { name, url } }`. Validated at load: every URL https; every origin https only, a lowercase host with one optional leading `*.` and an optional port, and no path, query, hash or trailing slash. A service names only script and connect origins; any other directive is a later feature's decision |
| `src/config/csp.ts` (new) | The policy builder | `buildPolicies({ services, dev }): { tool: string; standard: string }`, pure. `tool` never reads `services` |
| `src/lib/routes.ts` (extended) | Paths | `PRIVACY_PATH = "/privacy"`, `TERMS_PATH = "/terms"` |

The one entry `OUTSIDE_SERVICES` holds today:

| Field | Vercel |
|---|---|
| `role` | Hosts this site |
| `receives` | Your IP address, browser and device type, the page or file asked for, and the time |
| `purpose` | To deliver the site and keep it working and secure |
| `location` | The United States and other countries where Vercel operates |
| `safeguard` | The Data Privacy Framework between the EU and the US, and standard contractual clauses |
| `retention` | One day |
| `ownUse` | Vercel may also use some of this data, such as for platform security, as a controller in its own right under its own privacy policy |
| `policyUrl` | `https://vercel.com/legal/privacy-notice` (checked to resolve with no redirect on 2 October 2026) |
| `scriptOrigins`, `connectOrigins` | none |

**State transitions**: none at runtime. The two launch facts move one way, by hand, in `src/lib/legal.ts`: `contactEmail` from the placeholder to the real address, and `representatives` from `pending` to `decided`.

**API surface**: no endpoint. The surface is two pages and their components:

| Surface | Kind | Reads | Renders | Auth | Failure |
|---|---|---|---|---|---|
| `/privacy` | Static page, server component | `LEGAL`, `PRIVACY_CHANGES`, `PRIVACY_SECTIONS`, `OUTSIDE_SERVICES`, `COMPLAINT_AUTHORITIES` | The privacy outline below | Public | none at runtime. A bad module value fails the build |
| `/terms` | Static page, server component | `LEGAL`, `TERMS_CHANGES`, `TERMS_SECTIONS` | The terms outline below | Public | as above |
| `ServicesSection` (`src/app/privacy/services-section.tsx`) | Server component, the seam AC-8 is tested through | props: `services: readonly OutsideService[]` | One h3 per service, a `SummaryList` of its facts, `ownUse` when set, then its policy link | Public | none |
| `RepresentativesBlock` (`src/app/privacy/representatives-block.tsx`) | Server component, the seam AC-6 is tested through | props: `decision: RepresentativesDecision` | Each recorded representative's name, postal address and email link; nothing for `pending` or for `null` slots | Public | none |
| `LegalNav` (`src/app/legal-nav.tsx`) | Footer `nav aria-label="Legal"`, passed into `SiteFooter` by the layout before `LicenceNotice` | `LEGAL`, `PRIVACY_PATH`, `TERMS_PATH` | A `ul` of two links in a row (`flex gap-4`), no separators, no `p` inside (so `shell.spec.ts`'s `footer.locator("p")` still finds only the notice). It sits beside the notice as one flex item of the footer's row | Public | none |
| `FOOTER_LINK_CLASS` (`src/app/footer-link.ts`) | The link class `licence-notice.tsx` holds today as `LINK_CLASS`, moved and exported so both footer pieces share one 24 pixel target rule | n/a | n/a | n/a | n/a |
| `TermsNotice` (`src/app/tool/terms-notice.tsx`) | A sibling `p` directly after the full `DropZone`, in the non compact branch at `tool-client.tsx:706`, spaced by the parent's gap alone | `LEGAL`, both paths | AC-5's sentence | Public | none |
| `Prose` (`src/ui/prose.tsx`) | Presentation primitive: one wrapper that styles its descendants | props: `children`, `className` | h2 `text-heading`, h3 `text-body font-semibold`, `p`, `ul` and `ol` with markers, underlined `a` (focus from the global `:focus-visible` rule). No new colour pairing: `ink` and `ink-muted` on `canvas` | n/a | n/a |

**The claims register** (AC-7). The privacy policy says these, in plain words, and nothing else about data:

| # | The claim | Held by |
|---|---|---|
| C1 | Your document is opened and processed only in your browser. It is never uploaded to us or anyone else | `/tool`'s `connect-src 'self'` (spec 0001), AC-14, `tests/e2e/privacy.spec.ts` "no request carries the document, its text or its name" and "the only thing the tool route asks its own server for is the entitlement" |
| C2 | We never store your document, and nothing about it is saved in your browser's storage | Spec 0002 INV-3, the lint storage ban, `privacy.spec.ts` "every store is empty for the origin after a run" |
| C3 | What RedactNest finds, the words around it, and your file's name stay on your device | Spec 0002 AC-3 and INV-4, `privacy.spec.ts` "a detected redaction sends, stores and logs no match text or context" |
| C4 | When you close the page or start over, the document is gone from the page's memory | Spec 0002 INV-6, AC-5a, AC-5b |
| C5 | Apart from loading the page and its own files, the tool page asks our server one question only, which plan applies, and that request carries nothing about your document | Spec 0001's entitlement route (no body, no query read), spec 0002 AC-3, `privacy.spec.ts` "the only thing the tool route asks its own server for is the entitlement" |
| C6 | No cookies | AC-11 for our code. At the host, Launch readiness step 5 keeps the Vercel firewall's challenge modes off, because a challenge sets its own cookie |
| C7 | No analytics, advertising, tracking or error reporting, and no script from anyone else | AC-13 (the standard policy holds no outside origin while the list names none), `tests/e2e/headers.spec.ts` |
| C8 | Our own code keeps no logs | AC-15 |
| C9 | Fonts and files come from our own site, so loading a page tells no one else you visited | Spec 0003 AC-20, AC-12 |
| C10 | Our host records standard request data and keeps it one day. We keep no copy and do not try to identify you | The Vercel entry in `OUTSIDE_SERVICES`, INV-9, Launch readiness steps 5 and 6 (Vercel settings, not testable in code) |
| C11 | We do not sell or share data, combine it with anything, or make automated decisions about you | True by absence, held by C6 to C8 |
| C12 | There are no accounts or payments yet | True by absence. Feature 10 owes the update |

**Privacy policy outline** (h2 sections in order):
1. **Who we are**: the operator line, what a controller is, the contact `mailto:` link, and the representatives when recorded (AC-6).
2. **Your documents**: C1 to C5. The tool page is locked so the browser itself refuses to let it connect to any other site. The cleaned file is saved wherever your browser saves downloads. We cannot see, recover or delete your documents, because we never have them.
3. **What we receive when you visit**: C10. What the request data is, why (to deliver the site and keep it working and secure), the legal basis (legitimate interests), that a browser cannot load a page without sending its IP address, and how long it is kept.
4. **What we do not do**: C6 to C9, C11, C12.
5. **Services we use**: one h3 per `OUTSIDE_SERVICES` entry (AC-8), with `ownUse` when set.
6. **Transfers outside the UK and the EU**: each service's location and safeguard, each explained in one plain sentence (an agreement under which certified US companies commit to protection at the EU's level; contract terms approved by the European Commission that bind the receiver to protect the data). We operate from Pakistan.
7. **Your rights**: access, correction, erasure, restriction, objection and portability. The only data is the host's request logs, kept one day, and we cannot link them to you, so most requests will find nothing, and we will say so. How to ask (the contact), a reply within one month, no fee.
8. **Complaints**: the ICO for the UK and your own country's data protection authority in the EU, each linked from `COMPLAINT_AUTHORITIES`.
9. **Children**: RedactNest is not aimed at children, and it asks no one for personal details, children included.
10. **Links to other sites**: their own policies apply.
11. **Changes**: we change this page, update the date and add a line below. Then the dated list (AC-1, AC-2).

**Terms of use outline** (h2 sections in order):
1. **About these terms**: an agreement between you and RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan. Choosing a PDF in the tool, or using the site, means you agree. The contact.
2. **What RedactNest does**: a tool that runs in your browser to find and remove text from PDFs, free within the limits shown in the tool. We may change, limit or stop it at any time.
3. **Checking the result is your job**: RedactNest suggests, you choose, and it removes only what you tick. It warns you about parts it cannot read, such as text in pictures and scanned pages. Review the cleaned file before you share it. You decide whether it is fit for your purpose.
4. **Using it fairly**: use it lawfully, and only on documents you are entitled to handle. Do not attack, overload or disrupt the site, or try to get around its limits.
5. **The software licence**: RedactNest's software is licensed separately, under the licence linked at the foot of every page. These terms cover your use of this website, and nothing in them limits your rights under that licence.
6. **No warranty**: provided as is and as available. No promise that it finds every sensitive item, is free of errors, or is always available.
7. **Our liability**: capped at the greater of what you paid us in the 12 months before the claim or US$100. No liability for indirect or consequential loss (lost profits, business or data) where the law allows. Nothing limits liability for fraud, for death or personal injury caused by negligence, or for anything else the law does not let us limit.
8. **If you are a consumer**: nothing in these terms removes rights you have by law where you live.
9. **Ending**: you can stop using RedactNest at any time. We may block anyone who breaks these terms.
10. **Law and courts**: Pakistani law, and the courts of Pakistan. A consumer in the UK or the EU keeps the protection of their own country's mandatory laws and may bring a claim in their own courts.
11. **Changes**: we change this page, update the date and add a line below, and using the site after a change means you accept it. Then the dated list (AC-1, AC-2).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Footer | "Legal", "Privacy policy", "Terms of use" | `LEGAL.legalNavLabel`, `LEGAL.privacyLabel`, `LEGAL.termsLabel` |
| Footer, notice | the two hrefs | `PRIVACY_PATH`, `TERMS_PATH` |
| Tool notice | the sentence around the two links | `LEGAL.toolNotice` with the two labels |
| Both pages | the operator line | derived from `LEGAL.tradingName`, `LEGAL.holder` ("Heyrbiar Khan", spec 0009) and `LEGAL.country` |
| Both pages | the contact address | `LEGAL.contactEmail` (placeholder until Launch readiness step 1) |
| Privacy policy | each representative | `LEGAL.representatives` |
| Both pages | "Last updated" | `lastUpdated()` over `PRIVACY_CHANGES` or `TERMS_CHANGES`, through `formatPolicyDate()` |
| Both pages | the change list | `PRIVACY_CHANGES`, `TERMS_CHANGES` |
| Both pages | every h2 heading | `PRIVACY_SECTIONS`, `TERMS_SECTIONS` (the outline names, word for word) |
| Both lists | the first entry's date | the day `/develop` writes the pages (decided here). Launch readiness step 7 resets it to launch day |
| Privacy policy | each service's facts and link | `OUTSIDE_SERVICES` |
| Privacy policy | Vercel's "One day" | Vercel's runtime log retention on Pro (Vercel docs, 2026-08-28), with Pro decided here |
| Privacy policy | Vercel's safeguard | Vercel's privacy policy, fetched 2026-10-02 |
| Privacy policy | the two complaint links | `COMPLAINT_AUTHORITIES`, addresses confirmed by `/develop` when written |
| Privacy policy | the claims | the claims register above |
| Terms | the liability floor, US$100 | decided here, written in the terms page |
| Terms | the free tier's limits | not stated as numbers: "the limits shown in the tool" (INV-6) |
| Terms | the law and courts | `LEGAL.country`, and "the courts of Pakistan" decided here |
| Each page | metadata title and description | each `page.tsx`'s `metadata`, through the layout's title template |
| Gate | "is this a production deploy" | `VERCEL_ENV` (Vercel's system variable, read at build, never sent to the browser). `VERCEL=1` with it missing, or with a value outside `production`, `preview` and `development`, fails closed |

**Key invariants**:
- **INV-1**: Every outside origin in the standard policy comes from `OUTSIDE_SERVICES`, and every outside service any page uses is in that list. AC-13 holds every directive to its fixed sources plus the list, and `default-src 'none'` blocks whatever the policy does not name.
- **INV-2**: `/tool`'s policy takes nothing from `OUTSIDE_SERVICES`, whatever later features add (AC-14). This holds spec 0001's guarantee as the list grows.
- **INV-3**: The privacy policy makes only the claims in the register, and each stays held by what the register names. A change that weakens a claim's holder updates the page and adds a change entry in the same change. Features 10 and 11 add their own claims.
- **INV-4**: Every word in the footer nav and the tool notice comes from `src/lib/legal.ts`, and every path from `src/lib/routes.ts` (as spec 0009 AC-1 does for the notice).
- **INV-5**: A Vercel production deploy never carries a contact address on a `.invalid` host (the placeholder, in any letter case, among them) or a `pending` Article 27 decision (AC-16, AC-17). It fails closed.
- **INV-6**: Neither page states a cap as a number or mentions the repository (AC-19).
- **INV-7**: Both pages are static server components with no form, no client component and no script of their own. They collect nothing.
- **INV-8**: `src/config/privacy.ts`, `src/config/csp.ts` and `src/config/error.ts` import only each other, by relative path, and read no environment variable, because `next.config.ts` loads them and does not resolve the `@/` alias.
- **INV-9**: Turning on Vercel Observability Plus, a log drain, Web Analytics, Speed Insights or a firewall challenge mode changes what the host keeps, who receives it, or whether a cookie is set, so the privacy policy and the Vercel entry change first.
- **INV-10**: The terms never limit rights under the software licence, whichever licence that is.

**Security model**: public static pages, no input, no personal data of their own, no authentication. Compliance scope: UK GDPR and EU GDPR (Article 3(2), services offered to people in the UK and the EU, from Pakistan), and Pakistan's Prevention of Electronic Crimes Act 2016 (whether its section 32 traffic data rule reaches this operator is a lawyer question). The only personal data anywhere in the product is the host's request logs, which RedactNest never copies.

**Configuration required**: no variable you set. The build reads Vercel's system variable `VERCEL_ENV` (with `VERCEL`, already read since spec 0009), which needs "Automatically expose System Environment Variables" on, as spec 0009 already requires.

**Critical test scenarios**:
- Happy path: both pages render the shell, h1, "Last updated", every outline section and the change list; the footer nav and the tool notice link to them; axe clean on all four routes, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-18**.
- Claims: a full run leaves no cookie and no `Set-Cookie`; both pages make same origin requests only, verifies **AC-11**, **AC-12**.
- Guard: `buildPolicies` with a sample list holding `https://a.example` and `https://*.b.example` puts both in the standard policy and neither anywhere in the tool policy, whose `connect-src` stays exactly `'self'`, verifies **AC-13**, **AC-14**.
- Gate: `checkLegalFacts` with the placeholder and `production` reports the address, and so it does for the placeholder in any letter case (named as the placeholder) and for any other `.invalid` host (`hello@example.invalid`, `privacy@mail.redactnest.INVALID`, a trailing dot; named as on a `.invalid` host), while `invalid.redactnest.com`, `redactnest.xinvalid` and `me.invalid@redactnest.com` pass; with `pending` and `production` reports the representatives; with a real address, a decision and `production` reports nothing; with any `.invalid` address, in any letter case, and `preview`, `development` or `undefined` reports nothing; with `not-an-email` reports the address in every environment; a recorded representative with a blank name or a bad email is reported in every environment. Config throws with `VERCEL=1` and `VERCEL_ENV` missing or set to `staging`, verifies **AC-16**, **AC-17**.
- Lint: a `console.log` and a `process.stdout.write` in a sample file in each zone are rejected, verifies **AC-15**.
- Pages: neither page's `main` text names the repository, GitHub or a commit, or puts a number beside "page" or "MB", verifies **AC-19**.
- Leave warning: on `/tool` with a match ticked, the footer's Privacy policy link raises the `beforeunload` dialog, verifies **AC-4**.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest whole a visitor can use: both pages, true and linked, with the gates in the same slice so it is safe to merge alone. Slice 2 holds the claims with tests. Slice 3 amends the older specs and puts the words in front of you.

**Slice 1: the pages, published and linked**
1. `PRIVACY_PATH` and `TERMS_PATH` in `src/lib/routes.ts`. In `src/lib/legal.ts`: the operator facts, `CONTACT_PLACEHOLDER` and `contactEmail` set to it, `representatives: { status: "pending" }`, the footer and notice words, `EMAIL_SHAPE`, and the pure `checkLegalFacts(legal, vercelEnv)`. `src/lib/policy-changes.ts` with both lists, `lastUpdated`, `isCalendarDate` and `formatPolicyDate`. `src/lib/policy-sections.ts` with both heading lists. Tests: `tests/unit/legal.test.ts` (every gate case above) and `tests/unit/policy-changes.test.ts` (at least one entry, real calendar dates with `2026-02-30` refused, strictly newest first, the British format; never a fixed date). Satisfies **AC-1**, **AC-2**, **AC-16**, **AC-17**.
2. The gate: move `ConfigError` to `src/config/error.ts` (exported again from `src/config/index.ts`). `RAW` gains `VERCEL_ENV`, read literally like `VERCEL`, with a comment that the browser never sees it, so the production rules run only at build and on the server while the email shape check also runs in the browser (as `readSourceUrl`'s comment says of `VERCEL`). At module load, when `VERCEL` is `1`, a missing `VERCEL_ENV` or one outside `production`, `preview` and `development` is a problem; add every problem `checkLegalFacts(LEGAL, VERCEL_ENV)` returns, and throw one `ConfigError` listing them all. `tests/unit/config.test.ts`: `CONFIG_KEYS` gains `VERCEL_ENV`, and the `VERCEL_BUILD` fixture gains `VERCEL_ENV: "preview"`, so the existing Vercel cases keep passing. New cases: with `VERCEL_ENV=production`, config throws exactly when `checkLegalFacts(LEGAL, "production")` is not empty (so the test stays true once the real facts are in); `preview` loads; `VERCEL=1` with `VERCEL_ENV` missing or `staging` throws. Satisfies **AC-16**, **AC-17**.
3. `src/config/privacy.ts`: the types, `OUTSIDE_SERVICES` with the Vercel entry, `COMPLAINT_AUTHORITIES` (confirm both addresses resolve before writing them), validation at load, relative imports only (INV-8). `tests/unit/privacy-config.test.ts`: the real list validates; an http policy URL, an origin with a path, a trailing slash, a query, an uppercase host, a bare `*` and a bare host each fail; `https://*.a.example` and `https://a.example:8443` pass. Satisfies **AC-8**, **AC-9**, **AC-13**.
4. `src/ui/prose.tsx` with a component test and `expectNoAxeViolations` in `tests/component/ui/prose.test.tsx`. Satisfies **AC-18**.
5. `src/app/privacy/services-section.tsx` (`ServicesSection`) and `src/app/privacy/representatives-block.tsx` (`RepresentativesBlock`), with component tests fed sample data: two services render two h3s with their facts, links and `ownUse`; `pending` and `decided` with both slots `null` render nothing; an EU only decision renders one representative. Satisfies **AC-6**, **AC-8**.
6. `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`: the shell as on `/` (header with the reload button to `TOOL_PATH`), `PageContainer width="narrow"`, h1 in `text-title`, "Last updated" in a `<time>`, the h2 sections from `PRIVACY_SECTIONS` and `TERMS_SECTIONS` in `Prose`, `ServicesSection` and `RepresentativesBlock` fed the real modules, the change list, and `metadata`. Write the words in plain language from the outlines and the claims register, matching the product's voice and British spelling. Satisfies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-19**.
7. `src/app/footer-link.ts` exporting `FOOTER_LINK_CLASS` (moved from `licence-notice.tsx`'s `LINK_CLASS`, which then imports it). `src/app/legal-nav.tsx` (`LegalNav`), passed into `SiteFooter` by `layout.tsx` before `LicenceNotice`, with `SiteFooter` unchanged. Component test in `tests/component/app/legal-nav.test.tsx`: the nav's label, the order, the hrefs, no `p` inside, axe. Satisfies **AC-4**.
8. `src/app/tool/terms-notice.tsx` (`TermsNotice`), rendered as a sibling right after the full `DropZone` in the non compact branch at `tool-client.tsx:706`. A case in `tests/component/tool-client.test.tsx`: shown at idle, gone once a document opens. Satisfies **AC-5**.
9. `tests/e2e/legal-pages.spec.ts`: both pages' h1, "Last updated" and change list; every h2 read from `policy-sections.ts`, in order; the footer nav on `/`, `/tool`, `/privacy` and `/terms`; the tool notice; axe, 320 pixel reflow and 200% text on both pages; the leave warning through the footer's Privacy policy link with a tick in place; AC-19's text scan of each page's `main` (no "repository", "GitHub" or "commit", no number beside "page" or "MB"). A unit check in `tests/unit/policy-pages.test.ts` that no file under `src/app/privacy` or `src/app/terms` starts with `"use client"`. Extend `privacy.spec.ts`'s same origin test to `/privacy` and `/terms`. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-12**, **AC-18**, **AC-19**.

**Slice 2: the claims, held**
10. Spike first: Next's docs (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`) say `next.config.ts` resolves imports as CommonJS by default, so move the builder, import it by relative path, and run `pnpm build` before writing anything else. If extensionless imports fail, use `.ts` suffixed imports with `allowImportingTsExtensions`. Then `src/config/csp.ts`: `buildPolicies({ services, dev })`, moved from `next.config.ts` with its comments. `next.config.ts` imports it and `OUTSIDE_SERVICES` by relative path and drops `THIRD_PARTY_SCRIPT_ORIGINS` and `THIRD_PARTY_CONNECT_ORIGINS`. `tests/unit/csp.test.ts`: the real list gives today's exact two policies; a sample list's origins land in the standard policy's `script-src` and `connect-src` exactly, every other directive keeps its fixed sources, and none of the sample origins appears anywhere in the tool policy; with `dev: false` the tool policy's `connect-src` is exactly `'self'`. `tests/e2e/headers.spec.ts` still passes unchanged, which proves the config loads from the built output. Satisfies **AC-13**, **AC-14**.
11. In `eslint.config.mjs`, `zone()` adds `no-console: error` and a `no-restricted-syntax` entry banning `process.stdout` and `process.stderr`, and the one zone that sets `no-console` alone drops its copy. In `tests/unit/engine-wall.test.ts`, `no-console` joins the rules the helper reads, and a `console.log` and a `process.stdout.write` are each rejected in one sample file per zone (`src/engine`, `src/detect`, `src/worker/engine.worker.ts`, `src/worker/client.ts`, `src/ui`, `src/app/tool/page.tsx`, and the wall zone that covers the rest of `src`). Satisfies **AC-15**.
12. The cookie check in `tests/e2e/privacy.spec.ts`: reusing its full run helper, a run on `/tool`, then `/`, `/privacy` and `/terms`; every response read with `headersArray()` (which keeps repeated headers) carries no `set-cookie`, and `context.cookies()` is empty at the end. Satisfies **AC-11**.

**Slice 3: the amends and your review**
13. Amend, each with an `**Updated**` line naming spec 0011: spec 0001 (the standard regime's outside origins now come from `OUTSIDE_SERVICES` through `src/config/csp.ts`; the tool regime is unchanged); spec 0003 (AC-14: the footer carries the Legal nav before spec 0009's notice; `Prose` joins the primitives; no new colour pairing); spec 0007 (the idle step shows the terms notice under the drop zone); spec 0009 (the Follow-up on reusing `src/lib/legal.ts` for the holder is met; AC-1's notice is unchanged, the nav sits before it, the footer link class moved to `src/app/footer-link.ts`, and `shell.spec.ts`'s `footer.locator("p")` check stays valid because the nav holds no `p`). Satisfies **AC-4**, **AC-5**, **AC-13**.
14. You read every word of both pages and the notice before merge, and correct the first change entry's date if the merge slips. Satisfies **AC-6**, **AC-7**, **AC-9**, **AC-10**.

**Launch readiness** (your steps, for the new Release 2 scope feature; none is a build task here):
1. Buy the domain, set `LEGAL.contactEmail` to the real address, and check that it receives mail (AC-16's gate lifts).
2. Ask a lawyer whether you need EU and UK representatives under Article 27. Record the answer in `LEGAL.representatives`, with names, postal addresses and emails if appointed (AC-17's gate lifts).
3. Ask a Pakistani lawyer whether section 32 of the Prevention of Electronic Crimes Act 2016 makes RedactNest a "service provider" that must keep traffic data for a year. If it does, claim C10 and the "we keep no copy" line change and a store is needed, so route back through `/architect`.
4. Have a lawyer review both pages in full: Pakistani law and courts against UK and EU consumers and businesses (and name a city), the liability cap, the line under the drop zone as a way to agree, and anything else a controller outside the UK and the EU owes, such as the ICO's data protection fee. Deferred, with step 3, until RedactNest has 100+ users, on a tech lawyer's advice (2026-10-03); feature 10 may take money before then (spec 0012).
5. Vercel: production on Pro. Observability Plus, log drains, Web Analytics, Speed Insights and the firewall's challenge modes off (INV-9).
6. Ask Vercel in writing whether a deployment's request logs are processed for you (as your processor) or as Vercel's own service generated data, and correct the Vercel entry's `ownUse` if needed.
7. Fold every change entry made before launch into one `First published.` entry dated launch day.

## Consequences

**Positive**:
- The never stored claim becomes testable: every sentence about data in the policy points at a test or a gate, and `/check verify` can walk the register.
- One list names every outside service, and the standard policy cannot admit an origin the policy does not name. `/tool` stays sealed whatever that list holds.
- Neither page can go live on a placeholder address or an undecided Article 27 question.
- No new dependency, no new environment variable you set, and two pages with no script of their own.

**Negative / tradeoffs**:
- From the merge until Launch readiness steps 1 and 2 are done, every Vercel production deploy from `main` fails, so the live site stays on its last good deploy, including for urgent fixes. Previews still deploy, and a rollback or promote of an earlier build is unaffected because it does not rebuild. With no successful production deploy, spec 0009's `tag-deploy` workflow writes no tags in that time.
- The words are drafted, not legally cleared. Three questions (Article 27, PECA section 32, Pakistani law against UK and EU consumers) could change what the pages must say, and section 32 could even require a store this product has none of.
- Three claims rest on Vercel's settings and Vercel's word, outside the code: no cookie at the host (C6), the one day (C10), and Vercel's role. Only Launch readiness and INV-9 hold them.
- Long legal prose lives in TSX, so every wording change is a code change plus a change entry, by hand.
- `next.config.ts` now imports from `src/config` by relative path, a new trap: the `@/` alias or an environment read in those three files breaks the config load (INV-8).
- A notice line under the drop zone is weaker than a tick box, and its enforceability is untested until a lawyer looks.
- No audit log, deliberately: this feature changes no data and holds no personal data of its own. Spec 0001's position stands, and feature 10 owns audit logging for billing.

**Neutral**:
- `src/lib/legal.ts` grows from the licence notice's words into every operator fact. `ConfigError` gets its own file.
- Specs 0001, 0003, 0007 and 0009 are amended (task 13).
- The workflow tier rises from Prototype to Alpha.

## Follow-up

- [x] Enroll **Launch readiness** as a Release 2 scope feature, seeded with the seven steps above. Enrolled as feature 21.
- [ ] Feature 10 owes: accounts and payments sections in the privacy policy (Clerk, and Polar as merchant of record), its strictly necessary cookies (AC-11 then changes, deliberately), entries in `OUTSIDE_SERVICES` for any origin it adds, a subscriptions section in the terms, a tick box at checkout, and change entries on both pages.
- [ ] Feature 11 owes: its counts only telemetry as new claims, its service in `OUTSIDE_SERVICES`, and a deliberate, narrow lift of the console ban for its one reporter, in the same change as the policy update.
- [ ] Feature 16 (security page) can link to the privacy policy and reuse the claims register rather than restating it. Feature 17 (DPA) lists the same `OUTSIDE_SERVICES`.
- [x] ~~If you take the Artifex commercial licence and keep the repository private, revisit the terms' software licence section and the footer's licence notice together.~~ _Closed 2026-10-03: spec 0001 decided on 2026-10-02 to stay on the AGPL 3.0 and publish the source, so both stand as written._
- [ ] `/sync`: add to root `AGENTS.md`: `OUTSIDE_SERVICES` is the one list of outside services, it feeds the standard policy only and never `/tool`'s, and the privacy policy renders it; `next.config.ts` loads `src/config/privacy.ts`, `csp.ts` and `error.ts`, so they use relative imports and read no environment; `console`, `process.stdout` and `process.stderr` are banned in every zone; a Vercel production deploy fails on a contact address on a `.invalid` host (the placeholder in any letter case among them) or a pending Article 27 decision, so never set `VERCEL` in Playwright's build environment; a change to either page adds an entry in `src/lib/policy-changes.ts`, and its h2 headings live in `src/lib/policy-sections.ts`.

## Rationale

Reasoning, options, research findings and references: see [rationale.md](rationale.md).
