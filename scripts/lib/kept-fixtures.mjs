/**
 * The kept object fixtures. Spec 0019, AC-4.
 *
 * Each one is a case feature 31's row measured: something a kept object points
 * at that the rebuild used to carry into the output, so a file passed every
 * check and still held what the visitor ticked, or what the summary said was
 * stripped. Before spec 0019 the allowlists covered only the catalog and the
 * pages, and the sweep below them deleted six known keys, so any other key on a
 * font, a figure or a picture was grafted with everything it pointed at.
 *
 * Four cases hang their payload on a private key on page 1's first font,
 * `/RedactNestPrivate`, the way feature 16's eighth verify added one in memory.
 * The other two carry keys a producer or the PDF format itself puts on a figure
 * or a picture: pdfTeX's `/PTEX.*` keys, and an embedded file reached through
 * `/Ref` or `/OPI`.
 *
 * Written object by object, never by MuPDF, so an engine bug cannot write a
 * fixture that hides itself (spec 0004, INV-3).
 *
 * The fourth pass (AC-17) adds eight more, each a case its measurements found
 * failing a run with nothing ticked on files main cleans: five pages painting
 * through a colour space MuPDF cannot load, a control whose spaces MuPDF keeps
 * naming, and two pairs of a picture or a figure each pointing at an identical
 * small object, which MuPDF's deduplicating write merges.
 */

import { deflateSync } from "node:zlib";

import { stream, writePdf } from "./pdf-writer.mjs";
import { IDENTITY_UNICODE, line, literal } from "./redaction-fixtures.mjs";

/**
 * Every string a test looks for in an output. Each is written in this file and
 * nowhere else, so finding one in an output means the case's payload survived.
 */
export const KEPT_TEXT = Object.freeze({
  /** `kept-figure.pdf`: the value ticked inside the figure. */
  figure: "SECRET-42",
  /** `kept-annotations.pdf`: the sticky note's text and the attached file's contents. */
  note: "Private reviewer comment",
  attachment: "attached secret contents",
  /** `kept-catalog.pdf`: one string from each catalog entry. */
  label: "Secret label prefix ",
  preference: "Private viewer preference",
  uri: "https://example.com/secret-open-action",
  alt: "Structure alt secret",
  /** `kept-program-keys.pdf`: what pdfTeX writes about an included figure. */
  author: "Avery Quill",
  title: "Merger plan draft figure",
  path: "C:/Users/avery/private/merger-plan.pdf",
  /** `kept-embedded.pdf`: one embedded file per way of reaching it. */
  ref: "reference xobject embedded secret",
  formOpi: "form opi embedded secret",
  imageOpi: "image opi embedded secret",
  /** `kept-lang.pdf`: the name the page shows, repeated as the catalog's `/Lang` (spec 0021). */
  lang: "Quinn Harlow",
  /** `kept-cid-strings.pdf`: the name the page shows, repeated as a CID font's `/Ordering` (spec 0021). */
  ordering: "Rowan Ashby",
});

const HELVETICA =
  "/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding";
const COURIER =
  "/Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding";

/**
 * A whole document from page specs, its objects numbered as they are added,
 * like `document()` in `redaction-fixtures.mjs`, with page 1's first font
 * (`/F1`, Helvetica) written last so it can point at what the pages hold.
 *
 * `build` receives `add` (append an object, get its number), `set` (fill in an
 * object added as `null`, for a cycle) and `fonts` (the `/Font` entries). It
 * returns `pages` (each `content`, and optionally `resources` and `keys`),
 * `kept` (what the font's private key points at, or nothing for no key) and
 * `catalog` (more catalog entries).
 */
function keptDocument(build) {
  const objects = [];
  const add = (body) => objects.push(body);
  const set = (num, body) => {
    objects[num - 1] = body;
  };

  const catalog = add(null);
  const pages = add(null);
  const helvetica = add(null);
  const courier = add(`<< ${COURIER} >>`);
  const fonts = `/F1 ${helvetica} 0 R /F2 ${courier} 0 R`;

  const built = build({ add, set, fonts });

  const kids = built.pages.map((spec) => {
    const content = add(stream("", spec.content));
    return add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ${spec.keys ?? ""} ` +
        `/Resources << /Font << ${fonts} >> ${spec.resources ?? ""} >> /Contents ${content} 0 R >>`,
    );
  });

  set(
    helvetica,
    built.kept === undefined
      ? `<< ${HELVETICA} >>`
      : `<< ${HELVETICA} /RedactNestPrivate ${built.kept} >>`,
  );
  set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R ${built.catalog ?? ""}>>`);
  set(
    pages,
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`,
  );

  return writePdf({ objects, trailer: `/Root ${catalog} 0 R` }).bytes;
}

/** A form XObject holding one line of `text`, with `extra` dictionary entries. */
function form(add, fonts, text, extra = "") {
  return add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 400 40] /Resources << /Font << ${fonts} >> >>${extra}`,
      line("F1", 12, 4, 20, text),
    ),
  );
}

/** A 2 by 2 pixel RGB picture of one colour, with `extra` dictionary entries. */
function picture(add, [red, green, blue], extra = "") {
  const pixels = new Uint8Array(12);
  for (let at = 0; at < pixels.length; at += 3) pixels.set([red, green, blue], at);
  return add(
    stream(
      `/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8${extra}`,
      pixels,
    ),
  );
}

/** An embedded file stream holding `contents`, and the file specification naming it. */
function embeddedFile(add, name, contents) {
  const file = add(stream("/Type /EmbeddedFile", contents));
  return add(
    `<< /Type /Filespec /F ${literal(name)} /UF ${literal(name)} /EF << /F ${file} 0 R >> >>`,
  );
}

/**
 * Feature 31, measurement (1). `form-xobject.pdf`'s page, with the first font's
 * private key pointing at the form. A pass redacts a figure into a new copy,
 * which the page draws, so the original, still holding `SECRET-42`, stayed in
 * the output wherever something else pointed at it.
 */
export function keptFigure() {
  return keptDocument(({ add, fonts }) => {
    const figure = form(add, fonts, `Reference: ${KEPT_TEXT.figure} inside a form`);
    return {
      kept: `${figure} 0 R`,
      pages: [
        {
          resources: `/XObject << /Fm1 ${figure} 0 R >>`,
          content:
            line("F1", 12, 72, 700, "Text outside the form") +
            "q 1 0 0 1 72 600 cm /Fm1 Do Q\n",
        },
      ],
    };
  });
}

/**
 * Feature 31, measurement (2). `images-under.pdf`'s page, with the first font's
 * private key pointing at the image mask. The padded pass blanks a picture into
 * a new copy, so the unblanked original stayed whole beside it.
 */
export function keptPicture() {
  const columns = 170 * 4;
  const rows = 20 * 4;
  return keptDocument(({ add }) => {
    const mask = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${columns} /Height ${rows} /ImageMask true ` +
          "/BitsPerComponent 1 /Filter /FlateDecode",
        deflateSync(new Uint8Array((columns / 8) * rows).fill(0)),
      ),
    );
    const grey = deflateSync(new Uint8Array(columns * rows).fill(0x60)).toString("hex");
    return {
      kept: `${mask} 0 R`,
      pages: [
        {
          resources: `/XObject << /Mask ${mask} 0 R >>`,
          content:
            `q 170 0 0 20 140 684 cm BI /W ${columns} /H ${rows} /CS /G /BPC 8 /F [/AHx /Fl] ID ${grey}> EI Q\n` +
            line("F1", 12, 150, 690, "Account 12345678 held") +
            `q 0.2 0.2 0.8 rg 170 0 0 20 140 624 cm /Mask Do Q\n` +
            line("F1", 12, 150, 630, "Sort code 40-11-22 used"),
        },
      ],
    };
  });
}

/**
 * Feature 31, measurement (3). A page with a sticky note, its popup and a file
 * attachment annotation, and the first font's private key holding the same
 * list as the page's `/Annots`. The page drops its annotations, and they stayed
 * in the output through the font, the note's text and the attached file with
 * them, while `annotations` and `attachments` were reported stripped.
 *
 * The font holds its own copy of the list, as the measurement's saved file did,
 * not a pointer to one shared list object: MuPDF's flatten empties the page's
 * `/Annots` in place, so a shared list would have nothing left in it to keep.
 */
export function keptAnnotations() {
  return keptDocument(({ add, set }) => {
    const filespec = embeddedFile(add, "kept-note.txt", KEPT_TEXT.attachment);
    const note = add(null);
    const popup = add(
      `<< /Type /Annot /Subtype /Popup /Rect [520 620 620 720] /Parent ${note} 0 R >>`,
    );
    set(
      note,
      `<< /Type /Annot /Subtype /Text /Rect [500 700 520 720] /Contents ${literal(KEPT_TEXT.note)} ` +
        `/Popup ${popup} 0 R /Open false >>`,
    );
    const attachment = add(
      `<< /Type /Annot /Subtype /FileAttachment /Rect [540 740 556 756] /FS ${filespec} 0 R ` +
        "/Contents (Attached file) >>",
    );
    const annotations = `[${note} 0 R ${popup} 0 R ${attachment} 0 R]`;
    return {
      kept: annotations,
      pages: [
        {
          keys: `/Annots ${annotations}`,
          content: line("F1", 12, 72, 700, "A page with a note and an attachment"),
        },
      ],
    };
  });
}

/**
 * Feature 31, measurement (4). A catalog with page labels, viewer preferences
 * holding a private string, an opening URI action and a structure tree whose
 * element has `/Alt`, each also reached from the first font's private key. The
 * catalog allowlist drops all four, and every string stayed through the font.
 */
export function keptCatalog() {
  return keptDocument(({ add, set }) => {
    const labels = add(`<< /Nums [0 << /S /D /P ${literal(KEPT_TEXT.label)} >>] >>`);
    const preferences = add(
      `<< /HideToolbar true /RedactNestNote ${literal(KEPT_TEXT.preference)} >>`,
    );
    const action = add(`<< /S /URI /URI ${literal(KEPT_TEXT.uri)} >>`);
    const element = add(null);
    const tree = add(`<< /Type /StructTreeRoot /K ${element} 0 R >>`);
    set(
      element,
      `<< /Type /StructElem /S /Figure /P ${tree} 0 R /Alt ${literal(KEPT_TEXT.alt)} >>`,
    );
    return {
      kept: `[${labels} 0 R ${preferences} 0 R ${action} 0 R ${tree} 0 R]`,
      catalog:
        `/PageLabels ${labels} 0 R /ViewerPreferences ${preferences} 0 R ` +
        `/OpenAction ${action} 0 R /StructTreeRoot ${tree} 0 R /MarkInfo << /Marked true >> `,
      pages: [{ content: line("F1", 12, 72, 700, "A page whose catalog says more") }],
    };
  });
}

/**
 * Feature 31, the sixth verify. pdfTeX writes `/PTEX.FileName` (the figure's
 * path), `/PTEX.PageNumber` and `/PTEX.InfoDict` (the figure's own document
 * info) on every PDF figure it includes; here on a form XObject and on an
 * image. Every key stayed in the output, the author, the title and the path
 * with them.
 *
 * The two share one info dictionary. With two identical ones, MuPDF 1.28.1's
 * deduplicating write merged them and wrote the form and the image with no
 * data, because the carrier sweep had resolved both first, so the run failed
 * safe with `unsupported` and measured nothing.
 */
export function keptProgramKeys() {
  return keptDocument(({ add, fonts }) => {
    const info = add(
      `<< /Author ${literal(KEPT_TEXT.author)} /Title ${literal(KEPT_TEXT.title)} >>`,
    );
    const pdfTeX =
      ` /PTEX.FileName ${literal(KEPT_TEXT.path)} /PTEX.PageNumber 1 ` +
      `/PTEX.InfoDict ${info} 0 R`;
    const figure = form(add, fonts, "A figure pdfTeX included", pdfTeX);
    const image = picture(add, [40, 120, 200], pdfTeX);
    return {
      pages: [
        {
          resources: `/XObject << /Fm1 ${figure} 0 R /Im1 ${image} 0 R >>`,
          content:
            line("F1", 12, 72, 700, "A page with an included figure") +
            "q 1 0 0 1 72 600 cm /Fm1 Do Q\n" +
            "q 40 0 0 40 400 600 cm /Im1 Do Q\n",
        },
      ],
    };
  });
}

/**
 * Feature 31, the seventh verify. An embedded file reached through keys the
 * PDF format itself defines, one way per page: a form XObject's `/Ref` (a
 * reference XObject), a form XObject's `/OPI` and an image's `/OPI`. Each file
 * stayed whole, and nothing was reported stripped.
 */
export function keptEmbedded() {
  return keptDocument(({ add, fonts }) => {
    const reference = form(
      add,
      fonts,
      "A figure that names another file",
      ` /Ref << /F ${embeddedFile(add, "reference.pdf", KEPT_TEXT.ref)} 0 R /Page 0 >>`,
    );
    const opiForm = form(
      add,
      fonts,
      "A figure with an OPI proxy",
      ` /OPI << /2.0 << /Type /OPI /Version 2.0 ` +
        `/F ${embeddedFile(add, "form-proxy.tif", KEPT_TEXT.formOpi)} 0 R /Inks /full_color >> >>`,
    );
    const opiImage = picture(
      add,
      [200, 120, 40],
      ` /OPI << /1.3 << /Type /OPI /Version 1.3 ` +
        `/F ${embeddedFile(add, "image-proxy.tif", KEPT_TEXT.imageOpi)} 0 R ` +
        "/Size [2 2] /CropRect [0 0 2 2] /Position [0 0 0 2 2 2 2 0] >> >>",
    );
    const drawsForm = (name, number, words) => ({
      resources: `/XObject << /${name} ${number} 0 R >>`,
      content: line("F1", 12, 72, 700, words) + `q 1 0 0 1 72 600 cm /${name} Do Q\n`,
    });
    return {
      pages: [
        drawsForm("Fm1", reference, "A page drawing a reference figure"),
        drawsForm("Fm1", opiForm, "A page drawing a figure with a proxy"),
        {
          resources: `/XObject << /Im1 ${opiImage} 0 R >>`,
          content:
            line("F1", 12, 72, 700, "A page drawing a picture with a proxy") +
            "q 40 0 0 40 72 600 cm /Im1 Do Q\n",
        },
      ],
    };
  });
}

/**
 * Spec 0021, AC-5. A one page document for the string place cases: 612 by
 * 792 points, one line at 72, 700, size 18. `build` receives `add` (append an
 * object, get its number) and returns `font` (the number of the page's `/F1`),
 * `content` (the page's drawing instructions) and `catalog` (more catalog
 * entries).
 */
function stringDocument(build) {
  const objects = [];
  const add = (body) => objects.push(body);

  const catalog = add(null);
  const pages = add(null);
  const built = build(add);
  const content = add(stream("", built.content));
  const page = add(
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${built.font} 0 R >> >> /Contents ${content} 0 R >>`,
  );

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R ${built.catalog ?? ""}>>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`;

  return writePdf({ objects, trailer: `/Root ${catalog} 0 R` }).bytes;
}

/**
 * Spec 0021, AC-1 and AC-5. A page naming a person, and a catalog whose
 * `/Lang` repeats the name. The rebuild copied `/Lang` across whatever it
 * held, so a run with the name ticked passed the check and kept it there.
 */
export function keptLang() {
  return stringDocument((add) => ({
    font: add(`<< ${HELVETICA} >>`),
    content: line("F1", 18, 72, 700, `Prepared by ${KEPT_TEXT.lang}`),
    catalog: `/Lang ${literal(KEPT_TEXT.lang)} `,
  }));
}

/**
 * Spec 0021, AC-5. A Type 0 font with no font program, built here rather than
 * borrowed from the detection set: two byte codes that are Unicode code
 * points (`/Identity-H`, with `IDENTITY_UNICODE` as its ToUnicode map), a font
 * descriptor and `/DW 600`, its `CIDSystemInfo` naming `registry` and
 * `ordering`. Returns the font's number.
 */
function cidFont(add, registry, ordering) {
  const unicode = add(stream("", IDENTITY_UNICODE));
  const descriptor = add(
    "<< /Type /FontDescriptor /FontName /RedactNestCid /Flags 32 /FontBBox [0 -200 1000 900] " +
      "/ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
  );
  const descendant = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RedactNestCid /CIDToGIDMap /Identity " +
      `/CIDSystemInfo << /Registry ${literal(registry)} /Ordering ${literal(ordering)} /Supplement 0 >> ` +
      `/FontDescriptor ${descriptor} 0 R /DW 600 >>`,
  );
  return add(
    "<< /Type /Font /Subtype /Type0 /BaseFont /RedactNestCid /Encoding /Identity-H " +
      `/DescendantFonts [${descendant} 0 R] /ToUnicode ${unicode} 0 R >>`,
  );
}

/**
 * Spec 0021, AC-5. A one page document whose line, `text`, is drawn in
 * `cidFont`'s font, its `CIDSystemInfo` naming `registry` and `ordering`. The
 * fixture below uses it, and tests build their own cases with it.
 */
export function cidDocument(text, ordering, registry = "Adobe") {
  const codes = [...text]
    .map((character) => character.codePointAt(0).toString(16).padStart(4, "0"))
    .join("");
  return stringDocument((add) => ({
    font: cidFont(add, registry, ordering),
    content: `BT /F1 18 Tf 72 700 Td <${codes}> Tj ET\n`,
  }));
}

/**
 * Spec 0021, AC-3 and AC-5. A page naming a person in a CID font whose
 * `/Ordering` repeats the name. The walk kept a `CIDSystemInfo`'s strings
 * whatever they held, so a run with the name ticked passed the check and kept
 * it there; now the open refuses the file.
 */
export function keptCidStrings() {
  return cidDocument(`Prepared by ${KEPT_TEXT.ordering}`, KEPT_TEXT.ordering);
}

/**
 * Strings `marked-descriptions.pdf` writes into its pages' drawing
 * instructions, for the pins on what MuPDF's `sanitize` keeps (spec 0019,
 * AC-10).
 */
export const MARKED_TEXT = Object.freeze({
  /** The value on page 1, ticked by the pin. */
  value: "jane.doe@example.com",
  /** Page 1's inline alternate text, around the value. */
  alt: "Alternate text naming Jane Doe",
  /** Page 4's inline replacement text, around only a filled shape. */
  shape: "A chart of quarterly sales",
});

/**
 * Spec 0019, AC-10. One page per case of the `marked-descriptions` warning,
 * each a marked content sequence or point written into the page's drawing
 * instructions, each page with a line anybody can read:
 *
 *  1. an inline `/Span` with `/Alt` and `/E` around a line holding a value (warns);
 *  2. a `DP` point with a private string (warns);
 *  3. an inline span holding only `/ActualText` around text (quiet);
 *  4. an inline `/ActualText` around only a filled shape (warns);
 *  5. a property list named in `/Properties`, its `/ActualText` around only a
 *     filled shape (warns);
 *  6. a span holding only `/MCID` (quiet);
 *  7. `/Lang (en-GB)` and `/Lang (en_US)` (quiet);
 *  8. `/Lang (Jane Smith)` (warns);
 *  9. an inline `/E` inside a form XObject the page draws (warns);
 * 10. an artifact holding only names (quiet).
 */
export function markedDescriptions() {
  return keptDocument(({ add, fonts }) => {
    const named = add(`<< /ActualText ${literal("A named figure")} >>`);
    const figure = form(add, fonts, "Words inside a form");
    const inForm = add(
      stream(
        `/Type /XObject /Subtype /Form /BBox [0 0 400 40] /Resources << /Font << ${fonts} >> >>`,
        `/Span << /E ${literal("Expansion inside a form")} >> BDC ` +
          line("F1", 12, 4, 20, "Words inside a form") +
          "EMC\n",
      ),
    );
    const shape = "0.6 g 72 560 120 60 re f 0 g\n";
    return {
      pages: [
        {
          content:
            line("F1", 12, 72, 720, "Page one: alternate text around a value") +
            `/Span << /Alt ${literal(MARKED_TEXT.alt)} /E (JD) >> BDC ` +
            line("F1", 12, 72, 690, `Contact: ${MARKED_TEXT.value}`) +
            "EMC\n",
        },
        {
          content:
            line("F1", 12, 72, 720, "Page two: a point with a private string") +
            `/Note << /Private ${literal("A private note on this page")} >> DP\n`,
        },
        {
          content:
            line("F1", 12, 72, 720, "Page three: replacement text around text") +
            `/Span << /ActualText ${literal("Shown words")} >> BDC ` +
            line("F1", 12, 72, 690, "Shown words") +
            "EMC\n",
        },
        {
          content:
            line("F1", 12, 72, 720, "Page four: replacement text around a shape") +
            `/Figure << /ActualText ${literal(MARKED_TEXT.shape)} >> BDC ${shape}EMC\n`,
        },
        {
          resources: `/Properties << /MC0 ${named} 0 R >>`,
          content:
            line("F1", 12, 72, 720, "Page five: a named list around a shape") +
            `/Figure /MC0 BDC ${shape}EMC\n`,
        },
        {
          content:
            line("F1", 12, 72, 720, "Page six: a marked content identifier") +
            "/P << /MCID 0 >> BDC " +
            line("F1", 12, 72, 690, "A tagged paragraph") +
            "EMC\n",
        },
        {
          content:
            line("F1", 12, 72, 720, "Page seven: language tags") +
            "/Span << /Lang (en-GB) >> BDC " +
            line("F1", 12, 72, 690, "Colour") +
            "EMC /Span << /Lang (en_US) >> BDC " +
            line("F1", 12, 72, 670, "Color") +
            "EMC\n",
        },
        {
          content:
            line("F1", 12, 72, 720, "Page eight: a language that is a name") +
            "/Span << /Lang (Jane Smith) >> BDC " +
            line("F1", 12, 72, 690, "Bonjour") +
            "EMC\n",
        },
        {
          resources: `/XObject << /Fm1 ${inForm} 0 R /Fm2 ${figure} 0 R >>`,
          content:
            line("F1", 12, 72, 720, "Page nine: an expansion inside a form") +
            "q 1 0 0 1 72 600 cm /Fm1 Do Q q 1 0 0 1 72 500 cm /Fm2 Do Q\n",
        },
        {
          content:
            "/Artifact << /Type /Pagination /Subtype /Header >> BDC " +
            line("F1", 12, 72, 760, "Page ten header") +
            "EMC " +
            line("F1", 12, 72, 720, "Page ten: an artifact holding only names"),
        },
      ],
    };
  });
}

/**
 * Every line the fourth pass fixtures draw, one for every page of every
 * fixture and one for each of `shared-forms.pdf`'s forms, so two builds write
 * the same bytes and a test can tick any page's line. Spec 0019, AC-17.
 */
export const COLOUR_TEXT = Object.freeze({
  iccAlternate: Object.freeze([
    "An unreadable profile over DeviceRGB",
    "An unreadable profile over DeviceCMYK",
  ]),
  iccBare: Object.freeze([
    "A bare unreadable profile, one channel",
    "A bare unreadable profile, three channels",
    "A bare unreadable profile, four channels",
    "A bare unreadable profile, stroked",
    "A bare unreadable profile, set with scn",
    "A bare unreadable profile inside a form",
  ]),
  calRgb: Object.freeze([
    "Calibrated RGB with a zero white point",
    "Calibrated RGB with a middle value of one half",
  ]),
  calGray: Object.freeze(["Calibrated grey with a zero white point"]),
  inline: Object.freeze(["An inline image in an unreadable profile"]),
  loaded: Object.freeze([
    "Lab with a zero white point",
    "A separation over an unreadable profile",
    "A separation whose tint arrays differ",
    "DeviceN over an unreadable profile",
    "Indexed over an unreadable profile",
    "Indexed with a short palette",
    "Indexed over calibrated RGB with a zero white point",
    "An uncoloured pattern over an unreadable profile",
  ]),
  sharedPictures: Object.freeze([
    "Two pictures with identical decode parameters",
    "Two pictures with identical indexed spaces",
    "Two pictures with identical calibrated spaces",
  ]),
  sharedForms: Object.freeze(["Two forms with an identical group and resources"]),
  /** What `shared-forms.pdf`'s two forms draw, one line each. */
  sharedFormLines: Object.freeze([
    "The first form draws this",
    "The second form draws this",
  ]),
});

/**
 * 128 bytes of fixed ASCII where an ICC profile belongs, shared by every case
 * that names an unreadable profile. Its first four bytes, read as the
 * profile's size, say far more than 128, so MuPDF 1.28.1 cannot load it and
 * draws with a device colour instead (spec 0019, AC-15).
 */
export const UNREADABLE_PROFILE = "This is not an ICC colour profile. "
  .repeat(4)
  .slice(0, 128);

/** Where every fourth pass case draws: a 100 point square at 72, 500. */
const SQUARE = "72 500 100 100 re";

/** A mid tone for each channel count (AC-17). */
const TONE = Object.freeze({ 1: "0.5", 3: "0.2 0.4 0.6", 4: "0.1 0.2 0.3 0.4" });

/** The square filled through `/CS0`, with `colour` as its operands. */
function filled(colour) {
  return `q /CS0 cs ${colour} sc ${SQUARE} f Q\n`;
}

/** A resource dictionary's `/ColorSpace` holding `space` as `/CS0`. */
function colourSpace(space) {
  return `/ColorSpace << /CS0 ${space} >>`;
}

/** An `/ICCBased` profile stream holding `UNREADABLE_PROFILE`, with `/Alternate` or without. */
function unreadableProfile(add, channels, alternate) {
  return add(
    stream(
      `/N ${channels}${alternate === undefined ? "" : ` /Alternate /${alternate}`}`,
      UNREADABLE_PROFILE,
    ),
  );
}

/**
 * A whole document for the fourth pass: every page 612 by 792 points with one
 * line of Helvetica 18 at 72, 700, then the case's drawing. `build` receives
 * `add` (append an object, get its number) and `font` (Helvetica's number),
 * and returns one spec per page: `text`, `content`, and optionally
 * `resources` (more resource entries).
 */
function colourDocument(build) {
  const objects = [];
  const add = (body) => objects.push(body);

  const catalog = add(null);
  const pages = add(null);
  const font = add(`<< ${HELVETICA} >>`);

  const kids = build({ add, font }).map((spec) => {
    const content = add(stream("", line("F1", 18, 72, 700, spec.text) + spec.content));
    return add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> ${spec.resources ?? ""} >> /Contents ${content} 0 R >>`,
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  return writePdf({ objects, trailer: `/Root ${catalog} 0 R` }).bytes;
}

/**
 * AC-17. An `/ICCBased` profile MuPDF cannot read, with `/Alternate`: three
 * channels over `/DeviceRGB` and four over `/DeviceCMYK`, each a filled square.
 */
export function colourIccAlternate() {
  return colourDocument(({ add }) => {
    const rgb = unreadableProfile(add, 3, "DeviceRGB");
    const cmyk = unreadableProfile(add, 4, "DeviceCMYK");
    return [
      {
        text: COLOUR_TEXT.iccAlternate[0],
        resources: colourSpace(`[/ICCBased ${rgb} 0 R]`),
        content: filled(TONE[3]),
      },
      {
        text: COLOUR_TEXT.iccAlternate[1],
        resources: colourSpace(`[/ICCBased ${cmyk} 0 R]`),
        content: filled(TONE[4]),
      },
    ];
  });
}

/**
 * AC-17. The same profile with no `/Alternate`: one, three and four channels
 * filled, three stroked with `CS` and `SC`, three set with `scn`, and three
 * filled inside a form XObject whose own resources hold the entry.
 */
export function colourIccBare() {
  return colourDocument(({ add }) => {
    const one = unreadableProfile(add, 1);
    const three = `[/ICCBased ${unreadableProfile(add, 3)} 0 R]`;
    const four = unreadableProfile(add, 4);
    const figure = add(
      stream(
        `/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << ${colourSpace(three)} >>`,
        filled(TONE[3]),
      ),
    );
    return [
      {
        text: COLOUR_TEXT.iccBare[0],
        resources: colourSpace(`[/ICCBased ${one} 0 R]`),
        content: filled(TONE[1]),
      },
      {
        text: COLOUR_TEXT.iccBare[1],
        resources: colourSpace(three),
        content: filled(TONE[3]),
      },
      {
        text: COLOUR_TEXT.iccBare[2],
        resources: colourSpace(`[/ICCBased ${four} 0 R]`),
        content: filled(TONE[4]),
      },
      {
        text: COLOUR_TEXT.iccBare[3],
        resources: colourSpace(three),
        content: `q /CS0 CS ${TONE[3]} SC 4 w ${SQUARE} S Q\n`,
      },
      {
        text: COLOUR_TEXT.iccBare[4],
        resources: colourSpace(three),
        content: `q /CS0 cs ${TONE[3]} scn ${SQUARE} f Q\n`,
      },
      {
        text: COLOUR_TEXT.iccBare[5],
        resources: `/XObject << /Fm0 ${figure} 0 R >>`,
        content: "q /Fm0 Do Q\n",
      },
    ];
  });
}

/**
 * AC-17. A `/CalRGB` whose white point is zero, and one whose middle value is
 * not 1, which the format requires.
 */
export function colourCalRgb() {
  return colourDocument(() => [
    {
      text: COLOUR_TEXT.calRgb[0],
      resources: colourSpace("[/CalRGB << /WhitePoint [0 0 0] >>]"),
      content: filled(TONE[3]),
    },
    {
      text: COLOUR_TEXT.calRgb[1],
      resources: colourSpace("[/CalRGB << /WhitePoint [0.9505 0.5 1.089] >>]"),
      content: filled(TONE[3]),
    },
  ]);
}

/** AC-17. A `/CalGray` whose white point is zero. */
export function colourCalGray() {
  return colourDocument(() => [
    {
      text: COLOUR_TEXT.calGray[0],
      resources: colourSpace("[/CalGray << /WhitePoint [0 0 0] >>]"),
      content: filled(TONE[1]),
    },
  ]);
}

/** The inline image's one pixel, three fixed bytes (0x33 0x66 0x99), one character each. */
const INLINE_PIXEL = String.fromCharCode(0x33, 0x66, 0x99);

/**
 * AC-17. An inline image whose `/CS` names an entry holding the unreadable
 * profile: 1 by 1, RGB, 8 bits, three fixed bytes, drawn 100 points square.
 */
export function colourInline() {
  return colourDocument(({ add }) => [
    {
      text: COLOUR_TEXT.inline[0],
      resources: colourSpace(`[/ICCBased ${unreadableProfile(add, 3)} 0 R]`),
      content: `q 100 0 0 100 72 500 cm BI /W 1 /H 1 /CS /CS0 /BPC 8 ID ${INLINE_PIXEL} EI Q\n`,
    },
  ]);
}

/**
 * AC-17, the control. Spaces with a broken part that MuPDF still loads, or
 * keeps naming, one per page: a `/Lab` with a zero white point, a
 * `/Separation` over the unreadable profile, a `/Separation` whose tint
 * function's `/C0` and `/C1` differ in length, a `/DeviceN` over the profile,
 * an `/Indexed` over it, an `/Indexed` with a palette shorter than its high
 * value, an `/Indexed` over a zero white point `/CalRGB`, and an uncoloured
 * tiling pattern over the profile. Every entry stays named, so the second
 * write never runs.
 */
export function colourLoaded() {
  return colourDocument(({ add }) => {
    const profile = `[/ICCBased ${unreadableProfile(add, 3)} 0 R]`;
    const tint = (high) =>
      `<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0] /C1 [${high}] /N 1 >>`;
    const palette = "<000000336699>";
    const pattern = add(
      stream(
        "/Type /Pattern /PatternType 1 /PaintType 2 /TilingType 1 /BBox [0 0 10 10] " +
          "/XStep 10 /YStep 10 /Resources << >>",
        "0 0 5 5 re f\n",
      ),
    );
    const page = (at, space, colour) => ({
      text: COLOUR_TEXT.loaded[at],
      resources: colourSpace(space),
      content: filled(colour),
    });
    return [
      page(0, "[/Lab << /WhitePoint [0 0 0] >>]", "50 0 0"),
      page(1, `[/Separation /Spot ${profile} ${tint(TONE[3])}]`, TONE[1]),
      page(2, `[/Separation /Spot /DeviceRGB ${tint("0.2 0.4")}]`, TONE[1]),
      page(3, `[/DeviceN [/Spot] ${profile} ${tint(TONE[3])}]`, TONE[1]),
      page(4, `[/Indexed ${profile} 1 ${palette}]`, "1"),
      page(5, `[/Indexed /DeviceRGB 3 ${palette}]`, "2"),
      page(6, `[/Indexed [/CalRGB << /WhitePoint [0 0 0] >>] 1 ${palette}]`, "1"),
      {
        text: COLOUR_TEXT.loaded[7],
        resources: `${colourSpace(`[/Pattern ${profile}]`)} /Pattern << /P0 ${pattern} 0 R >>`,
        content: `q /CS0 cs ${TONE[3]} /P0 scn ${SQUARE} f Q\n`,
      },
    ];
  });
}

/**
 * Fixed 8 by 8 pixels, Flate compressed: three bytes a pixel for RGB, or one
 * index a pixel below `indexes`. `seed` keeps the two pictures on a page
 * different.
 */
function eightByEight(seed, indexes) {
  const pixels =
    indexes === undefined
      ? Uint8Array.from({ length: 8 * 8 * 3 }, (_, at) => (seed * 53 + at * 29) % 256)
      : Uint8Array.from({ length: 8 * 8 }, (_, at) => (seed + at + (at >> 3)) % indexes);
  return deflateSync(pixels);
}

/** An 8 by 8 Flate picture, with `extra` dictionary entries. */
function sharedPicture(add, data, extra) {
  return add(
    stream(
      "/Type /XObject /Subtype /Image /Width 8 /Height 8 /BitsPerComponent 8 " +
        `/Filter /FlateDecode ${extra}`,
      data,
    ),
  );
}

/** Two pictures drawn 100 points square, side by side under the line. */
const TWO_PICTURES =
  "q 100 0 0 100 72 500 cm /Im0 Do Q q 100 0 0 100 222 500 cm /Im1 Do Q\n";

/**
 * AC-17. Three pages, each two pictures pointing at two identical indirect
 * objects, which MuPDF's deduplicating write merges into one: a decode
 * parameters dictionary, an indexed colour space array (its palette inside)
 * and a calibrated colour space array. Main wrote each such picture blank,
 * because its carrier sweep had resolved it (AC-16).
 */
export function sharedPictures() {
  return colourDocument(({ add }) => {
    const pair = (body) => [add(body), add(body)];
    const parameters = pair("<< /Colors 3 /BitsPerComponent 8 /Columns 8 >>");
    const indexed = pair("[/Indexed /DeviceRGB 3 <000000336699996633ffffff>]");
    const calibrated = pair("[/CalRGB << /WhitePoint [0.9505 1 1.089] >>]");
    const page = (at, pictures) => ({
      text: COLOUR_TEXT.sharedPictures[at],
      resources: `/XObject << /Im0 ${pictures[0]} 0 R /Im1 ${pictures[1]} 0 R >>`,
      content: TWO_PICTURES,
    });
    return [
      page(
        0,
        parameters.map((object, seed) =>
          sharedPicture(
            add,
            eightByEight(seed),
            `/ColorSpace /DeviceRGB /DecodeParms ${object} 0 R`,
          ),
        ),
      ),
      page(
        1,
        indexed.map((object, seed) =>
          sharedPicture(add, eightByEight(seed, 4), `/ColorSpace ${object} 0 R`),
        ),
      ),
      page(
        2,
        calibrated.map((object, seed) =>
          sharedPicture(add, eightByEight(seed + 2), `/ColorSpace ${object} 0 R`),
        ),
      ),
    ];
  });
}

/**
 * AC-17. Two forms, each pointing at an identical indirect `/Group` and an
 * identical indirect `/Resources`, each drawing a line of text, 200 by 100
 * points side by side under the page's line. Main refused it with
 * `unsupported`, because the forms lost their text in the write (AC-16).
 */
export function sharedForms() {
  return colourDocument(({ add, font }) => {
    const figure = (text) => {
      const group = add("<< /Type /Group /S /Transparency >>");
      const resources = add(`<< /Font << /F1 ${font} 0 R >> >>`);
      return add(
        stream(
          "/Type /XObject /Subtype /Form /BBox [0 0 200 100] " +
            `/Group ${group} 0 R /Resources ${resources} 0 R`,
          line("F1", 12, 10, 45, text),
        ),
      );
    };
    const [first, second] = COLOUR_TEXT.sharedFormLines.map(figure);
    return [
      {
        text: COLOUR_TEXT.sharedForms[0],
        resources: `/XObject << /Fm0 ${first} 0 R /Fm1 ${second} 0 R >>`,
        content: "q 1 0 0 1 72 500 cm /Fm0 Do Q q 1 0 0 1 300 500 cm /Fm1 Do Q\n",
      },
    ];
  });
}
