import { config } from "@/config";
import { llmsText } from "@/lib/llms-text";

/**
 * `/llms.txt` (the marketing brief of 2026-11-28, item 2): a plain text
 * account of RedactNest for language model crawlers, built from code by
 * `llmsText` so it cannot drift from the site. Not in the sitemap, which
 * lists pages. Static, built once, like the sitemap and the robots file.
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(llmsText(config), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
