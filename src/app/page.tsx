import { HOME_TEXT } from "@/lib/home-text";
import { TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { PageContainer } from "@/ui/page-container";

import { NAV_TEXT, PageHeader } from "./site-nav";

/**
 * The home page. Spec 0013, AC-10 to AC-13: every word in its main content
 * comes from `src/lib/home-text.ts`.
 *
 * Both buttons are real page loads (`reload`), never `next/link` (spec 0003,
 * AC-21). A content security policy belongs to the document it arrived with,
 * so a client side navigation would open the tool under this page's policy,
 * with whatever scripts this page started still running (INV-10). It also
 * stops `/` prefetching `/tool`.
 */
export default function HomePage() {
  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col justify-center py-16 focus:outline-none sm:py-24"
      >
        <PageContainer width="wide" className="flex flex-col items-start gap-6">
          <div className="flex flex-col gap-4">
            <p data-testid="home-eyebrow" className="eyebrow">
              {HOME_TEXT.eyebrow}
            </p>
            <h1 className="max-w-3xl text-display text-ink">{HOME_TEXT.headline}</h1>
          </div>
          <p className="max-w-2xl text-lead text-ink-muted">
            The text is removed from the file itself rather than covered with a black box,
            and your document never leaves your machine.
          </p>
          <Button href={TOOL_PATH} reload size="lg" className="mt-2">
            {NAV_TEXT.redactPdf}
          </Button>
        </PageContainer>
      </main>
    </>
  );
}
