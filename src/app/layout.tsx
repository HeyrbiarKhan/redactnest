import type { Metadata } from "next";
import { Inter } from "next/font/google";

// Imported here, at the root of every route, on purpose. The config module
// validates at module load, so a missing or malformed environment variable fails
// `next build` rather than shipping a cap that is quietly `undefined`.
import { config } from "@/config";
import { SiteFooter } from "@/ui/site-footer";
import { SkipLink } from "@/ui/skip-link";

import "./globals.css";

/**
 * The one family (spec 0003, AC-4). `next/font` downloads it at build time and
 * serves it from our own origin, so no visitor's browser ever asks Google for
 * it (AC-20), and the tool route's `font-src 'self'` needs no change.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: {
    default: "RedactNest",
    template: "%s · RedactNest",
  },
  description:
    "Truly redact PDFs in your own browser. Text is removed from the file, not covered with a black box, and your document is never uploaded.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-body text-ink">
        <SkipLink />
        {children}
        <SiteFooter>
          {/*
            The AGPL source offer. Feature 18 owns the full obligation (licence
            file, third party notices, a tag per deploy). This link is here
            because the config module already carries the value, and it must
            resolve to the exact deployed commit rather than the repository root.
          */}
          {config.sourceUrl ? (
            <a
              href={config.sourceUrl}
              className="inline-flex min-h-6 items-center rounded-sm underline underline-offset-4 hover:text-ink"
            >
              Source code (AGPL 3.0)
            </a>
          ) : (
            <span>Source code (AGPL 3.0) · link set per deploy</span>
          )}
        </SiteFooter>
      </body>
    </html>
  );
}
