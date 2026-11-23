import { SearchPage, searchPageMetadata } from "../search-page";

/**
 * `/black-box-redaction`, the search page for "black box redaction",
 * "redacted pdf text can be copied" and "how to check a redacted pdf". Spec
 * 0024: one shared template over its record in `src/lib/search-pages.ts`.
 *
 * Prerendered static (AC-1): no request time data, so it is built once and
 * served as a file under the standard content security policy.
 */
export const dynamic = "force-static";

export const metadata = searchPageMetadata("black-box");

export default function BlackBoxRedactionPage() {
  return <SearchPage kind="black-box" />;
}
