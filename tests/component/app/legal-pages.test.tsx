/**
 * The privacy policy and the terms of use, as rendered. Spec 0011, AC-1, AC-2,
 * AC-6 to AC-10, AC-18 and AC-19.
 *
 * Both pages are plain server components, so they render here as they do at
 * build. The browser suite (`tests/e2e/legal-pages.spec.ts`) proves the same
 * pages in the real shell, with styles, at 320 pixels and at 200% text.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import { COMPLAINT_AUTHORITIES, OUTSIDE_SERVICES } from "@/config/privacy";
import { LEGAL } from "@/lib/legal";
import {
  formatPolicyDate,
  lastUpdated,
  PRIVACY_CHANGES,
  TERMS_CHANGES,
  type PolicyChanges,
} from "@/lib/policy-changes";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/policy-sections";
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
    name: "the terms of use",
    Page: TermsPage,
    title: "Terms of use",
    sections: TERMS_SECTIONS,
    changes: TERMS_CHANGES,
    metadata: termsMetadata,
  },
] as const;

/** The text of `main`, which is where AC-19 looks. */
function mainText(): string {
  return screen.getByRole("main").textContent ?? "";
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

  /** covers: AC-6. Nothing about representatives while the decision is pending. */
  it("says nothing about representatives while the decision is pending", () => {
    // Only meaningful while the repository still holds the pending decision.
    if (LEGAL.representatives.status !== "pending") return;

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
});
