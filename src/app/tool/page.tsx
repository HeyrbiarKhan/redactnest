import type { Metadata } from "next";

import { PageContainer } from "@/ui/page-container";

import { PageHeader } from "../site-nav";
import { ToolClient } from "./tool-client";

/**
 * The tool route.
 *
 * Prerendered static on purpose. The page that touches a customer's file has no
 * server in its request path at all, which is a claim feature 16 can make and a
 * customer can check for themselves in developer tools.
 *
 * This is also why the tool route's content security policy allows
 * `'unsafe-inline'` in `script-src`: the nonce alternative would force dynamic
 * rendering, which is exactly what this line rules out. See `next.config.ts`.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Redact a PDF",
  description:
    "Remove sensitive text from a PDF in your own browser. The file never leaves your machine.",
};

export default function ToolPage() {
  return (
    <>
      {/* Redact current, and no "Redact a PDF" button on its own page (spec 0013, AC-7). */}
      <PageHeader current="tool" />
      {/*
        The skip link's target (spec 0003, AC-14). Focusable so the link can
        move focus here, and the one element allowed to drop its outline,
        because it is a place focus lands rather than a control.
      */}
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        {/*
          Wide, for the three area grid (spec 0013, AC-14). The lock line that
          sat under the title now ends the rail, beside the drop zone or inside
          the action panel, where the file is.
        */}
        <PageContainer width="wide" className="flex flex-col gap-8">
          <h1 className="text-title text-ink">Redact a PDF</h1>

          <ToolClient />
        </PageContainer>
      </main>
    </>
  );
}
