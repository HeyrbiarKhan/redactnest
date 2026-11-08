/**
 * The root layout's reporter. Spec 0016, AC-10 and AC-17.
 *
 * `report` is the boundary: what reaches it is what a page would send. The
 * pathname comes from `next/navigation`, as the App Router gives it.
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isOwnScript, TelemetryReporter } from "@/app/telemetry-reporter";

const mocks = vi.hoisted(() => ({ pathname: "/", report: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/telemetry/client", () => ({ report: mocks.report }));

beforeEach(() => {
  mocks.pathname = "/";
  mocks.report.mockClear();
});

const ownScript = () => `${window.location.origin}/_next/static/chunks/app.js`;

function throwFrom(filename: string): void {
  window.dispatchEvent(
    new ErrorEvent("error", {
      message: "Cannot read properties of undefined (reading 'passport.pdf')",
      filename,
      lineno: 12,
      colno: 34,
      error: new Error("passport.pdf"),
    }),
  );
}

describe("page views", () => {
  it("sends one page view for the page it loads on", () => {
    mocks.pathname = "/tool";
    render(<TelemetryReporter />);
    expect(mocks.report.mock.calls).toEqual([[{ name: "page-view", page: "tool" }]]);
  });

  it("sends another on each client side pathname change, and none on a rerender", () => {
    const { rerender } = render(<TelemetryReporter />);
    rerender(<TelemetryReporter />);
    mocks.pathname = "/pricing";
    rerender(<TelemetryReporter />);
    mocks.pathname = "/account/subscribe";
    rerender(<TelemetryReporter />);
    expect(mocks.report.mock.calls).toEqual([
      [{ name: "page-view", page: "home" }],
      [{ name: "page-view", page: "pricing" }],
      [{ name: "page-view", page: "account" }],
    ]);
  });

  it("names a path no kind covers as not-found", () => {
    mocks.pathname = "/nowhere";
    render(<TelemetryReporter />);
    expect(mocks.report).toHaveBeenCalledWith({ name: "page-view", page: "not-found" });
  });
});

describe("browser crashes", () => {
  it("reports an error from our own script by kind and page, and nothing of the error", () => {
    mocks.pathname = "/tool";
    render(<TelemetryReporter />);
    mocks.report.mockClear();
    throwFrom(ownScript());
    expect(mocks.report.mock.calls).toEqual([
      [{ name: "browser-crash", page: "tool", kind: "error" }],
    ]);
  });

  it("reports an unhandled rejection", () => {
    mocks.pathname = "/account/welcome";
    render(<TelemetryReporter />);
    mocks.report.mockClear();
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(mocks.report.mock.calls).toEqual([
      [{ name: "browser-crash", page: "welcome", kind: "rejection" }],
    ]);
  });

  it("names the page the visitor is on now, after a client side change", () => {
    const { rerender } = render(<TelemetryReporter />);
    mocks.pathname = "/privacy";
    rerender(<TelemetryReporter />);
    mocks.report.mockClear();
    throwFrom(ownScript());
    expect(mocks.report).toHaveBeenCalledWith({
      name: "browser-crash",
      page: "privacy",
      kind: "error",
    });
  });

  it.each([
    ["a browser extension", "chrome-extension://abcdefghijklmnop/content.js"],
    ["another origin", "https://cdn.example.com/widget.js"],
    ["a muted error with no file name", ""],
  ])("sends nothing for an error from %s", (_label, filename) => {
    render(<TelemetryReporter />);
    mocks.report.mockClear();
    throwFrom(filename);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", () => {
    const { unmount } = render(<TelemetryReporter />);
    unmount();
    mocks.report.mockClear();
    // Vitest treats an error event nobody listens for as a test failure, so
    // a listener of the test's own stands in for the rest of the page.
    const bystander = () => {};
    window.addEventListener("error", bystander);
    throwFrom(ownScript());
    window.removeEventListener("error", bystander);
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(mocks.report).not.toHaveBeenCalled();
  });
});

describe("isOwnScript", () => {
  it.each([
    ["https://redactnest.com/_next/static/a.js", true],
    ["https://redactnest.com.evil.example/a.js", false],
    ["http://redactnest.com/a.js", false],
    ["chrome-extension://x/a.js", false],
    ["", false],
    ["not a url", false],
  ])("reads %s as %s", (filename, own) => {
    expect(isOwnScript(filename, "https://redactnest.com")).toBe(own);
  });
});
