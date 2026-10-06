/**
 * The licence notice at the foot of every page. Spec 0009, AC-1 to AC-3.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LicenceNotice } from "@/app/licence-notice";
import { LEGAL } from "@/lib/legal";
import { LICENCE_PATH, NOTICES_PATH } from "@/lib/routes";
import { SiteFooter } from "@/ui/site-footer";

import { expectNoAxeViolations } from "../../setup/component";

const SOURCE_URL =
  "https://example.invalid/redactnest/tree/0123456789abcdef0123456789abcdef01234567";

/** The six parts AC-1 names, in its order. */
const PARTS = [
  "© 2026 Heyrbiar Khan",
  "Licensed under the GNU AGPL 3.0 or later, which lets you share and change it",
  "No warranty",
  "Source code for this version",
  "Licence",
  "Third party notices",
];

describe("LicenceNotice", () => {
  /** covers: AC-1. Section 5(d)'s four parts, then the three links. */
  it("reads every part in order, as one paragraph", () => {
    const { container } = render(<LicenceNotice sourceUrl={SOURCE_URL} />);

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe(PARTS.join(" · "));
  });

  /** covers: AC-1. Plain links in the same tab, to the config link and our own files. */
  it("links the last three parts", () => {
    render(<LicenceNotice sourceUrl={SOURCE_URL} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Source code for this version", SOURCE_URL],
      ["Licence", "/licence.txt"],
      ["Third party notices", "/third-party-notices.txt"],
    ]);
    for (const link of links) expect(link).not.toHaveAttribute("target");
  });

  /** covers: AC-1. The words and paths come from their modules, not from literals. */
  it("takes its words from legal.ts and its paths from routes.ts", () => {
    render(<LicenceNotice sourceUrl={SOURCE_URL} />);

    expect(screen.getByRole("link", { name: LEGAL.licenceLabel })).toHaveAttribute(
      "href",
      LICENCE_PATH,
    );
    expect(screen.getByRole("link", { name: LEGAL.noticesLabel })).toHaveAttribute(
      "href",
      NOTICES_PATH,
    );
    expect(LEGAL.copyrightLine).toBe(`© ${LEGAL.year} ${LEGAL.holder}`);
    expect(Object.isFrozen(LEGAL)).toBe(true);
  });

  /** covers: AC-1. The dots are hidden; the spaces around them are not. */
  it("hides the separators from assistive technology", () => {
    const { container } = render(<LicenceNotice sourceUrl={SOURCE_URL} />);

    const dots = [...container.querySelectorAll("span")].filter(
      (span) => span.textContent === "·",
    );
    expect(dots).toHaveLength(PARTS.length - 1);
    for (const dot of dots) expect(dot).toHaveAttribute("aria-hidden", "true");

    // What a screen reader is left with still has a space between every part.
    const spoken = [...(container.querySelector("p")?.childNodes ?? [])]
      .filter((node) => !(node instanceof Element && node.getAttribute("aria-hidden")))
      .map((node) => node.textContent)
      .join("");
    expect(spoken.replace(/\s+/g, " ")).toBe(PARTS.join(" "));
  });

  /** covers: AC-3. No commit to name, so the offer says so instead of linking. */
  it("shows the pending text when there is no source link", () => {
    const { container } = render(<LicenceNotice sourceUrl="" />);

    expect(screen.queryByRole("link", { name: /source code/i })).not.toBeInTheDocument();
    expect(container.querySelector("p")?.textContent).toBe(
      [...PARTS.slice(0, 3), LEGAL.sourcePending, ...PARTS.slice(4)].join(" · "),
    );
    expect(LEGAL.sourcePending).toBe(
      "Source code for this version (link set per deploy)",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  /** covers: AC-2 */
  it("passes axe inside the footer, with and without a source link", async () => {
    for (const sourceUrl of [SOURCE_URL, ""]) {
      const { container, unmount } = render(
        <SiteFooter
          brand={null}
          groups={null}
          notice={<LicenceNotice sourceUrl={sourceUrl} />}
        />,
      );
      await expectNoAxeViolations(container);
      unmount();
    }
  });
});
