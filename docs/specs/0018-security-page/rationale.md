# 0018. Security page: rationale

## Context

The security page is the page that closes the sale for HR, legal and healthcare buyers, and its scope row's bar is that it describes the real implementation with no claim the code does not support. It was built first on an assumed spec, whose AC-7 asked it to name every honest limit the earlier specs record. Spec 0004's Follow-up alone lists seventeen, and the detection specs (0005, 0014, 0015, 0017) record dozens of exact misses, each with its own condition.

`/check verify` failed AC-5 twice on 2026-11-14. The first run found seven claims beyond their source (every picture blanked, every footnote mark refusing, every drawing outside removed, warnings that never miss, and more). They were fixed one by one, and the second run found two new failures: an email wrapped after the @ found only in part when the page said whole, and a custom term glued to other text that lists nothing when the page said unticked. It also found eleven smaller wording points and eight source comments that named the wrong item or none. Each fix was an exact claim replaced by another exact claim, and the code has more cases than any page can list, so each run finds new ones.

Two further forces. The page restated facts the privacy policy already holds (C1, C5, C7, C8) and the home page's band (the flattening note), so two pages could drift apart on the same claim. And the assumed spec left the footer link unrecorded in spec 0013, whose AC-8 lists the footer's links exactly.

## Options considered

### Option 1: Keep fixing exact claims, each measured

Keep the page's level of detail and fix each failing claim by measuring the real code, adding a test per exact case.

**Pros**: the most precise page; a buyer sees exactly which phone formats and date forms are read.
**Cons**: a claim under a condition can be broken by any case nobody listed, so every verify can fail again; every detector change can make a line false; the test count grows with each case.

### Option 2: One claim rule with broad limits (chosen)

Every outcome claim holds in every case it covers or says what can happen; limits are stated by kind; the page tells the visitor to look over the document; facts another linkable page states are linked, not repeated; every paragraph names its exact source.

**Pros**: a "can" line cannot be broken by a case the code gets right, so verify checks a rule rather than hunting cases; the page survives detector changes; it reads at a buyer's level.
**Cons**: less precise; the exact cases live only in specs a buyer is unlikely to read; the broad lines lean toward warning more than the product deserves.

### Option 3: Drop the limits, keep only "check the result"

State what RedactNest does, then one line that it can miss things and the visitor must check the result.

**Pros**: shortest, nothing to break.
**Cons**: fails the scope row and the earlier specs that ask this page to name specific limits (the file handle, unreachable not erased, fonts, owner restrictions, the scan and picture limits); a buyer learns nothing about which documents are risky.

## Rationale

Option 2 answers the force that made verify fail twice: the claims were exact while the code's cases are open ended. Writing every limit as what can happen moves the risk to the safe side (the page may over warn, never under warn), and limiting absolutes to the gates every file passes keeps the page's strong claims (the check, the content security policy, the refusals) where they are true by construction. Breadth by kind keeps what a buyer needs (split, joined, other formats, scans, fake boxes) and drops what only a tester needs. The fixed fallback for sources keeps limits the specs record only as *Security model* bullets, which a strict AC or INV rule would have cut. Linking rather than restating gives each fact one home, which is the privacy policy's own rule for its claims register.

The two option sets the engineer settled: the rule covers every outcome claim, not only detection; examples are kinds of writing, never quoted values; AC-6 covers any fact on a linkable page; "What it can miss" becomes one short list; the earlier specs' Follow-ups get a note pointing here; a test bans positive outcome wording. The tool's own `off-page-picture` line, which shares a false phrase with the page, is recorded on feature 30 rather than fixed here, so this branch stays on the page and the footer.

## Evidence

- The two verify reports of 2026-11-14 (in the session transcripts, not committed): the first against eebd476, the second against 26d281c, with the scripts that ran `detect` and `findTerms` on the two failing cases.
- `structureIsClean` in `src/engine/self-check.ts` checks the trailer, the catalog's and each page's allowed keys, carrier keys and `/JS` anywhere, one revision and the page count, and never reads fonts or `/ID`, which is why the structure line can claim no more.
