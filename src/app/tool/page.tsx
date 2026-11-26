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
 *
 * `ToolClient` draws the whole page, the header and `main` with the title
 * included, because the header shows the open document's name and controls
 * (spec 0026, child 0001, AC-30), and only `ToolClient` holds the session.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Redact a PDF",
  description:
    "Remove sensitive text from a PDF in your own browser. The file never leaves your machine.",
};

export default function ToolPage() {
  return <ToolClient />;
}
