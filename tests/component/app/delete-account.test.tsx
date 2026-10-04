/**
 * Delete account, the two step confirm. Spec 0012, AC-11 and INV-13.
 *
 * The server action, Clerk and the page load are stubbed at their module
 * boundaries. Each case reads what the visitor meets: the confirm in place,
 * the warning when Pro was set to end, each refusal and failure in words,
 * focus never lost, and a deleted account leaving through Sign out's after
 * deletion mode, a full page load of `/` whatever Clerk's `signOut` does.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeleteResult } from "@/app/(account)/account/actions";
import { DeleteAccount } from "@/app/(account)/delete-account";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  deleteAccountAction: vi.fn<() => Promise<DeleteResult>>(),
  signOut: vi.fn<(callback?: () => void) => Promise<unknown>>(),
  loadDocument: vi.fn<(path: string) => void>(),
}));

vi.mock("@/app/(account)/account/actions", () => ({
  deleteAccountAction: mocks.deleteAccountAction,
}));
// Clerk once its script has loaded; Sign out's tests cover the wait before.
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ loaded: true, on: () => {}, off: () => {}, signOut: mocks.signOut }),
}));
vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadDocument: mocks.loadDocument,
}));

const DELETE = { name: "Delete account" };
const CONFIRM = { name: "Delete my account for good" };
const CANCEL = { name: "Cancel" };

beforeEach(() => {
  mocks.deleteAccountAction.mockReset();
  mocks.signOut.mockReset();
  mocks.loadDocument.mockReset();
});

/** Render, then open the confirm. */
async function openConfirm(endsOn: string | null = null) {
  const view = render(<DeleteAccount endsOn={endsOn} />);
  await userEvent.click(screen.getByRole("button", DELETE));
  return view;
}

describe("the two steps", () => {
  it("shows only Delete account at rest", async () => {
    const { container } = render(<DeleteAccount endsOn={null} />);
    expect(screen.getByRole("button", DELETE)).toBeEnabled();
    expect(screen.queryByRole("button", CONFIRM)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoAxeViolations(container);
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
  });

  it("cannot be sent twice while it runs", async () => {
    mocks.deleteAccountAction.mockReturnValue(new Promise(() => {}));
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    expect(screen.getByRole("button", CONFIRM)).toBeDisabled();
    expect(screen.getByRole("button", CANCEL)).toBeDisabled();
    expect(mocks.deleteAccountAction).toHaveBeenCalledTimes(1);
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
      expect(screen.getByRole("button", CONFIRM)).toHaveFocus();
      expect(mocks.loadDocument).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
      await expectNoAxeViolations(container);
    },
  );

  it("links the contact address where the words name it", async () => {
    mocks.deleteAccountAction.mockResolvedValue("billing-failed");
    await openConfirm();

    await userEvent.click(screen.getByRole("button", CONFIRM));

    expect(
      await screen.findByRole("link", { name: "privacy@redactnest.com" }),
    ).toHaveAttribute("href", "mailto:privacy@redactnest.com");
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
