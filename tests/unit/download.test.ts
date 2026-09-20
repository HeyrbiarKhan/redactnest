import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { offerDownload } from "@/lib/download";

/**
 * Handing the finished file over, and letting go of it. Spec 0002, INV-7.
 *
 * The document object model and the object URL registry are the environment
 * here, so both are stubbed and everything else is the real module. What is
 * worth asserting is the ordering: the click has to happen before the URL is
 * revoked, and the revoke has to happen at all.
 *
 * A URL revoked in the same task as the click can lose the race against the
 * browser starting to read it, which shows up as an empty download on some
 * machines and never on the developer's. Deferring by a macrotask is the fix,
 * and it is the kind of thing that gets "tidied" away later, so it is pinned
 * here.
 *
 * Feature 5 wires this to real redacted output. The mechanics are the same
 * whatever the bytes are.
 */

const OUTPUT = new ArrayBuffer(64);

interface FakeAnchor {
  href: string;
  download: string;
  style: { display: string };
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

let anchor: FakeAnchor;
let created: string[];
let revoked: string[];
/** Every call, in order, so the sequence can be asserted rather than guessed. */
let calls: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  calls = [];

  anchor = {
    href: "",
    download: "",
    style: { display: "" },
    click: vi.fn(() => {
      calls.push("click");
    }),
    remove: vi.fn(() => {
      calls.push("remove");
    }),
  };

  vi.useFakeTimers();

  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
    body: { appendChild: vi.fn() },
  });

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      calls.push("createObjectURL");
      created.push(blob.type);
      return "blob:redactnest/1";
    }),
    revokeObjectURL: vi.fn((url: string) => {
      calls.push("revokeObjectURL");
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("offering the file", () => {
  it("names it as the session decided", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(anchor.download).toBe("report-redacted.pdf");
  });

  /** The one media type this tool produces, so it is stated rather than sniffed. */
  it("hands over a PDF", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(created).toEqual(["application/pdf"]);
  });

  it("points the anchor at the object URL and clicks it", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(anchor.href).toBe("blob:redactnest/1");
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("never renders the anchor", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(anchor.style.display).toBe("none");
  });

  it("takes the anchor back out of the page", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });
});

describe("letting go of it", () => {
  /**
   * The ordering this file exists for. Revoking before the click, or in the
   * same task as it, is the bug that produces an empty file on a slow machine.
   */
  it("revokes only after the click, and not in the same task", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");

    expect(calls).toEqual(["createObjectURL", "click", "remove"]);

    vi.runAllTimers();

    expect(calls).toEqual(["createObjectURL", "click", "remove", "revokeObjectURL"]);
  });

  it("revokes the URL it created", () => {
    offerDownload(OUTPUT, "report-redacted.pdf");
    vi.runAllTimers();

    expect(revoked).toEqual(["blob:redactnest/1"]);
  });

  /**
   * A click that throws must still give the URL back. Otherwise a tab that
   * failed to download holds the whole output until it is closed, which is the
   * opposite of what INV-7 is for.
   */
  it("revokes even when the click throws", () => {
    anchor.click.mockImplementation(() => {
      throw new Error("popup blocked");
    });

    expect(() => offerDownload(OUTPUT, "report-redacted.pdf")).toThrow();
    vi.runAllTimers();

    expect(revoked).toEqual(["blob:redactnest/1"]);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });
});
