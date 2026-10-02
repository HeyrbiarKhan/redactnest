import { Fragment, type ReactNode } from "react";

import { LEGAL } from "@/lib/legal";
import { LICENCE_PATH, NOTICES_PATH } from "@/lib/routes";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The licence notice at the foot of every page. Spec 0009, AC-1 to AC-3.
 *
 * AGPL section 5(d)'s four parts (a copyright notice, no warranty, that people
 * may share the work under the licence, and how to read it) and section 13's
 * offer of the running version's source, in that order, as one paragraph so it
 * wraps at words inside the footer's row. Every word comes from
 * `src/lib/legal.ts` and every path from `src/lib/routes.ts`.
 *
 * It takes the source link as a prop rather than reading the config, so a
 * component test can render it without the layout's font loader.
 */
export function LicenceNotice({ sourceUrl }: { readonly sourceUrl: string }) {
  const parts: readonly ReactNode[] = [
    LEGAL.copyrightLine,
    LEGAL.licenceLine,
    LEGAL.warrantyLine,
    // AC-3: a development build has no commit to link to.
    sourceUrl ? (
      <a key="source" href={sourceUrl} className={FOOTER_LINK_CLASS}>
        {LEGAL.sourceLabel}
      </a>
    ) : (
      LEGAL.sourcePending
    ),
    <a key="licence" href={LICENCE_PATH} className={FOOTER_LINK_CLASS}>
      {LEGAL.licenceLabel}
    </a>,
    <a key="notices" href={NOTICES_PATH} className={FOOTER_LINK_CLASS}>
      {LEGAL.noticesLabel}
    </a>,
  ];

  return (
    <p>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {/* The spaces stay outside the hidden dot, so a screen reader still
              hears the parts as separate words. */}
          {index > 0 && (
            <>
              {" "}
              <span aria-hidden="true">·</span>{" "}
            </>
          )}
          {part}
        </Fragment>
      ))}
    </p>
  );
}
