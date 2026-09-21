import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

/**
 * Proof that the component harness itself works, rather than a test of any one
 * component. Feature 4 builds the UI primitives and `/test` writes the real
 * tests against them; this is here so a failure then is a failure in the
 * component, not in the wiring underneath it.
 *
 * It exercises each piece separately: the `jsdom` environment and the `@` alias
 * against real app code, then the pieces a render test leans on (a jest-dom
 * matcher, user-event, and the teardown between tests).
 */

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Clicked {count} times
    </button>
  );
}

describe("the component test harness", () => {
  it("renders a real app component through the @ alias", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("RedactNest");
    expect(screen.getByRole("link", { name: "Redact a PDF" })).toHaveAttribute(
      "href",
      "/tool",
    );
  });

  it("handles a real user interaction", async () => {
    const user = userEvent.setup();
    render(<Counter />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAccessibleName("Clicked 1 times");
  });

  it("starts each test with an empty document", () => {
    // If `cleanup` were not wired in tests/setup/component.ts, the previous
    // test's button would still be mounted here and this would fail.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
