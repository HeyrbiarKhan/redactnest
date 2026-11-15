import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  CATALOG_KEYS,
  EngineFailure,
  openDocumentWith,
  PAGE_KEYS,
  redactDocumentWith,
  ROLES,
  silenceEngineLog,
  STRING_PLACES,
  TRAILER_KEYS,
  walkRoles,
  type Shape,
} from "@/engine";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { inspect, keysOf, LIMITS, mupdf } from "../support/mupdf";

/**
 * The typed allowlist's walk. Spec 0019, AC-1 to AC-3, INV-1 and INV-2.
 *
 * Every document here is built in the test, object by object, so each case
 * holds exactly the shape it is about. Objects 1 to 4 are the catalog, the page
 * tree, the page and its contents; each case's own objects start at 5.
 */

type Body = string | ReturnType<typeof stream>;

const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

/** A one page document: `resources` and `pageKeys` on the page, `rest` from object 5. */
function onePage(resources: string, rest: Body[], content = "", pageKeys = ""): Body[] {
  return [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} ` +
      `/Contents 4 0 R ${pageKeys}>>`,
    stream("", content),
    ...rest,
  ];
}

/** Open `objects` as a document, hand it to `read`, and destroy it after. */
function withDoc<T>(
  objects: Body[],
  read: (doc: PDFDocument) => T,
  trailer = "/Root 1 0 R",
): T {
  const { bytes } = writePdf({ objects, trailer });
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF");
    return read(pdf);
  } finally {
    doc.destroy();
  }
}

function labelsOf(doc: PDFDocument, num: number, from: "catalog" | "pages" = "catalog") {
  return [...(walkRoles(doc, "read", from).reached.get(num) ?? [])].sort();
}

function problemOf(objects: Body[], from: "catalog" | "pages" = "catalog") {
  return withDoc(objects, (doc) => walkRoles(doc, "read", from).problem);
}

/** Every key, at any depth of a shape, whose value is a string. */
function stringKeys(): string[] {
  const found: string[] = [];
  const walk = (shape: Shape, place: string): void => {
    if (shape.is === "string") found.push(place);
    if (shape.is === "either") shape.options.forEach((option) => walk(option, place));
    if (shape.is === "array") walk(shape.item, place);
    if (shape.is === "dict") walk(shape.value, place);
  };
  for (const [role, rule] of Object.entries(ROLES)) {
    for (const [key, shape] of Object.entries(rule.keys)) walk(shape, `${role} ${key}`);
  }
  return found.sort();
}

describe("the role table", () => {
  it("restates the catalog and page allowlists", () => {
    expect(Object.keys(ROLES.catalog.keys).sort()).toEqual([...CATALOG_KEYS].sort());
    expect(Object.keys(ROLES.page.keys).sort()).toEqual([...PAGE_KEYS].sort());
  });

  it("gives the string shape only at the string places (AC-2)", () => {
    const places = STRING_PLACES.flatMap((place) =>
      "role" in place ? [`${place.role} ${place.key}`] : [],
    ).sort();
    expect(stringKeys()).toEqual(places);
    expect(STRING_PLACES).toContainEqual({ colourSpace: "Indexed", item: 3 });
  });

  it("keeps only /Size and /Root on the trailer", () => {
    expect(TRAILER_KEYS).toEqual(["Size", "Root"]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ROLES)).toBe(true);
    expect(Object.isFrozen(ROLES.image.keys)).toBe(true);
    expect(Object.isFrozen(STRING_PLACES[0])).toBe(true);
  });
});

describe("roles come from the path that reached an object (INV-1)", () => {
  it("chooses a font's role by /Subtype, and a Type 0 font's descendant is a CID font", () => {
    const objects = onePage("<< /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 9 0 R >> >>", [
      HELVETICA,
      "<< /Type /Font /Subtype /MMType1 /BaseFont /Minion >>",
      "<< /Type /Font /Subtype /Type0 /BaseFont /Song /Encoding /Identity-H /DescendantFonts [8 0 R] >>",
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Song /DW 1000 >>",
      "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1 1] /FontMatrix [1 0 0 1 0 0] " +
        "/CharProcs << >> /Encoding << /Differences [0 /a] >> >>",
    ]);
    withDoc(objects, (doc) => {
      expect(labelsOf(doc, 5)).toEqual(["simple-font"]);
      expect(labelsOf(doc, 6)).toEqual(["simple-font"]);
      expect(labelsOf(doc, 7)).toEqual(["type0-font"]);
      expect(labelsOf(doc, 8)).toEqual(["cid-font"]);
      expect(labelsOf(doc, 9)).toEqual(["type3-font"]);
    });
  });

  it("makes an XObject an image or a form by /Subtype, whatever its /Type says", () => {
    const objects = onePage("<< /XObject << /Im1 5 0 R /Fm1 6 0 R >> >>", [
      stream(
        "/Type /Font /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
        "\u0080",
      ),
      stream("/Type /XObject /Subtype /Form /BBox [0 0 1 1]", ""),
    ]);
    withDoc(objects, (doc) => {
      expect(labelsOf(doc, 5)).toEqual(["image"]);
      expect(labelsOf(doc, 6)).toEqual(["form"]);
    });
  });

  it("makes a pattern tiling or shading by /PatternType", () => {
    const objects = onePage("<< /Pattern << /P1 5 0 R /P2 6 0 R >> >>", [
      stream(
        "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 1 1] /XStep 1 /YStep 1",
        "",
      ),
      "<< /Type /Pattern /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB " +
        "/Coords [0 0 1 1] /Function << /FunctionType 2 /Domain [0 1] /N 1 >> >> >>",
    ]);
    withDoc(objects, (doc) => {
      expect(labelsOf(doc, 5)).toEqual(["tiling-pattern"]);
      expect(labelsOf(doc, 6)).toEqual(["shading-pattern"]);
    });
  });
});

describe("kinds for objects that are not dictionaries", () => {
  it("labels each indirect value by its shape's kind", () => {
    const objects = onePage(
      "<< /Font << /F1 5 0 R >> /XObject << /Im1 8 0 R >> /ColorSpace << /CS1 6 0 R >> >>",
      [
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 33 " +
          "/Widths 7 0 R >>",
        "[/Indexed /DeviceRGB 1 11 0 R]",
        "[500 600]",
        stream(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace 6 0 R " +
            "/BitsPerComponent 10 0 R /Filter 9 0 R",
          "x\u009c\u0003\u0000\u0000\u0000\u0000\u0001",
        ),
        "[/FlateDecode]",
        "8",
        "(\u00ff\u0000\u0000\u0000\u00ff\u0000)",
      ],
    );
    withDoc(objects, (doc) => {
      const walk = walkRoles(doc, "read");
      expect(walk.problem).toBeNull();
      expect([...(walk.reached.get(6) ?? [])]).toEqual(["colour space"]);
      expect([...(walk.reached.get(7) ?? [])]).toEqual(["number array"]);
      expect([...(walk.reached.get(9) ?? [])]).toEqual(["name array"]);
      expect([...(walk.reached.get(10) ?? [])]).toEqual(["scalar"]);
      expect([...(walk.reached.get(11) ?? [])]).toEqual(["palette"]);
    });
  });

  it("labels an indirect array of functions as a function", () => {
    const objects = onePage("<< /ColorSpace << /CS1 5 0 R >> >>", [
      "[/Separation /Spot /DeviceCMYK 6 0 R]",
      "[<< /FunctionType 2 /Domain [0 1] /N 1 >>]",
    ]);
    withDoc(objects, (doc) => {
      expect(labelsOf(doc, 6)).toEqual(["function"]);
    });
  });

  it("resolves an indirect number and counts it as reached", () => {
    const objects = onePage("<< /Font << /F1 5 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 6 0 R >>",
      "32",
    ]);
    withDoc(objects, (doc) => expect(labelsOf(doc, 6)).toEqual(["scalar"]));
  });
});

describe("shapes", () => {
  it("refuses a listed key holding a shape the format never gives it (AC-3)", () => {
    const font = (keys: string) =>
      onePage("<< /Font << /F1 5 0 R >> >>", [
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${keys} >>`,
      ]);
    expect(problemOf(font("/Widths << /A 1 >>"))).toBe("shape");
    expect(problemOf(font("/BaseFont (Helvetica)"))).toBe("shape");
    expect(problemOf(font("/Widths [500 (wide)]"))).toBe("shape");
    expect(problemOf(font("/FontDescriptor [1 2]"))).toBe("shape");
    expect(problemOf(font("/Encoding (WinAnsi)"))).toBe("shape");
    expect(
      problemOf(font("/Widths [500 [600 /a]] /Encoding /WinAnsiEncoding")),
    ).toBeNull();
  });

  it("refuses a colour space array naming a family it does not know", () => {
    const space = (value: string) => onePage(`<< /ColorSpace << /CS1 ${value} >> >>`, []);
    expect(problemOf(space("[/Unknown 1]"))).toBe("shape");
    expect(problemOf(space("[/DeviceRGB]"))).toBe("shape");
    expect(problemOf(space("[/ICCBased]"))).toBe("shape");
    expect(problemOf(space("(DeviceRGB)"))).toBe("shape");
    expect(problemOf(space("/DeviceRGB"))).toBeNull();
    expect(problemOf(space("[/Pattern]"))).toBeNull();
    expect(problemOf(space("[/Pattern /DeviceRGB]"))).toBeNull();
    expect(
      problemOf(space("[/CalRGB << /WhitePoint [1 1 1] /Gamma [1 1 1] >>]")),
    ).toBeNull();
  });

  it("takes the option of an either by the value's outer form", () => {
    const image = (keys: string) =>
      onePage("<< /XObject << /Im1 5 0 R >> >>", [
        stream(
          `/Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 ${keys}`,
          "\u0080",
        ),
      ]);
    expect(problemOf(image("/ColorSpace /DeviceGray /Mask [0 10]"))).toBeNull();
    expect(problemOf(image("/ColorSpace /DeviceGray /Filter [/AHx]"))).toBeNull();
    expect(problemOf(image("/ColorSpace /DeviceGray /Mask (mask)"))).toBe("shape");
    expect(
      problemOf(image("/ColorSpace /DeviceGray /DecodeParms [null << /Columns 1 >>]")),
    ).toBeNull();
  });

  it("refuses a dictionary where a stream role is due", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents << /Length 0 >> >>",
    ];
    expect(problemOf(objects)).toBe("shape");
  });
});

describe("strings by place (AC-2)", () => {
  it("keeps the catalog's /Lang, a CIDSystemInfo's strings, a palette and /ActualText", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R /Lang (en-GB) >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
        "/Resources << /Font << /F1 5 0 R >> /ColorSpace << /CS1 [/Indexed /DeviceGray 1 (\u0000\u00ff)] >> " +
        "/Properties << /P1 << /ActualText (Shown) /Alt (Hidden) >> >> >> >>",
      stream("", ""),
      "<< /Type /Font /Subtype /Type0 /BaseFont /Song /Encoding /Identity-H /DescendantFonts [6 0 R] >>",
      "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /Song " +
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>",
    ];
    withDoc(objects, (doc) => {
      const read = walkRoles(doc, "read");
      expect(read.problem).toBeNull();
      expect(read.strays).toBe(1);

      walkRoles(doc, "prune");
      const properties = doc.findPage(0).get("Resources", "Properties", "P1");
      expect(keysOf(properties)).toEqual(["ActualText"]);
      expect(doc.getTrailer().get("Root", "Lang").asString()).toBe("en-GB");
      expect(doc.newIndirect(6).get("CIDSystemInfo", "Ordering").asString()).toBe("GB1");
    });
  });
});

describe("what the prune deletes", () => {
  it("deletes a key off a role's list and leaves what it pointed at unreferenced", () => {
    const objects = onePage("<< /Font << /F1 5 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /RedactNestPrivate 6 0 R /Name /F1 >>",
      "<< /Secret (kept by a font) >>",
    ]);
    withDoc(objects, (doc) => {
      const read = walkRoles(doc, "read");
      expect(read.strays).toBe(2);
      expect(read.reached.has(6)).toBe(false);
      expect(keysOf(doc.newIndirect(5))).toContain("RedactNestPrivate");

      const prune = walkRoles(doc, "prune");
      expect(prune.strays).toBe(2);
      expect(keysOf(doc.newIndirect(5))).toEqual(["Type", "Subtype", "BaseFont"]);
      expect(walkRoles(doc, "read").strays).toBe(0);
    });
  });

  it("deletes every key outside TRAILER_KEYS from the trailer", () => {
    withDoc(
      onePage("<< >>", ["<< /Title (Secret) >>"]),
      (doc) => {
        expect(walkRoles(doc, "read").strays).toBe(1);
        walkRoles(doc, "prune");
        expect(keysOf(doc.getTrailer()).sort()).toEqual(["Root", "Size"]);
      },
      "/Root 1 0 R /Info 5 0 R",
    );
  });

  it("deletes a null at a key and leaves a null inside an array", () => {
    const objects = onePage("<< /Font << /F1 5 0 R /F2 null >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FontDescriptor 99 0 R " +
        "/FirstChar 32 /LastChar 34 /Widths [500 null 600] >>",
    ]);
    withDoc(objects, (doc) => {
      const read = walkRoles(doc, "read");
      expect(read.problem).toBeNull();
      expect(read.strays).toBe(2);

      walkRoles(doc, "prune");
      const font = doc.newIndirect(5);
      expect(keysOf(font)).not.toContain("FontDescriptor");
      expect(font.get("Widths").length).toBe(3);
      expect(keysOf(doc.findPage(0).get("Resources", "Font"))).toEqual(["F1"]);
    });
  });

  it("deletes an XObject that is neither an image nor a form, and a pattern neither 1 nor 2", () => {
    const objects = onePage(
      "<< /XObject << /X1 5 0 R /X2 6 0 R >> /Pattern << /P1 7 0 R >> >>",
      [
        stream("/Type /XObject /Subtype /PS", "showpage"),
        "<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] >>",
        "<< /Type /Pattern /PatternType 3 >>",
      ],
    );
    withDoc(objects, (doc) => {
      expect(walkRoles(doc, "read").problem).toBeNull();
      walkRoles(doc, "prune");
      const resources = doc.findPage(0).get("Resources");
      expect(keysOf(resources.get("XObject"))).toEqual([]);
      expect(keysOf(resources.get("Pattern"))).toEqual([]);
    });
  });

  it("changes nothing in read mode", () => {
    const objects = onePage("<< /Font << /F1 5 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Private (data) >>",
    ]);
    withDoc(objects, (doc) => {
      walkRoles(doc, "read");
      expect(keysOf(doc.newIndirect(5))).toContain("Private");
    });
  });

  it("deletes nothing when it refuses", () => {
    const objects = onePage("<< /Font << /F1 5 0 R /F2 6 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Private (data) >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Widths << >> >>",
    ]);
    withDoc(objects, (doc) => {
      expect(walkRoles(doc, "prune").problem).toBe("shape");
      expect(keysOf(doc.newIndirect(5))).toContain("Private");
    });
  });
});

describe("objects reached more than once", () => {
  it("walks a cycle once and stops", () => {
    const objects = onePage("<< /XObject << /Fm1 5 0 R >> >>", [
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /Fm1 5 0 R >> >>",
        "/Fm1 Do",
      ),
    ]);
    withDoc(objects, (doc) => {
      const walk = walkRoles(doc, "read");
      expect(walk.problem).toBeNull();
      expect([...(walk.reached.get(5) ?? [])]).toEqual(["form"]);
    });
  });

  it("lets two roles share an object whose keys both keep, an empty dictionary included", () => {
    const objects = onePage(
      "<< /ExtGState << /G1 5 0 R >> /Properties << /P1 5 0 R >> /Font << /F1 6 0 R /F2 7 0 R >> >>",
      [
        "<< >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /A /FontDescriptor 8 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /B /FontDescriptor 8 0 R >>",
        "<< /Type /FontDescriptor /FontName /A /Flags 32 >>",
      ],
    );
    withDoc(objects, (doc) => {
      expect(walkRoles(doc, "read").problem).toBeNull();
      expect(labelsOf(doc, 5)).toEqual(["graphics-state", "property-list"]);
    });
  });

  it("refuses one stream reached as page contents and as a form", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
        "/Resources << /XObject << /Fm1 4 0 R >> >> >>",
      stream("/Type /XObject /Subtype /Form /BBox [0 0 1 1]", ""),
    ];
    expect(problemOf(objects)).toBe("roles");
  });

  it("refuses one object reached in two kinds it cannot satisfy together", () => {
    const objects = onePage("<< /Font << /F1 5 0 R >> /ColorSpace << /CS1 6 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Widths 6 0 R >>",
      "[/ICCBased 7 0 R]",
      stream("/N 1", ""),
    ]);
    expect(problemOf(objects)).toBe("shape");
  });
});

describe("drawings and their resource dictionaries", () => {
  it("joins a /Contents array as one drawing", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents [4 0 R 5 0 R] /Resources << >> >>",
      stream("", "q"),
      stream("", "Q"),
    ];
    withDoc(objects, (doc) => {
      const [contents] = walkRoles(doc, "read").pages[0];
      expect(contents.joined).toBe(true);
      expect(contents.streams.map((part) => part.asIndirect())).toEqual([4, 5]);
    });
  });

  it("gives a shared dictionary one owner with every page that draws with it", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources 7 0 R >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources 7 0 R >>",
      stream("", ""),
      stream("", ""),
      `<< /Font << /F1 8 0 R >> >>`,
      HELVETICA,
    ];
    withDoc(objects, (doc) => {
      const { owners } = walkRoles(doc, "read");
      expect(owners).toHaveLength(1);
      expect(owners[0].resources.asIndirect()).toBe(7);
      expect(owners[0].units.map((unit) => unit.streams[0].asIndirect()).sort()).toEqual([
        5, 6,
      ]);
    });
  });

  it("counts a form and a Type 3 font with no resources of their own toward the dictionary they are drawn from", () => {
    const objects = onePage(
      "<< /XObject << /Fm1 5 0 R >> /Font << /T3 6 0 R >> >>",
      [
        stream("/Type /XObject /Subtype /Form /BBox [0 0 1 1]", "/T3 1 Tf"),
        "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1 1] /FontMatrix [1 0 0 1 0 0] " +
          "/CharProcs << /a 7 0 R /b 8 0 R >> /Encoding << /Differences [0 /a /b] >> >>",
        stream("", "0 0 d0"),
        stream("", "0 0 d0"),
      ],
      "/Fm1 Do",
    );
    withDoc(objects, (doc) => {
      const { owners, pages } = walkRoles(doc, "read");
      expect(owners).toHaveLength(1);
      const drawn = owners[0].units.map((unit) =>
        unit.streams.map((part) => part.asIndirect()),
      );
      expect(drawn).toEqual(expect.arrayContaining([[4], [5], [7, 8]]));
      expect(drawn).toHaveLength(3);
      const glyphs = owners[0].units.find((unit) => unit.streams.length === 2);
      expect(glyphs?.joined).toBe(false);

      expect(pages[0][0].streams[0].asIndirect()).toBe(4);
      expect(pages[0]).toHaveLength(3);
    });
  });

  it("gives a form with resources of its own an owner of its own, drawn on the page", () => {
    const objects = onePage("<< /XObject << /Fm1 5 0 R >> >>", [
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /Font << /F1 6 0 R >> >>",
        "BT /F1 1 Tf ET",
      ),
      HELVETICA,
    ]);
    withDoc(objects, (doc) => {
      const { owners, pages } = walkRoles(doc, "read");
      expect(owners).toHaveLength(2);
      const own = owners.find((owner) =>
        owner.units.some((unit) => unit.streams[0].asIndirect() === 5),
      );
      expect(own?.units).toHaveLength(1);
      expect(keysOf(own?.resources.get("Font") ?? mupdf.PDFObject.Null)).toEqual(["F1"]);
      expect(pages[0].map((unit) => unit.streams[0].asIndirect())).toEqual([4, 5]);
    });
  });
});

describe("from the pages, at open (AC-3)", () => {
  it("reads inherited resources and never refuses a tree node with no /Type", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] >>",
      "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
      stream("", "BT /F1 12 Tf (x) Tj ET"),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Widths << >> >>",
    ];
    withDoc(objects, (doc) => {
      const walk = walkRoles(doc, "read", "pages");
      expect(walk.problem).toBe("shape");
    });

    const fixed = [...objects.slice(0, 4), HELVETICA];
    withDoc(fixed, (doc) => {
      const walk = walkRoles(doc, "read", "pages");
      expect(walk.problem).toBeNull();
      expect([...(walk.reached.get(5) ?? [])]).toEqual(["simple-font"]);
      expect(walk.reached.has(2)).toBe(false);
      expect(walk.pages[0][0].resources?.get("Font").isDictionary()).toBe(true);
    });
  });
});

/** The bytes of a document built here. */
function bytesOf(objects: Body[]): ArrayBuffer {
  return writePdf({ objects, trailer: "/Root 1 0 R" }).bytes.slice().buffer;
}

/** The kind an open refuses with, or `null` if it opened. */
async function openOutcome(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/** The kind a run with nothing ticked fails with, or `null` if it made a file. */
async function runOutcome(bytes: ArrayBuffer): Promise<string | null> {
  try {
    await redactDocumentWith(mupdf, bytes, []);
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

const READABLE = "BT /F1 12 Tf 72 700 Td (A line anybody can read) Tj ET";

/**
 * AC-3: a shape the walk cannot read is refused at open, on the prepared
 * review copy, before any review exists, and by a run handed the bytes
 * directly, before anything is written.
 */
describe("the refusal (AC-3)", () => {
  beforeAll(() => {
    silenceEngineLog(mupdf);
  });

  const unreadable = [
    [
      "a font whose /Widths is a dictionary",
      onePage(
        "<< /Font << /F1 5 0 R >> >>",
        [
          "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 " +
            "/Widths << /Wide 1 >> >>",
        ],
        READABLE,
      ),
    ],
    [
      "one stream reached as both page contents and a form",
      [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /Font << /F1 5 0 R >> /XObject << /Fm1 4 0 R >> >> >>",
        stream("/Type /XObject /Subtype /Form /BBox [0 0 612 792]", READABLE),
        HELVETICA,
      ],
    ],
  ] as const;

  it.each(unreadable)("refuses at open %s", async (_label, objects) => {
    await expect(openOutcome(bytesOf([...objects]))).resolves.toBe(
      "unreadable-structure",
    );
  });

  it.each(unreadable)("refuses a run handed the bytes of %s", async (_label, objects) => {
    await expect(runOutcome(bytesOf([...objects]))).resolves.toBe("unreadable-structure");
  });

  it("keeps the no-readable-text refusal ahead of its own", async () => {
    const objects = onePage("<< /Font << /F1 5 0 R >> >>", [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Widths << >> >>",
    ]);
    await expect(openOutcome(bytesOf(objects))).resolves.toBe("no-readable-text");
  });

  it("keeps the empty clip refusal ahead of its own", async () => {
    const objects = onePage(
      "<< /Font << /F1 5 0 R >> >>",
      ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Widths << >> >>"],
      `${READABLE}
q 0 0 0 0 re W n BT /F1 12 Tf 72 650 Td (jane.doe@example.com) Tj ET Q`,
    );
    await expect(openOutcome(bytesOf(objects))).resolves.toBe("unsupported");
  });

  it("opens and runs a page whose tree node has no /Type, inheriting its resources", async () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 612 792] >>",
      "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
      stream("", READABLE),
      HELVETICA,
    ];
    const bytes = bytesOf(objects);
    await expect(openOutcome(bytes)).resolves.toBeNull();
    await expect(runOutcome(bytes)).resolves.toBeNull();
  });

  it("deletes a pattern of a type MuPDF never draws, and opens and runs", async () => {
    const objects = onePage(
      "<< /Font << /F1 5 0 R >> /Pattern << /P1 6 0 R >> >>",
      [HELVETICA, "<< /Type /Pattern /PatternType 3 >>"],
      `${READABLE}
/Pattern cs /P1 scn 72 600 20 20 re f`,
    );
    const bytes = bytesOf(objects);
    await expect(openOutcome(bytes)).resolves.toBeNull();

    const { output } = await redactDocumentWith(mupdf, bytes, []);
    inspect(output, (doc) => {
      const patterns = doc.findPage(0).get("Resources", "Pattern");
      expect(patterns.isNull() || !keysOf(patterns).includes("P1")).toBe(true);
    });
  });
});
