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

/**
 * The description's absolutes, each behind a gate (spec 0018, AC-5): "never
 * uploaded" is the tool page's content security policy (`connect-src 'self'`)
 * with no endpoint of ours that takes document data (spec 0002, AC-3 as C5
 * amends it); "before any box is drawn" is the pass order (spec 0004's
 * *Decision* bullet "Box pass"); "every new file is checked" is the self
 * check, which no file leaves without passing (spec 0004, INV-2).
 */
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
          When you choose a PDF, the tool page hands it to a background worker (a Web
          Worker), which holds the document while you work on it. The PDF engine, MuPDF
          built for the browser, runs inside that worker too.
        </p>
        {/* Spec 0001's *Consequences* bullet "`'unsafe-inline'` on the tool
            route" (the page is rendered static, so no server is in its path)
            and spec 0002, INV-1 (the document exists only inside the worker),
            which together say no server of ours reads it; C1 and C5 linked,
            not restated. */}
        <p>
          The tool page is a fixed file, so no server of ours takes part in reading your
          document. What the page does ask our own server, and what that carries, is in
          the privacy policy’s{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>

        <h3>When it ends</h3>
        {/* Spec 0002, AC-5a, AC-5b and INV-6, and its *Security model* bullet
            "The two endings are not equally strong". "Once that session has
            ended" rather than "from then on", because a run under way finishes
            its step before the session ends. "At once" is the worker's
            termination (AC-5b). "Nothing in the page can reach" names a step
            that does not exist: the page keeps no reference to a replaced
            document (AC-5a). "Only released" is the limit, not a promise. */}
        <p>
          Leaving the page, closing the tab or pressing Start over stops the worker, and
          its memory goes back to your browser at once. Opening a second document ends the
          first one’s session. Once that session has ended, nothing in the page can reach
          the first document, though its memory is only released for reuse until you leave
          the page or start over.
        </p>
        {/* Spec 0002, AC-4 and INV-7 (released once the download is handed
            to the browser); spec 0004, AC-20 (dropped sooner on a tick change,
            start over, a replacement, a lost worker or leaving the page), so
            "only until": keeping the copy past the handover is a step that
            does not exist (INV-7). */}
        <p>The cleaned copy waits in the page only until you download it.</p>
        {/* Spec 0002, AC-11, and its *Security model* bullet "The `File` handle
            is worth naming". "Stores nothing new" sits behind spec 0002, INV-3:
            no storage is ever written, held by lint in every zone and by
            `tests/e2e/privacy.spec.ts` in a real browser. */}
        <p>
          Until the session ends, the page also keeps a handle to the file you chose, so
          it can read that one file again without asking. It stores nothing new: the file
          is already on your device, where you chose it.
        </p>

        <h3>What no website can control</h3>
        {/* Spec 0018, AC-7 (what no website controls), and spec 0002's
            *Security model* bullet "What this design does not control" (the
            four things). */}
        <p>
          Some things on your device are beyond any website, RedactNest included: your
          operating system moving memory to disk (swap or page files), your browser
          keeping memory or crash reports of its own, a browser extension that can read
          the page, and what is kept on your own disk.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="removedNotCovered" />
        {/* Spec 0004's *Security model* bullet "Text that no detector matched
            passes through as it is" (text under a black rectangle is still in
            the file, a fake redaction), and spec 0018, AC-8, whose drawing
            shows a copy giving the words back. */}
        <p>
          Drawing a black box over words hides them from your eyes, not from the file. The
          words are still there underneath, so copying the text brings them back.
        </p>
        {/* Spec 0018, AC-8, and the *Page design* bullet "The drawing" it
            points to (the panels' words and the caption). The caption's "only"
            tells the two drawn panels apart; it claims nothing about a
            document. */}
        <CoverFigure
          panels={COVER_PANELS}
          caption="Both pages look the same. Only the second took the words out of the file."
        />
        {/* Spec 0004, AC-4 (the text removed), and its *Decision* bullets "Box
            pass" (the box drawn last) and "Self check method: compare, never
            sample" (the box a filled path, not text). "Each item you ticked"
            and "nothing in it to copy" sit behind the self check's character
            part, which every file passes: none leaves holding a ticked
            character, or any character under a box (spec 0004, INV-2, INV-10
            and AC-13). */}
        <p>
          RedactNest works the other way round: removed, then marked. It takes each item
          you ticked out of the page’s drawing instructions (the part of the file that
          says what text goes where), then draws the black box where it was. The box is a
          filled shape, not text, so there is nothing in it to copy.
        </p>
        {/* Spec 0004's *Decision* bullets "Padded area" and "Padded pass", and
            its *Security model* bullets "Covered line art is removed across the
            padded area" and "Scan ink further from the OCR text". "Each" sits
            behind the self check's pixel part: every picture it sees under a
            removed item is blank there, or no file leaves (spec 0004, AC-13
            and INV-15). No colour is named: blank is white, or unpainted for a
            stencil picture (AC-13). The reach past the edges is the pass's own
            area, the same on every item ("Padded area"). */}
        <p>
          Under each removed item it also blanks the pictures MuPDF reports there, over an
          area reaching a little past the item’s edges, and small drawn marks lying wholly
          inside that area, such as an underline, can go with it. Ink of a scanned page
          lying further out than that can stay visible.
        </p>
        {/* Spec 0004, INV-5 (every setting written out), its *Decision*
            bullet "Redaction settings are explicit at the call site", whose
            line "All twelve arguments are written out" gives the reason, INV-13
            and AC-13. INV-13 is about the content stream, so the line says
            drawing instructions: the box pass adds to the page through
            MuPDF. "Every setting" is INV-5, all four arguments written at each
            call in `src/engine/passes.ts`. "Never edits" names a step that
            does not exist (INV-13). "Stops the run" is the self check: a
            ticked character still in the output fails it (AC-13). */}
        <p>
          MuPDF does the removing, with every setting spelled out rather than left to its
          defaults, so a change in the engine’s defaults cannot quietly change what is
          removed. RedactNest never edits a page’s drawing instructions itself, and a
          ticked item MuPDF cannot remove stops the run.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="theCheck" />
        {/* Spec 0004, INV-2 and AC-13 (three parts: the text of every page,
            the pictures under each target, the file's structure). This is the
            gate itself: every file passes it or does not leave. */}
        <p>
          Before you get a file, RedactNest opens the new file again, from the exact bytes
          you will download, and checks three things:
        </p>
        <ul>
          {/* Spec 0004, INV-2 and AC-13; spec 0006, AC-16 (a character wholly
              inside the visible area stays where it was, one crossing its edge
              may go or stay) and AC-17 (none centred outside survives). The
              check compares against the page after the trim, so "wholly". It
              skips whitespace, so "spaces aside". It counts a character as
              ticked by where it lies (inside a ticked item, on its line), not
              by which row held it, and fails on any character under a box
              (spec 0004, INV-10), so "lying in an item you ticked". Every
              "every" and "none" here is the check's own rule. */}
          <li>
            Text, spaces aside: for each page’s visible area, every character wholly
            inside it is still there, in its place, except those lying in an item you
            ticked, and none lying in one is left. Outside the visible area, none is left
            at all, and a character crossing the page’s edge can go with what lies outside
            it. It reads the pages twice, the second time ignoring replacement text (the
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
          {/* Spec 0004, AC-13 (no `/Info`, only allowlisted keys, no carrier
              key or `/JS` anywhere, one revision) and INV-3. "A single
              version" is the version count, a gate every file passes or does
              not leave. "Looks for" says what the check does and claims
              nothing about what is left (spec 0018, *Page changes*, item 13):
              it fails on document info in the trailer's `/Info`, a `/Metadata`
              or `/Thumb` entry on any object (`CARRIER_KEYS`), bookmarks and
              the attachment and script name trees in the catalog
              (`CATALOG_KEYS`), attachment annotations in a page's `/Annots`
              (`PAGE_KEYS`), an associated file in `/AF` on any object, a `/JS`
              entry anywhere and a second version. Never "none is left":
              below the catalog and the pages the rebuild deletes only
              `CARRIER_KEYS`, so whatever else an object it keeps refers to is
              copied with it. */}
          {/* The "can" line is the measurements spec 0018 records (items 13
              and 15), each run with nothing ticked: on
              `tests/fixtures/form-xobject.pdf`, an embedded file reached
              through the figure's `/Ref` or `/OPI` (the seventh verify,
              2026-11-15) and pdfTeX's `/PTEX.InfoDict` and `/PTEX.FileName`
              (the sixth verify); on `tests/fixtures/images-under.pdf`, an
              embedded file through the picture's `/OPI` and the same two
              program keys (the seventh verify). Each time the self check
              passed, nothing was reported stripped, and the output kept them.
              "Can", because a carrier key is deleted wherever it sits. */}
          <li>
            Structure: the file holds a single version, and the check looks for the hidden
            data the home page lists. Hidden data kept in less common places the PDF
            format allows, such as a file or details attached to a picture or figure, or
            in entries a program adds for its own use, can stay.
          </li>
        </ul>
        {/* Spec 0004, AC-14 (no output, one kind); spec 0007, AC-16 (each
            kind's words, so the reason is plain). "No file, only a plain
            reason" is that gate: a failed check returns no bytes (INV-2). */}
        <p>
          If any part fails, you get no file, only a plain reason. RedactNest stops rather
          than hand you a file the check could not vouch for.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="hiddenData" />
        {/* The band linked, not restated (spec 0018, AC-6): a plain pointer
            naming the subject, spec 0004, AC-7 (what is stripped) and AC-13
            (what the structure check looks for), with no claim of its own.
            What the check looks for and what can stay are said once, under
            The check on every file; never "where the PDF format keeps it",
            "whenever a file carries it" or "from the file's own structure"
            (the seventh verify, 2026-11-15). */}
        <p>
          The home page lists the{" "}
          <a href={HOME_BAND}>hidden data RedactNest looks for and strips</a>.
        </p>
        {/* Spec 0006, AC-29 (every page image in a run's output has the same
            filter and the same bytes as in the source), held by
            `tests/unit/cost.test.ts` and run again by the fifth verify
            (2026-11-15). A picture under no removed item leaves as the file
            stored it, so whatever it holds inside its own bytes leaves with
            it; one the run blanks is written again, so "can". */}
        <p>
          Details stored inside a picture’s own data, such as a photo’s camera details,
          can stay.
        </p>
        {/* Spec 0004, AC-7, its *Feature design* sentence "Stripped and never
            reported", and its *Consequences* bullet "The output is plainer than
            the source, by design". Each item sits behind the self check's
            structure part (AC-13) or a step that does not exist: page labels,
            viewer preferences and an opening action are off the catalog's
            allowlist (`CATALOG_KEYS`), other automatic actions are the `/AA`
            carrier key on any object, links are a page's `/Annots` (`PAGE_KEYS`)
            and tags the catalog's structure tree. The identifier is a step
            that does not exist: the output is a new document that takes the
            source's pages and never its trailer (`graftPages`), pinned in
            `tests/unit/redaction.test.ts`. "Without reporting" is
            `SANITIZED_KINDS`, which has no kind for them
            (`tests/unit/redaction-inventory.test.ts`). Private application
            data is not named: the check holds only the format's own key for
            it, not every place a producer may write its own. */}
        <p>
          That list leaves some things out. RedactNest also strips page labels, viewer
          preferences, automatic actions that are not scripts, and the file’s identifier,
          without reporting them. And the cleaned copy loses its links and its
          accessibility tags, so screen readers read it less well.
        </p>

        <h3>Notes and attachments</h3>
        {/* Spec 0004, AC-22 (comments and form fields flattened) and AC-7 (no
            annotations or attachments in the output); the measurement spec
            0018's AC-7 records (`tests/fixtures/metadata.pdf`, 2026-11-14, a
            run with nothing ticked: no annotation, note text or attached file
            left in any object, both icons still drawn). "Can keep": one
            fixture measured, so the icon is a "can" line, while the text and
            the file gone is AC-7's, on every file. "Is gone" sits behind the
            self check's structure part (AC-13): no page holds annotations
            (`PAGE_KEYS`), the catalog no attachment list (`CATALOG_KEYS`) and
            no object an associated file (`/AF`), and the write drops every
            object nothing refers to (`WRITE_OPTIONS`). */}
        <p>
          The home page notes{" "}
          <a href={HOME_BAND}>how comments and form fields are flattened</a>. A sticky
          note or a file attachment that shows as an icon can keep that icon as a mark on
          the page, while what it held but did not show, the note’s text or the attached
          file, is gone.
        </p>

        <h3>Passwords and fonts</h3>
        <ul>
          {/* Spec 0004, AC-10 (a file with an owner password is redacted, the
              output unencrypted with no permission restrictions), and its
              *Security model* bullet "Owner password restrictions are removed
              on purpose". "Not refused for that" names a step that does not
              exist: the open refuses only a file that needs a password to open
              (`src/engine/open.ts`). "No restriction" sits behind the self
              check, which fails an output whose trailer holds `/Encrypt`
              (AC-13). */}
          <li>
            A file that opens without a password but restricts what you can do with it is
            not refused for that, and the cleaned copy carries no restriction. That is on
            purpose: you already hold the content, and the restriction protects nothing
            from you.
          </li>
          {/* Spec 0004's *Security model* bullet "Embedded fonts keep the shapes
              of removed characters" (an inventory of which characters existed).
              Nothing about order: an app that numbers a subset font's
              characters as each first appears keeps some of it (the third
              verify, 2026-11-14), so that bullet's "never their order" is
              owed on feature 30 in the scope. */}
          <li>
            A font in the file can still hold the shapes of characters that were removed.
            That can tell someone which characters the document used.
          </li>
        </ul>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItFinds" />
        {/* Spec 0005, AC-14 (names and addresses not looked for: no such
            detector exists, a step that does not exist); spec 0017, AC-1 (the
            custom terms panel). That terms come with Pro is said once, under
            Plans. */}
        <p>
          RedactNest looks for the{" "}
          <a href={HOME_BAND}>kinds of detail the home page lists</a>. It does not look
          for names or postal addresses, and you can add those as custom terms.
        </p>
        {/* Spec 0005, AC-8 (a match the find step can tell the engine would
            refuse starts unticked and cannot be ticked), AC-10 and AC-13. That
            a row you can tick can still stop the run (spec 0005, AC-6) is said
            once, under When it stops instead. "Any row except" names a step
            that does not exist: the session refuses a tick only on a blocked
            match (`tick-toggled` and `ticks-set` in `src/lib/session.ts`). The rows hold still
            while a run works (spec 0007, AC-7's rule for select all, which the
            checklist applies to every row), so "while no run is under
            way". */}
        <p>
          Each find is a row with a box. A row’s starting tick is a suggestion. While no
          run is under way, you can tick or untick any row except one RedactNest can tell,
          while reading, that it cannot remove safely.
        </p>

        <h3>Custom terms</h3>
        {/* Spec 0017, AC-29 and INV-5 (no pattern is built from a term, so a
            term is plain words: "never" names a step that does not exist), AC-7 (case and accents folded) and AC-8
            (spacing and line breaks match one space); C3 linked, not
            restated. */}
        <p>
          A custom term is plain words, never a pattern or a wildcard. It matches its
          words through many differences of writing, such as case, accents, spacing and
          line breaks, but not all. What happens to the terms you type is in{" "}
          <a href={privacy("yourDocuments")}>{PRIVACY_SECTIONS.yourDocuments}</a>.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whatItCanMiss" />
        {/* Spec 0005's *Consequences* bullet "Rule based detection misses
            whatever does not look like its pattern". Each line below says what
            can be missed. */}
        <p>
          RedactNest goes by what the text looks like; it does not understand the
          document.
        </p>
        <ul>
          {/* Spec 0005, AC-4 (other wraps not found, no match across text
              blocks), and its *Consequences* bullet "A value wrapped mid word
              or at a hyphen is missed" (an email wrapped at a dot lists only
              the part after the break). For a term: spec 0017, AC-8 (an exact
              match is the folded term equal to the folded page, only a run of
              whitespace or a break standing for a space) and AC-11 (the spaced
              reading removes only separators), so other text between a term's
              parts in reading order keeps them apart on one page; AC-33 (text
              drawn between the parts keeps them apart across a page break) and
              its *Consequences* bullet "Known misses, recorded". A term is read
              across line and block breaks (AC-9), so only text between is
              named for it: measured on `tests/fixtures/detect-wraps.pdf`, a
              term split across its two columns is matched (the sixth verify,
              2026-11-15). */}
          <li>
            A value broken up across lines, columns, table cells or pages can be missed,
            or found only in part. A term with other text between its parts, on one page
            or across pages, can be missed.
          </li>
          {/* Spec 0005, AC-20, AC-21 and AC-23; spec 0014, AC-3 (a plain digit
              glued after a date, listed as an unticked phone row); spec 0017,
              AC-10, and its *Consequences* bullet "Known misses, recorded" (an
              all capitals word glued to the next). */}
          <li>
            One joined to other letters, digits or words can be missed, found only in
            part, or listed unticked.
          </li>
          {/* Spec 0005, AC-2 and AC-19, and its *Consequences* bullet "Rule based
              detection misses whatever does not look like its pattern" (another
              region's national number, a non English month) and its bullet "A
              phone number written in decimal digits other than ASCII `0` to `9`
              is found only when it is written with a `+`" (another script);
              spec 0015's *Consequences* bullet "Still missed" (number
              words). */}
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
            Something that is not sensitive can be listed, and two card numbers side by
            side can share one row, so they stay or go together.
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
            or shown only as pixels". "Does not read" names a step that does
            not exist: RedactNest has no text recognition. */}
        <p>
          RedactNest does not read words that exist only as a picture, so it cannot find
          them.
        </p>
        {/* Spec 0006, INV-9, and its *Consequences* bullet "The heuristic
            findings will misfire sometimes" (each errs toward saying too much;
            the small print is its 0.5 pt legal line). */}
        <p>
          RedactNest’s page warnings rely on rules of thumb, so they can miss a page, and
          can warn about one that is fine, such as a page with a brochure photo or a line
          of very small print.
        </p>
        {/* Spec 0018, AC-7 (the Pages line: one list of what can stay or be
            misjudged). Each item below names its own source. */}
        <p>Some things can stay in the file, or be misjudged:</p>
        <ul>
          {/* Spec 0008, AC-1 and AC-9. */}
          <li>
            When a scan carries text from recognition (OCR) run by another tool,
            RedactNest can treat the picture as read and work from that text alone, so
            words the recognition missed or misread can stay in the picture.
          </li>
          {/* Spec 0010, AC-7, and its *Decision* bullets "MRC pieces and a photo
              pasted before OCR are recorded limits" and "Dense vertical OCR is a
              recorded limit". */}
          <li>
            It can name a scan as a picture it cannot read although recognised text lies
            over it.
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
            show) and INV-9 (the search can miss). "When it finds some, it warns
            you" sits behind two records over every finding in
            `src/lib/page-findings.ts` (`FINDING_TONE` and the finding lines):
            both findings are warnings with words of their own, a finding
            without its line fails `pnpm typecheck`, and both lines say the
            text is still in the file. */}
        <p>
          RedactNest looks for text under a box or picture drawn over it, and for text you
          cannot see, such as text the same colour as the page. When it finds some, it
          warns you that the text is still in the file. This search can miss hidden text,
          so a file you received can still hold words that look covered, with no warning.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="whenItStops" />
        {/* Spec 0004, AC-1 to AC-3, with spec 0007, AC-16 (the `corrupt`
            kind's words: the file may be damaged); spec 0007, AC-17 (a file
            that needs a password is refused, and the page never asks for one);
            spec 0006, AC-10 (no page it can read). Each is a refusal the engine
            makes on every file it judges that way, in the open's fixed order
            (`src/engine/open.ts`). "Never its name" names a step that does not
            exist: the name is never consulted (spec 0004, INV-4). */}
        <p>
          At open, RedactNest refuses, among others, a file that is not a PDF (judged by
          its contents, never its name), one too damaged to open, one that needs a
          password (RedactNest does not take passwords), one with layers a viewer can
          switch on and off, and a file in which it finds no page it can read.
        </p>
        {/* Spec 0004, AC-26 to AC-29; spec 0005, AC-8. That the row cannot be
            ticked is said once, under What it finds. "The row says" sits behind
            `BLOCKED_REASON_TEXT`, a record over every reason a match is
            blocked for, each line ending "will stay in the file". */}
        <p>
          Some items cannot be removed safely, such as text set at an angle or inside
          replacement text. Where RedactNest can tell while reading, the row says the item
          will stay in the file.
        </p>
        {/* Spec 0007, AC-14 (a refused run keeps every tick, with its reason
            and no output); spec 0005, AC-6 (the self check can still refuse a
            run of rows that could be ticked); spec 0004, AC-13 and AC-26, and
            its *Security model* bullets "A document with a text object that is
            positioned with `Td`" (some files stop every run) and "A text
            watermark that crosses a target" (a stop met only while
            removing). "No file" is spec 0004, AC-14, on every failed run. "Your
            ticks are kept" is the session's `failed` edge out of a run, which
            every refused run takes (spec 0007, AC-14 and INV-1). A worker lost
            during a run is not a refusal and its ticks do not survive it
            (AC-14's last sentence), so the last line says so. The review starts
            over only on the lost state's Try again (`retry` in
            `src/lib/session.ts`, which reopens at `opening` with no ticks and
            no matches), never by itself (the sixth verify, 2026-11-15). */}
        <p>
          Otherwise the run stops with a plain reason and no file, and your ticks are
          kept: a row you could tick can still stop the run, for something RedactNest
          meets only while removing. Some files stop every run. A run can also end because
          the engine itself was lost. The review then starts over, without your ticks,
          when you press Try again.
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
        {/* Spec 0012, AC-13 (Pro's longer documents) and INV-8 as spec 0017's
            AC-26 amends it (only what Pro does today, custom terms among it, so
            no support is promised); spec 0017, INV-2 (terms honesty based, like
            the cap); spec 0001's *Consequences* bullet "The paywall is not
            enforceable" (client side code and published source); spec 0012's
            *Consequences* bullet "The paywall stays unenforceable" (not a
            lock). */}
        <p>
          The page limit relies on honesty. It is applied in your own browser, by code
          anyone can read, so someone determined could lift it. Pro gives you longer
          documents and custom terms, not a lock, and custom terms rely on honesty in the
          same way.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="logsAndCounts" />
        {/* Spec 0002's *Security model* bullet "Audit logging, stated
            plainly". "No record" sits behind three gates: the tool page's
            content security policy (`connect-src 'self'`), no endpoint of ours
            that takes document data (spec 0002, AC-3 as C5 amends it), and
            every log, count and error payload typed as kinds and numbers with
            no free string (spec 0002, INV-4, held by
            `tests/unit/loggable.test.ts`). */}
        <p>
          On purpose, there is no record of your document or its words, because such a
          record would recreate the very exposure RedactNest exists to remove.
        </p>
        {/* Spec 0004, AC-24 (never reaches the console), and its *Decision*
            bullet "MuPDF's log is silenced once, right after the engine loads"
            (its warnings can quote document detail); C8 and C10 linked, not
            restated. "Thrown away" is the callback `silenceEngineLog` installs
            on every engine load, before a document is opened. */}
        <p>
          MuPDF’s own messages, which can quote a document, are thrown away inside the
          worker as the engine loads. Whether our own code writes a log is in{" "}
          <a href={privacy("whatWeDoNotDo")}>{PRIVACY_SECTIONS.whatWeDoNotDo}</a>, and
          what our host keeps is in{" "}
          <a href={privacy("whatWeReceive")}>{PRIVACY_SECTIONS.whatWeReceive}</a>.
        </p>
        {/* C7 (the only outside script) and C14 to C16, linked, not
            restated. */}
        <p>
          What we count, what a failure report holds and what neither ever holds is in{" "}
          <a href={privacy("countsAndReports")}>{PRIVACY_SECTIONS.countsAndReports}</a>,
          and which outside scripts run on our pages is in{" "}
          <a href={privacy("whatWeDoNotDo")}>{PRIVACY_SECTIONS.whatWeDoNotDo}</a>.
        </p>
      </section>

      <section>
        <SectionHeading sections={SECURITY_SECTIONS} name="checkIt" />
        {/* Spec 0009, AC-1 and AC-4. "Every page": the root layout draws the
            footer on every route (`src/app/layout.tsx`), and a build whose
            link is not the built version's fails (AC-4 to AC-6). */}
        <p>
          The foot of every page links to the source code for the version you are using.
        </p>
        {/* Spec 0002, AC-3 as C5 amends it, and spec 0004, AC-21 (what the
            tool page asks our server); C1 and C5 linked. Developer tools come
            first, because requests made as the page loads are listed only if
            the panel is already open. "Every request" is what the browser's
            own panel does, not a claim about RedactNest. */}
        <p>
          Your browser can show you the rest. Open its developer tools, then load the tool
          page and redact a file, and the network panel lists every request the page
          sends, so you can check what{" "}
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
        {/* Spec 0011, AC-2, which this page takes through spec 0018, AC-3. */}
        <p>
          When we change this page, we update the date at the top and add a line below
          saying what changed.
        </p>
        <ChangeList changes={SECURITY_CHANGES} />
      </section>
    </LegalPage>
  );
}
