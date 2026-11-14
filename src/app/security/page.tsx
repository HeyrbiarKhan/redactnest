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
 * The security and how it works page. Spec 0018: the page that closes the
 * sale for HR, legal and healthcare buyers, describing the real implementation
 * with no claim the code does not support.
 *
 * Every claim meets AC-5's one rule. A claim about what RedactNest does with a
 * document holds in every case it covers, or it says what can happen ("can be
 * missed", "can stay in the file"); an absolute appears only behind a gate
 * every file passes, or for a step that does not exist. Limits are stated by
 * kind, at a buyer's level, and the exact cases stay in the specs. Each
 * paragraph and list item carries a source comment in AC-5's order: the AC or
 * INV, else a privacy claim (C1 to C16), else a named *Security model*,
 * *Consequences* or *Decision* bullet, else a dated measurement on a file in
 * `tests/fixtures` that spec 0018 records.
 *
 * Where the privacy policy, the terms, the home page's finds and strips band or
 * the footer already says a thing, this page links to it and adds only the
 * mechanism or the limit that page leaves out (AC-6). It names no cap, size or
 * price as a number, and no word for the source repository (AC-9).
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
const HOME_BAND = `${HOME_PATH}#${HOME_BAND_ID}`;

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
        {/* Spec 0002, INV-1 (the document inside the worker, MuPDF's parsed
            copies in its heap) and AC-6. No "only": the checklist's context
            and the checked output reach the page, each said where it belongs. */}
        <p>
          When you choose a PDF, the tool page hands it to a background worker in the same
          tab (a Web Worker), which holds the document while you work on it. The PDF
          engine, MuPDF built for the browser, runs inside that worker too.
        </p>
        {/* Spec 0001's *Consequences* bullet "`'unsafe-inline'` on the tool
            route" (the page is rendered static, so no server is in its path);
            C1 and C5 linked, not restated. */}
        <p>
          The tool page is a fixed file, the same for everyone, so no server of ours takes
          part in reading your document. What the page does ask our own server, and what
          that carries, is in the privacy policy’s{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>

        <h3>When it ends</h3>
        {/* Spec 0002, AC-5a, AC-5b and INV-6, and its *Security model* bullet
            "The two endings are not equally strong". "Once that session has
            ended" rather than "from then on", because a run under way finishes
            its step before the session ends. */}
        <p>
          Leaving the page, closing the tab or pressing Start over stops the worker, and
          its memory goes back to your browser at once. Opening a second document ends the
          first one’s session. Once that session has ended, nothing in the page can reach
          the first document, though its memory is only released for reuse until you leave
          the page or start over.
        </p>
        {/* Spec 0002, AC-4 and INV-7; spec 0004, AC-20. */}
        <p>
          The cleaned copy waits in the page until you download it, and the page lets go
          of it once it is handed to your browser.
        </p>
        {/* Spec 0002, AC-11, and its *Security model* bullet "The `File` handle
            is worth naming". */}
        <p>
          Until the session ends, the page also keeps a handle to the file you chose, so
          it can read that one file again without asking. It stores nothing new: the file
          is already on your device, where you chose it.
        </p>

        <h3>What no website can control</h3>
        {/* Spec 0002's *Security model* bullet "What this design does not
            control". */}
        <p>
          Some things on your device are beyond any website, RedactNest included: your
          operating system moving memory to disk (swap or page files), your browser
          keeping memory or crash reports of its own, a browser extension that can read
          the page, and what is kept on your own disk.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="removedNotCovered" />
        {/* Spec 0018, AC-8. */}
        <p>
          Drawing a black box over words hides them from your eyes, not from the file. The
          words are still there underneath, so selecting, searching or copying the text
          brings them back.
        </p>
        {/* Spec 0018, AC-8. */}
        <CoverFigure
          panels={COVER_PANELS}
          caption="Both pages look the same. Only the second took the words out of the file."
        />
        {/* Spec 0004, AC-4 (the text removed), and its *Decision* bullets "Box
            pass" (the box drawn last) and "Self check method: compare, never
            sample" (the box a filled path, not text). */}
        <p>
          RedactNest works the other way round: removed, then marked. It takes each item
          you ticked out of the page’s drawing instructions (the part of the file that
          says what text goes where), then draws the black box where it was. The box is a
          filled shape, not text, so there is nothing in it to copy.
        </p>
        {/* Spec 0004's *Decision* bullets "Padded area" and "Padded pass", and
            its *Security model* bullets "Covered line art is removed across the
            padded area" and "Scan ink further from the OCR text". */}
        <p>
          Under each removed item it also blanks to white the pictures MuPDF reports
          there, a little past the item’s edges, and small drawn marks lying wholly inside
          that area, such as an underline, can go with it. Ink of a scanned page lying
          further out than that can stay visible.
        </p>
        {/* Spec 0004, INV-5, INV-13 and AC-13. INV-13 is about the content
            stream, so the line says drawing instructions: the box pass adds to
            the page through MuPDF. */}
        <p>
          MuPDF does the removing, with every setting spelled out rather than left to its
          defaults, so a change in the engine’s defaults cannot quietly change what is
          removed. RedactNest never edits a page’s drawing instructions itself, and a
          ticked item MuPDF cannot remove stops the run.
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
          {/* Spec 0004, INV-2 and AC-13; spec 0006, AC-17 (the visible area). */}
          <li>
            Text: inside each page’s visible area, every character you did not tick is
            still there, in its place, and none you ticked is; outside it, none is left at
            all. It reads the pages twice, the second time ignoring replacement text (the
            words a copy gives instead of what is drawn).
          </li>
          {/* Spec 0004, AC-13 (a picture it cannot decode counts as not blank)
              and INV-15, and its *Security model* bullet "The pixel check sees
              the images structured text reports". */}
          <li>
            Pictures: the pictures the check sees under each removed item are blank there,
            and a picture it cannot decode counts as not blank. A picture drawn only as a
            repeating pattern, or used only as a soft mask (to fade or shape something
            else), can escape both the blanking and this check.
          </li>
          {/* Spec 0004, AC-13 and INV-3. `structureIsClean` covers each of the
              band's seven stripped kinds: document info by the trailer, XMP,
              thumbnails and private data by `CARRIER_KEYS`, bookmarks,
              attachments and named scripts by `CATALOG_KEYS`, annotations by
              `PAGE_KEYS`, scripts by `/JS` anywhere, earlier versions by the
              version count. A change to `rebuild.ts` that drops one names fewer
              here. */}
          <li>
            Structure: none of the hidden data the home page lists is left anywhere in the
            file, and the file holds a single version, with no earlier versions inside it.
          </li>
        </ul>
        {/* Spec 0004, AC-14. */}
        <p>
          If any part fails, you get no file, only a plain reason. RedactNest stops rather
          than hand you a file the check could not vouch for.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="hiddenData" />
        {/* Spec 0004, AC-7. */}
        <p>
          A PDF can carry far more than its pages. The home page lists{" "}
          <a href={HOME_BAND}>what RedactNest finds and strips</a> whenever a file carries
          it.
        </p>
        {/* Spec 0004, AC-7, its *Feature design* sentence "Stripped and never
            reported", and its *Consequences* bullet "The output is plainer than
            the source, by design". */}
        <p>
          That list leaves some things out. RedactNest also strips private application
          data, page labels, viewer preferences, automatic actions that are not scripts,
          and the file’s identifier, without reporting them. And the cleaned copy loses
          its links and its accessibility tags, so screen readers read it less well.
        </p>

        <h3>Notes and attachments</h3>
        {/* Spec 0004, AC-22 and AC-7; the measurement spec 0018's AC-7 records
            (`tests/fixtures/metadata.pdf`, 2026-11-14, a run with nothing
            ticked: no annotation, note text or attached file left in any
            object, both icons still drawn). "Can keep": one fixture measured,
            so the icon is a "can" line, while the text and the file gone is
            the structure check's gate. */}
        <p>
          The home page notes{" "}
          <a href={HOME_BAND}>how comments and form fields are flattened</a>. A sticky
          note or a file attachment that shows as an icon can keep that icon as a mark on
          the page, while what it held but did not show, the note’s text or the attached
          file, is gone, as the structure check holds.
        </p>

        <h3>Passwords and fonts</h3>
        <ul>
          {/* Spec 0004, AC-10, and its *Security model* bullet "Owner password
              restrictions are removed on purpose". */}
          <li>
            A file that opens without a password but restricts printing or copying is
            redacted, and the cleaned copy carries no restriction. That is on purpose: you
            already hold the content, and the restriction protects nothing from you.
          </li>
          {/* Spec 0004's *Security model* bullet "Embedded fonts keep the shapes
              of removed characters". */}
          <li>
            Fonts in the file are kept as they are, so a font can still hold the shapes of
            characters that were removed. That could tell someone which characters the
            document used, never which words they made or in what order.
          </li>
        </ul>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItFinds" />
        {/* Spec 0005, AC-14; spec 0017, AC-7. */}
        <p>
          RedactNest looks for the{" "}
          <a href={HOME_BAND}>kinds of detail the home page lists</a>. It does not look
          for names or postal addresses, and you can add those as custom terms.
        </p>
        {/* Spec 0005, AC-8 (a match RedactNest would refuse starts unticked and
            cannot be ticked), AC-10 and AC-13. No "only": the row AC-8 blocks
            is the exception, named here. */}
        <p>
          Each find is a row with a box. A row’s starting tick is a suggestion: you can
          tick or untick any row except one RedactNest cannot remove safely.
        </p>

        <h3>Custom terms</h3>
        {/* Spec 0017, AC-7 (case and accents folded) and AC-8 (a match is the
            folded term equal to the folded page, spacing and line breaks
            included, so a term is plain words); C3 linked, not restated. */}
        <p>
          A custom term is plain words, never a pattern or a wildcard. It matches its
          words through many differences of writing, such as case, accents, spacing and
          line breaks, but not all. What happens to the terms you type is in{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItCanMiss" />
        {/* Spec 0005, AC-14. */}
        <p>
          RedactNest finds patterns in the text; it does not understand the document. So
          it can miss a value or a term, or find only part of one and leave the rest in
          the file.
        </p>
        <ul>
          {/* Spec 0005, AC-4; spec 0017, AC-33, and its *Consequences* bullet
              "Known misses, recorded" (a page break with text between). */}
          <li>
            A value or term broken up across lines, columns, table cells or pages can be
            missed, or found only in part.
          </li>
          {/* Spec 0005, AC-20, AC-21 and AC-23; spec 0014, AC-3 (a plain digit
              glued after a date), AC-4 and AC-6; spec 0017, AC-10. */}
          <li>
            One joined to other letters, digits or words can be missed, found only in
            part, or listed unticked.
          </li>
          {/* Spec 0005, AC-2 and AC-19, and its *Consequences* bullet "Rule based
              detection misses whatever does not look like its pattern" (another
              region's national number, a non English month); spec 0015's
              *Consequences* bullet "Still missed" (number words). */}
          <li>
            One written in a format, language or script RedactNest does not read, such as
            a phone number in another country’s own format, or a date written in words or
            with its month in another language, can be missed.
          </li>
          {/* Spec 0005's *Consequences* bullets "Reading cards out of a longer
              run lists false cards" and "An IBAN glued at its end can be read out
              of a longer code" (checks passing by chance), and "Two cards side by
              side on one run can share one row". */}
          <li>
            Something that is not sensitive can be listed, and two values close together
            can share one row, so they stay or go together.
          </li>
        </ul>
        {/* Spec 0018, AC-5 (look over the document); the terms' Checking the
            result is your job linked, not restated. */}
        <p>
          So look over the whole document before you share it, not only what was found and
          ticked (see the terms’{" "}
          <a href={terms("checkingTheResult")}>{TERMS_SECTIONS.checkingTheResult}</a>).
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="pagesItCannotRead" />
        {/* Spec 0004's *Security model* bullet "Text drawn as vector outlines,
            or shown only as pixels". */}
        <p>
          RedactNest reads the text a PDF holds. It does not read words that exist only as
          a picture, so it cannot find them.
        </p>
        {/* Spec 0006, INV-9, and its *Consequences* bullet "The heuristic
            findings will misfire sometimes" (each errs toward saying too much;
            the small print is its 0.5 pt legal line). */}
        <p>
          It warns you about a page when it sees something there it cannot check. These
          warnings rely on rules of thumb, so they can miss a page, and can warn about one
          that is fine, such as a page with a brochure photo or a line of very small
          print.
        </p>
        <p>Some things can stay in the file, or be misjudged:</p>
        <ul>
          {/* Spec 0008, AC-1 and AC-9. */}
          <li>
            When a scan carries text from recognition (OCR) run by another tool,
            RedactNest can treat the picture as read and work from that text alone, so
            words the recognition missed or misread can stay in the picture with no
            warning.
          </li>
          {/* Spec 0010, AC-7, and its *Decision* bullets "MRC pieces and a photo
              pasted before OCR are recorded limits" and "Dense vertical OCR is a
              recorded limit". */}
          <li>
            It can name a scan as a picture it cannot read although recognised text lies
            over it. Treat that page as not checked.
          </li>
          {/* Spec 0006, AC-15. */}
          <li>
            The part of a picture beyond the page’s visible edge can stay in the file.
          </li>
          {/* Spec 0006, AC-7. */}
          <li>Text a clip hides completely can stay in the file without a row.</li>
          {/* Spec 0006, AC-14. */}
          <li>Drawings outside the visible area can stay in the file.</li>
        </ul>

        <h3>Fake redactions in files you receive</h3>
        {/* Spec 0006, AC-6 (text under a cover), AC-7 (text a viewer does not
            show) and INV-9 (the search can miss). */}
        <p>
          RedactNest looks for text under a box or picture drawn over it, and for text you
          cannot see, such as text the same colour as the page. When it finds some, it
          warns you: the page may look redacted, but the text is still in the file. This
          search can miss hidden text, so a file you received can still hold words that
          look covered, with no warning.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whenItStops" />
        {/* Spec 0004, AC-1 to AC-3; spec 0007, AC-17 (a file that needs a
            password is refused, and the page never asks for one); spec 0006,
            AC-10 (no page it can read). */}
        <p>
          Some files and some items RedactNest cannot handle safely, so it refuses rather
          than guess. At open it refuses, among others, a file that is not a PDF (judged
          by its contents, never its name), one too damaged to open, one that needs a
          password (RedactNest does not take passwords), one with layers a viewer can
          switch on and off, and a file in which it finds no page it can read.
        </p>
        {/* Spec 0004, AC-26 to AC-29; spec 0005, AC-8. That the row cannot be
            ticked is said once, under What it finds. */}
        <p>
          Some items cannot be removed safely, such as text set at an angle or inside
          replacement text. Where RedactNest can tell while reading, the row says the item
          will stay in the file.
        </p>
        {/* Spec 0007, AC-14; spec 0004, AC-13 and AC-26, and its *Security
            model* bullets "A document with a text object that is positioned
            with `Td`" (some files stop every run) and "A text watermark that
            crosses a target" (a stop met only while removing). */}
        <p>
          Otherwise the run stops with a plain reason and no file, and your ticks are
          kept. A run can stop for something it meets only while removing, and some files
          stop every run.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="plans" />
        {/* C5, linked, not restated. */}
        <p>
          How the tool page learns which plan applies to you, and what that question
          carries, is in{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>
        {/* Spec 0012, INV-8 as spec 0017's AC-26 amends it (only what Pro does
            today, so no support is promised); spec 0017, INV-2 (terms honesty
            based, like the cap); spec 0001's *Consequences* bullet "The paywall
            is not enforceable"; spec 0012's *Consequences* bullet "The paywall
            stays unenforceable". */}
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
        {/* Spec 0002's *Security model* bullet "Audit logging, stated
            plainly". */}
        <p>
          On purpose, there is no record of your document or its words, because such a
          record would recreate the very exposure RedactNest exists to remove.
        </p>
        {/* Spec 0004, AC-24; C8 and C10 linked, not restated. */}
        <p>
          MuPDF’s own messages, which can quote a document, are thrown away inside the
          worker as the engine loads. Whether our own code writes a log is in{" "}
          <a href={privacy("whatWeDoNotDo")}>{PRIVACY_SECTIONS.whatWeDoNotDo}</a>, and
          what our host keeps is in{" "}
          <a href={privacy("whatWeReceive")}>{PRIVACY_SECTIONS.whatWeReceive}</a>.
        </p>
        {/* C7 and C14 to C16, linked, not restated. */}
        <p>
          What we count, what a failure report holds and what neither ever holds is in{" "}
          <a href={privacy("countsAndReports")}>{PRIVACY_SECTIONS.countsAndReports}</a>,
          and which scripts run on our pages is in{" "}
          <a href={privacy("whatWeDoNotDo")}>{PRIVACY_SECTIONS.whatWeDoNotDo}</a>.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="checkIt" />
        {/* Spec 0009, AC-1 and AC-4. */}
        <p>
          The foot of every page links to the source code for the version you are using,
          so you can read what runs in your browser.
        </p>
        {/* Spec 0002, AC-3 as C5 amends it; spec 0004, AC-21; C1 and C5
            linked. */}
        <p>
          Your browser can show you the rest. Open its developer tools on the tool page,
          redact a file, and the network panel lists every request the page sends, so you
          can check what{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a> says.
        </p>
        {/* Spec 0011, AC-16. */}
        <p>
          If you find RedactNest doing something this page says it does not, please write
          to <ContactLink />.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="changes" />
        {/* Spec 0011, AC-2. */}
        <p>
          When we change this page, we update the date at the top and add a line below
          saying what changed.
        </p>
        <ChangeList changes={SECURITY_CHANGES} />
      </section>
    </LegalPage>
  );
}
