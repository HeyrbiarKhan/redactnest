import type { Metadata } from "next";

import { LEGAL } from "@/lib/legal";
import { TERMS_CHANGES } from "@/lib/policy-changes";
import { TERMS_SECTIONS } from "@/lib/policy-sections";

import { ChangeList, ContactLink, LegalPage, SectionHeading } from "../legal-page";

/**
 * The Terms of service. Spec 0011, AC-1, AC-3 and AC-10, renamed from "Terms of
 * use" at the same path, with the account and Pro points spec 0012 adds
 * (AC-22).
 *
 * Each point of the terms outline, in its order. The free tier's limits are
 * "the limits shown in the tool", never a number, because the caps live in
 * `src/config` and change by environment (INV-6). Pro's price is "the price
 * shown on Pricing when you subscribe", never a number, for the same reason
 * (spec 0012, INV-8). The liability floor and its 12 months, and the 30 days'
 * notice of a price change, are not limits on the visitor, so they are written
 * here. Nothing here limits rights under the software licence, whichever
 * licence that is (INV-10).
 *
 * Prerendered static, with no client component and no script of its own
 * (INV-7).
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: LEGAL.termsLabel,
  description:
    "The terms for using RedactNest to remove text from PDFs in your browser and for Pro subscriptions, including checking the cleaned file before you share it.",
};

export default function TermsPage() {
  return (
    <LegalPage title={LEGAL.termsLabel} changes={TERMS_CHANGES} sections={TERMS_SECTIONS}>
      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="about" />
        <p>
          These terms are an agreement between you and {LEGAL.operatorLine} (“we”, “us”).{" "}
          {LEGAL.soldThroughLine} By choosing a PDF in the tool, or by using this site at
          all, you agree to them. If you do not agree, please do not use RedactNest.
        </p>
        <p>
          You can reach us about these terms at <ContactLink />.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="whatItDoes" />
        <p>
          RedactNest is a tool that runs in your browser to find text in a PDF and remove
          it from the file. It is free to use within the limits shown in the tool.
        </p>
        <p>We may change, limit or stop it at any time.</p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="checkingTheResult" />
        <p>
          RedactNest suggests what to remove. You choose, and it removes only what you
          tick. It warns you about parts it cannot read, such as text in pictures and
          scanned pages.
        </p>
        <p>
          Review the cleaned file before you share it. You decide whether it is fit for
          your purpose.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="yourAccount" />
        <p>
          You need an account only to buy Pro. An account is for one person, so do not
          share it. Keep your email secure, because anyone who can read it can sign in as
          you.
        </p>
        <p>
          You can delete your account at any time in Account, once nothing renews: cancel
          Pro first in Manage billing.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="proSubscriptions" />
        <p>
          Pro is a monthly subscription, at the price shown on Pricing when you subscribe.
          It renews each month until you cancel.
        </p>
        <p>
          You can cancel at any time in Manage billing, on your Account page. Pro then
          lasts to the end of the month you have paid for.
        </p>
        <p>
          We do not refund part months. Your legal rights stay, including any right to
          withdraw from the purchase.
        </p>
        <p>
          If a renewal payment fails, Pro continues while the payment is retried. If it
          still fails, the free limits apply again.
        </p>
        <p>
          Polar is the merchant of record that sells Pro to you, under the name{" "}
          {LEGAL.sellerName}, and Polar’s buyer terms also apply to the purchase.
        </p>
        <p>
          If we change the price, we will email you at least 30 days before, and the new
          price applies from your next renewal.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="usingItFairly" />
        <p>
          Use RedactNest lawfully, and only on documents you are entitled to handle. Do
          not attack, overload or disrupt the site, or try to get around its limits.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="softwareLicence" />
        <p>
          RedactNest’s software is licensed separately, under the licence linked at the
          foot of every page. These terms cover your use of this website, and nothing in
          them limits your rights under that licence.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="noWarranty" />
        <p>
          RedactNest is provided as is and as available. We do not promise that it finds
          every sensitive item, that it is free of errors, or that it is always available.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="liability" />
        <p>
          Our total liability to you is capped at the greater of what you paid us in the
          12 months before the claim, or US$100.
        </p>
        <p>
          Where the law allows, we are not liable for indirect or consequential loss, such
          as lost profits, lost business or lost data.
        </p>
        <p>
          Nothing in these terms limits our liability for fraud, for death or personal
          injury caused by our negligence, or for anything else the law does not let us
          limit.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="consumers" />
        <p>Nothing in these terms removes rights you have by law where you live.</p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="ending" />
        <p>
          You can stop using RedactNest at any time. We may block anyone who breaks these
          terms.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="lawAndCourts" />
        <p>
          These terms are governed by the law of {LEGAL.country}, and the courts of{" "}
          {LEGAL.country} deal with any dispute about them.
        </p>
        <p>
          If you are a consumer in the UK or the EU, you keep the protection of your own
          country’s mandatory laws, and you may bring a claim in your own country’s
          courts.
        </p>
      </section>

      <section>
        <SectionHeading sections={TERMS_SECTIONS} name="changes" />
        <p>
          When we change these terms, we update the date at the top and add a line below
          saying what changed. Using the site after a change means you accept it.
        </p>
        <ChangeList changes={TERMS_CHANGES} />
      </section>
    </LegalPage>
  );
}
