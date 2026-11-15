# 0019. A typed allowlist below the pages: rationale

## Context

Spec 0004 rebuilds every output from the redacted pages: allowlists at the catalog and each page (`CATALOG_KEYS`, `PAGE_KEYS`), a sweep of six known carrier keys from every dictionary (`CARRIER_KEYS`), and a `sanitize` write that keeps only the resources each page's drawing instructions use. Below the catalog and the pages, though, the rebuild is a subtraction: MuPDF's page graft copies every object a kept object refers to, and the sweep removes only what someone listed. Anything else a font, an image or a form XObject points to rides along, and `structureIsClean` does not look for it.

Feature 16's sixth, seventh and eighth verifies (2026-11-15) measured the family on committed fixtures, each with a key added in memory and every run passing the self check. pdfTeX's `/PTEX.InfoDict` and `/PTEX.FileName` stayed on a figure and on a picture. An embedded file reached through a form XObject's `/Ref` or `/OPI`, or an image's `/OPI`, stayed whole, unreported. And a private key on a font, pointing at an object, kept that object and everything below it: the original of a redacted figure still holding a ticked `SECRET-42` (spec 0004, AC-4), the unblanked original of a blanked picture, a page's annotations with a note's text and an attached file reported as stripped, and the catalog's page labels, viewer preferences, opening action and structure tree (AC-7). MuPDF redacts a figure or picture into a new copy, which the page draws; the original stays whenever something else points to it. That is a ticked value leaving in the file, not a gap that fails safe.

The forces: the rule has to hold for keys nobody has listed yet, since producers write their own (one general rule, not one key at a time); it must fail closed, refusing where it cannot decide rather than keeping data; it must never remove less than main from what a page draws; it must cost little on the dense fixtures; and spec 0001 keeps MuPDF the only parser, while MuPDF.js 1.28.1 offers no way to see or rewrite marked content inside a page's drawing instructions. The home page, `/tool` and the security page make claims that rest on this, each held to spec 0018's AC-5 rule.

## Options considered

### Option 1: Typed allowlist, pruning the grafted document

MuPDF keeps grafting the pages. A walk from the catalog gives each object a role from the key that reached it and deletes every key the role's list lacks; the write's garbage collection drops what nothing reaches. The self check walks the written bytes with the same table and adds reachability, embedded files anywhere and resource use.

**Pros**:
- Holds for keys nobody listed: anything off a role's list goes.
- Reuses MuPDF's graft (inheritance, stream copying, shared objects), so little new code.
- Measured clean: every recipe closed, every fixture pixel identical, cost under the timer's resolution.

**Cons**:
- A role table to keep in step with the PDF format; a drawing key it lacks is deleted.
- Relies on the write's garbage collection to drop the unreferenced objects, so the check must hold reachability itself.

### Option 2: Typed graft, copying only allowlisted keys

Replace `graftPage` with our own copier that walks the working copy by role and writes only allowlisted keys into the new document, so nothing unchosen is ever copied.

**Pros**:
- Nothing outside the lists ever enters the new document, even for a moment.
- No reliance on garbage collection.

**Cons**:
- Reimplements page attribute inheritance, stream copying (raw and filtered) and shared object mapping, which MuPDF's graft does today and has been measured to do.
- More engine code on the path every run takes, for the same result the check already proves on the bytes.

### Option 3: Refuse any file carrying a key off the lists

Keep today's rebuild and add the role walk as a gate only: any off list key anywhere refuses the file.

**Pros**:
- Nothing is ever deleted, so nothing drawn can change.

**Cons**:
- pdfTeX writes `/PTEX.*` on every included figure, and producers add private keys freely, so a large share of real files would be refused.

### Option 4: Widen `CARRIER_KEYS`

Add `/Ref`, `/OPI`, `/Alternates`, `/PTEX.*` and the rest to the sweep.

**Pros**:
- The smallest change.

**Cons**:
- Fails on the next key nobody listed; spec 0004's INV-3 forbids subtracting known keys, and the eighth verify's pointer was a private key, which no list can name.

## Rationale

Option 1 is the general rule the forces ask for. An allowlist per role holds for keys that do not exist yet, which only an allowlist can (option 4 cannot by construction), and deleting rather than refusing keeps pdfTeX figures and ordinary private data working (option 3 would refuse them). Keeping MuPDF's graft avoids rewriting copy logic that is already measured (option 2), and the self check makes option 1's one weak point, garbage collection, into a check: an object the walk does not reach fails the file.

Failing closed decides the edges: an off list key is deleted (the table decides it is not needed to draw), while a listed key whose value the table cannot read, or an object reached in two roles, refuses with `unsupported`, at open, so the visitor never reviews a file no run can finish. Strings are the sharpest carrier of words, so only the four places drawing or the character check needs one keep a string. The check's resource use, through the read only scan, turns "only what each page draws" from a measured MuPDF behaviour into a gate, so AC-4 holds even if a MuPDF upgrade stops pruning, and the security page can state it as an absolute.

Inline marked content descriptions are the one hole an object walk cannot reach, and MuPDF.js offers no way in. The owner chose a warning over a silent limit, through a narrow scan. That scan breaks the letter of spec 0001's one parser rule but not its reason: the rule exists because "two libraries disagreeing about page geometry" would let removal go wrong, and the scan computes no geometry, removes nothing and only adds a warning or a refusal. Its faults lean safe by construction (any doubt warns at open and fails the check), so spec 0019 amends spec 0001 with one named exception rather than leaving the limit silent. Picture metadata is a separate family (stream data, never a pointer, never a ticked value), with its own risks (a JPEG marker reader, a proof that decoding is unchanged, AC-29), so it is split into its own feature and the home page drops XMP from its list until then.

## Evidence

All measured 2026-11-15 on MuPDF 1.28.1, from scratch tests run through the real engine (`redactDocumentWith`, `prepareDocument`), using only `tests/fixtures` and documents built in the test. The prototype allowlist was swapped in through the existing `Pipeline.sweepCarriers` seam.

### The recipes, main against the prototype

Each recipe adds keys in memory as feature 31's row describes, saves, and runs. "Kept" means the needle is in the output's decompressed bytes (streams read through the indirect reference, since a resolved stream's `isStream()` is false in MuPDF.js).

| Recipe | Main | Prototype |
|---|---|---|
| (1) `form-xobject.pdf`, `SECRET-42` ticked, a font key at the form | passed the check, kept `SECRET-42` | passed, kept nothing |
| (1) control, no pointer | kept nothing | kept nothing |
| (2) `images-under.pdf`, both ticked, a font key at the mask | passed, the original mask byte for byte | passed, no original |
| (3) `metadata.pdf`, a font key at `/Annots` | passed, kept the note's text and the attached file, reported both stripped | passed, kept nothing |
| (4) catalog extras through a font key | kept all four strings | kept nothing |
| (5) pdfTeX keys on the form, and on the mask | kept author, title, path | kept nothing |
| (6) an embedded file through `/Ref`, the form's `/OPI`, the mask's `/OPI` | kept each, unreported | kept nothing |

### Every fixture, nothing ticked

- Every page of every fixture's output renders pixel identical with the prototype and without it.
- The prototype dropped three kinds of key across all fixtures: `/ActualText` on `actual-text.pdf`'s named property list (whose text equals its glyphs, so the check still passed; the final table keeps `/ActualText` for that reason, as spec 0004 records), and `/Type` and `/Name` on the layer fixtures' groups, which the open refuses anyway.
- No value had a shape the table could not read, and the walk over every output reached every object, with none left over.
- Every output's trailer holds only `/Size` and `/Root` (`metadata.pdf`, `form-xobject.pdf`, `carlito.pdf`, `owner-aes256.pdf` read).

### Inline marked content

- `sanitize` keeps an inline property list whole, any key, with nothing ticked and with the text inside it ticked: `/Span << /Alt (...) /E (...) >> BDC` and `/Tag << /RNNote (...) /MCID 3 >> BDC` both left in the output. A named property list's `/Alt` and `/E` went with the prototype.
- `sanitize` drops comments in drawing instructions, rewrites an inline image's dictionary with only its own keys (a private key on it went), and drops an empty marked content sequence.
- MuPDF.js 1.28.1's device has no marked content or metatext callback, no content filter is exposed, and structured text shows neither `/Alt` nor `/E` under any option tried (`collect-structure` is not accepted).

### The read only scan

- On every committed fixture's prepared review copy, no page warned, `actual-text.pdf`'s inline `/ActualText` spans included.
- Probes: inline `/Alt` and `/E` warn; `/ActualText` only, `/MCID` only and names only stay quiet; `/Lang (en-GB)` warns under a rule that counts every string, which is why AC-9 lets a language tag through; a `DP` with a private string warns; a text string holding `BDC` like bytes stays quiet; a span after an inline image whose data holds a false `EI` is found; an unbalanced string warns as unsure; a span inside a form XObject warns.
- Cost: 50 dense pages with 3,000 tagged lines (21,000 operators) scan in 13 ms.

### Resource use

- Every one of the 74 fixture outputs that runs names no unused resource; 70 of the sources do (mostly an unused second font), so the scan finds unused names and `sanitize` prunes them.
- `sanitize` prunes unused entries from a tiling pattern's resources, a Type 3 font's resources, a nested form's resources and `/Properties`, and drops an extra page name pointing at a ticked figure's original.

### What the cross check changed (2026-11-15)

A read only cross check on another model found fourteen decision gaps and some soundness points; the owner took every recommended fix. Three were measured first:
- **`/ActualText`.** Its claim that MuPDF's extraction ignores replacement text was wrong: a ticked line wrapped in `/ActualText` left no trace in the output, as spec 0004's two way comparison expects. The measurement found a real variant instead: an `/ActualText` wrapping only a filled shape is invisible to extraction in both modes and survives `sanitize`, so its string escaped the check and the first draft's warning. An empty sequence (`BDC EMC` with nothing inside) is dropped by `sanitize`. Hence AC-9's rule: `/ActualText` is exempt only where its sequence draws text, inline or named.
- **Merging.** After the prune, an emptied property list and an emptied graphics state were written as one shared `<<>>` object, so a check refusing any object in two roles would fail a clean file. Hence "satisfy every role" in AC-3 and AC-5.
- **Many objects.** One page drawing 2,000 form XObjects: 797 ms of CPU on main, 608 ms with the prune, 47 ms for one read walk of the output. With 10,000: 10,094 ms on main, 10,234 ms with the prune, 250 ms for one walk, so three walks are about 7% of the run. Hence AC-11's second budget, 15%.

The other fixes write down what the build would otherwise invent: the open walks pages, not the tree; kind labels for indirect arrays and values; strings by place; the decode parameters; nulls; a work list; resource owners; the scan's token, string and inline image rules; `unsupported` for an output stream the scan cannot read, with the warning reworded to "may have"; a new error kind, `unreadable-structure`, so the refusal is counted apart from other refusals; an unknown pattern type deleted like an unknown XObject; and keys, not entries, in the security page's claims, since names on listed keys are kept as written.

Two of its points were not taken: refusing only on malformed entries a page uses (which would let the scan change what the rebuild keeps, against INV-4), and dropping the resource use check (the owner chose it; no committed fixture fails it).

### Cost of the walk

On a 50 page text heavy document (60 lines a page), the least of three runs: 1,312 ms of CPU on main and 1,156 ms with the prototype, nothing ticked; 1,687 ms and 1,765 ms with one address ticked a page. The difference is noise. The walk alone, reopening the output and scanning for unreached objects, measured under the timer's 16 ms resolution. `terms-dense.pdf` and `detect-dense.pdf` behaved the same.

### The page lines held to spec 0018's AC-5 (2026-11-15)

Read before task 12 was built, three lines AC-12 and AC-14 gave would have failed spec 0018's AC-5 once written. Each now holds in every case it covers, states a limit by kind, or rests its absolute on a gate every file passes or a step that does not exist:
- **The lead.** "RedactNest finds" the kinds, with no "can", claimed every value is found, while a value can be missed (spec 0018, AC-5's own example). It now "looks for" them, as the security page's What it finds says it.
- **The "Removed, not covered" card.** "Hidden data such as document info and attachments is stripped" can be read as all hidden data, while descriptions written into a page (AC-9) and a picture's own details (AC-14) can stay. It now names only document info and attachments, each held by the structure check (no `/Info`, no trailer key outside `TRAILER_KEYS`, no embedded file or file specification anywhere), and the Strips card names the rest.
- **The hidden data paragraph.** "It does not report the last four" after a list of six implied the first two, the file's identifier and links, are reported. The identifier never is: `SANITIZED_KINDS` has no kind for it. The paragraph now names the four with no kind (the identifier, page labels, viewer preferences, automatic actions that are not scripts) as stripped and never reported, then links and tags, which are reported, in a sentence of their own. Entries a program adds for its own use leave this paragraph, since the structure item names them and AC-5 says each fact once.
- **The band's heading and its first card's title** (a second pass, the same day). "What RedactNest finds and strips" and "Finds" made the lead's claim as headings, so they now read "What RedactNest looks for and strips" and "Looks for". A sweep of every other "finds" and "found" on the home page kept the rest: the first card's subtitle says "can", and the product shot's alt text describes the one picture it labels.
