import Link from "next/link";

/**
 * Kept deliberately light. Feature 15 builds the real landing page; this exists
 * so the scaffold has a route that is not the tool route, which is what the
 * standard content security policy regime is asserted against.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">RedactNest</h1>
      <p className="text-ink-muted">
        Truly redact a PDF. The text is removed from the file itself rather than covered
        with a black box, and your document never leaves your machine.
      </p>
      <Link
        href="/tool"
        className="w-fit rounded-md border border-border-strong px-4 py-2 text-sm font-medium"
      >
        Redact a PDF
      </Link>
    </main>
  );
}
