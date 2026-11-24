import { SearchPage, searchPageMetadata } from "../search-page";

/**
 * `/redact-pdf`, the search page for "redact pdf", "redact pdf online free"
 * and "redact pdf without uploading". Spec 0024: one shared template over its
 * record in `src/lib/search-pages.ts`.
 *
 * Prerendered static (AC-1): no request time data, so it is built once and
 * served as a file under the standard content security policy.
 */
export const dynamic = "force-static";

export const metadata = searchPageMetadata("redact-pdf");

export default function RedactPdfPage() {
  return <SearchPage kind="redact-pdf" />;
}
