/**
 * The privacy policy and the Terms of service, as rendered. Spec 0011, AC-1,
 * AC-2, AC-6 to AC-10, AC-18 and AC-19, and the account and Pro claims spec
 * 0012 adds (AC-22).
 *
 * Both pages are plain server components, so they render here as they do at
 * build. The browser suite (`tests/e2e/legal-pages.spec.ts`) proves the same
 * pages in the real shell, with styles, at 320 pixels and at 200% text.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import {
  CLERK_PRODUCTION_ORIGIN,
  COMPLAINT_AUTHORITIES,
  OUTSIDE_SERVICES,
  POLAR_SERVICE,
} from "@/config/privacy";
import { LEGAL } from "@/lib/legal";
import {
  formatPolicyDate,
  lastUpdated,
  PRIVACY_CHANGES,
  TERMS_CHANGES,
  type PolicyChanges,
} from "@/lib/policy-changes";
import { PRIVACY_SECTIONS, sectionId, TERMS_SECTIONS } from "@/lib/policy-sections";
import { TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

const PAGES = [
  {
    name: "the privacy policy",
    Page: PrivacyPage,
    title: "Privacy policy",
    sections: PRIVACY_SECTIONS,
    changes: PRIVACY_CHANGES,
    metadata: privacyMetadata,
  },
  {
    name: "the Terms of service",
    Page: TermsPage,
    title: "Terms of service",
    sections: TERMS_SECTIONS,
    changes: TERMS_CHANGES,
    metadata: termsMetadata,
  },
] as const;

/** The text of `main`, which is where AC-19 looks. */
function mainText(): string {
  return screen.getByRole("main").textContent ?? "";
}

/** The text of the section under one h2. */
function sectionText(heading: string): string {
  return (
    screen.getByRole("heading", { level: 2, name: heading }).closest("section")
      ?.textContent ?? ""
  );
}

describe.each(PAGES)("$name", ({ Page, title, sections, changes, metadata }) => {
  /** covers: AC-1 */
  it("has the header, one h1, and its h2 sections word for word, in order", () => {
    render(<Page />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(Object.values(sections));
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Redact a PDF" }),
    ).toHaveAttribute("href", TOOL_PATH);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  /** covers: AC-2 */
  it("shows Last updated as the newest change, in a machine readable time", () => {
    render(<Page />);

    const updated = screen.getByTestId("last-updated");
    const newest = lastUpdated(changes);
    expect(updated).toHaveTextContent(`Last updated ${formatPolicyDate(newest)}`);
    expect(updated.querySelector("time")).toHaveAttribute("datetime", newest);
  });

  /** covers: AC-1, AC-2. The dated list, last, newest first. */
  it("ends with the dated change list, newest first", () => {
    render(<Page />);

    const list = screen.getByTestId("changes");
    const entries = within(list).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual(
      (changes as PolicyChanges).map(
        (change) => `${formatPolicyDate(change.date)}: ${change.summary}`,
      ),
    );
    expect(
      entries.map((entry) => entry.querySelector("time")?.getAttribute("datetime")),
    ).toEqual(changes.map((change) => change.date));

    const lastSection = screen.getAllByRole("heading", { level: 2 }).at(-1);
    expect(lastSection).toHaveTextContent("Changes");
    expect(lastSection?.parentElement).toContainElement(list);
  });

  /** covers: AC-6, AC-10. The operator and the contact, by name and mailto. */
  it("names the operator and links the contact address", () => {
    render(<Page />);

    expect(mainText()).toContain(
      "RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan",
    );
    const contact = screen.getAllByRole("link", { name: LEGAL.contactEmail });
    expect(contact.length).toBeGreaterThan(0);
    for (const link of contact) {
      expect(link).toHaveAttribute("href", `mailto:${LEGAL.contactEmail}`);
    }
  });

  /** covers: AC-3. Its own title and a one sentence description, indexable. */
  it("sets its own title and description, and no noindex", () => {
    expect(metadata.title).toBe(title);
    expect(metadata.description).toMatch(/^[^.]+\.$/);
    expect(metadata.robots).toBeUndefined();
  });

  /**
   * covers: AC-19, INV-6. No cap as a number, and no word for the source
   * repository. The terms' 12 months and US$100 are not limits on the visitor.
   */
  it("states no cap as a number and never mentions the repository", () => {
    render(<Page />);
    const text = mainText();

    expect(text).not.toMatch(/repositor|github|commit/i);
    expect(text).not.toMatch(/\d[\d,.]*\s*(pages?|MB|megabytes?)\b/i);
    expect(text).not.toMatch(/\b(pages?|MB)\s*\d/i);
  });

  /**
   * Spec 0013, AC-25. An On this page list of plain links, in the section
   * record's order, each to the h2 its key names, after the title and before
   * the text.
   */
  it("lists every section under On this page, each linking its own h2", () => {
    const { container } = render(<Page />);

    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(Object.values(sections));
    for (const [index, key] of Object.keys(sections).entries()) {
      const href = links[index]?.getAttribute("href");
      expect(href).toBe(`#${sectionId(key)}`);
      const heading = container.querySelector(`h2${href}`);
      expect(heading).toHaveTextContent(sections[key as keyof typeof sections]);
    }
    for (const link of links) expect(link).toHaveClass("underline");
    const h1 = screen.getByRole("heading", { level: 1 });
    const firstH2 = screen.getAllByRole("heading", { level: 2 })[0] as HTMLElement;
    expect(
      h1.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      nav.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /** covers: AC-18. Headings run h1, h2, h3 with no level skipped. */
  it("never skips a heading level", () => {
    const { container } = render(<Page />);

    const levels = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (heading) => Number(heading.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
  });

  /** covers: AC-18 */
  it("passes axe", async () => {
    const { container } = render(<Page />);

    await expectNoAxeViolations(container);
  });
});

describe("the privacy policy's facts", () => {
  /** covers: AC-8. Every service, from the list, with its policy link. */
  it("renders every outside service from the list", () => {
    render(<PrivacyPage />);

    for (const service of OUTSIDE_SERVICES) {
      expect(
        screen.getByRole("heading", { level: 3, name: service.name }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `${service.name}’s privacy policy` }),
      ).toHaveAttribute("href", service.policyUrl);
    }
  });

  /** covers: AC-9. Both complaint authorities, linked. */
  it("links the UK and EU complaint authorities", () => {
    render(<PrivacyPage />);

    for (const authority of Object.values(COMPLAINT_AUTHORITIES)) {
      expect(screen.getByRole("link", { name: authority.name })).toHaveAttribute(
        "href",
        authority.url,
      );
    }
  });

  /** covers: AC-9. The Article 13 items the outline names. */
  it("covers the legal basis, the six rights, retention and no profiling", () => {
    render(<PrivacyPage />);
    const text = mainText();

    expect(text).toContain("legitimate interest");
    expect(text).toContain("Article 6(1)(f)");
    for (const right of [
      "access",
      "corrected",
      "erased",
      "restrict",
      "object",
      "portability",
    ]) {
      expect(text).toContain(right);
    }
    expect(text).toContain("one day");
    expect(text).toContain("within one month");
    expect(text).toContain("no fee");
    expect(text).toContain("cannot load a page without sending its IP address");
    expect(text).toContain("automated decisions");
    expect(text).toContain("no profiling");
  });

  /**
   * covers: spec 0012, AC-22 and claim C6. By owner, purpose and place, on
   * Clerk's production host whatever keys built the page, with no cookie
   * named and no cookie list linked. "What we do not do" keeps one line, word
   * for word.
   */
  it("states the cookie claim by owner, purpose and place", () => {
    render(<PrivacyPage />);
    const text = mainText();
    const host = new URL(CLERK_PRODUCTION_ORIGIN).host;

    expect(text).toContain(
      `Clerk sets the cookies that sign in needs, on our site and on ${host}, its address for us.`,
    );
    expect(text).toContain("Cloudflare, the network Clerk uses");
    expect(text).toContain("strictly necessary for signing in and keeping it secure");
    expect(text).toContain(
      `Nothing else sets a cookie on our site or on ${host}, and we set none of our own.`,
    );
    expect(text).toContain("Polar’s checkout and billing pages are Polar’s own site");
    expect(
      screen.getByText(
        "No page sets a cookie except the sign in and account pages, and we set none of our own (see Your account).",
      ).tagName,
    ).toBe("LI");
    expect(text).not.toMatch(/__session|__client|_cfuvid|__cf_bm/);
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/cookie/i);
    }
  });

  /**
   * covers: spec 0012, AC-22 and claims C12 and C13. The seller, the account's
   * legal basis, what Polar learns and keeps, and Polar's own policy from its
   * entry. Polar is our processor: no sentence naming it calls it a controller.
   */
  it("covers accounts and payments, with Polar as our processor", () => {
    render(<PrivacyPage />);
    const text = mainText();

    expect(text).toContain(LEGAL.soldThroughLine);
    expect(text).toContain("Your account holds your email address and nothing else.");
    expect(text).toContain("Article 6(1)(b)");
    expect(text).toContain(LEGAL.merchantLine);
    expect(text).toContain("We never see your card");
    expect(text).toContain("we send Polar your account id and email address");
    expect(text).toContain("Polar still keeps the records tax law requires.");
    expect(text).toContain("as our processor");
    expect(
      screen.getByRole("link", { name: "Polar’s own privacy policy" }),
    ).toHaveAttribute("href", POLAR_SERVICE.policyUrl);
    for (const heading of [PRIVACY_SECTIONS.yourAccount, PRIVACY_SECTIONS.payments]) {
      expect(sectionText(heading)).not.toMatch(/controller/i);
    }
  });

  /** covers: AC-6. Nothing about representatives while none is recorded. */
  it("says nothing about representatives while none is recorded", () => {
    // Only meaningful while the repository's decision names nobody, as the
    // recorded "not required, on advice" does.
    const decision = LEGAL.representatives;
    if (decision.status === "decided" && (decision.eu !== null || decision.uk !== null)) {
      return;
    }

    render(<PrivacyPage />);
    expect(mainText()).not.toMatch(/representative/i);
  });
});

describe("the terms' points", () => {
  /** covers: AC-10. Each point the outline settles. */
  it("makes the points the outline names", () => {
    render(<TermsPage />);
    const text = mainText();

    expect(text).toContain("Review the cleaned file before you share it.");
    expect(text).toContain("within the limits shown in the tool");
    expect(text).toContain("nothing in them limits your rights under that licence");
    expect(text).toContain(
      "the greater of what you paid us in the 12 months before the claim, or US$100",
    );
    expect(text).toContain(
      "fraud, for death or personal injury caused by our negligence",
    );
    expect(text).toContain("removes rights you have by law where you live");
    expect(text).toContain("the law of Pakistan, and the courts of Pakistan");
    expect(text).toContain("may bring a claim in your own country’s courts");
  });

  /** covers: spec 0012, AC-22 and INV-8. The account and Pro points, no price as a number. */
  it("makes the account and Pro points the outline names", () => {
    render(<TermsPage />);
    const text = mainText();

    expect(text).toContain(LEGAL.soldThroughLine);
    expect(text).toContain("An account is for one person");
    expect(text).toContain("once nothing renews");
    expect(text).toContain("at the price shown on Pricing when you subscribe");
    expect(text).toContain("It renews each month until you cancel.");
    expect(text).toContain("lasts to the end of the month you have paid for");
    expect(text).toContain("We do not refund part months.");
    expect(text).toContain("including any right to withdraw");
    expect(text).toContain("Pro continues while the payment is retried");
    expect(text).toContain("buyer terms also apply to the purchase");
    expect(text).toContain("at least 30 days before");
    expect(sectionText(TERMS_SECTIONS.proSubscriptions)).not.toMatch(
      /\$|\bUSD\b|dollar/i,
    );
  });
});
