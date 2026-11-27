# Brief: marketing fixes (from the marketing chat, 2026-11-28)

Checked by the dev chat against `main` 9f61229 on 2026-11-28. Two lines changed from the marketing chat's draft:
- "teams" → "firms" / "departments" / "businesses": `tests/unit/home-text.test.ts` (spec 0013 INV-1) bans `teams?|customers?|trusted|testimonials?|history` in the home words, so the page never implies a user base. The list stays as it is.
- "You need an account only to buy Pro" → "only for Pro": an account is needed to use Pro, not only to buy it.

Small row. Words, one static text route and one data block. No change to src/engine, src/worker, the CSPs or /tool. Every new line on a page that describes RedactNest follows "Writing pages that describe the engine" and passes tests/support/claim-phrases.ts (both lists) and the home page's tests (INV-1, the AC-30 idea counts); if a test catches a line, stop and ask the owner for a rewording, never loosen a list. Detector names, caps, term count and price come from detectors.ts, config and plans.ts, never typed by hand. Anything about Pro shows only with billing on (Previews have billing off).

## 1. Home title
- The home page's own title, absolute, so the root default other pages fall back to stays "RedactNest":
  "PDF redaction that removes the text · RedactNest" (48 characters).
- Meta description: no change (siteLine is in the claim register).

## 2. /llms.txt
- A static text route (text/plain; charset=utf-8), built from code like the sitemap, so it can't drift. Not added to the sitemap. Both banned phrase lists run over its text in a test.
- Text ({…} from code; the Pro bullet and the Pro plan line only with billing on):

```
# RedactNest

> PDF redaction in your browser. The PDF is processed in the tab and never uploaded. You tick what to remove; the selectable text you tick is taken out of the page, then marked, and every new file is checked before you can download it. If the check fails, you get no file.

RedactNest is for small businesses that share documents with personal details in them, such as recruitment agencies, HR departments, law firms, insurance brokers and bookkeepers. It is open source under the GNU AGPL 3.0 or later.

## What it does and doesn't do

- It looks for {lookedFor("conjunction")}, and lists each item for you to tick. A tick at the start is only a suggestion.
- It does not look for names or postal addresses by itself. With Pro you can add up to {maxCustomTerms} of your own names, numbers or phrases, and RedactNest looks for them too.
- Words that exist only as a picture, such as in a scan with no selectable text, are not read, so they can stay in the new file.
- It can miss values. Review the whole document before you share it: {siteUrl}/security#what-it-can-miss

## Plans

- Free: up to {freePageCap} pages per document, no account needed.
- Pro: {PRO_PLAN.priceLine}, up to {maxPages} pages per document and up to {maxCustomTerms} custom terms. Payments are handled by Polar, the merchant of record.

## Pages

- [Security]({siteUrl}/security): how the processing, the removal and the check work, what it strips, what it can miss and when it stops
- [Redact a PDF]({siteUrl}/tool): the tool
- [Pricing]({siteUrl}/pricing)
- [Redact a PDF without uploading it]({siteUrl}/redact-pdf)
- [Take text out of a PDF, not just cover it]({siteUrl}/remove-text-from-pdf)
- [A black box over text isn't redaction]({siteUrl}/black-box-redaction)
- [Privacy policy]({siteUrl}/privacy)
- [Terms of service]({siteUrl}/terms)

## Optional

- [Source code]({the footer's source link}): the source of the version running
```

## 3. JSON-LD on home
- Into the existing application/ld+json element as one @graph with today's WebSite, so the page still adds one script element. The Pro offer only with billing on. No aggregateRating, no review, no counts. Add a numeric amount and currency to PRO_PLAN rather than parsing "$19". Description is siteLine.

```
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": "{siteUrl}/#website", "name": "RedactNest", "url": "{siteUrl}/" },
    {
      "@type": "SoftwareApplication",
      "@id": "{siteUrl}/#app",
      "name": "RedactNest",
      "url": "{siteUrl}/",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web browser",
      "description": "{siteLine}",
      "license": "https://www.gnu.org/licenses/agpl-3.0.html",
      "offers": [
        { "@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD",
          "description": "Up to {freePageCap} pages per document", "url": "{siteUrl}/tool" },
        { "@type": "Offer", "name": "Pro", "price": "19", "priceCurrency": "USD",
          "description": "Up to {maxPages} pages per document, plus up to {maxCustomTerms} custom terms",
          "url": "{siteUrl}/pricing",
          "priceSpecification": { "@type": "UnitPriceSpecification", "price": "19",
            "priceCurrency": "USD", "billingDuration": "P1M", "unitCode": "MON" } }
      ]
    }
  ]
}
```

## 4. Who it's for (home)
- A new section right after the trust strip, before How it works. Four cards, title and one line each, in the How it works card style. The "With Pro" sentences only with billing on. Each line says "can", because a scanned CV or letter isn't read.
- Eyebrow: Who it's for
- Title: For small firms that share documents with personal details in them
- Recruitment agencies: You can take a candidate's email address and phone number off a CV before it goes to a client. With Pro, add their name as a custom term for a blind CV.
- HR departments: You can clear phone numbers, dates and National Insurance or Social Security numbers from letters and records before you share them.
- Law firms: You can take email addresses, phone numbers and dates out of copies you send on. With Pro, add the names and case numbers that matter.
- Bookkeepers and brokers: You can clear card numbers and bank account numbers (IBAN) from statements and claim papers.
- Line under the cards, linking "what it can miss" to /security#what-it-can-miss: It doesn't look for names or postal addresses by itself, and words in a scan or a picture are not read. See what it can miss.

## 5. Differentiators
- Trust strip: keep its four items. Make "Open source (AGPL), so you can check it" a link to /security#check-it.
- Move the network band ("Don't take our word for it") up to straight after the black box section, ahead of "What RedactNest looks for and strips".
- Honest limits: carried by the last line of the "Who it's for" section (item 4). The questions stay as they are.

## 6. /pricing questions
- Below the billing notes, in the home page's questions pattern (disclosures, first open). Caps from config. Never suggest splitting a file (the free cap's message leaves that out on purpose, and the Terms say don't get around the limits). "Terms of service" links to /terms.
- Can I cancel any time? / Yes. Cancel in Manage billing, on your Account page. Pro then lasts to the end of the month you've paid for.
- Do you give refunds? / We don't refund part months. Your legal rights stay, including any right to withdraw from the purchase. The Terms of service have the details.
- What if my PDF has more than {freePageCap} pages on Free? / RedactNest tells you when you open it, and makes no file. Pro handles up to {maxPages} pages per document.
- Do I need an account for Free? / No. You need an account only for Pro.

## 7. One wording fix on the Pro card (src/app/pricing-cards.tsx)
- "Custom terms: up to 50 names, numbers or phrases, found wherever they appear" promises more than the code (a term in a scan, or split across lines, can be missed). Replace with: "Custom terms: up to {maxCustomTerms} of your own names, numbers or phrases for RedactNest to look for".
- Owed outside the code after the deploy: the Polar product description carries the same "found wherever they appear" line; the owner changes it to match.

## Checks
The home idea counts still pass (upload, "in your browser", not covered, checked before download, each only in its named places) and INV-1 holds; the reflow tests at 320/305 and at 1024 with 200% text cover the new home section and the pricing questions; the page walk covers changed lines only.
