import type { Metadata } from "next";

import {
  CLERK_PRODUCTION_ORIGIN,
  COMPLAINT_AUTHORITIES,
  OUTSIDE_SERVICES,
  POLAR_SERVICE,
} from "@/config/privacy";
import { LEGAL } from "@/lib/legal";
import { PRIVACY_CHANGES } from "@/lib/policy-changes";
import { PRIVACY_SECTIONS } from "@/lib/policy-sections";

import { ChangeList, ContactLink, LegalPage } from "../legal-page";

import { RepresentativesBlock } from "./representatives-block";
import { ServicesSection } from "./services-section";

/**
 * The privacy policy. Spec 0011, AC-1, AC-3 and AC-6 to AC-9, with the claims
 * spec 0012 changed and added for accounts and Pro (AC-22).
 *
 * It makes only the claims in spec 0011's claims register as spec 0012 amends
 * it (C1 to C13), each held by the test or gate the register names, and no
 * other claim about data (AC-7, INV-3). A change that weakens a claim's holder
 * changes this page and adds an entry to `PRIVACY_CHANGES` in the same change.
 * The comments name the claim each paragraph makes, so `/check verify` can
 * walk the register.
 *
 * Prerendered static, with no client component and no script of its own
 * (INV-7). No cap is stated as a number and the source repository is never
 * named (INV-6). It describes production in every build, billing off
 * included, so Clerk's host is always its production address.
 */
export const dynamic = "force-static";

/** Where Clerk's cookies sit beside ours, as claim C6 names it. */
const CLERK_HOST = new URL(CLERK_PRODUCTION_ORIGIN).host;

export const metadata: Metadata = {
  title: LEGAL.privacyLabel,
  description:
    "What happens to your data on RedactNest: your document is processed only in your browser and never uploaded, there is no tracking, and only the sign in and account pages set cookies.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title={LEGAL.privacyLabel} changes={PRIVACY_CHANGES}>
      <section>
        <h2>{PRIVACY_SECTIONS.whoWeAre}</h2>
        {/* AC-6 */}
        <p>
          {LEGAL.operatorLine}, runs this website and the redaction tool on it.{" "}
          {LEGAL.soldThroughLine} In this policy, “we”, “us” and “our” mean RedactNest.
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
          Apart from loading the page and its own files, the tool page asks our server one
          question only: which plan applies to you. That request carries your sign in
          cookie if you have one, and nothing about your document. To answer, our server
          checks your sign in cookie itself and, when it shows you are signed in, asks
          Polar whether you hold Pro, sending your account id and nothing else.
        </p>
        <p>
          The cleaned file is saved wherever your browser saves downloads. We cannot see,
          recover or delete your documents, because we never have them.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.yourAccount}</h2>
        <p>You can use the tool without an account. You need one only to buy Pro.</p>
        {/* C12 */}
        <p>
          Your account holds your email address and nothing else. There is no name and no
          password: you sign in with a code sent to that address. Clerk, our sign in
          provider, keeps it for us until you delete the account, which you can do in
          Account. Clerk also records details of each sign in, listed under Services we
          use.
        </p>
        <p>
          We use your email address to sign you in and to run your Pro subscription. Our
          legal basis is the contract between us (Article 6(1)(b) of the UK GDPR and the
          EU GDPR).
        </p>
        {/* AC-11 of spec 0012 */}
        <p>
          When you delete your account, we delete it at Clerk and delete your customer
          record at Polar. Polar still keeps the records tax law requires.
        </p>
        {/* C6 */}
        <p>
          No page on this site sets a cookie, except the sign in and account pages. There,
          Clerk sets the cookies that sign in needs, on our site and on {CLERK_HOST}, its
          address for us. On that address, Cloudflare, the network Clerk uses, also sets
          cookies that protect sign in from abuse. All of them are strictly necessary for
          signing in and keeping it secure.
        </p>
        <p>
          Nothing else sets a cookie on our site or on {CLERK_HOST}, and we set none of
          our own. Polar’s checkout and billing pages are Polar’s own site, not ours: any
          cookies there are set by Polar or the services it uses, not by us.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.payments}</h2>
        {/* C13 */}
        <p>{LEGAL.merchantLine}</p>
        <p>
          A merchant of record is the seller in law: Polar sells Pro to you, works out the
          tax and sends your receipts. We never see your card: Polar’s payment processor,
          Stripe, takes your card details.
        </p>
        <p>
          When you start to subscribe, before you pay, we send Polar your account id and
          email address, so your payment is tied to your account. Polar keeps that
          customer record even if you leave checkout, until you delete your account.
        </p>
        <p>
          From Polar we learn only whether you hold Pro, when your subscription renews or
          ends, and whether it already knows your email address.
        </p>
        <p>
          Polar handles your details for us as our processor, as its privacy policy and
          data processing agreement say. As merchant of record, it also uses your billing
          details for fraud protection and security, and keeps the records tax law
          requires, under <a href={POLAR_SERVICE.policyUrl}>Polar’s own privacy policy</a>
          . Our legal basis for sending Polar your details is the contract between us, as
          for your account.
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
          {/* C6, word for word (spec 0012, *Policy and terms changes*) */}
          <li>
            No page sets a cookie except the sign in and account pages, and we set none of
            our own (see Your account).
          </li>
          {/* C7 */}
          <li>
            No analytics, advertising, tracking or error reporting. The only script from
            anyone else is Clerk’s, on the sign in and account pages.
          </li>
          {/* C8 */}
          <li>Our own code keeps no logs.</li>
          {/* C9 */}
          <li>
            Fonts and files come from our own site, so loading a page tells no one else
            that you visited. The sign in and account pages are the exception: they load
            Clerk’s sign in.
          </li>
          {/* C11 */}
          <li>
            We do not sell your data, share it for advertising, combine it with anything
            else, or make automated decisions about you. There is no profiling.
          </li>
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
          promise to protect personal data to the EU’s standard, and its UK Extension does
          the same for data from the UK. Standard contractual clauses are contract terms,
          approved by the European Commission, that bind the receiver to protect the data,
          and the UK’s International Data Transfer Addendum makes them work for data from
          the UK.
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
          Without an account, the only personal data involved is the request data our host
          keeps for one day, and we cannot link it to you. So most requests will find
          nothing, and if that happens we will tell you. With an account, Account shows
          your email address and lets you delete the account, and we can help with
          anything else.
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
          RedactNest is not aimed at children. The tool asks no one for personal details,
          and an account asks only for an email address.
        </p>
      </section>

      <section>
        <h2>{PRIVACY_SECTIONS.links}</h2>
        <p>
          This page links to other sites, such as the services’ own privacy policies and
          the data protection authorities above. Their own privacy policies apply there,
          not this one.
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
