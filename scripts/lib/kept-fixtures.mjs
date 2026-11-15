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
 */

import { deflateSync } from "node:zlib";

import { stream, writePdf } from "./pdf-writer.mjs";
import { line, literal } from "./redaction-fixtures.mjs";

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
