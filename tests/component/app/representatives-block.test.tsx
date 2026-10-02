/**
 * The Article 27 representatives on the privacy policy. Spec 0011, AC-6.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RepresentativesBlock } from "@/app/privacy/representatives-block";
import type { Representative } from "@/lib/legal";

import { expectNoAxeViolations } from "../../setup/component";

const EU: Representative = {
  name: "Example Representation Ltd",
  postalAddress: "1 Example Street, Dublin, Ireland",
  email: "eu-rep@example.eu",
};

const UK: Representative = {
  name: "Example UK Rep Ltd",
  postalAddress: "2 Example Road, London",
  email: " uk-rep@example.co.uk ",
};

describe("RepresentativesBlock", () => {
  /** covers: AC-6. Undecided, so the page says nothing about representatives. */
  it("renders nothing while the decision is pending", () => {
    const { container } = render(
      <RepresentativesBlock decision={{ status: "pending" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  /** covers: AC-6. Neither required, on advice: still nothing on the page. */
  it("renders nothing when the decision names nobody", () => {
    const { container } = render(
      <RepresentativesBlock decision={{ status: "decided", eu: null, uk: null }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  /** covers: AC-6. Name, postal address and email, for the one recorded. */
  it("names an EU representative alone", () => {
    render(<RepresentativesBlock decision={{ status: "decided", eu: EU, uk: null }} />);

    const paragraph = screen.getByTestId("representative-eu");
    expect(paragraph).toHaveTextContent(
      "Our representative in the European Union is Example Representation Ltd, 1 Example Street, Dublin, Ireland.",
    );
    expect(screen.getByRole("link", { name: EU.email })).toHaveAttribute(
      "href",
      `mailto:${EU.email}`,
    );
    expect(screen.queryByTestId("representative-uk")).not.toBeInTheDocument();
  });

  /** covers: AC-6. Both, EU first, each email trimmed. */
  it("names both when both are recorded", () => {
    render(<RepresentativesBlock decision={{ status: "decided", eu: EU, uk: UK }} />);

    expect(screen.getAllByRole("paragraph").map((each) => each.dataset.testid)).toEqual([
      "representative-eu",
      "representative-uk",
    ]);
    expect(screen.getByTestId("representative-uk")).toHaveTextContent(
      "Our representative in the United Kingdom is Example UK Rep Ltd, 2 Example Road, London.",
    );
    expect(screen.getByRole("link", { name: "uk-rep@example.co.uk" })).toHaveAttribute(
      "href",
      "mailto:uk-rep@example.co.uk",
    );
  });

  /** covers: AC-18 */
  it("passes axe", async () => {
    const { container } = render(
      <RepresentativesBlock decision={{ status: "decided", eu: EU, uk: UK }} />,
    );

    await expectNoAxeViolations(container);
  });
});
