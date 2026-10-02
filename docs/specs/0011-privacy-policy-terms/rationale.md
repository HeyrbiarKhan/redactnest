# 0011. Privacy policy and terms of use: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: these pages can be built and made accurate now, but not legally cleared. Three questions only a lawyer can answer could change what they must say: whether you need EU and UK representatives (Article 27), whether Pakistan's traffic data rule (PECA 2016, section 32) reaches this operator, and how far Pakistani law and courts hold against UK and EU customers. Section 32 is the sharpest: if it applies, "we keep no copy" stops being true and the product needs a store it was designed never to have. So the right framing is "drafted, accurate to the code, and unable to launch until the open facts are settled", which is what the two production gates and the Launch readiness steps do. Feature 10 must not take money before the lawyer review.

Scope feature 9 says the privacy policy "is where the never stored claim stops being marketing copy and becomes something you are held to". The product's whole pitch is a privacy claim, and specs 0001 and 0002 already enforce it with a content security policy, lint rules and browser tests. A policy written as free prose would sit outside all of that: true on the day it ships, then quietly false the day feature 10 adds a cookie or feature 11 adds a reporter.

The operator is an individual in Pakistan, trading as RedactNest, selling mostly to small businesses in the UK and the EU. **Compliance scope**: UK GDPR and EU GDPR reach a controller outside both when it offers services to people there (Article 3(2)), so the policy has to meet Article 13's list, including the parts a controller outside the EU and the UK tends to miss (a representative, the supervisory authority, transfer safeguards, retention). Pakistan has no general data protection act in force; its Prevention of Electronic Crimes Act 2016 has a traffic data retention rule whose reach is unclear.

The facts the policy must state are mostly true by construction, with one exception: the host. Vercel records every visitor's IP address in its request logs by default, keeps them for a period set by the plan, and treats some service data as its own. Those are settings outside the code. Two values only you can supply, the real contact address (no domain bought yet) and the Article 27 decision, must not be guessed and must not ship as placeholders.

A visitor never signs in, so there is no moment to collect agreement to the terms except the act of choosing a file. The repository may stay private if you take an Artifex commercial licence, so the pages cannot lean on its history.

## Options considered

### Option 1: Hand written pages, facts as data, claims held by tests and gates

Write both pages in the app. Operator facts, change lists and outside services live in typed modules; the policy states only claims a named test or gate holds; the services list also builds the standard content security policy; production deploys fail on unfinished launch facts.

**Pros**: every data claim fails a build when it stops being true; one list for outside services; no new dependency or script; the pages say exactly what this product does.
**Cons**: the most build work of the four; legal prose in TSX; two claims still rest on Vercel's settings; production deploys stop until launch facts are in.

### Option 2: A hosted policy generator (Termly, iubenda, TermsFeed)

Answer a questionnaire, embed or link the generated policy and terms.

**Pros**: fastest; the vendor tracks legal changes; familiar to buyers.
**Cons**: generic text cannot make this product's specific claims, which are its selling point; embeds load a third party script (blocked on `/tool`, and a new outside service everywhere else); the vendor's own tracking becomes something the policy must disclose; a subscription cost.

### Option 3: Markdown or MDX content files under a shared layout

Keep each page as a Markdown file rendered by one legal page layout.

**Pros**: prose is easier to edit than JSX; a lawyer's redline maps onto it cleanly.
**Cons**: a new dependency and build configuration for two pages; values like the contact address or the services list need a templating step or an MDX import anyway; Turbopack and MDX are one more combination to keep working.

### Option 4: Static pages, prose only, accuracy by review

Write both pages as plain JSX and rely on an `AGENTS.md` rule that any change to what is collected updates the policy.

**Pros**: the least work; nothing new to maintain.
**Cons**: nothing fails when someone forgets; the scope's own framing ("something you are held to") is not met; the placeholder address could ship.

## Rationale

Option 1, because the force that shapes this feature is that the policy is the product's main claim written down. Specs 0001 and 0002 already made "your document never leaves your machine" something the browser and the test suite enforce. Option 4 would put the one public statement of that claim outside the enforcement, and Option 2 would replace it with text that cannot say it. The cost of Option 1 is real but bounded: a services list and a policy builder that are already half there in `next.config.ts`, two gate checks shaped like spec 0009's source link rule, and one cookie test. Option 3's only gain is editing comfort, and it brings a dependency for two pages.

The gates follow from two values you do not have yet. A literal "fail every production build" would turn CI red, because Playwright builds in production mode, so the gate keys on Vercel's `VERCEL_ENV`, which is `production` only for the deploy that goes public. You accepted the cost that production deploys from `main` stop until launch.

The `/tool` guard is your addition: as the services list grows with features 10 and 11, the risk is that someone wires it into the tool route's policy for convenience. Building the tool policy from a function that never reads the list, and testing it with sample origins, makes that a failing test rather than a code review catch.

## Research findings

A cheap web research pass on 2026-10-02 (full notes in `docs/.agent-cache/research/privacy-terms.md`). Confidence as reported, with my reading.

**Pakistan.** The Personal Data Protection Bill (2023 draft) is not enacted. PECA 2016 applies. Its section 32 requires a "service provider" to keep "specified traffic data" for at least a year. The definition of service provider is broad (anyone providing services "in relation to electronic communication through an information system", or processing or storing data on behalf of such a service or its users). Whether a stateless website operator falls inside it is unclear. The statute's text was located but not parsed, so this rests on summaries: medium confidence. **Needs a Pakistani lawyer.**

**Article 27 (EU and UK).** A controller outside the EU or the UK that offers services there needs a representative unless its processing is occasional, involves no large scale special category or criminal data, and is unlikely to risk people's rights. All three must hold. The EDPB reads "occasional" narrowly (not regular, outside the normal course of business). The host logs every visit, so the exemption is doubtful. The research put it more firmly than its sources (the EDPB guidelines were located, not read in full), so treat it as likely, not settled. Representative services exist; no price was confirmed. **Needs a lawyer.**

**Vercel.** Runtime logs are kept 1 hour on Hobby, 1 day on Pro, 3 days on Enterprise, and 30 days with Observability Plus. Request, firewall and static asset logs follow the same periods and record the client IP address and user agent by default. Vercel processes data in the US and elsewhere, under the EU and US Data Privacy Framework and standard contractual clauses. Its DPA covers customer personal data as a processor, but treats "service generated data" (logs, metrics) as Vercel's own, and does not say plainly which side deployment request logs fall on: medium confidence, so it is Launch readiness step 6. Hobby forbids commercial use.

**Choice of law.** Under Rome I Article 6, and the UK's retained version, a consumer keeps the mandatory protections of their own country whatever law the contract chooses, so Pakistani law cannot strip a UK or EU consumer of them. For business customers the choice may hold. **Needs a lawyer**, who should also name a city for the courts.

**Article 13, easy to miss from outside the EU and the UK.** Name the representative if appointed; name the supervisory authority (the ICO, and each EU country's own); explain transfer safeguards rather than just naming them; state a retention period or the criteria for one.

## References

**Project sources**:
- `AGENTS.md`: the non negotiables (no document leaves the browser, no storage, counts only logs), the two policy regimes, "every public URL comes from `src/config`"
- Spec 0001: the content security policy regimes and the entitlement route
- Spec 0002: INV-3, INV-4, INV-6, AC-3, the claims C1 to C5 rest on
- Spec 0003: AC-20, same origin fonts; the footer and primitives
- Spec 0007: the leave warning and the idle step's layout
- Spec 0009: `src/lib/legal.ts`, the footer notice, the Vercel variable rules, and its Follow-up on reusing the holder
- `tests/e2e/privacy.spec.ts`, `tests/e2e/headers.spec.ts`, `tests/unit/engine-wall.test.ts`: the tests the claims register names

**Practices & standards**:
- GDPR and UK GDPR Articles 3(2), 6(1)(f), 13 and 27; EDPB Guidelines 3/2018 on territorial scope
- Rome I Regulation Article 6 (consumer contracts), and the UK's retained equivalent
- Pakistan's Prevention of Electronic Crimes Act 2016, sections 2 and 32 (text located, not parsed; no link)
- RFC 2606: the reserved `.invalid` top level domain
- Fail closed configuration, as spec 0009's source link rule

**Links** (web verified on 2026-10-02):
- GDPR Article 13: https://gdpr-info.eu/art-13-gdpr/
- GDPR Article 27: https://gdpr-info.eu/art-27-gdpr/
- EDPB Guidelines 3/2018 on territorial scope (located, not read in full): https://edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf
- Vercel privacy notice (its final address; `/legal/privacy` redirects here): https://vercel.com/legal/privacy-notice
- Vercel terms of service: https://vercel.com/legal/terms
- Vercel data processing addendum: https://vercel.com/legal/dpa
- Vercel runtime logs (retention by plan): https://vercel.com/docs/logs/runtime
- Vercel log drains reference (fields, client IP): https://vercel.com/docs/drains/reference/logs
- Vercel deployment retention: https://vercel.com/docs/deployment-retention
- The ICO's complaints page and the EDPB's list of member authorities: none verified; `/develop` confirms both addresses when it writes `COMPLAINT_AUTHORITIES`
