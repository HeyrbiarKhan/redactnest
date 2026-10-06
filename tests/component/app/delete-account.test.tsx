/**
 * Delete account, the two step confirm. Spec 0012, AC-11 and INV-13, and
 * spec 0013, AC-34 and AC-35: the red buttons, and the wait shown on the
 * confirm, which keeps focus.
 *
 * The server action, Clerk and the page load are stubbed at their module
 * boundaries. Each case reads what the visitor meets: the confirm in place,
 * the warning when Pro was set to end, each refusal and failure in words,
 * focus never lost, and a deleted account leaving through Sign out's after
 * deletion mode, a full page load of `/` whatever Clerk's `signOut` does.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeleteResult } from "@/app/(account)/account/actions";
import { DeleteAccount } from "@/app/(account)/delete-account";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  deleteAccountAction: vi.fn<() => Promise<DeleteResult>>(),
  signOut: vi.fn<(callback?: () => void) => Promise<unknown>>(),
  loadDocument: vi.fn<(path: string) => void>(),
  /** The seller and contact a case swaps in, or the real ones. */
  legal: null as { readonly sellerName: string; readonly contactEmail: string } | null,
}));

vi.mock("@/app/(account)/account/actions", () => ({
  deleteAccountAction: mocks.deleteAccountAction,
}));
// Clerk once its script has loaded; Sign out's tests cover the wait before.
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    loaded: true,
    status: "ready",
    on: () => {},
    off: () => {},
    signOut: mocks.signOut,
  }),
}));
vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadDocument: mocks.loadDocument,
}));
// The real words unless a case swaps the seller or the contact (INV-9).
vi.mock("@/lib/legal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legal")>();
  return {
    ...actual,
    LEGAL: {
      ...actual.LEGAL,
      get sellerName() {
        return mocks.legal?.sellerName ?? actual.LEGAL.sellerName;
      },
      get contactEmail() {
        return mocks.legal?.contactEmail ?? actual.LEGAL.contactEmail;
      },
    },
  };
});

const DELETE = { name: "Delete account" };
const CONFIRM = { name: "Delete my account for good" };
const CANCEL = { name: "Cancel" };
const DELETING = { name: "Deleting your account" };

/** The confirm while it waits: still a button, busy, never `disabled`, with focus. */
function expectBusy(button: HTMLElement) {
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).not.toHaveAttribute("disabled");
  expect(within(button).getByTestId("spinner")).toBeInTheDocument();
  expect(button).toHaveFocus();
}

beforeEach(() => {
  mocks.deleteAccountAction.mockReset();
  mocks.signOut.mockReset();
  mocks.loadDocument.mockReset();
  mocks.legal = null;
});

/** Render, then open the confirm. */
async function openConfirm(endsOn: string | null = null) {
  const view = render(<DeleteAccount endsOn={endsOn} />);
  await userEvent.click(screen.getByRole("button", DELETE));
  return view;
}

describe("the two steps", () => {
  it("shows only Delete account at rest, with an empty hidden region already there", async () => {
    const { container } = render(<DeleteAccount endsOn={null} />);
    expect(screen.getByRole("button", DELETE)).toBeEnabled();
    expect(screen.queryByRole("button", CONFIRM)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveClass("sr-only");
    expect(status).toBeEmptyDOMElement();
    await expectNoAxeViolations(container);
  });

  /** Spec 0013, AC-35 and INV-12: red for the two that destroy, teal for Cancel. */
  it("draws Delete account as a red outline, the confirm solid red and Cancel in teal", async () => {
    render(<DeleteAccount endsOn={null} />);
    expect(screen.getByRole("button", DELETE)).toHaveClass(
      "border-danger-ink",
      "text-danger-ink",
      "bg-surface",
      "hover:bg-danger-bg",
    );

    await userEvent.click(screen.getByRole("button", DELETE));

    expect(screen.getByRole("button", CONFIRM)).toHaveClass(
      "bg-danger-ink",
      "text-on-accent",
      "border-transparent",
      "hover:bg-danger-strong",
    );
    expect(screen.getByRole("button", CANCEL)).toHaveClass(
      "border-accent",
      "text-accent-strong",
      "hover:bg-accent-soft",
    );
    expect(screen.getByRole("button", CANCEL).className).not.toMatch(/danger/);
  });

  it("asks in place, with focus on Cancel, and calls nothing yet", async () => {
    const { container } = await openConfirm();
    expect(screen.queryByRole("button", DELETE)).toBeNull();
    expect(screen.getByRole("group", DELETE)).toBeInTheDocument();
    expect(screen.getByRole("button", CONFIRM)).toBeEnabled();
    expect(screen.getByRole("button", CANCEL)).toHaveFocus();
    expect(screen.queryByText(/Your Pro access ends now/)).toBeNull();
    expect(mocks.deleteAccountAction).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("warns that Pro set to end ends now, and ties the warning to the confirm", async () => {
    const { container } = await openConfirm("3 November 2026");
    const warning = screen.getByText("Your Pro access ends now, not on 3 November 2026.");
    expect(screen.getByRole("group", DELETE)).toHaveAttribute(
      "aria-describedby",
      warning.id,
    );
    await expectNoAxeViolations(container);
  });

  it("goes back on Cancel, with focus on Delete account, having deleted nothing", async () => {
    await openConfirm("3 November 2026");
    await userEvent.click(screen.getByRole("button", CANCEL));
    expect(screen.getByRole("button", DELETE)).toHaveFocus();
    expect(screen.queryByText(/Your Pro access ends now/)).toBeNull();
    expect(mocks.deleteAccountAction).not.toHaveBeenCalled();
  });
});

describe("a deleted account (AC-11, INV-13)", () => {
  it("signs out with a callback, then loads / as a new document", async () => {
    mocks.deleteAccountAction.mockResolvedValue("deleted");
    mocks.signOut.mockResolvedValue(undefined);
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
    expect(typeof mocks.signOut.mock.calls[0][0]).toBe("function");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still loads / when signOut fails, as it will with the user gone", async () => {
    mocks.deleteAccountAction.mockResolvedValue("deleted");
    mocks.signOut.mockRejectedValue(new Error("user not found"));
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes to sign in, as a page load, when the session ended meanwhile", async () => {
    mocks.deleteAccountAction.mockResolvedValue("sign-in");
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expectBusy(screen.getByRole("button", { name: "Taking you to sign in" }));
    expect(screen.getByRole("status")).toHaveTextContent("Taking you to sign in");
  });

  it("cannot be sent twice while it runs", async () => {
    mocks.deleteAccountAction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await openConfirm();

    await user.click(screen.getByRole("button", CONFIRM));
    await user.click(screen.getByRole("button", DELETING));
    await user.keyboard("{Enter}");

    expectBusy(screen.getByRole("button", DELETING));
    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
    expect(mocks.deleteAccountAction).toHaveBeenCalledTimes(1);
  });

  /**
   * Spec 0013, AC-34 and INV-13, and WCAG 4.1.3. The delete and the sign out
   * after it can each take seconds, so the confirm shows which is under way
   * and keeps focus, and a region that was in the page from the first render
   * says it to a screen reader without showing it twice.
   */
  it("shows the delete on the confirm it keeps focus on, and says it in the hidden region", async () => {
    mocks.deleteAccountAction.mockReturnValue(new Promise(() => {}));
    const { container } = await openConfirm();
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    expectBusy(screen.getByRole("button", DELETING));
    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Deleting your account");
    expect(status).not.toHaveAttribute("tabindex");
    // Nothing new shows under the buttons: every `p` but the hidden region
    // is the confirm's own warning, and there is none here.
    expect([...container.querySelectorAll("p")]).toEqual([status]);
    await expectNoAxeViolations(container);
  });

  it("says the account is deleted while it signs out, in the same region", async () => {
    mocks.deleteAccountAction.mockResolvedValue("deleted");
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    await openConfirm();
    const status = screen.getByRole("status");

    await userEvent.click(screen.getByRole("button", CONFIRM));

    await waitFor(() =>
      expect(status).toHaveTextContent("Your account is deleted. Signing you out"),
    );
    // The same element, so the change is announced in place; the button
    // names what is happening now, as Sign out's does.
    expect(screen.getByRole("status")).toBe(status);
    expectBusy(screen.getByRole("button", { name: "Signing you out" }));
    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
  });

  /**
   * AC-34: the button stays busy after the page load starts, until the
   * browser leaves, so the last moment before `/` arrives shows the work
   * still under way and no press can start it again.
   */
  it("stays busy, saying it signs you out, once the load of / has started", async () => {
    mocks.deleteAccountAction.mockResolvedValue("deleted");
    mocks.signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await openConfirm();

    await user.click(screen.getByRole("button", CONFIRM));
    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));

    const busy = screen.getByRole("button", { name: "Signing you out" });
    expectBusy(busy);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account is deleted. Signing you out",
    );
    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
    await user.click(busy);
    await user.keyboard("{Enter}");
    expect(mocks.deleteAccountAction).toHaveBeenCalledTimes(1);
    expect(mocks.loadDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps Cancel disabled once the load of sign in has started", async () => {
    mocks.deleteAccountAction.mockResolvedValue("sign-in");
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));
    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/sign-in"));

    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
  });
});

describe("refusals and failures (AC-11)", () => {
  it.each<[DeleteResult, string]>([
    ["renewing", "Cancel your subscription in Manage billing first."],
    [
      "other-product",
      "Your email also has a subscription to another EdiventStudio product, so we can’t remove your billing details here. Write to privacy@redactnest.com.",
    ],
    [
      "billing-failed",
      "We couldn’t delete your account. Nothing was removed. Try again, or write to privacy@redactnest.com.",
    ],
    [
      "sign-in-kept",
      "Your billing details were removed, but your sign in wasn’t. Try again to finish.",
    ],
  ])(
    "says so for %s, stays, and gives focus back to the confirm",
    async (result, words) => {
      mocks.deleteAccountAction.mockResolvedValue(result);
      const { container } = await openConfirm();

      await userEvent.click(screen.getByRole("button", CONFIRM));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(words);
      const button = screen.getByRole("button", CONFIRM);
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(within(button).queryByTestId("spinner")).toBeNull();
      expect(button).toHaveFocus();
      expect(screen.getByRole("button", CANCEL)).toBeEnabled();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(mocks.loadDocument).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
      await expectNoAxeViolations(container);
    },
  );

  it.each<DeleteResult>(["billing-failed", "other-product"])(
    "links the contact address where the words name it, for %s",
    async (result) => {
      mocks.deleteAccountAction.mockResolvedValue(result);
      await openConfirm();

      await userEvent.click(screen.getByRole("button", CONFIRM));

      expect(
        within(await screen.findByRole("alert")).getByRole("link", {
          name: "privacy@redactnest.com",
        }),
      ).toHaveAttribute("href", "mailto:privacy@redactnest.com");
    },
  );

  /** covers: INV-9. The seller and the contact are LEGAL's, never a literal here. */
  it.each<[DeleteResult, string]>([
    [
      "other-product",
      "Your email also has a subscription to another Another Studio product, so we can’t remove your billing details here. Write to help@redactnest.example.",
    ],
    [
      "billing-failed",
      "We couldn’t delete your account. Nothing was removed. Try again, or write to help@redactnest.example.",
    ],
  ])("takes the seller and the contact from LEGAL, for %s", async (result, words) => {
    mocks.legal = {
      sellerName: "Another Studio",
      contactEmail: "help@redactnest.example",
    };
    mocks.deleteAccountAction.mockResolvedValue(result);
    // The lines are built once, as the module loads, so a fresh copy reads the
    // swapped words; the contact link reads them again as it renders.
    vi.resetModules();
    const { DeleteAccount: Fresh } = await import("@/app/(account)/delete-account");
    render(<Fresh endsOn={null} />);
    await userEvent.click(screen.getByRole("button", DELETE));

    await userEvent.click(screen.getByRole("button", CONFIRM));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(words);
    expect(
      within(alert).getByRole("link", { name: "help@redactnest.example" }),
    ).toHaveAttribute("href", "mailto:help@redactnest.example");
  });

  it("claims nothing either way when the call never answers", async () => {
    mocks.deleteAccountAction.mockRejectedValue(new Error("Failed to fetch"));
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We didn’t hear back, so we can’t tell whether your account was deleted. Reload the page to check.",
    );
    expect(mocks.loadDocument).not.toHaveBeenCalled();
  });

  it("can try again, and the new answer is announced afresh", async () => {
    mocks.deleteAccountAction
      .mockResolvedValueOnce("sign-in-kept")
      .mockResolvedValueOnce("deleted");
    mocks.signOut.mockResolvedValue(undefined);
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Try again to finish/);

    await userEvent.click(screen.getByRole("button", CONFIRM));
    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the words on Cancel", async () => {
    mocks.deleteAccountAction.mockResolvedValue("renewing");
    await openConfirm();
    await userEvent.click(screen.getByRole("button", CONFIRM));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", CANCEL));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", DELETE)).toHaveFocus();
  });
});
