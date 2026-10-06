import type { Metadata } from "next";

import { HOME_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { PageContainer } from "@/ui/page-container";

import { NAV_TEXT, PageHeader } from "./site-nav";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Every address that is not a page, and `/pricing` with billing off. Spec
 * 0013, AC-9.
 *
 * The shell every page has, then two ways on: into the tool, and home. Both are
 * real page loads, so the tool opens under its own content security policy
 * (spec 0003, INV-10). Next.js answers with status 404 and marks the page
 * `noindex`, so no search index keeps a dead address. Its words are written
 * here: they describe no document, cap or plan.
 */
export default function NotFound() {
  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col justify-center py-16 focus:outline-none sm:py-24"
      >
        <PageContainer width="wide" className="flex flex-col items-start gap-4">
          <h1 className="text-title text-ink">This page doesn&rsquo;t exist</h1>
          <p className="max-w-2xl text-lead text-ink-muted">
            The address may be mistyped, or the page may have moved.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href={TOOL_PATH} reload size="lg">
              {NAV_TEXT.tryFree}
            </Button>
            <Button href={HOME_PATH} reload variant="secondary" size="lg">
              Go to the home page
            </Button>
          </div>
        </PageContainer>
      </main>
    </>
  );
}
