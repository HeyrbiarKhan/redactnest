import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

// Imported here, at the root of every route, on purpose. The config module
// validates at module load, so a missing or malformed environment variable fails
// `next build` rather than shipping a cap that is quietly `undefined`.
import { config } from "@/config";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <footer className="mx-auto w-full max-w-2xl px-4 py-8 text-xs opacity-70">
          {/*
            The AGPL source offer. Feature 18 owns the full obligation (licence
            file, third party notices, a tag per deploy). This link is here
            because the config module already carries the value, and it must
            resolve to the exact deployed commit rather than the repository root.
          */}
          {config.sourceUrl ? (
            <a href={config.sourceUrl} className="underline underline-offset-2">
              Source code (AGPL 3.0)
            </a>
          ) : (
            <span>Source code (AGPL 3.0) · link set per deploy</span>
          )}
        </footer>
      </body>
    </html>
  );
}
