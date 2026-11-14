import type { Metadata } from "next";

import { HOME_BAND_ID } from "@/lib/home-text";
import { SECURITY_CHANGES } from "@/lib/policy-changes";
import {
  PRIVACY_SECTIONS,
  SECURITY_SECTIONS,
  sectionId,
  TERMS_SECTIONS,
} from "@/lib/policy-sections";
import { HOME_PATH, PRIVACY_PATH, TERMS_PATH } from "@/lib/routes";
import { CoverFigure, type CoverPanel } from "@/ui/cover-figure";

import { NAV_TEXT } from "../site-nav";
import { ChangeList, ContactLink, LegalPage, SectionHeading } from "../legal-page";

/**
 * The security and how it works page. Spec 0018 (assumed): the page that
 * closes the sale for HR, legal and healthcare buyers, describing the real
 * implementation with no claim the code does not support (AC-5).
 *
 * Every claim here is one an earlier spec records, and the comment beside each
 * paragraph names it, so `/check verify` can walk them. Where another page
 * already says a thing, this page links to it rather than restating it (AC-6):
 * the privacy policy's claims (spec 0011's register, C1 to C16), the terms'
 * Checking the result is your job, the home page's list of what RedactNest
 * finds and strips, and the footer's source link.
 *
 * It names the honest limits the specs record (AC-7), each in plain words,
 * and no cap, size or price as a number, and no word for the source
 * repository (AC-9), as the legal pages' browser checks hold.
 *
 * Prerendered static in the legal pages' frame, with no client component and
 * no script of its own (AC-11). It describes production in every build, as
 * the privacy policy does, so Pro and custom terms are named even with billing
 * off.
 */
export const dynamic = "force-static";

/** A section of another page, by its key, so a renamed heading keeps its link. */
const privacy = (key: keyof typeof PRIVACY_SECTIONS) =>
  `${PRIVACY_PATH}#${sectionId(key)}`;
const terms = (key: keyof typeof TERMS_SECTIONS) => `${TERMS_PATH}#${sectionId(key)}`;

/** The two drawings: the same page, told apart only by what a copy gives (AC-8). */
const PAGE_LINES = Object.freeze([
  Object.freeze({ text: "Offer of employment" }),
  Object.freeze({ text: "Contact:", boxed: true as const }),
  Object.freeze({ text: "Role: Office manager" }),
]);

const COVER_PANELS: readonly CoverPanel[] = Object.freeze([
  Object.freeze({
    title: "A box drawn over the text",
    lines: PAGE_LINES,
    readsLabel: "A copy of the text gives",
    reads: "Contact: jane.doe@example.com",
  }),
  Object.freeze({
    title: "Removed, then marked",
    lines: PAGE_LINES,
    readsLabel: "A copy of the text gives",
    reads: "Contact:",
  }),
]);

export const metadata: Metadata = {
  title: NAV_TEXT.security,
  description:
    "How RedactNest works: your PDF is processed in your browser and never uploaded, text is removed from the file before any box is drawn, every new file is checked before you get it, and the limits are stated plainly.",
};

export default function SecurityPage() {
  return (
    <LegalPage
      title={NAV_TEXT.security}
      changes={SECURITY_CHANGES}
      sections={SECURITY_SECTIONS}
    >
      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="inYourBrowser" />
        {/* Spec 0002, INV-1 and AC-6; spec 0001 (the engine from our own origin). */}
        <p>
          When you choose a PDF, RedactNest opens it on your own device, inside your
          browser. The document is handed to a background worker in that tab (a Web
          Worker), and only the worker holds it. The PDF engine, MuPDF built for the
          browser, runs there too, and comes from our own site like every other file the
          tool uses.
        </p>
        {/* Spec 0001, *Proposed stack* (the tool route rendering row) and
         *Content security policy*; claims C1 and C5 linked, not restated. */}
        <p>
          The tool page is a fixed file, the same for everyone, so no server of ours takes
          part in reading your document. It is locked so that your browser refuses to let
          it connect to any other site. What it does ask our own server, and what that
          carries, is set out in the privacy policy’s{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>

        <h3>When it ends</h3>
        {/* Spec 0002, INV-6 as spec 0017 amends it, AC-5b and *Security model*
            (the two endings). A second document ends the first session at
            once, and the worker waits for any work on it to let go before it
            reads the new file (`handleOpen`), so "from then on" holds. */}
        <p>
          Closing the tab, leaving the page or pressing Start over stops the worker, and
          your browser takes back all of its memory at once. Opening a second document
          closes the first: from then on nothing can read it, but its memory is only
          released for reuse, not wiped, until you leave the page or start over.
        </p>
        {/* Spec 0004, AC-20. */}
        <p>
          The cleaned copy waits in the page until you download it, and the page lets go
          of it once it is handed to your browser.
        </p>
        {/* Spec 0002, *Security model* (the retained file handle). */}
        <p>
          Until the session ends, the page also keeps a handle to the file you chose, so
          it can read that one file again without asking. It stores nothing new: the file
          is already on your device, where you chose it.
        </p>

        <h3>What no website can control</h3>
        {/* Spec 0002, *Security model* (what this design does not control). */}
        <p>
          Working in memory means RedactNest writes nothing down. It cannot stop your
          operating system moving memory to disk (swap or page files), your browser
          keeping memory or crash reports of its own, or a browser extension that can read
          the page. Your original file and the cleaned copy also sit on your own disk,
          where you keep them.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="removedNotCovered" />
        {/* Spec 0004, *Requirements* (the first user story: pasting, searching
            or another tool must not bring the words back). */}
        <p>
          Drawing a black box over words hides them from your eyes, not from the file. The
          words are still there underneath, so selecting, searching or copying the text
          brings them back.
        </p>
        {/* AC-8. */}
        <CoverFigure
          panels={COVER_PANELS}
          caption="Both pages look the same. Only the second took the words out of the file."
        />
        {/* Spec 0004, AC-4 and *Decision* (the marking, drawn after the text is
            gone; the self check method, the box a filled path). */}
        <p>
          RedactNest works the other way round: removed, then marked. It takes each item
          you ticked out of the page’s drawing instructions (the part of the file that
          says what text goes where), then draws the black box where it was. The box is a
          filled shape, not text, so there is nothing in it to copy.
        </p>
        {/* Spec 0004, *Decision* (the padded pass); INV-15 and *Security model*
            (a picture drawn only through a tiling pattern, or used only as a
            soft mask, is outside the pixel pass's guarantee and the pixel
            check), as its Follow-up asks this page to say. */}
        <p>
          Under each removed item it also blanks pictures to white, a little past the
          item’s edges, which clears the ink of a scanned word, and removes small drawn
          marks lying wholly inside that area, such as an underline. Table lines that only
          cross it stay. A picture drawn only as a repeating pattern, or used only as a
          soft mask (to fade or shape something else), may not be blanked: whether it is
          is up to MuPDF, as the check below says.
        </p>
        {/* Spec 0004, INV-5, INV-13 and *Decision* (every argument written out). */}
        <p>
          MuPDF does the removing, with every setting spelled out rather than left to its
          defaults, so a change in the engine’s defaults cannot quietly change what is
          removed. RedactNest never rewrites a page itself: what MuPDF cannot remove, it
          refuses.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="theCheck" />
        {/* Spec 0004, INV-2 and AC-13. */}
        <p>
          Before you get a file, RedactNest opens the new file again, from the exact bytes
          you will download, and checks three things on every page:
        </p>
        <ul>
          {/* Spec 0004, AC-13; spec 0006, AC-14 and AC-17. The record is taken
              after the trim, so it holds the visible area only, and any
              character left outside it fails the check. */}
          <li>
            Text: inside each page’s visible area, every character you did not tick is
            still there, in its place, and none you ticked is; outside it, none is left at
            all. It reads the pages twice, the second time ignoring replacement text (the
            words a copy gives instead of what is drawn).
          </li>
          {/* Spec 0004, AC-13, INV-15 and *Security model* (the images the
              structured text reports), as its Follow-up asks this page to say. */}
          <li>
            Pictures: every picture under a removed item is blank there. A picture it
            cannot decode counts as not blank. The check sees the pictures MuPDF reports
            on the page, so a picture drawn only as a repeating pattern, or used only as a
            soft mask, is not checked.
          </li>
          {/* Spec 0004, AC-7 and AC-13, and *Decision* (the write options:
              nothing asserts a new identifier). `structureIsClean` never reads
              `/ID`; `tests/unit/redaction.test.ts` holds the source's gone. */}
          <li>
            Structure: none of the hidden data below is left, and the file holds a single
            version, with no earlier versions inside it. The one exception is the file’s
            identifier, which this check does not look at: the new file never carries the
            original’s across, and our tests hold that.
          </li>
        </ul>
        {/* Spec 0004, AC-14 and *Summary*. */}
        <p>
          If any part fails, you get no file, only a plain reason. RedactNest stops rather
          than hand you a file that looks redacted and is not, or one that lost words
          nobody ticked.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="hiddenData" />
        {/* Spec 0004, AC-7 and its inventory, which the home page's list shows. */}
        <p>
          A PDF can carry far more than its pages. The home page lists{" "}
          <a href={`${HOME_PATH}#${HOME_BAND_ID}`}>what RedactNest finds and strips</a>{" "}
          whenever a file carries it.
        </p>
        {/* Spec 0004, *Feature design*, under its *Inventory table* (stripped
            and never reported). */}
        <p>
          It also strips what a summary would only confuse: private application data, page
          labels, viewer preferences, automatic actions that are not scripts, and the
          file’s identifier.
        </p>

        <h3>Comments, notes and form fields</h3>
        {/* Spec 0004, AC-22, AC-8 and AC-7; the icons measured on
            tests/fixtures/metadata.pdf, 2026-11-14 (spec 0018, AC-7). */}
        <p>
          Comments, typed notes and form fields that show on a page are flattened into it:
          what you could see stays, as ordinary page content, and anything a viewer never
          shows is deleted first. A sticky note or a file attachment that shows as an icon
          keeps that icon as a mark on the page, though the note’s text and the attached
          file are gone.
        </p>

        <h3>What the cleaned copy loses</h3>
        {/* Spec 0004, *Decision* and *Consequences* (tags and navigation dropped). */}
        <p>
          The cleaned copy has no bookmarks, links, fillable fields, page labels,
          attachments or accessibility tags. Without tags, screen readers read it less
          well, and the result tells you when a file had them.
        </p>

        <h3>Passwords, layers and fonts</h3>
        <ul>
          {/* Spec 0004, AC-10, the `password-required` refusal and *Security
              model* (owner restrictions); spec 0007, AC-17 (the page never asks
              for a password). */}
          <li>
            A file that needs a password to open is refused, because RedactNest does not
            take passwords. A file that opens without one but restricts printing or
            copying is redacted, and the cleaned copy carries no restriction. That is on
            purpose: you already hold the content, and the restriction protects nothing
            from you.
          </li>
          {/* Spec 0004, AC-3. */}
          <li>
            A file with layers a viewer can switch on and off is refused, even when every
            layer is showing, because RedactNest cannot be sure it removes text from them.
          </li>
          {/* Spec 0004, *Security model* (fonts keep a character inventory). */}
          <li>
            Fonts in the file are kept as they are, so a font can still hold the shapes of
            characters that were removed. That could tell someone which characters the
            document used, never which words they made or in what order.
          </li>
        </ul>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItFinds" />
        {/* Spec 0005, AC-14 (the coverage note); spec 0017 (custom terms, Pro). */}
        <p>
          RedactNest looks for the{" "}
          <a href={`${HOME_PATH}#${HOME_BAND_ID}`}>kinds of detail the home page lists</a>
          . Names and addresses are not among them: they stay in the file unless you add
          them as custom terms, which come with Pro.
        </p>
        {/* Spec 0005, AC-8, AC-10 and AC-13. */}
        <p>
          Each find is a row with a box. Some start ticked, such as email addresses and
          card numbers. Others start unticked, such as most dates and numbers that may not
          be phone numbers. Nothing is removed unless its box is ticked when you redact,
          and you can tick or untick any row, except one RedactNest cannot remove safely:
          that row says it will stay in the file, and cannot be ticked.
        </p>
        {/* Terms: Checking the result is your job, linked, not restated. */}
        <p>
          Reviewing the cleaned file before you share it is still yours to do, as the
          Terms of service say under{" "}
          <a href={terms("checkingTheResult")}>{TERMS_SECTIONS.checkingTheResult}</a>.
        </p>

        <h3>Custom terms</h3>
        {/* Spec 0017, AC-7 to AC-11, AC-32 and AC-33 (a match across a page
            break, two rows both unticked); `TERM_NOTE_TEXT` for the notes;
            claim C3 linked, not restated. */}
        <p>
          A custom term finds its words whatever their case, through accents on Latin,
          Greek and Cyrillic letters, ligatures, extra spacing, line breaks and a word
          split by a hyphen at the end of a line. A match of the whole word starts ticked.
          Others are listed unticked with a note saying why: the term joined to other
          text, written with different spacing or punctuation, or, in scripts such as
          Arabic, Hebrew or Devanagari, written with different vowel marks. A match that
          runs across a page break is listed as two rows, one on each page, both unticked.
          Like your document, your terms stay on your device (see{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>).
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItCanMiss" />
        {/* Specs 0005, 0014 and 0015, *Consequences* and *Follow-up*. */}
        {/* Spec 0017, AC-8 and AC-9: a term crosses line and block breaks and a
            line end hyphen, so the first three lists are not its limits. */}
        <p>
          These are limits we have measured and recorded. The first three lists are for
          the details RedactNest finds by itself. A custom term reads across line breaks,
          blocks of text such as columns, and a hyphen at the end of a line, so those
          limits are not its own: its misses are the last list. Most are values that are
          not found, or not found whole, so look over the document as well as what was
          found and ticked.
        </p>

        <h3>Anywhere in a page</h3>
        <ul>
          {/* Spec 0005, AC-4 and *Decision* (no match crosses a block). */}
          <li>
            A value split across two blocks of text, two columns or two table cells is
            never joined, so it is not found.
          </li>
          {/* Spec 0005, AC-4 (a line ending in a dot rejoined when the joined
              text passes) and *Consequences* (wrapped values; the local part). */}
          <li>
            A value wrapped in the middle of a word or at a hyphen is not found. An email
            address wrapped at a dot before the @ is found only after the break; one
            wrapped at a dot after the @ is found whole.
          </li>
          {/* Spec 0005, AC-21 and *Consequences* (a letter before a value). */}
          <li>
            A value at the end of a longer code is not found, such as the date in
            REF-05.12.1980, or a bank account or National Insurance number with a letter
            or digit stuck straight before it.
          </li>
          {/* Spec 0014, AC-4 and AC-6; spec 0005, *Consequences* (markers). */}
          <li>
            A plain digit stuck straight after a value, as text recognition gives for a
            footnote mark, can hide the value or put it in the wrong row. A footnote mark
            drawn small and raised is parted from the value, so it does not.
          </li>
          {/* Spec 0005, *Consequences* (card and IBAN checks passing by chance). */}
          <li>
            Something that is not sensitive can be listed too, such as a reference number
            that happens to pass a card number’s or a bank account number’s check.
          </li>
        </ul>

        <h3>Phone numbers and dates</h3>
        <ul>
          {/* Spec 0005, AC-2 and *Consequences*. */}
          <li>
            Phone numbers are read when written internationally, or in UK or US national
            format. A national number from anywhere else and a number written in words are
            missed, and so are digits from another script, though some are read after a
            plus sign.
          </li>
          {/* Spec 0005, *Consequences* and *Follow-up*. */}
          <li>
            Phone numbers joined only by hyphens or dots, the second number of a short
            form such as 0958/0959, and a number glued to the next word are missed.
          </li>
          {/* Spec 0005, AC-19 and *Consequences* (English months); spec 0015,
           *Consequences*. */}
          <li>
            Only full dates are read: a day, a month and a year, with month names in
            English. A year alone, a month and a year, a time, or a date with its month in
            another language is not. Some forms are still not read, such as a date written
            in words.
          </li>
        </ul>

        <h3>Card numbers</h3>
        <ul>
          {/* Spec 0005, *Consequences* (glued cards; two cards in one row). */}
          <li>A card number glued to other digits is not found.</li>
          <li>
            Two card numbers side by side can share one row, so you cannot keep one and
            remove the other.
          </li>
        </ul>

        <h3>Custom terms</h3>
        <ul>
          {/* Spec 0017, *Consequences* and *Follow-up*. */}
          <li>
            A term split across a page break with other text between its parts, such as a
            running footer or a page number, is not found.
          </li>
          <li>
            An all capitals word glued to the next one is not found, as Smith is not found
            in SMITHDate.
          </li>
          <li>A term is plain words, never a pattern or a wildcard.</li>
        </ul>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="pagesItCannotRead" />
        {/* Spec 0006, the page findings' words; no text recognition in the code. */}
        <p>
          RedactNest reads the text a PDF holds. It does not recognise words inside a
          picture, so it cannot find or remove them.
        </p>
        {/* Spec 0006, AC-10, AC-23, INV-9 (the heuristic findings may miss a
            case) and *Consequences* (erring toward saying too much: the legal
            line is 0.5 pt print, text under `TINY_TEXT_MAX`, never a drawn rule);
            spec 0007, AC-12 and INV-2 as spec 0017 amends it (`outputFormFor`:
            a run that removed nothing is cleaned, whatever the pages hold). */}
        <p>
          When RedactNest sees that a page holds something it cannot check, it says so for
          that page. If a run then removes something, the new file’s name ends in partly
          redacted; a run that removes nothing gives a file whose name ends in cleaned,
          whatever the pages hold. Most of these warnings come from rules of thumb, so
          they can be wrong both ways. They lean toward saying too much, so a brochure
          photo or a line of very small print on a legal page can raise one, and they can
          also miss a case, such as the hidden text the last part of this section lists. A
          document with no page it can read is refused.
        </p>

        <h3>Scans with recognised text</h3>
        {/* Spec 0008, AC-1 and AC-9, and its Follow-up for this page; spec 0004,
         *Security model* (scan ink beyond the padding). */}
        <p>
          Many scans carry a hidden layer of text from text recognition (OCR) run by
          another tool. RedactNest counts a picture as read once that layer holds a word
          of three or more letters or digits over that picture alone, and then it reads
          that text. So it can only find what the recognition got right: words it missed,
          such as handwriting, stamps or tables, stay in the picture. Scan ink further
          from the recognised text than the blanking reaches stays visible.
        </p>
        {/* Spec 0010, *Consequences* and its Follow-up for this page. */}
        <p>
          Some scans are still named as pictures RedactNest cannot read, although the
          recognition may have read them: a scan stored as several pieces, recognised text
          in vertical writing, and a photo pasted onto a page before recognition. That
          warning means RedactNest cannot read the picture, whatever text lies over it.
        </p>

        <h3>Hidden parts it names but leaves</h3>
        <ul>
          {/* Spec 0006, AC-15. */}
          <li>
            A picture reaching past the page’s visible edge keeps its hidden part, because
            RedactNest does not clear pictures.
          </li>
          {/* Spec 0006, AC-7. */}
          <li>
            Text a clip hides completely stays in the file and is never listed, since
            RedactNest reads what the page shows.
          </li>
        </ul>
        {/* Spec 0006, AC-8 and AC-14 (the trim: a glyph straddling the edge
            removed whole; vector art only when one area covers it, a shape
            spanning two strips a recorded limit, and only text proved); spec
            0007, AC-12 (the partly redacted name only when a run removed
            something). */}
        <p>
          Both are warned about, and a file from a run that removes something is named
          partly redacted, but neither is removed. Text outside a page’s visible area is
          removed whenever you redact, and a character the page’s edge cuts through is
          removed whole. A drawing lying wholly outside goes too, except a shape that
          wraps around a corner of the page, which stays. Only the removal of text is
          checked.
        </p>

        <h3>Fake redactions in files you receive</h3>
        {/* Spec 0006, AC-6 and AC-7, and the page findings' words; INV-9 and
            *Consequences* (the hidden text it misses, recorded limits), as its
            Follow-up asks this page to describe. */}
        <p>
          RedactNest looks for text under a box or picture drawn over it, and for text you
          cannot see, such as text the same colour as the page. When it finds some, it
          warns you: the page may look redacted, but the text is still in the file. An
          item found hidden that way says so in its row. Text a clip hides completely is
          the exception above.
        </p>
        <p>
          This search can miss some hidden text: under a cover that is not an upright
          rectangle, or a picture you can partly see through; text coloured in a way it
          cannot compare, such as a printer’s spot colour; text the same colour as a
          picture, a shaded area or a group drawn behind it; and text hidden by a clip of
          an unusual shape.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whenItStops" />
        {/* Spec 0004, AC-1 to AC-3 (AC-2: only a file that does not open as a
            PDF; a file MuPDF repairs opens), the `password-required` refusal
            and the failure words. */}
        <p>
          Some files and some items RedactNest cannot handle safely, so it refuses rather
          than guess. At open it refuses, among others, a file that is not a PDF (judged
          by its contents, never its name), one too damaged to open, one that needs a
          password and one with layers.
        </p>
        {/* Spec 0004, AC-26 (replacement text), AC-27 to AC-29 and *Security
            model*; spec 0005, AC-8. */}
        <p>
          Some items cannot be removed safely: one inside wider replacement text, text set
          at an angle (a rotated stamp, slanted lettering or a scan that is too crooked),
          and text on a picture drawn at an angle or too coarse to blank cleanly. Where
          RedactNest can tell while reading, the row says the item will stay in the file.
        </p>
        {/* Spec 0004, *Security model* (a size or scaling change inside the same
            text object refuses; the same line as two text objects does not);
            spec 0014, AC-6, AC-7 and *Consequences* (a marker drawn as its own
            raised text object never refuses), agreeing with the marker line
            under What it can miss; spec 0007, AC-14 (a refused run keeps its
            ticks). */}
        <p>
          Otherwise the run stops with a plain reason and no file, and your ticks are
          kept. A run also stops for a stamp drawn across a ticked item, an accent drawn
          as its own mark at the end of a ticked word, or text that changes size or width
          inside a ticked item or straight after it within the same piece of text, as a
          smaller footnote mark written into the item’s own line of text can. A footnote
          mark drawn small and raised as its own piece of text, the way word processors
          and browsers draw one, never stops a run. A file that writes some of its lines
          in a way RedactNest cannot rewrite stops every run.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="plans" />
        {/* Claim C5, linked, not restated (spec 0012, Follow-up).
            `resolveEntitlement` in src/billing/entitlement.ts asks Polar only
            once the sign in cookie shows a session. */}
        <p>
          The tool page asks our server which plan applies to you, and when you are signed
          in, our server asks Polar whether you hold Pro. What that question carries is
          set out in the privacy policy’s{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>
        {/* Spec 0001, *Consequences* (the paywall is not enforceable); spec 0012,
         *Consequences*, and INV-8 (only what Pro does today: the higher page cap,
         and custom terms since spec 0017); spec 0017, *Consequences* (the same
         gate for terms). */}
        <p>
          The page limit relies on honesty. It is applied in your own browser, by code
          anyone can read, so someone determined could lift it. The limit decides how long
          a document may be and nothing else, and it plays no part in keeping your
          document private. Pro gives you longer documents and custom terms, not a lock,
          and custom terms rely on honesty in the same way.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="logsAndCounts" />
        {/* Spec 0002, *Security model* (audit logging, stated plainly). */}
        <p>
          On purpose, nothing records your documents or the words anyone redacted, because
          such a record would recreate the very exposure RedactNest exists to remove.
        </p>
        {/* Claim C8; spec 0004, AC-24 (MuPDF's lines discarded); claim C10 linked. */}
        <p>
          Our own code writes no log. MuPDF’s own messages, which can quote a document (a
          font’s name or a field’s name), are thrown away inside the worker as the engine
          loads. Our host keeps standard request logs, as{" "}
          <a href={privacy("whatWeReceive")}>{PRIVACY_SECTIONS.whatWeReceive}</a> in the
          privacy policy describes.
        </p>
        {/* Claims C14 to C16 linked, not restated; spec 0016, INV-4. */}
        <p>
          We count what happens on the site and report when our code fails, through our
          own server, so no counting or reporting script from anyone else runs on any
          page. What a count and a report hold, and never hold, is in{" "}
          <a href={privacy("countsAndReports")}>{PRIVACY_SECTIONS.countsAndReports}</a>.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="checkIt" />
        {/* Spec 0009, AC-1 and AC-4 (the footer's source link). */}
        <p>
          The foot of every page links to the source code for the version you are using,
          under the GNU AGPL, so you can read what runs in your browser.
        </p>
        {/* Spec 0002, AC-3 as claim C5 amends it; spec 0004, AC-21. */}
        <p>
          Your browser can show you the rest. Open its developer tools on the tool page,
          redact a file, and the network panel shows that every request the page sends
          goes to our own site.
        </p>
        {/* Spec 0011, AC-16 (`LEGAL.contactEmail`, the address the legal pages
            share). */}
        <p>
          If you find RedactNest doing something this page says it does not, please write
          to <ContactLink />.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="changes" />
        {/* Spec 0018, *Assumption built on* (the legal pages' frame); spec 0011,
            AC-2 (the dated change list). */}
        <p>
          When we change this page, we update the date at the top and add a line below
          saying what changed.
        </p>
        <ChangeList changes={SECURITY_CHANGES} />
      </section>
    </LegalPage>
  );
}
