/**
 * Build the fixture PDFs the tests open.
 *
 * Generated rather than hand edited so the bytes are reviewable as code, and so
 * nobody has to trust an opaque binary in the repository of a privacy tool. The
 * outputs are committed; run `node scripts/make-fixture.mjs` after changing one.
 *
 * Every fixture is written object by object in this file. None is made by the
 * engine it tests, so a MuPDF bug cannot write a fixture that hides itself.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  detectBlocked,
  detectCard,
  detectDate,
  detectDense,
  detectStamped,
  detectEmail,
  detectIban,
  detectMany,
  detectPhone,
  detectUkNino,
  detectUnicode,
  detectUsSsn,
  detectWraps,
  sampleAgreement,
} from "./lib/detection-fixtures.mjs";
import { encryptObjects } from "./lib/pdf-encrypt.mjs";
import { appendRevision, stream, writePdf } from "./lib/pdf-writer.mjs";
import {
  readBlank,
  readConcealed,
  readCovered,
  readCrooked,
  readEmptyClip,
  readEmptyClipScan,
  readHidden,
  readMixed,
  readPages,
  readPictures,
  readPrivate,
  readRefusedMix,
  readScans,
  readShortOcr,
  readSlides,
  readStamped,
  readUnmapped,
  trimEdge,
  trimKept,
  trimOcr,
  trimQuote,
  trimRefused,
  trimScan,
  trimText,
} from "./lib/reading-fixtures.mjs";
import {
  actualText,
  angledText,
  boundsPin,
  carlito,
  combining,
  formXObjectPage,
  imagesUnder,
  kerning,
  loneGlyphs,
  nextLine,
  ocrAligned,
  ocrBare,
  ocrMisaligned,
  offsetCropBox,
  outlined,
  reach,
  rotatedPage,
  sharedXObject,
  singleSpacing,
  superscript,
  textPage,
  twoLines,
  watermark,
  xObjectTwice,
  xObjectTwoPages,
} from "./lib/redaction-fixtures.mjs";

/**
 * Two pages on purpose:
 *   page 1 carries a text layer,
 *   page 2 has no content stream at all, standing in for a scanned page.
 *
 * That lets one fixture exercise the page count and the per page text layer flag
 * feature 7 will build on.
 */
function twoPages() {
  const encoder = new TextEncoder();
  const pageOneContent = `BT /F1 18 Tf 72 700 Td (RedactNest fixture page one) Tj ET
BT /F1 12 Tf 72 660 Td (Contact: contact@example.com) Tj ET
`;

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
      // No /Contents, so this page has nothing to extract text from.
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${encoder.encode(pageOneContent).length} >>\nstream\n${pageOneContent}endstream`,
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/** A tiny image or thumbnail: `width` by `height` RGB pixels of one colour. */
function rgbPixels(width, height, [red, green, blue]) {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = red;
    pixels[index + 1] = green;
    pixels[index + 2] = blue;
  }
  return pixels;
}

/**
 * Spec 0004, AC-7 and AC-22. Everything the output must not carry, in one file.
 *
 * Every kind in AC-7 that a file can have and still be opened: document info,
 * XMP metadata on the catalog and on an image, annotations (a link, a note with
 * its popup, a file attachment), a form field, an embedded and an associated
 * file, a bookmark, document JavaScript and an open action, automatic actions
 * on the catalog and a page, a page thumbnail, private application data, a
 * structure tree, page labels and a file identifier. Optional content is the
 * one kind missing, because a layered file is refused at open (AC-3) and has
 * fixtures of its own below.
 *
 * Two revisions, so the earlier one is left in the file the way an editor that
 * saves incrementally leaves it.
 *
 * And the three things the shared prepare step exists for (AC-22): a hidden
 * annotation that must never be painted in, a Redact mark already in the source
 * that must remove nothing, and a form field with no appearance of its own, so
 * MuPDF regenerates one. Plus a visible typed note, which must stay visible as
 * page text (AC-8).
 *
 * Page 2 is rotated with offset boxes and a transparency group, for AC-9.
 */
function metadata() {
  const pageOne = `BT /F1 18 Tf 72 720 Td (Quarterly report) Tj ET
BT /F1 12 Tf 72 690 Td (Contact: jane.doe@example.com or 020 7946 0958) Tj ET
BT /F1 12 Tf 72 660 Td (Keep this sentence exactly as it is) Tj ET
q 40 0 0 20 400 600 cm /Im1 Do Q
`;

  const base = writePdf({
    objects: [
      // 1: the catalog, carrying every document level kind at once.
      "<< /Type /Catalog /Pages 2 0 R /Lang (en-GB) /Metadata 20 0 R /Outlines 21 0 R " +
        "/Names << /EmbeddedFiles 23 0 R /JavaScript 26 0 R >> /OpenAction 28 0 R " +
        "/AA << /WC 28 0 R >> /AF [24 0 R] " +
        "/AcroForm << /Fields [15 0 R] /NeedAppearances true /DA (/Helv 0 Tf 0 g) " +
        "/DR << /Font << /Helv 5 0 R >> >> >> " +
        "/StructTreeRoot 29 0 R /MarkInfo << /Marked true >> " +
        "/PageLabels << /Nums [0 << /S /r >>] >> /ViewerPreferences << /HideToolbar true >> " +
        "/PieceInfo << /RedactNestFixture << /Private (catalog private data) >> >> >>",
      // 2
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      // 3: page one, carrying every page level kind.
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 6 0 R " +
        "/Annots [9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R] /Thumb 8 0 R " +
        "/Group << /S /Transparency /CS /DeviceRGB /I true >> " +
        "/PieceInfo << /RedactNestFixture << /Private (page private data) >> >> " +
        "/LastModified (D:20260101000000Z) /AA << /O 28 0 R >> /Metadata 19 0 R /StructParents 0 >>",
      // 4: page two, rotated, with every page box offset from the origin.
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [36 36 576 756] " +
        "/BleedBox [30 30 582 762] /TrimBox [40 40 572 752] /ArtBox [50 50 562 742] /Rotate 90 " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 17 0 R " +
        "/Group << /S /Transparency /CS /DeviceRGB >> >>",
      // 5
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      // 6
      stream("", pageOne),
      // 7: an image with its own XMP packet, below the page.
      stream(
        "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB " +
          "/BitsPerComponent 8 /Metadata 18 0 R",
        rgbPixels(2, 2, [200, 40, 40]),
      ),
      // 8: a page thumbnail.
      stream(
        "/Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8",
        rgbPixels(2, 2, [40, 40, 200]),
      ),
      // 9: a link, which counts as an annotation too.
      "<< /Type /Annot /Subtype /Link /Rect [72 686 300 704] /Border [0 0 0] " +
        "/A << /S /URI /URI (https://example.com/secret-link) >> >>",
      // 10 and 11: a sticky note and its popup.
      "<< /Type /Annot /Subtype /Text /Rect [500 700 520 720] /Contents (Private reviewer comment) " +
        "/T (Reviewer Name) /Popup 11 0 R /Open false >>",
      "<< /Type /Annot /Subtype /Popup /Rect [520 620 620 720] /Parent 10 0 R >>",
      // 12: a file attachment annotation, pointing at the embedded file.
      "<< /Type /Annot /Subtype /FileAttachment /Rect [540 740 556 756] /FS 24 0 R " +
        "/Contents (Attached file) >>",
      // 13: a Redact mark already in the source, over a sentence nobody ticked.
      "<< /Type /Annot /Subtype /Redact /Rect [70 655 300 675] " +
        "/QuadPoints [70 675 300 675 70 655 300 655] >>",
      // 14: a typed note flagged hidden, which no viewer ever shows.
      "<< /Type /Annot /Subtype /FreeText /Rect [72 560 400 590] /Contents (Hidden annotation text) " +
        "/DA (/Helv 12 Tf 0 g) /F 2 >>",
      // 15: a filled text field with no appearance, so it is regenerated.
      "<< /Type /Annot /Subtype /Widget /FT /Tx /T (account_name) /V (Form field value) " +
        "/Rect [72 500 300 520] /P 3 0 R /DA (/Helv 12 Tf 0 g) /F 4 >>",
      // 16: a visible typed note, which must stay visible (AC-8).
      "<< /Type /Annot /Subtype /FreeText /Rect [72 440 400 470] /Contents (Visible typed note) " +
        "/DA (/Helv 12 Tf 0 g) /F 4 >>",
      // 17: page two's first wording, replaced in the second revision.
      stream("", "BT /F1 12 Tf 72 700 Td (Draft wording that was replaced) Tj ET\n"),
      // 18 and 19: XMP on the image and on page one.
      stream("/Type /Metadata /Subtype /XML", "<x:xmpmeta>image xmp secret</x:xmpmeta>"),
      stream("/Type /Metadata /Subtype /XML", "<x:xmpmeta>page xmp secret</x:xmpmeta>"),
      // 20: XMP on the catalog.
      stream(
        "/Type /Metadata /Subtype /XML",
        "<x:xmpmeta><dc:creator>Jane Secret</dc:creator></x:xmpmeta>",
      ),
      // 21 and 22: one bookmark.
      "<< /Type /Outlines /First 22 0 R /Last 22 0 R /Count 1 >>",
      "<< /Title (Chapter with a secret title) /Parent 21 0 R /Dest [3 0 R /Fit] >>",
      // 23 to 25: an embedded file, also associated with the catalog.
      "<< /Names [(secret.txt) 24 0 R] >>",
      "<< /Type /Filespec /F (secret.txt) /UF (secret.txt) /EF << /F 25 0 R >> " +
        "/AFRelationship /Data >>",
      stream("/Type /EmbeddedFile", "attached secret contents"),
      // 26 and 27: document level JavaScript.
      "<< /Names [(init) 27 0 R] >>",
      "<< /S /JavaScript /JS (app.alert\\('document script'\\);) >>",
      // 28: a script run on open, and on close, and when page one shows.
      "<< /S /JavaScript /JS (this.print\\('open action'\\);) >>",
      // 29 and 30: a structure tree.
      "<< /Type /StructTreeRoot /K 30 0 R /ParentTree << /Nums [0 [30 0 R]] >> >>",
      "<< /Type /StructElem /S /P /P 29 0 R /Pg 3 0 R /K 0 /Alt (Structure alt text) >>",
      // 31: document info.
      "<< /Title (Secret title) /Author (Jane Secret) /Producer (RedactNest fixture) >>",
    ],
    trailer:
      "/Root 1 0 R /Info 31 0 R " +
      "/ID [<52656461637446697874757265494430> <52656461637446697874757265494430>]",
  });

  // The second revision: new document info and new wording on page two. The
  // first revision stays in the bytes above it.
  return appendRevision(base, {
    objects: new Map([
      [17, stream("", "BT /F1 12 Tf 72 700 Td (Final wording) Tj ET\n")],
      [
        31,
        "<< /Title (Updated secret title) /Author (Jane Secret) " +
          "/ModDate (D:20260201000000Z) >>",
      ],
    ]),
    trailer:
      "/Root 1 0 R /Info 31 0 R " +
      "/ID [<52656461637446697874757265494430> <52656461637446697874757265494431>]",
  }).bytes;
}

/**
 * Spec 0004, AC-3. A document with layers, refused at open whatever state each
 * layer is in. `offLayer` decides whether the second layer starts switched off.
 */
function layered(offLayer) {
  const content = `/OC /L1 BDC BT /F1 12 Tf 72 700 Td (Text on the first layer) Tj ET EMC
/OC /L2 BDC BT /F1 12 Tf 72 670 Td (Text on the second layer) Tj ET EMC
`;
  const defaults = offLayer ? "/ON [5 0 R] /OFF [6 0 R]" : "/ON [5 0 R 6 0 R]";

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R " +
        `/OCProperties << /OCGs [5 0 R 6 0 R] /D << ${defaults} /Order [5 0 R 6 0 R] >> >> >>`,
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> /Properties << /L1 5 0 R /L2 6 0 R >> >> " +
        "/Contents 7 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /OCG /Name (First layer) >>",
      "<< /Type /OCG /Name (Second layer) >>",
      stream("", content),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * Spec 0004, AC-1. A valid one page PDF with `junk` bytes ahead of its `%PDF-`
 * marker. At 1019 the whole marker still lies in the first 1024 bytes; at 1020
 * its last byte does not.
 */
function headerAt(junk) {
  const content = "BT /F1 12 Tf 72 700 Td (Header offset fixture) Tj ET\n";

  return writePdf({
    prefix: `${"-".repeat(junk - 1)}\n`,
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream("", content),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * Spec 0004, AC-24. A PDF whose cross reference table is not where the file
 * says it is. MuPDF repairs it and opens it, and prints warnings about the
 * repair as it goes, which is what the quiet console test needs to be silent.
 */
function damaged() {
  const intact = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream("", "BT /F1 12 Tf 72 700 Td (A damaged but readable page) Tj ET\n"),
    ],
    trailer: "/Root 1 0 R",
  });

  const text = new TextDecoder("latin1").decode(intact.bytes);
  const broken = text.replace(/startxref\n\d+/, "startxref\n999999");
  return Uint8Array.from(broken, (character) => character.charCodeAt(0));
}

/**
 * Spec 0004, AC-10. A one page PDF anybody can open, with an owner password
 * that forbids editing, under `scheme`. The output of a run must come out
 * unencrypted and unrestricted.
 */
function ownerPassword(scheme) {
  const { objects, trailer } = encryptObjects(
    [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream(
        "",
        `BT /F1 12 Tf 72 700 Td (Owner password fixture, ${scheme}) Tj ET\n` +
          "BT /F1 12 Tf 72 680 Td (Contact: jane.doe@example.com) Tj ET\n",
      ),
    ],
    scheme,
  );

  return writePdf({ objects, trailer: `/Root 1 0 R ${trailer}` }).bytes;
}

const FIXTURES = [
  ["two-pages.pdf", twoPages(), "2 pages, 1 with text"],
  ["metadata.pdf", metadata(), "every AC-7 kind, two revisions, the AC-22 cases"],
  ["layers-all-on.pdf", layered(false), "two layers, both on"],
  ["layers-one-off.pdf", layered(true), "two layers, one off"],
  ["header-at-1019.pdf", headerAt(1019), "%PDF- starting at byte 1019"],
  ["header-at-1020.pdf", headerAt(1020), "%PDF- starting at byte 1020"],
  ["damaged.pdf", damaged(), "a broken cross reference MuPDF repairs"],
  ["owner-rc4.pdf", ownerPassword("rc4"), "owner password, 128 bit RC4"],
  ["owner-aes128.pdf", ownerPassword("aes-128"), "owner password, AES-128"],
  ["owner-aes256.pdf", ownerPassword("aes-256"), "owner password, AES-256"],
  // Spec 0004, slice 2: the fixture matrix for real removal.
  ["text-page.pdf", textPage(), "an email and a phone number to tick"],
  ["single-spacing.pdf", singleSpacing(), "12pt and 14pt leading, Helvetica and Courier"],
  ["carlito.pdf", carlito(), "Carlito: single spacing and kerning"],
  ["kerning.pdf", kerning(), "neighbours kerned 80 to 300 thousandths into a match"],
  ["two-lines.pdf", twoLines(), "a match split across two lines"],
  ["rotated-page.pdf", rotatedPage(), "a page rotated 90 degrees"],
  ["angled-text.pdf", angledText(), "text drawn at 30 degrees"],
  ["offset-cropbox.pdf", offsetCropBox(), "a crop box away from the origin"],
  ["form-xobject.pdf", formXObjectPage(), "a match inside a form XObject"],
  ["shared-xobject.pdf", sharedXObject(), "a form XObject in shared resources"],
  ["xobject-two-pages.pdf", xObjectTwoPages(), "a form XObject drawn on pages 1 and 3"],
  ["xobject-twice.pdf", xObjectTwice(), "a form XObject drawn twice on one page"],
  ["ocr-aligned.pdf", ocrAligned(), "a scan with a Tesseract style text layer"],
  ["ocr-misaligned.pdf", ocrMisaligned(), "the same, text layer shifted"],
  ["ocr-bare.pdf", ocrBare(), "the same scan without the match's ink"],
  ["images-under.pdf", imagesUnder(), "an inline image and an image mask under matches"],
  ["outlined.pdf", outlined(), "a match drawn as outlines over invisible text"],
  ["lone-glyphs.pdf", loneGlyphs(), "a lone . and a lone i"],
  ["watermark.pdf", watermark(), "a diagonal watermark crossing a match"],
  ["superscript.pdf", superscript(), "a superscript inside a match's line box"],
  ["combining.pdf", combining(), "a match holding a combining mark"],
  ["actual-text.pdf", actualText(), "replacement text spans, exact, wider and differing"],
  // Spec 0004, slice 4: slanted targets, and images MuPDF would blank too far.
  ["reach.pdf", reach(), "slanted, sheared and joined matches, and matches over images"],
  [
    "bounds-pin.pdf",
    boundsPin(),
    "what MuPDF blanks and removes around an area's bounds",
  ],
  // Spec 0004, slice 5: text MuPDF moves off the page, and text already there.
  // One case per file, because a `'` line on any page fails every run on its
  // document.
  ...nextLine().map((bytes, index) => [
    `next-line-${index}.pdf`,
    bytes,
    [
      "the match alone on a line shown with '",
      'the match alone on a line shown with "',
      "the match alone on a line moved with T*, the control",
      "the match, then kept text on a line shown with '",
      "the match, and a line drawn off the page",
    ][index],
  ]),
  // Spec 0005: pattern detection.
  [
    "detect-email.pdf",
    detectEmail(),
    "email in running text, scripts, columns, reversed",
  ],
  ["detect-many.pdf", detectMany(), "600 email addresses on one page"],
  ["detect-dense.pdf", detectDense(), "a 50 page staff directory, 2,200 matches"],
  [
    "detect-stamped.pdf",
    detectStamped(),
    "an address under a CONFIDENTIAL stamp, one clear of it",
  ],
  ["detect-unicode.pdf", detectUnicode(), "an email holding letters above U+FFFF"],
  [
    "detect-phone.pdf",
    detectPhone(),
    "UK, US and international numbers, numbers side by side, and look alikes",
  ],
  [
    "detect-blocked.pdf",
    detectBlocked(),
    "a match for each reason detection blocks, and the limit",
  ],
  [
    "detect-wraps.pdf",
    detectWraps(),
    "addresses wrapped across lines, and across blocks",
  ],
  // Spec 0005, feature 12: the release 3 detectors.
  [
    "detect-date.pdf",
    detectDate(),
    "dates written and numeric, birth words, near misses",
  ],
  ["detect-card.pdf", detectCard(), "test card numbers, Luhn failures, longer numbers"],
  ["detect-iban.pdf", detectIban(), "example IBANs, a wrong check, an unknown country"],
  ["detect-us-ssn.pdf", detectUsSsn(), "Social Security numbers, bare and never issued"],
  [
    "detect-uk-nino.pdf",
    detectUkNino(),
    "National Insurance numbers, and prefixes never issued",
  ],
  [
    "sample-agreement.pdf",
    sampleAgreement(),
    "a two page employment agreement, 4 email addresses and 3 phone numbers",
  ],
  // Spec 0006: reading every page before review.
  ["read-pages.pdf", readPages(), "one page per reading rule and near miss"],
  ["read-scans.pdf", readScans(), "every page a scan"],
  ["read-blank.pdf", readBlank(), "every page blank, one a white rectangle"],
  ["read-stamped.pdf", readStamped(), "every page a scan with a Bates number"],
  ["read-unmapped.pdf", readUnmapped(), "every page in a font with no character map"],
  ["read-private.pdf", readPrivate(), "every page in private use code points"],
  ["read-refused-mix.pdf", readRefusedMix(), "a scan, a blank, a stamped scan, unmapped"],
  ["read-mixed.pdf", readMixed(), "a typed page, a scan and a blank page"],
  ["read-pictures.pdf", readPictures(), "one page per picture rule and near miss"],
  ["read-slides.pdf", readSlides(), "full bleed photo slides with a title and bullets"],
  [
    "read-crooked.pdf",
    readCrooked(),
    "a crooked OCR scan and a typed page at the same angle",
  ],
  ["read-covered.pdf", readCovered(), "one page per covering rule and near miss"],
  ["read-hidden.pdf", readHidden(), "one page per hiding rule and near miss"],
  // Spec 0008: the OCR advice followed on a one line scan.
  ["read-short-ocr.pdf", readShortOcr(), "a scan whose text layer is one short line"],
  // One case per file, because an open stops at the first page it refuses.
  ...readEmptyClip().map((bytes, index) => [
    `read-empty-clip-${index}.pdf`,
    bytes,
    [
      "an address under a zero area clip",
      "an address under a zero width clip",
      "an address under two nested clips that do not meet",
      "an address under a clip whose path is empty",
    ][index],
  ]),
  [
    "read-empty-clip-scan.pdf",
    readEmptyClipScan(),
    "a scan with nothing readable, and an address under a zero area clip",
  ],
  [
    "read-concealed.pdf",
    readConcealed(),
    "a covered email and phone, and a hidden email",
  ],
  [
    "trim-text.pdf",
    trimText(),
    "text below the crop, below the media box, and across its edge",
  ],
  [
    "trim-scan.pdf",
    trimScan(),
    "a cropped 150 ppi scan, and a picture wholly off the page",
  ],
  ["trim-kept.pdf", trimKept(), "a stretched band and a turned picture across the edge"],
  [
    "trim-edge.pdf",
    trimEdge(),
    "a scan 0.28 pt past an A4 page, a picture beside an address, a mask's image",
  ],
  [
    "trim-refused.pdf",
    trimRefused(),
    "a size change between glyphs outside and inside the crop",
  ],
  ["trim-quote.pdf", trimQuote(), "a trimmed page that shows a line with a quote"],
  [
    "trim-ocr.pdf",
    trimOcr(),
    "a scan with Tesseract's text layer, cropped through its lines",
  ],
];

const outDir = join(process.cwd(), "tests", "fixtures");
await mkdir(outDir, { recursive: true });

for (const [name, bytes, note] of FIXTURES) {
  await writeFile(join(outDir, name), bytes);
  console.log(`[make-fixture] tests/fixtures/${name} (${note})`);
}
