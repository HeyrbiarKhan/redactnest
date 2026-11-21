# 0021. Rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

Spec 0019 gave every object below the pages a role and a list of keys it may keep, and a structure check that holds those lists on the written bytes. Feature 31's fresh model review ([2026-11-15](../../reviews/2026-11-15-feat-kept-object-leaks.md)) approved it with five minors, none a regression from main and none breaking a page line, so they were left off that branch and carried in feature 30's row, after the glyph rule (spec 0020, merged 2026-11-18). The review's lint nit was already answered: the comment above `noResolve` in `eslint.config.mjs` names the template literal key, the computed key and the destructured `resolve` as forms the ban misses.

The five are of two kinds. Two are free text channels inside a check that says no string stays outside `STRING_PLACES`: the places themselves accepted any string. The catalog's `/Lang` is the one the scope names first, because the rebuild copies it whatever it holds, so a ticked value written there leaves in the file, which spec 0004's AC-4 forbids, and because a `/Lang` written as a name is refused in the run, after the visitor has ticked, since the open's walk never visits the catalog. A CID font's `/Registry` and `/Ordering` are the same channel on fonts. The language tag rule they share with the scan (`LANG_TAG`) also read `Amy-Jones` as a tag.

The other three are about the scan in `marked.ts` and the second write. The scan retries an inline picture's end whenever the rest of a stream fails to read, and each retry reads to the end again, so a crafted stream costs time that grows with the square of its length, at open, with no cancel inside the scan. An inline picture's colour space written as an indexed array over a named resource was not counted as use. And the second write's `drawnShape` counted forms and pictures only, so a font file, a profile, a pattern or a glyph procedure that lost its data in that write would pass.

These are constrained by spec 0019's rules: the prune deletes keys and nothing else (INV-7), a key on a list in the wrong shape is refused (INV-2), the scan never edits and any doubt warns or refuses (INV-4), the engine never edits a content stream (spec 0004, INV-13), and a list change is proven by a committed fixture that fails first (spec 0004, INV-3). Leaving them costs a ticked value in the catalog, a refused run after ticking, and an open that can hang for about an hour.

## Options considered

### Option 1: hold each to the shape the format gives it, in place

Each string place gains the shape the PDF format gives that key: a language tag at the catalog's `/Lang` (left out when it is not one, since no page needs it), a short token at `/Registry` and `/Ordering` (refused when it is not one, since a font may need them). The self check then fails any run whose string places still hold a ticked item's text, Adobe's own values aside, and the rebuild leaves out a `/Lang` that would. `LANG_TAG` takes the real tag shape. The scan caps its retries, and reads an indexed base name. The drawn shape covers every reached stream, with only colour profiles allowed to go.

**Pros**:
- Closes every measured case with small changes inside spec 0019's own rules.
- One pattern and one decoder for the language rule, so the inline and catalog paths agree.
- The scan's cost becomes a fixed number of reads of a stream.

**Cons**:
- A real file whose CID strings fall outside the token is refused at open, unmeasured on real files.
- Short names that fit the tag shape still pass.

### Option 2: record each as a limit, change no code

Spec 0019's *Consequences* already records that names on listed keys stay as written. The five could join them: free strings at the string places, a short name reading as a tag, a slow scan on a crafted stream, an uncounted inline base, a narrow drawn shape.

**Pros**:
- No refusal risk and no work.

**Cons**:
- A ticked value written into the catalog's `/Lang` or a font's `/Ordering` leaves in the file (measured), which spec 0004's AC-4 forbids.
- A `/Lang` written as a name keeps refusing runs after ticking.
- The scan can hold a tab for about an hour.

### Option 3: the strictest form of each

`LANG_TAG` checked against the ISO 639, ISO 15924 and ISO 3166 code lists; `/Registry` held to `Adobe` and `/Ordering` to Adobe's collections; the inline picture's data length worked out from its size so no retry is needed; the drawn shape comparing decoded bytes.

**Pros**:
- Stops almost every name in a language tag, and every non Adobe string in a CID font.
- A drawn shape on contents would also catch a stream changed at the same length.

**Cons**:
- About 4 KB of code lists to keep current, and real tags outside them (`yue-HK`) warn.
- Refuses every font from another registry.
- More parsing in `marked.ts`, the one exception to "one PDF parser", and filtered pictures still need the search.
- Decoding every picture and font in both outputs on the second write, which rests on MuPDF's filter repeating itself exactly, as stored lengths do.

### Per minor: chosen, runner up, why

| Minor | Chosen | Runner up | Why |
|---|---|---|---|
| Catalog `/Lang` | copy only a tag, check holds it | refuse the file | No page needs `/Lang` to draw, so leaving it out loses only a screen reader's voice choice; a refusal would need a new catalog check at open. Never keeping `/Lang` was the other option, and would lose the voice choice on every file. |
| `LANG_TAG` | the real tag shape (script, region, digit led variants) | the shape plus code lists | Stops `Amy-Jones` and `Bob_Smith` with no table to keep current; `Doe`, `Amy-Rose`, `Ann-Li` stay a recorded limit. |
| `/Registry`, `/Ordering` | empty, or a letter then up to 15 letters or digits, refused otherwise; and the check fails a run whose value (Adobe's own aside) holds a ticked text | leave them, record the limit | They name the character collection a CID font's codes come from, so they cannot be deleted; refusing is spec 0019's INV-2 rule for a listed key in the wrong shape, and every committed fixture and every Adobe value passes. The token alone still let a ticked `ACME12345` through, and a ticked value staying with the check passing is a silent miss, not a limit, so the check holds the rest (your call, after the cross check). |
| Ticked text at a string place | folded containment, Adobe's own values skipped, `/Lang` left out rather than refused | as written containment; whole value equality; no exemption | Folding catches `Rowan Ashby` written as `RowanAshby`, which the token forces; containment catches a ticked first name inside a full name. Terms may be two characters, so without the exemption a ticked `ID` would refuse every file with an `Identity` font, and without leaving `/Lang` out a ticked `GB` would refuse every file tagged `en-GB`. |
| Scan retries | 16 per stream, then unsure | a budget of bytes read | A count is simple to state and to test (16 reads, 17 is unsure); the cost is then 17 reads of the stream at most. |
| Inline `/CS` array | the indexed base name only | every name in the array | The format allows a named resource only there; counting other names could call an entry used when nothing draws with it. |
| Drawn shape | every reached stream's stored length by role; only colour profiles may go, whole | function and plain stream allowed to go too; equal lengths on every role | Equal on every role failed three colour fixtures, since the second write exists to drop the unused spaces' profiles (measured below). Functions and plain streams are also reached from shadings, graphics states, soft masks, CID fonts and pictures, so letting them go would hide the loss AC-8 exists to catch, and only profiles were measured going. |
| Proof | committed fixtures for the two string changes, built documents for the rest | everything built in tests | The string changes are list changes, which specs 0019 and 0020 proved with committed fixtures. |

## Rationale

Option 1 fits the forces in *Context*: every change sits inside a rule spec 0019 already states, and each closes a measured case. The catalog's `/Lang` and the CID strings take opposite failure modes on purpose. The catalog's language is never needed to draw, so the rebuild simply does not copy one that fails its shape, which also ends the refusal after ticking for a `/Lang` written as a name. The CID strings may change how a font is drawn and read, so deleting them could change a page, and spec 0019's INV-2 refuses a listed key in the wrong shape instead. The token is wide enough for every value seen in the committed fixtures and every Adobe collection, and narrow enough that it cannot hold a sentence, an identity number or a hyphenated name. What it still lets through, a run together name or code, is held by the ticked text check when ticked, and stays when unticked, as spec 0019 already says unticked text can.

Option 2 leaves a measured breach of spec 0004's AC-4 in place, and Option 3 buys a little more strictness at the price of tables, refusals of real fonts and more parsing in the one exception to "one PDF parser". The tightened `LANG_TAG` still lets a short name through; the comment and a pinned test record that, so the limit is a choice rather than a surprise, and a ticked one is left out of the catalog all the same (AC-1).

For the drawn shape, the measurement settled it: the second write exists to drop the unused colour space entries, and with them the profiles below them, so equal lengths on every role would refuse every file that needs it. Allowing only the roles that can sit below a colour space to lose whole objects, and never to change one, keeps the backstop the review asked for on fonts, patterns, shadings and glyph procedures.

## Measurements

All on MuPDF 1.28.1, through the real engine from scratch tests in the session's scratchpad (never committed), on documents built in the test or on committed fixtures, 2026-11-18.

### The catalog's `/Lang` today

A one page document, nothing ticked, its catalog's `/Lang` written four ways. The open never refused.

| `/Lang` | Run | `/Lang` in the output |
|---|---|---|
| `(Jane Smith 123-45-6789)` | made a file, check passed | `(Jane Smith 123-45-6789)` |
| `/en-US` (a name) | refused, `unreadable-structure` | none |
| `(en-GB)` | made a file | `(en-GB)` |
| `<FEFF0065006E002D00470042>` (UTF-16 `en-GB`) | made a file | the same |

### A CID font's `/Ordering` today

A one page document drawing "Prepared by Rowan Ashby" in a Type 0 font with no font program, a ToUnicode map and `/Registry (Adobe)`, run with `Rowan Ashby` ticked:

| `/Ordering` | Open | Run | `Rowan Ashby` in the output's decompressed bytes |
|---|---|---|---|
| `(Identity)` | opened | made a file | no |
| `(Rowan Ashby)` | opened | made a file | yes, in `/Ordering` |

So `kept-cid-strings.pdf`'s recipe opens, runs, and fails its test on today's code, as AC-5 needs. The committed fixtures hold only `/Registry (Adobe)` with `/Ordering (Identity)` (15 times) or `(UCS)` (17 times).

### The scan's retries

`scanContent` on a plain stream of 1,080,000 bytes (`12 34 m 56 78 l S` repeated) took 35 ms. On the crafted stream (one inline picture whose data repeats ` EI 1`, then an unbalanced `(`), answering `"unsure"` every time:

| Length | Time |
|---|---|
| 2,532 bytes | 26 ms |
| 5,032 bytes | 101 ms |
| 10,032 bytes | 393 ms |

Each doubling costs about four times as much, so 1 MB would take about 393 ms × 100² ≈ 65 minutes. With 16 retries the scan reads at most 17 times the stream, about 0.6 s for 1 MB at the plain stream's rate, hence AC-6's 2,000 ms budget. A false end needs white space, `E`, `I`, then white space or a delimiter: in random bytes about 6 × 16 in 256⁴, one in about 45 MB, so a real stream almost never holds two. The build records, in this file, the most retries any committed fixture's stream takes.

Recorded at the build (2026-11-21): no committed fixture's stream takes a single retry. Measured with an uncapped copy of the scan that counts each new end it gives, over every drawing the open's walk names on each of the 111 fixtures, prepared as the review copy is (815 drawings; `user-password.pdf` cannot be read without its password), and every drawing in the output of a run with nothing ticked. The copy counted one and five retries on two known streams, so a zero is a zero. `glyph-bitmap.pdf`'s inline masks hold the bytes `EI`, but never with the white space around them that makes a candidate end. With the cap, AC-6's 1 MB stream answers `"unsure"` in about 635 ms a pass.

### An indexed inline colour space over a named resource

A page drawing a 1 by 1 inline picture, nothing ticked:

| Inline `/CS` | Page resources | Source draws it | Output |
|---|---|---|---|
| `[/I /Cs1 1 <FF0000 00FF00>]` | `/Cs1 [/CalRGB ...]` | no | no inline picture, no `/ColorSpace` entry, check clean, one write |

MuPDF does not look up a name inside an inline array, so the picture is never drawn and `sanitize` drops it with its entry. No output reaches the case the review describes; AC-7 makes the scan agree with the format, and its pin shows a release that changes this.

### The drawn shape across the second write

Each colour fixture run with nothing ticked through a pipeline that keeps both writes' bytes; every reached object in a stream role, its stored length by role:

| Fixture | First write | Second write | Equal |
|---|---|---|---|
| `colour-icc-alternate.pdf` | content 101, 106; colour profile 45, 45 | content 101, 106 | no |
| `colour-icc-bare.pdf` | content 83, 96, 103, 103, 104, 104; form 37; colour profile 45, 45, 45 | content and form the same | no |
| `colour-calrgb.pdf` | content 103, 107 | the same | yes |
| `colour-calgray.pdf` | content 99 | the same | yes |
| `colour-inline.pdf` | content 131; colour profile 45 | content 131 | no |

The only differences are the 45 byte unreadable profiles, gone with the unused entries the second write exists to drop. Content and forms are equal on all five, so AC-8's rule (only colour profiles may go) holds on each.

### A lost inline picture

Found while measuring AC-7, outside the five minors. A page drawing a 2 by 2 picture, indexes 0 to 3 over red, green, blue and yellow, sampled at four points inside it, nothing ticked; "MuPDF alone" opens the source and saves it with `WRITE_OPTIONS`, with no RedactNest code:

| Picture | Source | Run's output | MuPDF alone | Output's inline dictionary |
|---|---|---|---|---|
| inline, `/CS /RGB` (control) | drawn | drawn, same | drawn | `/CS/RGB` |
| inline, `/CS [/I /RGB 3 <...>]` | drawn | blank | blank | `/CS/` (an empty name) and `/D[0 255]` |
| inline, `/CS [/Indexed /DeviceRGB 3 <...>]` | drawn | blank | blank | the same |
| inline, `/CS /Cs1`, `/Cs1` an indexed resource | drawn | drawn, same | drawn | `/CS/Cs1` |
| an XObject in the same indexed space | drawn | drawn, same | drawn | (not inline) |

Every run made a file and passed the check: nothing was ticked, so no pixel was compared. MuPDF's write turns an indexed space written inline into an empty name, so the picture no longer draws. It loses ink and keeps nothing, so it fails safe for privacy, but the cleaned copy no longer shows what the source showed, and no check sees it. Main does the same. This spec records it, and feature 30 takes it to `/debug` and then `/architect` (index, *Follow-up*).

## What the cross check changed

A read only pass on another model (Sonnet 5.5, 2026-11-18) read the draft and the code it touches. Two High findings changed the design, each your call:

- **The drawn shape's shrink set.** The draft let colour profiles, functions and plain streams lose whole objects, as "the stream roles below a colour space". Functions are also reached from shadings, graphics states and soft masks, and plain streams are also a CID font's `/CIDToGIDMap` and a picture's `/JBIG2Globals`, so the second write could have lost one of those unseen. Now only colour profiles may go (AC-8), the one role measured going.
- **The token and a ticked value.** The draft's token, `[A-Za-z0-9_-]{0,32}`, accepted `123-45-6789` and `Rowan-Ashby`, so a ticked value of that shape would stay with the check passing, while the draft claimed AC-4 of spec 0004 held there. Now the token is a letter then up to 15 letters or digits (AC-3), and the self check fails a run whose `/Lang`, `/Registry` or `/Ordering` holds a ticked item's text (AC-4): a ticked value surviving with the check passing is a silent miss, not a limit. Three follow on choices, also yours: the rebuild leaves out a `/Lang` holding a ticked text rather than the run failing; Adobe's own values are never compared; matching is containment on folded text.

Nine smaller points were applied as clarifications: the fixture's Type 0 font is built in `kept-fixtures.mjs` with `detection-fixtures.mjs` unchanged; the gate's pixel check on `kept-lang.pdf` is said to prove nothing about `/Lang`; `StringPlace.text` is spelt out for the palette arm and `/ActualText`, with `STRING` split in three; `retry`'s count, its place and two exact byte recipes are given; AC-7 is said to be a scan level change; `LANG_TAG` matches the whole decoded string; an indirect `/Ordering` is tested, and the stream roles are derived from `ROLES`; a font file, tiling pattern and shading go through the real second write before the drawn shape changes; and a `-1` matches only a `-1`. The pass found the spec's claims about today's code true: the open's walk reaches `CIDSystemInfo` from the pages, the glyph rule's walk refuses before anything is written in a run, and `asByteString()` exists in MuPDF.js 1.28.1.
