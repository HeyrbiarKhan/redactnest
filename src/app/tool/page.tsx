import type { Metadata } from "next";

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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Redact a PDF</h1>
        <p className="text-sm opacity-80">
          Your document is opened in your own browser and never uploaded. Nothing on this
          page can send it anywhere.
        </p>
      </header>

      <ToolClient />
    </main>
  );
}
