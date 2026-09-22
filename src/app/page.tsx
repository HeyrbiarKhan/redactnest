import { Button } from "@/ui/button";
import { PageContainer } from "@/ui/page-container";
import { SiteHeader } from "@/ui/site-header";

/**
 * Kept deliberately light. Feature 15 builds the real landing page; this exists
 * so the scaffold has a route that is not the tool route, which is what the
 * standard content security policy regime is asserted against.
 *
 * Spec 0003, AC-13 fixes what it holds: the header with its button, the
 * headline, the lead line and one large button. No eyebrow yet; feature 15 is
 * the first to place one.
 */
export default function HomePage() {
  return (
    <>
      <SiteHeader action={<Button href="/tool">Redact a PDF</Button>} />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col justify-center py-16 focus:outline-none sm:py-24"
      >
        <PageContainer width="wide" className="flex flex-col items-start gap-6">
          <h1 className="max-w-3xl text-display text-ink">Truly redact a PDF.</h1>
          <p className="max-w-2xl text-lead text-ink-muted">
            The text is removed from the file itself rather than covered with a black box,
            and your document never leaves your machine.
          </p>
          <Button href="/tool" size="lg" className="mt-2">
            Redact a PDF
          </Button>
        </PageContainer>
      </main>
    </>
  );
}
