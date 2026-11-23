import { SearchPage, searchPageMetadata } from "../search-page";

/**
 * `/remove-text-from-pdf`, the search page for "remove text from pdf" and
 * "delete text from pdf permanently". Spec 0024: one shared template over its
 * record in `src/lib/search-pages.ts`.
 *
 * Prerendered static (AC-1): no request time data, so it is built once and
 * served as a file under the standard content security policy.
 */
export const dynamic = "force-static";

export const metadata = searchPageMetadata("remove-text");

export default function RemoveTextFromPdfPage() {
  return <SearchPage kind="remove-text" />;
}
