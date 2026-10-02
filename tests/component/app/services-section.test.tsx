/**
 * The privacy policy's outside services, rendered straight from a list.
 * Spec 0011, AC-8.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServicesSection } from "@/app/privacy/services-section";
import { OUTSIDE_SERVICES, type OutsideService } from "@/config/privacy";

import { expectNoAxeViolations } from "../../setup/component";

const HOST: OutsideService = {
  name: "Sample Host",
  role: "Hosts things",
  receives: "Request data",
  purpose: "To serve pages",
  location: "Somewhere",
  safeguard: "A contract",
  retention: "A week",
  ownUse: "It also keeps some for itself.",
  policyUrl: "https://host.example/privacy",
  scriptOrigins: [],
  connectOrigins: [],
};

const MAILER: OutsideService = {
  name: "Sample Mailer",
  role: "Sends mail",
  receives: "An address",
  purpose: "To send receipts",
  location: "Elsewhere",
  safeguard: "Another contract",
  retention: "A month",
  policyUrl: "https://mailer.example/privacy",
  scriptOrigins: [],
  connectOrigins: ["https://api.mailer.example"],
};

/** The labels AC-8 asks for, in its order. */
const TERMS = [
  "What it does",
  "What it receives",
  "Why",
  "Where",
  "Safeguard",
  "How long",
];

describe("ServicesSection", () => {
  /** covers: AC-8. An entry added to the list appears with no other change. */
  it("renders one h3 per service, in the list's order", () => {
    render(<ServicesSection services={[HOST, MAILER]} />);

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Sample Host", "Sample Mailer"]);
  });

  /** covers: AC-8. Every fact, labelled, from the entry itself. */
  it("lists each service's facts under their labels", () => {
    render(<ServicesSection services={[HOST, MAILER]} />);

    const [host, mailer] = screen.getAllByTestId("service");
    for (const [element, service] of [
      [host, HOST],
      [mailer, MAILER],
    ] as const) {
      const terms = within(element).getAllByRole("term");
      const definitions = within(element).getAllByRole("definition");
      expect(terms.map((term) => term.textContent)).toEqual(TERMS);
      expect(definitions.map((definition) => definition.textContent)).toEqual([
        service.role,
        service.receives,
        service.purpose,
        service.location,
        service.safeguard,
        service.retention,
      ]);
    }
  });

  /** covers: AC-8. Its own privacy policy, linked. */
  it("links each service's own privacy policy", () => {
    render(<ServicesSection services={[HOST, MAILER]} />);

    expect(
      screen.getByRole("link", { name: "Sample Host’s privacy policy" }),
    ).toHaveAttribute("href", HOST.policyUrl);
    expect(
      screen.getByRole("link", { name: "Sample Mailer’s privacy policy" }),
    ).toHaveAttribute("href", MAILER.policyUrl);
  });

  /** covers: AC-8. What a service does for itself, only when it says. */
  it("shows a service's own use only when it has one", () => {
    render(<ServicesSection services={[HOST, MAILER]} />);

    const [host, mailer] = screen.getAllByTestId("service");
    expect(host).toHaveTextContent(HOST.ownUse ?? "");
    expect(within(mailer).getAllByRole("paragraph")).toHaveLength(1);
  });

  /** covers: AC-8. The real list, as the page renders it. */
  it("renders the real list, Vercel and all its facts", () => {
    render(<ServicesSection services={OUTSIDE_SERVICES} />);

    expect(screen.getByRole("heading", { level: 3, name: "Vercel" })).toBeVisible();
    expect(screen.getByText("One day")).toBeVisible();
    expect(screen.getByRole("link", { name: "Vercel’s privacy policy" })).toHaveAttribute(
      "href",
      "https://vercel.com/legal/privacy",
    );
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<ServicesSection services={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  /** covers: AC-18 */
  it("passes axe under a section heading", async () => {
    const { container } = render(
      <section>
        <h2>Services we use</h2>
        <ServicesSection services={[HOST, MAILER]} />
      </section>,
    );

    await expectNoAxeViolations(container);
  });
});
