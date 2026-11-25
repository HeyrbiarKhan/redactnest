import { Check, CircleCheck, Download, FileCheck } from "lucide-react";
import type { Ref } from "react";

import { countText } from "@/lib/count-text";
import {
  DOWNLOADED_LINE,
  leftLine,
  removedLine,
  RESULT_SET_ASIDE,
  RESULT_STATS,
  RESULT_TERMS,
  resultTitle,
  setAsideLine,
  strippedLine,
  type TermResult,
} from "@/lib/flow-text";
import type { NotSearchedReason, OutputForm } from "@/lib/session";
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
import { IconCircle } from "@/ui/icon-circle";
import { SummaryList } from "@/ui/summary-list";

interface ResultCardProps {
  /** From `resultCounts`, the only source of Removed and Left in the file. */
  readonly counts: ResultCounts;
  /**
   * Each term this job searched, in list order, with what the engine removed
   * for it and what it left (spec 0017, AC-22).
   */
  readonly terms?: readonly TermResult[];
  /** Each term set aside in this job, with why it was not searched (AC-22). */
  readonly setAside?: readonly {
    readonly text: string;
    readonly reason: NotSearchedReason;
  }[];
  readonly summary: DocumentSummary | null;
  /**
   * What the file's name says it is, from the same `outputFormFor` over the
   * same summary and outcome that named it at `redacted` (spec 0007, AC-12).
   */
  readonly outputForm: OutputForm;
  readonly downloaded: boolean;
  readonly onDownload: () => void;
  readonly onRedactAnother: () => void;
  readonly onMakeAgain: () => void;
  /**
   * The name the file downloads under (spec 0007, AC-12), shown under
   * Download (spec 0026, AC-12). Built from the visitor's own file name, so
   * rendered only as React text (spec 0003, INV-7).
   */
  readonly outputName: string;
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
  terms = [],
  setAside = [],
  summary,
  outputForm,
  downloaded,
  onDownload,
  onRedactAnother,
  onMakeAgain,
  outputName,
  headingRef,
  redactAnotherRef,
}: ResultCardProps) {
  const partly = summary !== null && isPartly(summary);
  const offPage = summary === null ? null : removedOffPageLine(summary);
  // Spec 0007, AC-12: the reason line explains the name, so it shows only when
  // the name says partly. A cleaned copy of a partly readable file keeps the
  // page lines and leaves this out. Read from the form that named the file,
  // never from the name's ending, which is built from the visitor's own name.
  const partlyNamed = outputForm === "partly-redacted";
  const removed = counts.removedTotal > 0;

  return (
    <Card
      title={
        // The tile is decoration, hidden from assistive technology, so the
        // heading focus lands on reads as the title alone.
        <span className="flex items-center gap-3">
          <IconCircle
            icon={removed ? Check : FileCheck}
            tone={removed ? "accent" : "neutral"}
          />
          <span>{resultTitle(counts)}</span>
        </span>
      }
      headingRef={headingRef}
      data-testid="result"
    >
      {/*
        Spec 0026, AC-12: the three counts at a glance, each through
        `countText`, a number over its label. A list of terms and values, so a
        screen reader hears each label with its number; the lines under it say
        which items and which kinds.
      */}
      <dl data-testid="result-stats" className="grid grid-cols-3 gap-3">
        {(
          [
            [RESULT_STATS.removed, counts.removedTotal],
            [RESULT_STATS.left, leftTotal(counts)],
            [RESULT_STATS.stripped, counts.sanitized.length],
          ] as const
        ).map(([label, count]) => (
          <div
            key={label}
            className="flex min-w-0 flex-col rounded-control border border-border px-4 py-3"
          >
            <dt className="order-2 text-small text-ink-muted">{label}</dt>
            <dd className="order-1 text-heading text-ink">{countText(count)}</dd>
          </div>
        ))}
      </dl>

      <SummaryList
        data-testid="outcome"
        items={[
          { term: RESULT_TERMS.removed, description: removedLine(counts, terms) },
          { term: RESULT_TERMS.left, description: leftLine(counts, terms) },
          ...(setAside.length > 0
            ? [{ term: RESULT_SET_ASIDE, description: setAsideLine(setAside) }]
            : []),
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
        <p
          data-testid="output-name"
          className="mt-3 text-small text-ink-muted wrap-anywhere"
        >
          {outputName}
        </p>
      </div>
    </Card>
  );
}

/** Everything still in the file: rows left unticked, and rows that could not be removed. */
function leftTotal(counts: ResultCounts): number {
  const sum = (byType: Readonly<Partial<Record<string, number>>>) =>
    Object.values(byType).reduce<number>((total, count) => total + (count ?? 0), 0);
  return sum(counts.untickedByType) + sum(counts.blockedByType);
}
