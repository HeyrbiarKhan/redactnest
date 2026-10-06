import type { Metadata } from "next";
import { Inter } from "next/font/google";

// Imported here, at the root of every route, on purpose. The config module
// validates at module load, so a missing or malformed environment variable fails
// `next build` rather than shipping a cap that is quietly `undefined`.
import { config } from "@/config";
// The billing gate, for its checks alone (spec 0012, AC-23): a partial or
// inconsistent set of billing values fails the build and every server start
// here, and a Vercel production deploy refuses anything but live keys.
import "@/config/billing";
import { LEGAL } from "@/lib/legal";
import { BrandLockup } from "@/ui/brand-mark";
import { SiteFooter } from "@/ui/site-footer";
import { SkipLink } from "@/ui/skip-link";

import { LegalNav } from "./legal-nav";
import { LicenceNotice } from "./licence-notice";
import { ProductNav } from "./site-nav";

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
  /*
   * The large card for `opengraph-image.png` beside this file, which every
   * page inherits, absolute on `metadataBase` (spec 0013, AC-5). The icons
   * come from the metadata files here too (`favicon.ico`, `icon.svg`,
   * `apple-icon.png`, AC-3), all from our own origin.
   */
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-body text-ink">
        <SkipLink />
        {children}
        <SiteFooter
          brand={
            <>
              {/*
                Not a link: the header's lockup is the way home. The line is a
                `div`, never a `p`, because the footer's one paragraph is the
                licence notice (spec 0013, AC-8).
              */}
              <BrandLockup />
              <div>{LEGAL.brandLine}</div>
            </>
          }
          groups={
            <>
              <ProductNav />
              {/* The privacy policy and the terms, on every page (spec 0011, AC-4). */}
              <LegalNav />
            </>
          }
          notice={
            /*
              The AGPL notice and the source offer, on every page, /tool included
              (spec 0009, AC-1). The link names the exact commit this deploy was
              built from, never the repository root (AC-4 to AC-6).
            */
            <LicenceNotice sourceUrl={config.sourceUrl} />
          }
        />
      </body>
    </html>
  );
}
