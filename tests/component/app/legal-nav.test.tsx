/**
 * The footer's Legal nav. Spec 0011, AC-4 and INV-4.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LegalNav } from "@/app/legal-nav";
import { LicenceNotice } from "@/app/licence-notice";
import { LEGAL } from "@/lib/legal";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/routes";
import { SiteFooter } from "@/ui/site-footer";

import { expectNoAxeViolations } from "../../setup/component";

/** The footer as the layout builds it, the groups before the licence notice. */
function Footer() {
  return (
    <SiteFooter
      brand={<div>{LEGAL.brandLine}</div>}
      groups={<LegalNav />}
      notice={<LicenceNotice sourceUrl="" />}
    />
  );
}

describe("LegalNav", () => {
  /** covers: AC-4 */
  it("is a nav labelled Legal", () => {
    render(<LegalNav />);

    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
    expect(LEGAL.legalNavLabel).toBe("Legal");
  });

  /** covers: AC-4. The two links, in order, plain and in the same tab. */
  it("links the privacy policy, then the terms of service", () => {
    render(<LegalNav />);

    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Privacy policy", "/privacy"],
      ["Terms of service", "/terms"],
    ]);
    for (const link of links) expect(link).not.toHaveAttribute("target");
  });

  /** covers: AC-4, INV-4. Words from legal.ts, paths from routes.ts. */
  it("takes its words from legal.ts and its paths from routes.ts", () => {
    render(<LegalNav />);

    expect(screen.getByRole("link", { name: LEGAL.privacyLabel })).toHaveAttribute(
      "href",
      PRIVACY_PATH,
    );
    expect(screen.getByRole("link", { name: LEGAL.termsLabel })).toHaveAttribute(
      "href",
      TERMS_PATH,
    );
  });

  /**
   * covers: AC-4. A list, with no separators and no paragraph of its own, under
   * a label shown on screen and hidden from assistive technology, which hears
   * the nav's own name instead (spec 0013, AC-8).
   */
  it("holds a list and no paragraph, under its label", () => {
    const { container } = render(<LegalNav />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByRole("list").textContent).toBe("Privacy policyTerms of service");
    const label = container.querySelector("nav > [aria-hidden='true']");
    expect(label).toHaveTextContent(LEGAL.legalNavLabel);
    expect(label?.tagName).toBe("DIV");
  });

  /**
   * covers: AC-4. Before the licence notice, which is still the footer's one
   * paragraph, so `shell.spec.ts` keeps reading the notice alone.
   */
  it("sits before the licence notice, which stays the footer's one paragraph", () => {
    const { container } = render(<Footer />);

    const nav = screen.getByRole("navigation", { name: "Legal" });
    const paragraphs = [...container.querySelectorAll("footer p")];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent(LEGAL.copyrightLine);
    expect(
      paragraphs.every(
        (paragraph) =>
          nav.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  /** covers: AC-4. A 24 pixel target, as the notice's links are. */
  it("gives each link the footer's 24 pixel target", () => {
    render(<LegalNav />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("inline-flex", "min-h-6", "underline");
    }
  });

  /** covers: AC-4, AC-18 */
  it("passes axe inside the footer", async () => {
    const { container } = render(<Footer />);

    await expectNoAxeViolations(container);
  });
});
