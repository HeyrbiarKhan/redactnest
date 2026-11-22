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
| Words | own title, naming the picture | the shared "stopped to be safe" title | Says what happened in the visitor's terms. The body says "missing or changed", because a picture holding both keys is written wrongly rather than dropped. |
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

**`pdf_load_image_imp`** (`pdf-image.c`) loads the picture from the long keys first:

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

So the space that is loaded and the name that is printed can come from different keys. A picture that is not a mask and has neither key gets no colour space at all.

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
- A loaded space that is not a device space is written under the name from `/CS`, which `parse_inline_image` takes whenever `/CS` is a direct name, whatever `/ColorSpace` says. That is right when `/CS` names the loaded space: `/ColorSpace` absent, or holding the same name. It is the empty name when `/CS` is no name (lost). It is the wrong name when `/ColorSpace` holds a different space (changed).
- No loaded space throws.

AC-1's rule is that table, with "device space" read from the dictionary rather than from the loaded space. The differences are the rare cases AC-1 lists. A `/ColorSpace` name whose resource holds a device space, and `/ColorSpace /Pattern`, are written correctly, but the scan, which does not look resources up, counts them as lost. A picture under a clip with no area is dropped by the filter (`pdf_filter_BI` returns at an empty clip), in the source's drawing as in the output, but the scan does not follow the clip, so it counts.

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

_To be filled by tasks 1, 7 and 8: each fixture's source and output on today's code, and the both keys and no colour space cases._

### What the cross check changed

A read only pass on another model (Sonnet 5.5, 2026-11-22) read the draft, the engine code it touches and the saved MuPDF source. It found the design sound. These changes followed, applied as recommended (your call):

- **Both keys.** The draft said the writer prints nothing when `/ColorSpace` is present. `parse_inline_image` prints the `/CS` name whatever `/ColorSpace` says, so `/CS /Cs1` beside `/ColorSpace /Cs1` is written correctly and the draft refused it. AC-1 now keeps that case, and loses a picture whose two keys name different spaces. The check cannot see the changed case, which AC-4 now says.
- **Device spaces.** Reading `pdf-colorspace.c` while checking that finding showed that an array whose first item is a device name or `/CalCMYK` loads as a device space at any length. The draft allowed only a one item array. The pin now holds `[/RGB]` and `[/CalCMYK << >>]` too.
- **Drawings with no resources.** `resourceUse` reads only drawings that have a resource dictionary, so the draft's backstop missed a page with none. `structureIsClean` now reads those units too (AC-4).
- **The open's pass.** `describesAnything` stops at its first hit, so it cannot also answer `losesPicture`; `readPageDrawings` replaces it with one full pass (AC-2).
- **An existing test.** The named indexed base pin in `redaction-kept.test.ts` runs a case AC-3 refuses; it swaps the seam (AC-7).
- **Malformed values and inline JPX.** A present value that is not a device space counts as lost, said outright, and an inline JPX picture counts, since MuPDF throws on it (AC-1).
- **Smaller points**: the Type 3 fixture's recipe written out, with an open on today's code first; the gate needs only `MAIN_FIXTURES` and `OPEN_NOW` for a refused fixture; a checkpoint after the run's step; `judgeInlinePictures` takes a walk, so a shared walk is a drop in; the lexer change named; and the over refusals and the check's words listed under *Consequences*.

The pass also confirmed, against the code and the source: the mask and colour space key order; that an inline dictionary cannot hold an indirect reference (`1 0 R` makes the scan unsure); that `copy()` restores the new fields after a false `EI`; that `roles.pages` reaches forms, tiling patterns and glyph procedures; that the run can walk from the pages where the step sits; that the open's order holds; that `resourceUse` has each owner's `/ColorSpace`; that `"lost-picture"` before `unused-colour-space` never reaches `"rewrite"`; that every page is still compared; that the committed fixtures hold no counted picture; and that telemetry builds its kinds from `ENGINE_ERROR_KINDS`.

### Real files

Not measured. Ghostscript writes small pictures inline (spec 0021's note), and an indexed space over a device base is the spelling the format allows inline, so a palette logo or icon in a Ghostscript made file is the likely real case. No real document may be committed, so the refusal's own count (from about 2026-12-08) is the first real evidence.
