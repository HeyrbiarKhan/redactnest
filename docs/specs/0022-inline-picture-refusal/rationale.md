# 0022. Refuse an inline picture the write would lose: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file holds the why.

## Context

An inline picture is a small picture stored inside a page's drawing instructions, between `BI` and `EI`, rather than as an object of its own. The PDF format lets one describe its colours with a device colour space (gray, RGB, CMYK, by full or short name), with the name of a colour space in the page's resources, or with an indexed space (a palette) whose base is one of those. Producers also write other arrays inline (calibrated, Lab, separation, DeviceN spaces). The format does not allow them, but MuPDF draws them.

Every file RedactNest makes passes through MuPDF's content filter at least once, because the write runs with `sanitize`. A page with a target passes through it twice, once for the redaction pass and once for the write. The filter reads each drawing and writes it again. MuPDF 1.28.1's writer can only carry an inline picture's colour space as the name written under `/CS`. Measured while designing spec 0021, then root caused by `/debug` (2026-11-22): any other description becomes an empty name (`/CS/`), so the picture stops drawing in the cleaned copy. On a page with a target, the second pass then drops the picture whole. The self check's pixel part looks only under targets, and its character part only at text, so a run with nothing ticked passes the check with the picture gone. Main does the same.

This loses ink and keeps nothing, so it fails safe for privacy. But the cleaned copy no longer shows what the source showed, nobody ticked that picture, and nothing tells the visitor. Spec 0004's INV-2 says a run refuses rather than hand back a partial file or remove what nobody ticked. The engine may not edit a content stream itself (INV-13). `marked.ts`, the one named place that reads drawing instructions, already reads every inline picture's dictionary at open, in the run's check, and for the glyph rule.

## Options considered

### Option 1: Refuse, by one scan rule, at open and in the run, with the check as a backstop

`marked.ts` judges each inline picture by the rule MuPDF's writer follows. The open refuses a file holding one with a new kind, `inline-picture`, before any review. A run asks the same rule on its own copy before anything is removed. The self check fails an output that still shows a lost picture.

**Pros**:
- No file ever leaves missing a picture nobody ticked. INV-2 stays whole, and the visitor hears before reviewing.
- It follows the project's standing answer whenever MuPDF cannot do the job: refuse, never patch (INV-13), as with `slanted-text`, `edge-text` and the matplotlib chart.
- A kind of its own gives the visitor the real reason and gives the counts a number of their own.

**Cons**:
- A file with even one such picture cannot be redacted at all, though only that picture was at risk.
- Ghostscript writes small pictures inline, so some real files will be refused. How many is unknown.
- One more walk and scan per run.

### Option 2: Warn at open with a page finding, and make the file without the picture

A new page finding says a picture on that page will not come through. The run makes a file as today, and the loss is disclosed.

**Pros**:
- Files with a small palette logo stay usable. Nothing leaks either way.
- It is closer to how RedactNest treats what it cannot remove (`marked-descriptions`, `off-page-picture`).

**Cons**:
- The cleaned copy lacks content nobody ticked, so INV-2 must be amended to allow a disclosed loss, a first for the project.
- The existing warnings say something stays. This one would say something goes, which no visitor can undo inside the tool.
- A warning on a page the visitor never scrolls to is easy to miss, and the download then differs from the source.

### Option 3: A workaround that keeps the picture without RedactNest editing a stream

Get MuPDF to write the picture correctly: recolour the page to a device space, rewrite inline pictures as objects, hook the write's image filter, or skip the filter on such pages.

**Pros**:
- The file is redacted, and the picture comes through.

**Cons**:
- MuPDF.js 1.28.1 exposes none of it: no recolour, no image rewrite, no image filter on the write (checked in `mupdf.d.ts`). Skipping `sanitize` would drop guarantees specs 0004, 0006 and 0019 rest on.
- Building MuPDF from master would fix only the indexed case, on code with no release, and master throws on the other arrays. RedactNest ships the npm package, pinned exact, with a notices file tied to that version (spec 0009).
- Anything else means RedactNest editing a content stream, which INV-13 forbids.

### Option 4: Record it as a limit and change nothing

Say on the security page that a small picture can be lost, and leave the engine alone.

**Pros**:
- No code. Every file stays usable.

**Cons**:
- The loss stays silent in the tool itself, where the visitor is. That is the opposite of how every other loss of content is treated.
- It leans on a page most visitors never read, for a promise the tool breaks.

## Rationale

Option 1 is the one that keeps the product's core promise intact: what you download is your file with exactly the ticked items removed, or no file at all. Spec 0004's INV-2 and INV-13 between them leave a refusal as the only answer that needs no amendment. Option 3 is out for want of an API, not by preference. Option 2 is the honest runner up. It is better for a visitor with a Ghostscript file and a logo, and it may become right if the counts show many real files refused. But making it now would mean amending INV-2 on a guess about frequency, when the refusal's own count will measure it. A refusal can be narrowed later on evidence; a loss already downloaded cannot be taken back.

Judging by the loader's and the writer's exact rule, not by "anything that is not a device name", keeps the refusal narrow. It refuses nothing the write carries except a few rare cases the scan cannot settle without looking up a resource or following the drawing state (AC-1). Asking the rule in the run as well as at open keeps the two from disagreeing, as spec 0020's glyph rule does, and makes the rule hold even for bytes that never went through an open. The check's backstop costs little, because resource use already pairs every drawing with its resources. It catches a scan miss wherever the output still shows `/CS/`, and its limit on pages with a target is pinned rather than hidden.

### Per point choices and their runners up

| Point | Chosen | Runner up | Why |
|---|---|---|---|
| Response | refuse at open | warn and make the file | INV-2 stays whole. The count measures how often, for a later decision. |
| Kind | a new `inline-picture` | reuse `unreadable-structure` | A real reason for the visitor, and a count of its own. `unreadable-structure` already has three causes a count cannot tell apart. |
| Name | `inline-picture` | `lost-picture` | Names the thing, as `edge-text` and `slanted-text` do. "Lost" reads as if something already went missing. |
| Words | own title, naming the picture | the shared "stopped to be safe" title | Says what happened in the visitor's terms. The body first said "missing or changed", for a picture whose two keys disagreed; task 8 showed none is written changed, so it says "missing" (your call, 2026-11-22). |
| Next step | `NEW_COPY`, unchanged | new advice naming the picture | It already suggests and never promises, and nothing has measured whether printing helps (your call). |
| Trigger | the loader's and writer's exact rule | every inline space that is not a device name | Refuses nothing the write carries but a few rare unresolved cases. `[/DeviceRGB]`, `[/RGB]` and `/ColorSpace /DeviceRGB` keep working. |
| Where | open, run and check | open and run only | The run cannot disagree with the open, and the check catches a scan miss on a page with nothing ticked. |
| Check's kind | `unsupported` | `inline-picture` | The check meets this only when the scan missed, so it cannot say why. Spec 0004 already makes a difference with nothing ticked `unsupported`. |
| Check's order | after `"unreadable"`, before `"unused-colour-space"` | folded into `"unreadable"` | It must never lead to a second write, which would drop the picture whole and hide it. A name of its own keeps tests able to tell it apart. |
| A drawing the scan cannot read | keeps today's warning | refuse at open | Refusing every unsure drawing would refuse files that only warn today, the 16 retry cap among the causes (your call). |
| Unmeasured places | rule everywhere, measure in the build | measure first, rule where measured | It fails safe, the open's walk already reaches all four places, and the filter writes every drawing it reaches the same way. |
| Fixtures | four, one per place, plus scan cases and a pin | one per lost space | One per place is what the gate and a browser verify need. The spaces are cheaper as scan cases on bytes. |
| Upgrade | pin today's `/CS/` | read the release notes | An upgrade that changes the writer then fails a test rather than passing unseen. |
| The run's walk | its own, beside the glyph rule's | one shared walk | Keeps the glyph seam and its tests untouched. Sharing is the fallback if a budget fails. |
| Code home | a new `src/engine/inline.ts` | inside `glyphs.ts` or `marked.ts` | One file per step, like `glyphs.ts`. `marked.ts` stays the scanner alone. |

## MuPDF 1.28.1's source

Read from the 1.28.1 tag's `source/pdf/` files (2026-11-22). Paraphrased, with the deciding lines as written.

**`parse_inline_image`** (`pdf-interpret.c`) keeps a name for the writer only from `/CS`, and only when it is a direct name:

```c
cs = pdf_dict_get(ctx, obj, PDF_NAME(CS));
if (!pdf_is_indirect(ctx, cs) && pdf_is_name(ctx, cs))
    fz_strlcpy(csname, pdf_to_name(ctx, cs), cslen);
else
    csname[0] = 0;
```

The caller passes `csname[0] ? csname : NULL` on to `op_BI`.

**`pdf_load_image_imp`** (`pdf-image.c`) loads the picture through `pdf_dict_geta`. The call names the long key first, but that is not the order it looks them up in (`pdf_dict_geta`, below):

```c
imagemask = pdf_to_bool(ctx, pdf_dict_geta(ctx, dict, PDF_NAME(ImageMask), PDF_NAME(IM)));
...
obj = pdf_dict_geta(ctx, dict, PDF_NAME(ColorSpace), PDF_NAME(CS));
if (obj && !imagemask && !forcemask)
{
    /* colorspace resource lookup is only done for inline images */
    if (pdf_is_name(ctx, obj)) { res = pdf_lookup_resource(...); if (res) obj = res; }
    colorspace = pdf_load_colorspace(ctx, obj);
```

**`pdf_dict_geta`** (`pdf-object.c`) looks the short name up first, under the comment "ISO 32000-2:2020 (PDF 2.0) - abbreviated names take precedence", and the long one only when the short one is absent (read from the 1.28.1 tag, 2026-11-22). So `/IM` decides the mask and `/CS` the loaded space whenever each is present, and task 8 measured the same, both pairs in both orders (*Task 8's measurements* below). The first draft of this section read the call's argument order as the lookup order, and AC-1 was first written from that.

So the space that is loaded comes from `/CS` when it is present, and so does the printed name (below); when `/CS` is a name, the two always agree. A picture that is not a mask and has neither key gets no colour space at all.

**`pdf_filter_BI`** (`pdf-op-filter.c`) copies the named resource and hands on the same name: `copy_resource(ctx, p, PDF_NAME(ColorSpace), colorspace)`, then `op_BI(..., image, colorspace)`. With a NULL name, nothing is copied, which is why `/ColorSpace /Cs1` also loses its resource entry.

**`pdf_out_BI`** (`pdf-op-buffer.c`) decides what to print from the loaded space but prints the passed name:

```c
if (img->imagemask)                      fz_write_string(ctx, out, "/IM true");
else if (cs == fz_device_gray(ctx))      fz_write_string(ctx, out, "/CS/G");
else if (cs == fz_device_rgb(ctx))       fz_write_string(ctx, out, "/CS/RGB");
else if (cs == fz_device_cmyk(ctx))      fz_write_string(ctx, out, "/CS/CMYK");
else if (cs)                             fz_write_printf(ctx, out, "/CS%n", colorspace);
else fz_throw(ctx, FZ_ERROR_ARGUMENT, "BI operator can only show ImageMask, Gray, RGB, or CMYK images");
```

`%n` with a NULL name prints `/`, so the output says `/CS/`. Its throw for "cannot write this" is reached only when no space was loaded, which is the "no colour space, not a mask" case: by the source, every write of such a picture throws.

**`pdf_load_colorspace_imp`** (`pdf-colorspace.c`, around line 376) loads a name only when it is one of the six device names (or `/Pattern`, as gray), and throws on any other. An array whose first item is one of the six device names, or `/CalCMYK`, loads as that device space, whatever follows; `/Lab` loads as MuPDF's Lab space, which the writer cannot print. So `[/RGB]`, `[/DeviceRGB 7]` and `[/CalCMYK << >>]` are written as `/CS/RGB`, `/CS/RGB` and `/CS/CMYK`.

**`pdf_is_jpx_image`** (`pdf-image.c`, around line 234) looks for `/JPXDecode` in `/Filter` only, alone or in an array, and `pdf_load_image_imp` throws "inline JPXDecode image" for one inline, before it reads the mask.

Taken together:

- An inline JPX picture is never loaded, so never written.
- A mask, or a loaded device space, is written correctly whatever the keys said.
- A loaded space that is not a device space is written under the name from `/CS`, which `parse_inline_image` takes whenever `/CS` is a direct name. Since the space was loaded from `/CS` first, that name always names it (kept). It is the empty name when `/CS` holds no name, or is absent and the space came from `/ColorSpace` (lost). No picture is written under another space's name.
- No loaded space throws.

AC-1's rule is that table, with "device space" read from the dictionary rather than from the loaded space. The differences are the rare cases AC-1 lists. A `/ColorSpace` name whose resource holds a device space, and `/ColorSpace /Pattern`, each with no `/CS`, are written correctly, but the scan, which does not look resources up, counts them as lost. A picture under a clip with no area is dropped by the filter (`pdf_filter_BI` returns at an empty clip), in the source's drawing as in the output, but the scan does not follow the clip, so it counts.

Upstream fixed only the indexed case on master in a9e17fa86c (bug 709906, 2026-10-28), by writing `/CS[/I ...]` inline. Read from master's code, not measured: the other arrays throw there instead. No release carries it; 1.28.6 still has the bug.

## Measurements

### Spec 0021's table (2026-11-18)

A page drawing a 2 by 2 picture, indexes 0 to 3 over red, green, blue and yellow, sampled at four points inside it, nothing ticked. "MuPDF alone" opens the source and saves it with `WRITE_OPTIONS`, with no RedactNest code.

| Picture | Source | Run's output | MuPDF alone | Output's inline dictionary |
|---|---|---|---|---|
| inline, `/CS /RGB` (control) | drawn | drawn, same | drawn | `/CS/RGB` |
| inline, `/CS [/I /RGB 3 <...>]` | drawn | blank | blank | `/CS/` and `/D[0 255]` |
| inline, `/CS [/Indexed /DeviceRGB 3 <...>]` | drawn | blank | blank | the same |
| inline, `/CS /Cs1`, `/Cs1` an indexed resource | drawn | drawn, same | drawn | `/CS/Cs1` |
| an XObject in the same indexed space | drawn | drawn, same | drawn | (not inline) |

And spec 0021's AC-7 pin: `[/I /Cs1 1 <...>]` with `/Cs1` a calibrated RGB resource is not drawn in the source, and the output holds neither the picture nor the entry.

### `/debug`'s root cause (2026-11-22)

- **Lost**: indexed, CalRGB, Lab, Separation and DeviceN arrays written inline, and `/ColorSpace /Name`, which also drops the resource entry.
- **Kept**: device spaces by any name, `[/DeviceRGB]`, `/CS /Name`, and masks.
- One filter pass writes `/CS/` and keeps the stored bytes. A second pass (a page's redaction pass followed by the write, or the second write) drops the whole `BI`. So on a page with a target, the output holds no trace of the picture. With CalRGB and a tick, the run refused with `redaction-overreach` (not chased).
- **Not measured**: the same inside a form, a tiling pattern or a Type 3 glyph, the two both keys cases, the case with no colour space, an inline JPX picture, and `[/RGB]` and `[/CalCMYK ...]`. Tasks 1, 7 and 8 measure these and record them below.

### At the build

Measured on today's code (the branch before task 2, MuPDF 1.28.1), with a scratch test outside the repository, on the committed fixtures only. Each fixture's picture is the same 2 by 2 palette picture, sampled at its four cell centres (red, green, blue, yellow in the source), nothing ticked. "MuPDF alone" opens the fixture and saves it with `WRITE_OPTIONS`, with no RedactNest code.

| Fixture (task) | Open today | Source | Run's output | MuPDF alone | Output's inline dictionary |
|---|---|---|---|---|---|
| `inline-indexed.pdf`, the page's contents (task 1) | opens, no finding | drawn, all four cells | made a file, blank, `sanitized` empty | blank | `/W 2/H 2/BPC 8/CS//D[0 255]` |
| `inline-indexed-form.pdf`, a form drawn once (task 7) | opens, no finding | drawn, all four cells | made a file, blank, `sanitized` empty | blank | the same, in the form |
| `inline-indexed-pattern.pdf`, a tiling pattern's one cell (task 7) | opens, no finding | drawn, all four cells | made a file, blank, `sanitized` empty | blank | the same, in the pattern |
| `inline-indexed-glyph.pdf`, a coloured Type 3 glyph (task 7) | opens, no finding | drawn, all four cells | made a file, blank, `sanitized` empty | blank | the same, in the glyph procedure |

Task 7 measured the three new places on main's code (0ee7571, a `git archive` of `src`), and measured `inline-indexed.pdf` again there, with the same answers. No earlier refusal takes any of the four: each opens with no page finding, so the spec's recipes stand unchanged. The glyph fixture's page reads as `Palette logo sample` and `A` (the glyph's code, since the font has no `/ToUnicode`), each on a line of its own. MuPDF's write keeps the picture in none of the four places, so the Follow-up item for a place where the write keeps it has nothing to bring to `/architect`.

#### Task 8's measurements, before the pin (2026-11-22)

MuPDF 1.28.1 alone, on documents built in a scratch test: a page with a Helvetica line before and after one 2 by 2 picture, its resources holding `/Cs1` (an indexed space over RGB, red, green, blue, yellow), `/Cs2` (the same over cyan, magenta, yellow, black) and `/Cs3` (a calibrated RGB space). Each was opened and saved with `WRITE_OPTIONS`; "drawn" means the four cells sampled as the data says.

| Picture's dictionary | Source | Written as | Output |
|---|---|---|---|
| `/CS /RGB`, `/CS /G`, `/CS /DeviceCMYK` | drawn | `/CS/RGB`, `/CS/G`, `/CS/CMYK` | drawn, same |
| `/CS [/DeviceRGB]`, `[/RGB]`, `[/DeviceRGB 7]`; `/ColorSpace /DeviceRGB`, `[/RGB]` | drawn | `/CS/RGB` | drawn, same |
| `/CS [/CalCMYK << >>]` | drawn | `/CS/CMYK` | drawn, same |
| `/CS /Cs1`, and `/CS /Cs1 /ColorSpace /Cs1` | drawn | `/CS/Cs1`, entry kept | drawn, same |
| `/IM true`, alone or beside an indexed `/CS` | drawn | `/IM true` | drawn, same |
| `/ColorSpace /Pattern` | drawn as gray | `/CS/G` | drawn, same |
| `/CS [/I /RGB 3 <...>]`, `[/Indexed /DeviceRGB 3 <...>]` | drawn | `/CS/` | blank |
| inline `/CalRGB`, `/Lab`, `/Separation`, `/DeviceN` arrays | drawn | `/CS/` | blank |
| `/ColorSpace /Cs1` | drawn | `/CS/`, entry dropped | blank |
| `/CS [/I /Cs3 1 <...>]` | not drawn | no `BI` | blank |
| `/CS/`, `/ColorSpace 3` | not drawn | no `BI` | blank |
| no colour space, not a mask | drawn faintly | the write throws: "BI operator can only show ImageMask, Gray, RGB, or CMYK images" | none |
| `/Filter /JPXDecode` or `[/JPXDecode]`, a mask too | not drawn, the rest of the stream drawn | no `BI`, the rest kept | blank |
| `/F /JPXDecode` | drawing the page throws ("Failed to read JPX header") | the write throws ("unknown compressed buffer type") | none |
| `/F [/AHx /JPXDecode]` | not drawn, the rest drawn | the write throws | none |

The two keys, each in both orders:

| Picture's dictionary | Source | Written as | Output |
|---|---|---|---|
| `/ColorSpace /DeviceRGB` beside `/CS [/I /RGB 3 <...>]`, index data | drawn from the indexed `/CS` | `/CS/` | blank |
| `/CS /RGB` beside `/ColorSpace [/I /RGB 3 <...>]`, RGB data | drawn as RGB | `/CS/RGB` | drawn, same |
| `/CS /Cs1` beside `/ColorSpace /Cs2` | drawn in Cs1's colours | `/CS/Cs1`, entry kept | drawn, same |
| `/CS /Cs2` beside `/ColorSpace [/I /RGB 3 <...>]` | drawn in Cs2's colours | `/CS/Cs2`, entry kept | drawn, same |
| `/CS /G` beside `/ColorSpace /Cs1` | drawn as gray | `/CS/G` | drawn, same |
| `/ImageMask false` beside `/IM true`, no colour space | drawn as a mask | `/IM true` | drawn, same |
| `/ImageMask true` beside `/IM false`, no colour space | not drawn, and neither is the rest of the stream | no `BI`, the rest dropped | blank |

So MuPDF 1.28.1 reads the short key first: `/CS` before `/ColorSpace` and `/IM` before `/ImageMask`, whichever comes first in the dictionary. That is the opposite of the order AC-1 and *MuPDF 1.28.1's source* first gave (`pdf_dict_geta` takes the short name first, as PDF 2.0 asks for inline pictures). By what was measured, the space MuPDF loads is `/CS` when present, else `/ColorSpace`, and the writer's name always names it when `/CS` is a name that is not empty. Against AC-1 as written, the measured writes differ in four places: `/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside an indexed `/ColorSpace`, and `/ImageMask false` beside `/IM true` all come through, though AC-1 counts them lost; and a device `/ColorSpace` beside a `/CS` that is not a device space is lost, though AC-1 says such a picture never counts. Taken to `/architect` before the pin is written (the build stopped at task 8), which corrected the spec the same day (*What task 8's measurements changed*, below).

#### Task 8's measurements, on the corrected rule (2026-11-22)

Measured before the pin was written, on documents built as above: the same lines and resources, a 2 by 2 picture 1 bit deep when it is a mask and 8 otherwise, with data that fills it for the space MuPDF loads. MuPDF 1.28.1 alone, saved with `WRITE_OPTIONS`.

The three rows AC-6 marks *Measured in the build*, each as expected:

| Picture's dictionary | Expected | Source | Written as | Output |
|---|---|---|---|---|
| `/CS /Cs9`, no `/Cs9` entry | no `BI`, the text after it kept | not drawn | no `BI`, the text after it kept | blank |
| `/CS/` beside `/ColorSpace /DeviceRGB`, each order, RGB data | no `BI`, as `/CS/` alone | not drawn | no `BI`, the text after it kept | blank |
| `/CS /RGB` then `/CS [/I /RGB 3 <...>]`, index data | `/CS/` (the last counts) | drawn from the indexed space | `/CS/` | blank |
| `/CS [/I /RGB 3 <...>]` then `/CS /RGB`, RGB data | `/CS/RGB` | drawn as RGB | `/CS/RGB` | drawn, same |

The three spellings the correction keeps, each in both orders, run with the line above the picture ticked (the redaction pass and the write: two filter passes), first with `judgeInlinePictures` skipped so only MuPDF decided, then through the default pipeline: `/CS /Cs1` beside `/ColorSpace /Cs2` (written `/CS/Cs1`, its entry kept), `/CS /RGB` beside `/ColorSpace [/I /RGB 3 <...>]` (written `/CS/RGB`) and `/ImageMask false` beside `/IM true` (written `/IM true`). Each made a file that passed the check, with the ticked line gone, the line after kept and the four cells drawn as the source draws them. So two passes carry them as one does, as reasoned. A run reads the page through the role walk, which refuses an indexed resource written with the inline abbreviations (`[/I /RGB ...]`) that MuPDF alone accepted in task 8's documents, so the run's documents, and the pin's, write `/Cs1` and `/Cs2` as `[/Indexed /DeviceRGB ...]`, the same spaces.

Every other row matched task 8's tables but one. `/ImageMask true` beside `/IM false`, with no colour space: task 8 wrote it with two data bytes at 8 bits, half what a 2 by 2 picture holds, so MuPDF read past `EI` and lost the rest of the stream (not drawn, no `BI`, the rest dropped). With data that fills it (four bytes at 8 bits, or two at 1 bit), the source draws it as gray, as it draws a picture with no colour space and no mask, and the write throws the same way ("BI operator can only show ImageMask, Gray, RGB, or CMYK images"), in both orders. Lost either way, so the rule does not change. The pin keeps task 8's row with its two bytes, named as such, under *No `BI` left and the text after it dropped*, and holds the filled picture under *The write throws*. AC-1's sentence that MuPDF draws neither the picture nor the rest of the stream holds only for that short data, and AC-1 now says so (*What the build corrected in the text*, below).

In passing, not pinned: `/IM null` beside `/ImageMask true`, with no colour space, is drawn as a mask and written `/IM true`, so MuPDF reads `null` as absent there, and the rule's refusal of it is one of the over refusals AC-1 allows for. `/IM 0` beside `/ImageMask true`, with no colour space, makes the write throw, as the rule counts it.

### What the cross check changed

A read only pass on another model (Sonnet 5.5, 2026-11-22) read the draft, the engine code it touches and the saved MuPDF source. It found the design sound. These changes followed, applied as recommended (your call):

- **Both keys.** The draft said the writer prints nothing when `/ColorSpace` is present. `parse_inline_image` prints the `/CS` name whatever `/ColorSpace` says, so `/CS /Cs1` beside `/ColorSpace /Cs1` is written correctly and the draft refused it. AC-1 now keeps that case, and loses a picture whose two keys name different spaces. The check cannot see the changed case, which AC-4 now says. (Task 8 later showed the short key wins, so such a picture is kept and no changed case exists; see below.)
- **Device spaces.** Reading `pdf-colorspace.c` while checking that finding showed that an array whose first item is a device name or `/CalCMYK` loads as a device space at any length. The draft allowed only a one item array. The pin now holds `[/RGB]` and `[/CalCMYK << >>]` too.
- **Drawings with no resources.** `resourceUse` reads only drawings that have a resource dictionary, so the draft's backstop missed a page with none. `structureIsClean` now reads those units too (AC-4).
- **The open's pass.** `describesAnything` stops at its first hit, so it cannot also answer `losesPicture`; `readPageDrawings` replaces it with one full pass (AC-2).
- **An existing test.** The named indexed base pin in `redaction-kept.test.ts` runs a case AC-3 refuses; it swaps the seam (AC-7).
- **Malformed values and inline JPX.** A present value that is not a device space counts as lost, said outright, and an inline JPX picture counts, since MuPDF throws on it (AC-1).
- **Smaller points**: the Type 3 fixture's recipe written out, with an open on today's code first; the gate needs only `MAIN_FIXTURES` and `OPEN_NOW` for a refused fixture; a checkpoint after the run's step; `judgeInlinePictures` takes a walk, so a shared walk is a drop in; the lexer change named; and the over refusals and the check's words listed under *Consequences*.

The pass also confirmed, against the code and the source: the mask and colour space key order (wrong: like the draft, it read `pdf_dict_geta`'s argument order as its lookup order, and task 8's measurements corrected it); that an inline dictionary cannot hold an indirect reference (`1 0 R` makes the scan unsure); that `copy()` restores the new fields after a false `EI`; that `roles.pages` reaches forms, tiling patterns and glyph procedures; that the run can walk from the pages where the step sits; that the open's order holds; that `resourceUse` has each owner's `/ColorSpace`; that `"lost-picture"` before `unused-colour-space` never reaches `"rewrite"`; that every page is still compared; that the committed fixtures hold no counted picture; and that telemetry builds its kinds from `ENGINE_ERROR_KINDS`.

### What task 8's measurements changed (2026-11-22)

`/architect` corrected the spec from *Task 8's measurements*, with `pdf_dict_geta`'s source read to confirm them.

- **The key order.** The short key wins: `/CS` before `/ColorSpace`, `/IM` before `/ImageMask`, whichever comes first in the bytes. AC-1's rule, its definitions and examples, the value sourcing and the pin follow.
- **Now refused, missed before.** A device `/ColorSpace` beside a `/CS` that is neither a device space nor a name, for example an indexed array. MuPDF loads the `/CS` and writes `/CS/`, so the picture is blank in the output. The first rule called it kept, and on a page with a target nothing in the output shows the loss (AC-4), so nothing would have caught it there.
- **No longer refused.** `/CS /Cs1` beside `/ColorSpace /Cs2`, `/CS /RGB` beside an indexed `/ColorSpace`, and `/ImageMask false` beside `/IM true`. Each was measured written as its `/CS` or `/IM` and drawn the same. On a page with a target, the second filter pass reads the first pass's one key spelling (`/CS/Cs1`, `/CS/RGB`, `/IM true`), which the rule already keeps, so two passes carry them as one does. That is reasoned from the one pass measurements, not measured with a tick; AC-6 now has task 8 measure it with a tick.
- **No changed picture.** No measured picture is written under a name other than the one loaded, so AC-4's bullet on it and the matching consequence go, and the refusal's body drops "or changed" (your call).
- **The pin.** Task 8 found four outcomes for a lost picture (`/CS/`, no `BI` with the rest kept, no `BI` with the rest dropped, a throw), not one, so the pin holds each row's measured outcome instead of "`/CS/` for every lost case". Its two key rows, each in both orders, become the key order's tripwire.
- **`/F /JPXDecode`.** AC-1 counted it under INV-4 for want of a measurement. The write throws on it (measured), so it now counts on evidence.
- **Unchanged.** The rule's other parts, the open's and the run's refusals, the check's backstop, the four fixtures, the gate, and every committed fixture's outcome: all four fixtures and every committed inline picture use one key.

A second read only cross check on another model (Sonnet 5.5, 2026-11-22) checked every measured row against the corrected rule and found each on the right side. Its gaps were applied as recommended (your call):

- **What the check sees.** INV-3, AC-4 and a consequence said the check fails a lost picture whenever nothing is ticked. Only a picture the output still shows as `/CS/` or a missing entry leaves a trace; the rows written as no `BI` leave nothing, and MuPDF draws none of them in the source either. The text now says so.
- **A `/CS` name with no resource entry.** The scan keeps it and the write drops it, against INV-4's lean, and the first draft already did. It stays kept, named as the one under refusal: the file never defines its colours and MuPDF draws nothing for it in the source, while refusing it would mean looking resources up, which the scan never does. The pin measures it.
- **`null` and a repeated key.** `null` counts as present. Whether MuPDF reads it as absent or not, that can only refuse more, so it is not measured. A repeated key takes the last, as the scan already does; if MuPDF kept the first, one order would be a miss, so the pin measures both.
- **`/CS/` beside a device `/ColorSpace`.** The case where the short key matters most, unmeasured; now a scan case and a pin row.
- **Two passes.** The three spellings this correction keeps are now run with a tick in task 8, so the reasoning above becomes a measurement.
- **Smaller.** Scan cases for `/IM 0`, `[]`, `[/Pattern]` and a device array under `/CS` beside an indexed `/ColorSpace`, and this file's `pdf_dict_geta` wording. `inlineSpaces` needed no change: it is read only on the output, where a mask prints no `/CS` and a JPX picture is never written.

### What the build corrected in the text (2026-11-22)

`/architect` amended the index as built, from *Task 8's measurements, on the corrected rule*. Wording only: no rule, test or outcome changed.

- **Short data.** AC-1 said that with `/ImageMask true` beside `/IM false` and no colour space, MuPDF draws neither the picture nor the rest of the stream. That holds only for task 8's short data. With data that fills the picture, the source draws it as gray and the write throws, in both orders. It is lost either way, so AC-1 keeps counting it and now names both outcomes. AC-6's pin names the short data row and lists the filled one under *The write throws*, as built.
- **Full names in a run's documents.** The role walk reads a colour space family only by its full name, so an indexed resource written `[/I /RGB ...]` fails it as a shape, and an open or a run refuses with `unreadable-structure` before the inline picture rule asks. The format allows the short forms only in an inline picture, so this is the walk doing what spec 0019 built it to do, not a gap. AC-6 now says the pin's and the ticked runs' documents write `/Cs1` and `/Cs2` as `[/Indexed /DeviceRGB ...]`, the same spaces task 8 wrote short.

### Real files

Not measured. Ghostscript writes small pictures inline (spec 0021's note), and an indexed space over a device base is the spelling the format allows inline, so a palette logo or icon in a Ghostscript made file is the likely real case. No real document may be committed, so the refusal's own count (from about 2026-12-08) is the first real evidence.
