# Privacy & Legal Research: RedactNest Operations

**Cached:** 2026-10-02  
**Budget Used:** 8 searches, 9 page fetches (of 12)  
**Status:** Complete with lawyer flags

---

## 1. Pakistan Data Protection Law (2026 Status)

**Finding:** The Personal Data Protection Bill 2023 has NOT been enacted as of 2026. Pakistan lacks a comprehensive data protection statute.

**Currently Applicable:** Prevention of Electronic Crimes Act 2016 (PECA)

### PECA 2016 Section 32 - Traffic Data Retention

**Requirement:** Service providers must retain "specified traffic data" for a **minimum of one year** (or such longer period as the Authority may notify), subject to a court warrant.

**Service Provider Definition (PECA 2016 Section 2):**
A "service provider" includes any person who:
- (a) acts as a service provider in relation to sending, receiving, storing, processing or distribution of any electronic communication or the provision of other services in relation to electronic communication through an information system;
- (b) owns, possesses, operates, manages or controls a public switched network or provides telecommunication services; or
- (c) processes or stores data on behalf of such electronic communication service or users of such service

**Application to RedactNest:**
The definition is broad. A website operator handling IP addresses and request logs could arguably fall under (a) or (c) as handling "electronic communications" through an information system. This is **ambiguous and needs a Pakistani lawyer** to confirm whether section 32 applies to a stateless web host.

**Sources:**
- Web search: PECA 2016 overview (Stanford, UNODC, SJA Pakistan)
- PECA full text fetched from Pakistan's SJA (could not parse PDF reliably)

---

## 2. GDPR Article 27 & UK GDPR Article 27 Representative Requirement

**Question:** Can RedactNest rely on the "occasional processing" exemption?

**GDPR Article 27(2) Exemption (confirmed from gdpr-info.eu):**
A controller does NOT need an EU representative if processing:
1. Is **"occasional"** (not carried out regularly)
2. Does NOT include large-scale processing of special categories or criminal data
3. Is **"unlikely to result in a risk to the rights and freedoms of natural persons"**

All THREE conditions must be met cumulatively.

**What EDPB Guidelines 3/2018 Say on "Occasional":**
"Occasional" means processing not carried out regularly and outside the regular course of business. The Guidelines emphasize this is a narrow exception; most active business operations fail the test.

**Does Continuous IP Address Logging Count as "Occasional"?**
**Honest answer: NO. Definitely not.** IP address and request logging happens continuously whenever someone visits the site—this is regular, ongoing, and integral to operating a hosted service. This fails the "occasional" test immediately.

**Exemption Safe to Rely On?** 
**Not at all.** This requires a lawyer to assess, but the fact that you're collecting IP addresses continuously almost certainly disqualifies the exemption. You will likely need an **EU representative** and a **UK representative**.

**Cost of Representatives:**
Not quickly found; appears to range from EUR 500–2,000/year for low-risk operations, but no definitive source fetched.

**Sources:**
- EDPB Guidelines 3/2018 URL: https://edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf (PDF parsing failed, but search results confirmed interpretation)
- GDPR Article 27 confirmed at: https://gdpr-info.eu/art-27-gdpr/
- EDPB statement on territorial scope confirmed via web search

---

## 3. Vercel as Host: Data Handling, Retention, and DPA

**What Vercel Collects:**
- IP addresses, location derived from IP, device/browser info, diagnostics
- Usage data, telemetry, logs, traffic data
- AI interaction data (if used)
- Uploaded content (code, files)

**Retention Period:**
**No specific retention timeframe is published.** Vercel's Privacy Policy states data is retained for "the minimum necessary period to fulfill legal and contractual obligations," then deleted or anonymized. The Terms of Service note that "general practices and limits" may be established but do not specify a timeframe for either Hobby or Pro plans.

**Data Processing Locations:**
US and "other jurisdictions in which we operate" — primarily US.

**Transfer Mechanism:**
Vercel uses **both**:
1. **EU-US Data Privacy Framework** (Vercel is certified)
2. **Standard Contractual Clauses** (for additional protection)

**DPA Applicability:**
Vercel's Data Processing Addendum (https://vercel.com/legal/dpa) applies automatically to customers processing personal data subject to GDPR/UK GDPR/CCPA. RedactNest should assume it applies.

**Hobby Plan Commercial Restriction:**
YES. Vercel's Hobby plan explicitly forbids commercial use. RedactNest must use Pro (or Enterprise) if monetizing. Vercel defines commercial as "any deployment used for the financial gain of anyone involved in producing it."

**Sources:**
- Vercel Terms of Service: https://vercel.com/legal/terms (fetched, confirmed)
- Vercel Privacy Policy: https://vercel.com/legal/privacy (fetched, confirmed)
- Vercel DPA: https://vercel.com/legal/dpa (linked, not fetched)
- Web search on commercial use restriction confirmed from multiple sources

---

## 4. Choice of Law: Pakistan Law & Courts vs. UK/EU Consumers

**Rome I Regulation Article 6(2) (Confirmed):**
Parties **may** choose governing law in a consumer contract. **However:** that choice cannot deprive the consumer of the protection afforded by mandatory rules of the consumer's **own country** (habitual residence).

**Application to RedactNest:**
- **UK Consumers:** Even if terms choose Pakistani law, UK consumers keep the mandatory protections of UK GDPR, UK Consumer Rights Act 2015, and other mandatory UK law. A Pakistani choice of law **will not hold** against UK consumers.
- **EU Consumers:** Same principle applies; EU consumers retain mandatory protections of their member state law (Rome I Article 6(1) + (2), Regulation 593/2008).
- **Business Customers:** For B2B contracts with business customers, the choice of law is generally enforceable, but this is jurisdiction-specific and **needs a lawyer** to confirm for Pakistan as the chosen law.

**Summary:** A Pakistani choice of law choice fails against consumers in the UK and EU but may hold (subject to legal advice) against business customers.

**Sources:**
- Rome I Regulation Article 6 confirmed at: https://gdpr-info.eu (search results)
- Multiple law firm sources cite Rome I Article 6(2) mandatory consumer protection principle

**Lawyer Flag:** YES. Confirm enforceability of Pakistani law choice against Pakistani and non-EU business customers; confirm adequacy of Pakistani courts for dispute resolution.

---

## 5. GDPR Article 13 Privacy Notice Requirements (Easy to Miss)

**Article 13 Full List (Confirmed from gdpr-info.eu):**

Controllers must disclose:
- **Identity** of controller and controller's **representative** (if applicable) with contact details
- Data Protection Officer contact (if applicable)
- Purposes of processing
- Legal basis for processing
- Legitimate interests (if relevant)
- Categories of recipients
- **Details on international data transfers and applicable safeguards** (e.g., SCCs, Data Privacy Framework)
- Retention period or criteria for determining it
- Rights: access, rectification, erasure, restriction, objection, portability
- Right to withdraw consent (if consent is the basis)
- Right to lodge a complaint with a supervisory authority (name of ICO for UK; relevant authority for EU member states)
- Whether providing data is mandatory or voluntary and consequences of non-compliance
- Details on automated decision-making and profiling (if applicable)

**Easy to Miss for Non-EU/UK Controllers:**
- **Naming the representative** (Article 27). If you appoint one, you must name them and provide contact details.
- **Naming the relevant supervisory authority**. For UK consumers, this is the ICO. For EU consumers, it's the authority of their member state. You may need separate notices or a consolidated notice naming both.
- **Data transfer safeguards details.** Simply saying "we use SCCs" is insufficient; you must explain what SCCs are and that they provide protection (Schrems II implications).
- **Retention criteria.** If you cannot state an exact period, you must explain the criteria used (e.g., "for as long as you have an account, plus one year for dispute resolution").

**Sources:**
- GDPR Article 13 full text: https://gdpr-info.eu/art-13-gdpr/ (fetched, confirmed)

---

## Research Gaps & Recommendations

1. **Pakistan PECA Section 32 coverage:** Needs explicit Pakistani legal advice on whether a stateless web operator falls under the "service provider" definition. If yes, one-year traffic data retention may be required.

2. **GDPR Article 27 exemption:** Needs lawyer confirmation that continuous IP logging disqualifies the exemption and triggers representative requirement.

3. **Vercel log retention:** Vercel does not publish specific retention periods. Recommend contacting Vercel support or escalating to legal to obtain a written commitment on retention duration for compliance records.

4. **Choice of law enforceability:** Needs Pakistani legal counsel to confirm whether Pakistani law choice is enforceable in Pakistan courts and whether Pakistani courts will accept jurisdiction over a web operator with no physical presence.

5. **Representative appointment:** If representatives are required, research local law firm or nominee service costs and terms (not completed due to budget constraints).

---

## URLs Confirmed in This Research

1. https://edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf — EDPB Guidelines 3/2018
2. https://gdpr-info.eu/art-27-gdpr/ — GDPR Article 27 text
3. https://gdpr-info.eu/art-13-gdpr/ — GDPR Article 13 text
4. https://vercel.com/legal/terms — Vercel ToS
5. https://vercel.com/legal/privacy — Vercel Privacy Policy
6. https://vercel.com/legal/dpa — Vercel DPA (linked, not fetched)
7. Various search results from Privacy International, DLA Piper, Chambers Practice Guides (not individually fetched)

---

## Confidence Levels

- **Pakistan PECA Section 32 service provider definition:** Medium confidence (statute text located, but PDF parsing failed; interpretation based on search summary and statutory excerpts). **Needs lawyer.**
- **GDPR Article 27 occasional exemption:** High confidence (Article text confirmed, EDPB principle confirmed via search; continuous IP logging clearly not occasional).
- **Vercel data collection & transfer mechanism:** High confidence (Privacy Policy fetched directly).
- **Vercel log retention timeframe:** Low confidence (not specified in public docs; needs direct inquiry).
- **Rome I Article 6 consumer protection:** High confidence (confirmed from multiple legal sources).
- **GDPR Article 13 requirements:** High confidence (full text confirmed).

---

## Gap Fill: Vercel Deployment Logs

**Budget:** 2 searches, 4 fetches (all used)  
**Date:** 2026-10-02

### (1) Runtime Logs Retention Per Plan

| Plan | Retention |
|------|-----------|
| Hobby | 1 hour |
| Pro | 1 day |
| Pro with Observability Plus | 30 days |
| Enterprise | 3 days |
| Enterprise with Observability Plus | 30 days |

**Source:** https://vercel.com/docs/logs/runtime (fetched 2026-10-02, confirmed at page heading "Limits" table, last_updated 2026-08-28)  
**Confidence:** High. Direct from Vercel documentation.

### (2) Visitor IP Address Logging: YES

**Finding:** Vercel deployment logs DO record visitor IP addresses by default.

**Evidence:**
- Log Drains schema includes `proxy.clientIp` field with example `120.75.16.101`
- Runtime Logs page explicitly states: "You can also filter and group your runtime logs based on the relevant fields" and "Each log row shares basic info about the request" including "IP address" (mentioned in relation to grouping by `public_ip`)
- Monitoring docs mention ability to "group by the request's IP address (public_ip)" and toggle "IP Address Visibility setting" off to hide them

**Retention with IP addresses:** Follows same retention schedule as (1) above.

**Sources:**
- https://vercel.com/docs/drains/reference/logs (fetched 2026-10-02, Log Drains Reference, last_updated 2026-09-11, schema table row 25: `proxy.clientIp`)
- https://vercel.com/docs/logs/runtime (fetched 2026-10-02, mentions IP address filtering and public_ip field)  
**Confidence:** High. Schema explicitly lists `proxy.clientIp`.

### (3) Other Logs by Default & Retention

**Vercel produces these log types by default:**

| Log Type | Details | Retention |
|----------|---------|-----------|
| **Runtime logs** | From Vercel Functions invocations (console.log output) | Per plan above |
| **Build logs** | From the build step during deployment | Per deployment retention policy (see below) |
| **Firewall/WAF logs** | Requests denied/allowed by Vercel Firewall rules | Per plan above (runtime logs retention) |
| **Static asset logs** | Requests to static HTML, CSS, JS files served by CDN | Per plan above |
| **Edge function logs** | Output from Vercel Functions using Edge runtime | Per plan above |
| **Proxy/request logs** | Full request data including `proxy.clientIp`, `proxy.userAgent`, `proxy.statusCode`, `proxy.cacheId` | Per plan above |

**Build logs retention is NOT tied to runtime logs retention.** Instead, build logs follow the **Deployment Retention Policy:**
- **Hobby:** Deployments retained 30 days
- **Pro/Enterprise:** Deployments retained up to 1 year (depending on deployment state)

When a deployment is deleted per retention policy, its build logs are typically deleted with it, but Vercel does not publish a specific guarantee on build log retention timing separate from the deployment.

**All logs (runtime, firewall, static, edge, proxy) can record `proxy.clientIp` and other visitor data.**

**Sources:**
- https://vercel.com/docs/logs/runtime (fetched 2026-10-02: describes runtime, build, static, edge logs)
- https://vercel.com/docs/drains/reference/logs (fetched 2026-10-02: full schema with `proxy.clientIp`, firewall source, build source documented; last_updated 2026-09-11)
- https://vercel.com/docs/deployment-retention (fetched 2026-10-02: deployment retention policy; last_updated 2026-09-16)  
**Confidence:** High for log types and IP recording. Medium for build log retention (depends on deployment lifecycle, not explicitly separate).

### (4) Vercel DPA: Processor Status for End-User Data

**Question:** Does Vercel's DPA say Vercel acts as processor for customer end-user data?

**Answer:** YES and NO (clarification needed).

**What the DPA says:**
- **Customer data** (what you upload/build): "Customer acts as a Controller (or Processor) and Vercel is a Processor." Vercel processes per customer's instructions. Vercel's DPA applies to this.
- **Service-Generated Data** (logs, usage metrics, telemetry): Vercel is a **controller**, not a processor. Vercel uses this data "to operate, improve and support the Services, to provide marketing and service-related messages" per its own Privacy Policy.

**Critical distinction:** If Vercel's deployment logs (runtime logs, proxy logs, IP addresses) are classified as "Service-Generated Data" rather than "Customer Data," then Vercel is a **controller** of that data, not a processor. The DPA does NOT apply to those logs as processor terms; instead, Vercel's Privacy Policy terms apply.

**For RedactNest's privacy policy:** You must clarify to visitors whether Vercel's logs (containing IP addresses, User-Agent, status codes, request paths) are processed by Vercel as controller or processor. Most likely: Vercel is the controller of those logs; RedactNest is a data subject's agent accessing those logs. The UK GDPR Article 13 privacy notice must disclose this.

**Source:**
- https://vercel.com/legal/dpa (fetched 2026-10-02, "Customer acts as a Controller (or Processor) and Vercel is a Processor" statement found; distinction between Customer Data and Service-Generated Data noted)  
**Confidence:** Medium. The DPA text confirms Vercel acts as processor for customer data, but the distinction between Customer Data and Service-Generated Data (logs) requires careful legal reading. Recommend confirming with Vercel support or legal whether deployment logs are classified as Service-Generated Data (Vercel is controller) or Customer Data (Vercel is processor under DPA).

---

## Summary for Gap Fill

1. **Runtime log retention is plan-specific:** Hobby 1h, Pro 1d, Enterprise 3d. Observability Plus extends to 30d for Pro/Enterprise.
2. **IP addresses ARE logged** in all deployment logs by default (proxy.clientIp field).
3. **Build logs** follow deployment retention (not runtime log retention): 30d Hobby, up to 1 year Pro/Enterprise depending on deployment state.
4. **Firewall logs, static logs, edge logs** all retain per runtime log plan above.
5. **Vercel's role:** Processor for customer data; controller for Service-Generated Data (likely including deployment logs). **Needs clarification** for privacy notice drafting.



