import { CircleCheck, Download } from "lucide-react";
import type { Ref } from "react";

import {
  DOWNLOADED_LINE,
  leftLine,
  removedLine,
  RESULT_TERMS,
  resultTitle,
  strippedLine,
} from "@/lib/flow-text";
import {
  DOWNLOAD_WARNING_TITLE,
  isPartly,
  PARTLY_REASON,
  removedOffPageLine,
  warningLines,
} from "@/lib/page-findings";
import type { DocumentSummary, ResultCounts } from "@/worker/protocol";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { SummaryList } from "@/ui/summary-list";

interface ResultCardProps {
  /** From `resultCounts`, the only source of Removed and Left in the file. */
  readonly counts: ResultCounts;
  readonly summary: DocumentSummary | null;
  /** The name Download offers, settled at `redacted`. Read, never shown. */
  readonly outputName: string;
  readonly downloaded: boolean;
  readonly onDownload: () => void;
  readonly onRedactAnother: () => void;
  readonly onMakeAgain: () => void;
  /** Focus lands here when the run completes (AC-11, AC-20). */
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** And here once Download has handed the file over. */
  readonly redactAnotherRef?: Ref<HTMLButtonElement>;
}

/**
 * What a finished run did, in the action panel's place. Spec 0007, AC-11 to
 * AC-13.
 *
 * Not inside a live region: it is heard once, through focus moving to its
 * heading, rather than read out as it appears and then again on focus. Inside
 * it, in order: what was removed, what is still in the file and what hidden
 * content went; the note on what the trim removed outside the visible area; the
 * download warning when some page carries one; then Download, so the warning
 * sits directly above the one action it is about (spec 0006, AC-22 and INV-5).
 *
 * The card stays after the download. Download then gives way to a line saying
 * the browser has the file, in a small polite region of its own, and the two
 * ways on: another PDF, or the same file again.
 */
export function ResultCard({
  counts,
  summary,
  outputName,
  downloaded,
  onDownload,
  onRedactAnother,
  onMakeAgain,
  headingRef,
  redactAnotherRef,
}: ResultCardProps) {
  const partly = summary !== null && isPartly(summary);
  const offPage = summary === null ? null : removedOffPageLine(summary);
  // Spec 0007, AC-12: the reason line explains the name, so it shows only when
  // the name says partly. A cleaned copy of a partly readable file keeps the
  // page lines and leaves this out.
  const partlyNamed = outputName.endsWith("-partly-redacted.pdf");

  return (
    <Card title={resultTitle(counts)} headingRef={headingRef} data-testid="result">
      <SummaryList
        data-testid="outcome"
        items={[
          { term: RESULT_TERMS.removed, description: removedLine(counts) },
          { term: RESULT_TERMS.left, description: leftLine(counts) },
          { term: RESULT_TERMS.stripped, description: strippedLine(counts.sanitized) },
        ]}
      />

      {offPage !== null && (
        <Callout tone="info" data-testid="off-page-removed">
          <p>{offPage}</p>
        </Callout>
      )}

      {partly && (
        <Callout
          tone="warning"
          title={DOWNLOAD_WARNING_TITLE}
          headingLevel={3}
          data-testid="download-warning"
        >
          {warningLines(summary).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {partlyNamed && <p>{PARTLY_REASON}</p>}
        </Callout>
      )}

      <div>
        <div aria-live="polite">
          {downloaded && (
            <p data-testid="downloaded" className="mb-4 flex items-center gap-2 text-ink">
              <CircleCheck
                aria-hidden="true"
                className="size-5 shrink-0 text-accent"
                strokeWidth={1.75}
              />
              <span>{DOWNLOADED_LINE}</span>
            </p>
          )}
        </div>

        {downloaded ? (
          <div className="flex flex-wrap gap-3">
            <Button
              ref={redactAnotherRef}
              size="lg"
              data-testid="redact-another"
              onClick={onRedactAnother}
            >
              Redact another PDF
            </Button>
            <Button
              variant="secondary"
              size="lg"
              data-testid="make-again"
              onClick={onMakeAgain}
            >
              Make it again
            </Button>
          </div>
        ) : (
          <Button size="lg" icon={Download} data-testid="download" onClick={onDownload}>
            Download
          </Button>
        )}
      </div>
    </Card>
  );
}
