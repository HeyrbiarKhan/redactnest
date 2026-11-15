# Review, feat/kept-object-leaks, 2026-11-15

**Reviewed by**: claude-sonnet-5-5 (author: opus)
**Scope**: 70 files in the diff, about 20 read in full or by diff (all of `src/engine` that changed, the lint zone, the wall test, the copy changes, the spec's requirements), branch vs main
**Verdict**: Approve with nits

## Summary
The branch adds a typed allowlist for every object below the catalog and pages (`walkRoles` in `src/engine/allowlist.ts`), a structure check that runs the same walk on the exact written bytes, a read only scan of drawing instructions (`marked.ts`), and a second write for one MuPDF colour space quirk. I looked for a way document content could ride through a kept object and found no blocker and no major. The ones I found are small: free strings kept at four listed places, a scan that can be slow on a crafted stream, and a few tidy ups. The `.resolve()` ban is real and enforced.

I leaned on `docs/specs/0019-kept-object-allowlist/verify.md` and the spec's *Consequences*: names and numbers on kept keys, data inside kept streams, and a Type 3 glyph that no text draws are recorded limits, so I do not report them again.

## Minor
### 🟡 Kept strings at `STRING_PLACES` are not shaped, `src/engine/allowlist.ts:166`, `:250`, `:463`
**Problem**: The `string` shape accepts any string at `/Lang` (catalog), `/Registry`, `/Ordering` and `/ActualText`. The scan in `marked.ts` already has `LANG_TAG` to tell a language tag from other text, but the structure check never uses it. So a catalog `/Lang (Jane Smith, SSN 123-45-6789)` passes the walk, the check and the self check, and leaves in the output with no warning.
**Why it matters**: It is a small free text channel inside a check that says "no string stays outside `STRING_PLACES`". The same string is held to `LANG_TAG` when it sits in an inline property list, so the two paths disagree. Today's cause is an odd producer, not a likely accident, so this is minor.
**Suggested fix**: In the walk, give `/Lang` a shape that must read as a language tag (`LANG_TAG`), and refuse or drop it otherwise. Registry and Ordering could be held to a short ASCII token the same way. Add a case to `tests/unit/allowlist.test.ts`.

### 🟡 The `LANG_TAG` pattern lets a short name through, `src/engine/marked.ts:29`
**Problem**: `^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$` matches `Amy-Jones`, `Bob_Smith` and `Doe`, because a 2 or 3 letter first group plus any later groups reads as a tag.
**Why it matters**: An inline `/Lang (Amy-Jones)` inside a marked content list counts as quiet, so the page gets no `marked-descriptions` warning for a ticked name that sits there. The `/Alt` case is warned, this one is not.
**Suggested fix**: Narrow the later groups to the real shape (a script of four letters, a region of two letters or three digits, short known variants), or accept that a name can look like a tag and say so in the comment above the pattern.

### 🟡 The scan can retry for a long time on a crafted stream, `src/engine/marked.ts:203`, `:709`
**Problem**: Each failed inline image end triggers `retry`, which rescans the rest of the stream. `failed` stops the same resume point being tried twice, but a stream with one large inline image holding many ` EI ` sequences, followed by an unbalanced string, retries once per candidate and rescans to the end each time. That is roughly candidates times length.
**Why it matters**: A megabyte stream could keep the worker busy for minutes at open, and the open has no cancel check inside the scan. It only hurts the person who opened the file, so it is minor.
**Suggested fix**: Cap the retries per stream (a number that is a rule about the scan, with the constants' comment), and answer `"unsure"` when it is spent. `unsure` already fails closed.

### 🟡 A second write is only compared on forms and picture lengths, `src/engine/self-check.ts:371`
**Problem**: `drawnShape` counts forms and compares stored image lengths. The second write is run through MuPDF's deduplicating write, the thing spec 0019 AC-16 says can turn a stream into a bare dictionary. A font file, ICC profile, tiling pattern, soft mask group or glyph procedure that lost its data in that write would not change the shape.
**Why it matters**: It is not a leak, so the redaction promise holds, but a file could come back drawn differently with the check passing. It only happens on the rare `unused-colour-space` path.
**Suggested fix**: Extend the shape to the stored length of every reached stream (all roles with `form: "stream"`), read raw, as images already are.

### 🟡 An inline image colour space written as an array is not counted as use, `src/engine/marked.ts:693`
**Problem**: `inlineImage` records `/CS` or `/ColorSpace` only when it is a name. An inline `/CS [/I /Cs1 255 <...>]` that names a resource base is not noted, so `Cs1` looks unused.
**Why it matters**: The check then answers `unused-colour-space`, which triggers the second write, and the second write's `drawnShape` does not look at inline images. Rare, and the first answer is fail closed only if MuPDF keeps the entry.
**Suggested fix**: Read names inside an inline `/CS` array too, and count them as colour space use.

## Nits
- ⚪ `src/engine/AGENTS.md`, not updated for `allowlist.ts`, `marked.ts`, the `unreadable-structure` kind or the second write; the file list and the "Conventions" pipeline order still describe the old shape. Probably /sync's job after merge.
- ⚪ `eslint.config.mjs:174`, the `resolve` selector matches `x.resolve()` and `x["resolve"]()` but not a template literal key or a destructured `const { resolve } = obj`. Tests hold the two forms they list. A comment saying so would help the next reader.
- ⚪ `src/lib/policy-changes.ts:63`, the new entry is dated `2026-11-16`, a day after the page's first publication, with a comment saying move it to the real merge day. Remember to change it if merge happens on a different day.

## Strengths
- The `.resolve()` ban is real: `RESOLVE_MESSAGE` and `noResolve` in `eslint.config.mjs`, applied to `src/engine/**` through the zone, covering both spellings and `Promise.resolve`; `tests/unit/engine-wall.test.ts` asserts it fires in the engine and not in tests. `eslint src/engine` is clean, and no `.resolve(` remains in `src/engine`. `forEachDictionary` was reworked to read through `newIndirect(num)` so it needs none.
- The self check runs on the exact bytes that cross: `takeOutput` copies the heap, the check reopens those bytes, the rewrite path replaces the first bytes only after the second bytes pass the whole check, and any throw answers `redaction-incomplete`. A drawing the scan cannot read answers `unsupported`, and a leak outranks it.
- The walk is deterministic and bounded: explicit work list, no recursion, once per object per role or kind, and an object reached in two roles whose off lists differ is refused instead of guessed. The check also fails any numbered object the walk never reached, so a smuggled object with no referrer is caught.
- Embedded files are caught three ways: the inventory, the role lists and `holdsEmbeddedFile` over every dictionary, reached or not.
- The copy changes (security page, home page, page finding, failure text) carry source comments naming the AC or invariant, and I found no line that promises more than the code does. "Looks for", "can stay", "selectable" and "wholly inside a page's visible area" match the gates they sit behind.

## Test coverage
Good. Each leak path in the steering has a `kept-*.pdf` fixture that fails on main, passes now and fails with the prune skipped (AC-4, AC-6), and `tests/unit/allowlist.test.ts`, `marked.test.ts`, `redaction-kept.test.ts` and `redaction-check.test.ts` hold the walk, the scan and the pipeline seams (prune skipped, structure stub, second write that throws or drops a picture). The `Pipeline` seam proves each part of the check fires. Gaps are the ones in the minors: no test for a free text `/Lang`, `Registry` or `Ordering`, none for a short name passing `LANG_TAG`, none for a slow scan, and none for a second write dropping a stream other than a picture or form. I did not run the full suite; I ran `eslint src/engine` (clean) and `tests/unit/engine-wall.test.ts` (289 passed).
