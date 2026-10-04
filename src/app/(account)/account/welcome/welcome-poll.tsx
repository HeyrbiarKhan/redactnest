"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readSnapshot } from "@/lib/entitlement";
import { TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/spinner";

/**
 * How often the welcome page asks, and how many times before it stops and
 * offers to check again. Spec 0012, AC-16: Polar can take a few seconds to
 * grant the benefit after a payment, so 2 s for 30 s covers the usual wait
 * without asking forever. Rules about this page, decided in the spec.
 */
const POLL_MS = 2_000;
const ASKS_PER_ROUND = 15;

/**
 * How long one ask may take, its answer read included, before it counts as a
 * failed ask. Without it a request that never settles would hold the buyer on
 * "Confirming your payment" with no way on. The tool's wait budget (spec
 * 0012, AC-4), named again here as a rule about this page.
 */
const ASK_BUDGET_MS = 4_000;

/** The same answer the tool gets, so Pro here means Pro there. */
const ENTITLEMENT_URL = "/api/entitlement";

type Phase = "confirming" | "pro" | "still-waiting";

/**
 * One ask. Anything but a clean paid answer keeps the page asking. Past its
 * budget the request is aborted, which `fetch` turns into a rejection, so a
 * stalled ask fails like a dropped one and counts toward the round.
 */
async function askIsPro(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_BUDGET_MS);
  try {
    const response = await fetch(ENTITLEMENT_URL, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    return readSnapshot(await response.json()).tier === "paid";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirming the payment after Polar's checkout. Spec 0012, AC-16.
 *
 * Asks every 2 s while the tab is visible, up to 15 asks a round. An
 * `unknown` or `sign-in-needed` answer is not Pro, so it keeps asking, and so
 * does an ask that runs out of its budget, so every round ends. Names
 * no amount and no card. The tool link is a real page load (spec 0003,
 * INV-10), so the tool opens under its own content security policy.
 */
export function WelcomePoll() {
  const [phase, setPhase] = useState<Phase>("confirming");
  const [round, setRound] = useState(0);
  const asks = useRef(0);

  useEffect(() => {
    if (phase !== "confirming") return;
    asks.current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asking = false;
    let stopped = false;

    // One chain of asks at a time: a tick runs only when no ask is in flight
    // and none is scheduled, so the visibility listener cannot start a second.
    const tick = async () => {
      timer = undefined;
      if (stopped || asking || document.visibilityState !== "visible") return;
      asking = true;
      asks.current += 1;
      const pro = await askIsPro();
      asking = false;
      if (stopped) return;
      if (pro) {
        setPhase("pro");
      } else if (asks.current >= ASKS_PER_ROUND) {
        setPhase("still-waiting");
      } else {
        timer = setTimeout(() => void tick(), POLL_MS);
      }
    };

    // A hidden tab stops asking, and asks again as soon as it is seen.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && timer === undefined) void tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, round]);

  const checkAgain = useCallback(() => {
    setPhase("confirming");
    setRound((value) => value + 1);
  }, []);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-start gap-4">
      {phase === "confirming" && (
        <p className="flex items-center gap-3 text-ink">
          <Spinner />
          Confirming your payment
        </p>
      )}
      {phase === "pro" && (
        <>
          <p className="text-ink">
            You&rsquo;re on Pro. Go back to the tab with your document, or open the tool.
          </p>
          <Button href={TOOL_PATH} reload>
            Open the tool
          </Button>
        </>
      )}
      {phase === "still-waiting" && (
        <>
          <p className="text-ink">
            Your payment is still being confirmed. This can take a few minutes.
          </p>
          <Button variant="secondary" onClick={checkAgain}>
            Check again
          </Button>
        </>
      )}
    </div>
  );
}
