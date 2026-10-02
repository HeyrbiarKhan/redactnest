import type { Metadata } from "next";

import { COMPLAINT_AUTHORITIES, OUTSIDE_SERVICES } from "@/config/privacy";
import { LEGAL } from "@/lib/legal";
import { PRIVACY_CHANGES } from "@/lib/policy-changes";
import { PRIVACY_SECTIONS } from "@/lib/policy-sections";

import { ChangeList, ContactLink, LegalPage } from "../legal-page";

import { RepresentativesBlock } from "./representatives-block";
import { ServicesSection } from "./services-section";

/**
 * The privacy policy. Spec 0011, AC-1, AC-3 and AC-6 to AC-9.
 *
 * It makes only the claims in spec 0011's claims register (C1 to C12), each
 * held by the test or gate the register names, and no other claim about data
 * (AC-7, INV-3). A change that weakens a claim's holder changes this page and
 * adds an entry to `PRIVACY_CHANGES` in the same change. The comments name the
 * claim each paragraph makes, so `/check verify` can walk the register.
 *
 * Prerendered static, with no client component and no script of its own
 * (INV-7). No cap is stated as a number and the source repository is never
 * named (INV-6).
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: LEGAL.privacyLabel,
  description:
    "What happens to your data on RedactNest: your document is processed only in your browser and never uploaded, and no cookies or tracking are used.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title={LEGAL.privacyLabel} changes={PRIVACY_CHANGES}>
      <section>
        <h2>{PRIVACY_SECTIONS.whoWeAre}</h2>
        {/* AC-6 */}
        <p>
          {LEGAL.operatorLine}, runs this website and the redaction tool on it. In this
          policy, “we”, “us” and “our” mean RedactNest.
        </p>
        <p>
          We are the controller for the little personal data this site involves. A
          controller is the one who decides how personal data is used, and why.
        </p>
        <p>
          You can reach us about anything on this page at <ContactLink />.
        </p>
        <RepresentativesBlock decision={LEGAL.representatives} />
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.yourDocuments}</h2>
        {/* C1 */}
        <p>
          When you choose a PDF, it is opened and processed only in your browser, on your
          own device. It is never uploaded to us or to anyone else.
        </p>
        <p>
          The tool page is locked so that your browser itself refuses to let it connect to
          any other site.
        </p>
        {/* C2 */}
        <p>
          We never store your document, and nothing about it is saved in your browser’s
          storage.
        </p>
        {/* C3 */}
        <p>
          What RedactNest finds in your document, the words around each item it finds, and
          your file’s name all stay on your device.
        </p>
        {/* C4 */}
        <p>
          When you close the page or start over, the document is gone from the page’s
          memory.
        </p>
        {/* C5 */}
        <p>
          The tool page asks our server for one thing only: which plan applies to you.
          That request carries nothing about your document.
        </p>
        <p>
          The cleaned file is saved wherever your browser saves downloads. We cannot see,
          recover or delete your documents, because we never have them.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.whatWeReceive}</h2>
        {/* C10 */}
        <p>
          Like every website, this one reaches you through a host. Whenever your browser
          asks for a page or a file, our host records standard request data: your IP
          address, your browser and device type, the page or file asked for, and the time.
        </p>
        <p>
          This is used to deliver the site and keep it working and secure. Our legal basis
          is our legitimate interest in doing that (Article 6(1)(f) of the UK GDPR and the
          EU GDPR). A browser cannot load a page without sending its IP address, so this
          data is needed for you to load a page at all.
        </p>
        <p>
          Our host keeps it for one day. We keep no copy of it, and we do not try to
          identify you from it.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.whatWeDoNotDo}</h2>
        <ul>
          {/* C6 */}
          <li>No cookies. No page on this site sets one.</li>
          {/* C7 */}
          <li>
            No analytics, advertising, tracking or error reporting, and no script from
            anyone else.
          </li>
          {/* C8 */}
          <li>Our own code keeps no logs.</li>
          {/* C9 */}
          <li>
            Fonts and files come from our own site, so loading a page tells no one else
            that you visited.
          </li>
          {/* C11 */}
          <li>
            We do not sell or share data, combine it with anything else, or make automated
            decisions about you. There is no profiling.
          </li>
          {/* C12 */}
          <li>There are no accounts or payments yet.</li>
        </ul>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.services}</h2>
        {/* AC-8 */}
        <p>These are the outside services involved in running RedactNest.</p>
        <ServicesSection services={OUTSIDE_SERVICES} />
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.transfers}</h2>
        <p>
          We operate from {LEGAL.country}, and the services above process data in the
          places listed for each. When personal data leaves the UK or the EU, it is
          protected like this:
        </p>
        <ul>
          {OUTSIDE_SERVICES.map((service) => (
            <li key={service.name}>
              {service.name}. Where: {service.location}. Safeguard: {service.safeguard}.
            </li>
          ))}
        </ul>
        <p>
          The Data Privacy Framework is an agreement under which certified US companies
          promise to protect personal data to the EU’s standard. Standard contractual
          clauses are contract terms, approved by the European Commission, that bind the
          receiver to protect the data.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.yourRights}</h2>
        {/* AC-9: the six rights. */}
        <p>Under the UK GDPR and the EU GDPR you have the right to:</p>
        <ul>
          <li>access the personal data we hold about you</li>
          <li>have it corrected if it is wrong</li>
          <li>have it erased</li>
          <li>restrict how it is used</li>
          <li>object to how it is used</li>
          <li>receive it in a form you can take elsewhere (portability)</li>
        </ul>
        <p>
          The only personal data involved is the request data our host keeps for one day,
          and we cannot link it to you. So most requests will find nothing, and if that
          happens we will tell you.
        </p>
        <p>
          To ask, write to <ContactLink />. We will reply within one month, and there is
          no fee.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.complaints}</h2>
        <p>
          If you are unhappy with how we handle your data, please tell us first at{" "}
          <ContactLink />. You also have the right to complain to a data protection
          authority:
        </p>
        <ul>
          <li>
            in the UK, the{" "}
            <a href={COMPLAINT_AUTHORITIES.uk.url}>{COMPLAINT_AUTHORITIES.uk.name}</a>{" "}
            (ICO)
          </li>
          <li>
            in the EU, your own country’s data protection authority, found on the{" "}
            <a href={COMPLAINT_AUTHORITIES.eu.url}>{COMPLAINT_AUTHORITIES.eu.name}</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.children}</h2>
        <p>
          RedactNest is not aimed at children, and it collects nothing from anyone,
          children included.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.links}</h2>
        <p>
          This page links to other sites, such as our host’s privacy policy and the data
          protection authorities above. Their own privacy policies apply there, not this
          one.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.changes}</h2>
        <p>
          When we change this policy, we update the date at the top and add a line below
          saying what changed.
        </p>
        <ChangeList changes={PRIVACY_CHANGES} />
      </section>
    </LegalPage>
  );
}
