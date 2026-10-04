"use server";

import { auth } from "@clerk/nextjs/server";

import { accountSeams } from "@/billing/clients";
import { deleteAccount, type DeleteOutcome } from "@/billing/delete";

/** What Delete account is told: a kind, never a detail from Polar or Clerk. */
export type DeleteResult = DeleteOutcome["kind"];

/**
 * Delete account's one server call. Spec 0012, AC-11 and INV-3.
 *
 * It takes no arguments. Anyone can send this POST without the page, so the
 * account is the session's own, read from `auth()` here, and nothing in the
 * request can name another one. Next.js refuses a request from another
 * origin before this runs. With billing off there is nothing to delete and no
 * Clerk to ask, and the page never shows the control.
 */
export async function deleteAccountAction(): Promise<DeleteResult> {
  const seams = accountSeams();
  if (seams === null) return "billing-failed";
  const { userId } = await auth();
  const outcome = await deleteAccount(userId, seams);
  return outcome.kind;
}
