"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";

import { cx } from "@/lib/cx";

import { Button } from "./button";
import { IconCircle } from "./icon-circle";

interface DropZoneCommon {
  readonly buttonLabel: string;
  readonly accept: string;
  readonly onFile: (file: File) => void;
  /** Called as soon as a file looks likely, so what it needs can start loading. */
  readonly onWarm: () => void;
  /**
   * The button, in either form, so a page can move focus to it after a step
   * change (spec 0007, *Focus*) or press it for a callout that offers the same
   * choice.
   */
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

/** The full zone, shown while nothing is open. */
interface FullDropZone extends DropZoneCommon {
  readonly compact?: false;
  readonly title: string;
  readonly helper: string;
}

/**
 * The file bar, shown once a document is chosen (spec 0007, AC-3): the file's
 * name, its page count once known, the button, and the caller's `action` (Start
 * over). It still takes a dropped file.
 */
interface CompactDropZone extends DropZoneCommon {
  readonly compact: true;
  /** From somebody's disk, so untrusted: rendered only as React text (INV-7). */
  readonly fileName: string;
  /** Null until the document is open, and nothing is shown for it until then. */
  readonly pageCount: number | null;
  readonly action?: ReactNode;
}

type DropZoneProps = FullDropZone | CompactDropZone;

type DropState = "idle" | "dragging";

const STATE: Readonly<Record<DropState, string>> = Object.freeze({
  idle: "border-dashed border-border-strong bg-surface",
  dragging: "border-solid border-accent bg-accent-soft",
});

/**
 * The file bar's idle edge is quieter than the full zone's, because it is no
 * longer the thing to do next. Dragging looks the same in both forms.
 */
const COMPACT_STATE: Readonly<Record<DropState, string>> = Object.freeze({
  idle: "border-solid border-border bg-surface",
  dragging: STATE.dragging,
});

/**
 * Where a PDF is dropped or chosen.
 *
 * One tab stop, the visible button (AC-8), plus the caller's action in the
 * file bar. The native file input is kept out of the tab order and hidden from
 * assistive technology, because a keyboard visitor landing on a second, unnamed
 * "Choose File" control right after the real one is noise. It still receives
 * files: from the button, and programmatically.
 *
 * This component owns one of spec 0002's privacy rules, which is why it is
 * called out: the input's value is cleared after every choice (spec 0002, AC-2),
 * so the page never keeps a `FileList` pointing at the visitor's file.
 */
export function DropZone(props: DropZoneProps) {
  const { buttonLabel, accept, onFile, onWarm, buttonRef } = props;
  const [state, setState] = useState<DropState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const leave = (event: DragEvent<HTMLDivElement>) => {
    // Moving from the zone onto one of its own children fires a leave too.
    // Staying in the dragging state across that stops the edge flickering.
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setState("idle");
  };

  const zone = {
    "data-state": state,
    onPointerEnter: onWarm,
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setState("dragging");
      onWarm();
    },
    onDragLeave: leave,
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setState("idle");
      const file = event.dataTransfer.files[0];
      if (file) onFile(file);
    },
  };

  const input = (
    <input
      ref={inputRef}
      data-testid="file-input"
      type="file"
      accept={accept}
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        // Spec 0002, AC-2: the input keeps no `FileList` once the file is in
        // hand. Clearing it also makes choosing the same file twice in a row
        // fire a change event, which it otherwise would not.
        event.target.value = "";
        if (file) onFile(file);
      }}
    />
  );

  if (props.compact) {
    return (
      <div
        {...zone}
        data-testid="file-bar"
        className={cx(
          "flex flex-col gap-3 rounded-xl border-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4",
          "transition-colors duration-150 motion-reduce:transition-none",
          COMPACT_STATE[state],
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconCircle icon={FileText} tone="accent" />
          <div className="flex min-w-0 flex-col">
            <p className="font-semibold text-ink wrap-anywhere">{props.fileName}</p>
            {props.pageCount !== null && (
              <p data-testid="page-count" className="text-small text-ink-muted">
                {props.pageCount} {props.pageCount === 1 ? "page" : "pages"}
              </p>
            )}
          </div>
        </div>

        {input}

        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
          <Button
            ref={buttonRef}
            variant="secondary"
            icon={Upload}
            data-testid="choose-file"
            onFocus={onWarm}
            onClick={() => inputRef.current?.click()}
          >
            {buttonLabel}
          </Button>
          {props.action}
        </div>
      </div>
    );
  }

  return (
    <div
      {...zone}
      data-testid="drop-area"
      className={cx(
        "flex flex-col items-center gap-4 rounded-xl border-2 px-6 py-10 text-center sm:px-10 sm:py-12",
        "transition-colors duration-150 motion-reduce:transition-none",
        STATE[state],
      )}
    >
      <IconCircle icon={FileText} tone="accent" size="lg" />

      <div className="flex flex-col gap-1">
        <p className="text-heading text-ink">{props.title}</p>
        <p className="text-small text-ink-muted">{props.helper}</p>
      </div>

      {input}

      <Button
        ref={buttonRef}
        size="lg"
        icon={Upload}
        data-testid="choose-file"
        onFocus={onWarm}
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
