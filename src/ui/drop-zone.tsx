"use client";

import { FileText, FileUp, Upload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";

import { countText } from "@/lib/count-text";
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
  /** The caps line, under the button. */
  readonly helper: string;
  /** A word between the title and the button, such as "or". */
  readonly or?: string;
  /** A second fact on the caps line, after a separator. */
  readonly note?: string;
}

/**
 * The file bar, shown once a document is chosen (spec 0007, AC-3): the file's
 * name, its page count once known, the button, and the caller's `action` (Start
 * over). It still takes a dropped file.
 *
 * `look` is where it sits: `bar`, a box of its own in the page, or `header`,
 * in the site header's row in the nav's place, with no box until a file is
 * dragged over it (`/tool`, spec 0026, child 0001, AC-30).
 */
interface CompactDropZone extends DropZoneCommon {
  readonly compact: true;
  readonly look?: "bar" | "header";
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

  if (props.compact && props.look === "header") {
    return (
      <div
        {...zone}
        data-testid="file-bar"
        data-look="header"
        className={cx(
          // An edge only while a file is dragged over it: at rest the header's
          // own row is the box. The edge's room is kept either way, so the
          // row never moves.
          "flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-control border px-2 py-1",
          "transition-colors",
          state === "dragging" ? STATE.dragging : "border-transparent",
        )}
      >
        {/*
          The name is cut with an ellipsis to fit, but the element still holds
          all of it, so assistive technology reads the whole name (AC-30). The
          count follows after a dot for the eye and a pause for a screen
          reader, through `countText` like every count the flow shows.
        */}
        <p className="flex min-w-0 flex-1 basis-48 items-center gap-2 text-small text-ink">
          <FileText
            aria-hidden="true"
            className="size-4.5 shrink-0 text-ink-muted"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate font-semibold">{props.fileName}</span>
          {props.pageCount !== null && (
            <span className="shrink-0 whitespace-nowrap text-ink-muted">
              <span aria-hidden="true">· </span>
              <span className="sr-only">, </span>
              <span data-testid="page-count">
                {countText(props.pageCount)} {props.pageCount === 1 ? "page" : "pages"}
              </span>
            </span>
          )}
        </p>

        {input}

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
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

  if (props.compact) {
    return (
      <div
        {...zone}
        data-testid="file-bar"
        className={cx(
          // A row once the bar itself is 36rem wide, not the window: so it
          // stacks in the page preview's 26.25rem column (spec 0026 child
          // 0002, AC-38), and a phone switches where it always did. Small
          // and quiet beside the review (the owner's call, 2026-11-26): a
          // 1 pixel edge, the control corner and the 40 pixel tile.
          "@container/file-bar rounded-control border px-3 py-2",
          "transition-colors",
          COMPACT_STATE[state],
        )}
      >
        <div className="flex flex-col gap-3 @min-[36rem]/file-bar:flex-row @min-[36rem]/file-bar:items-center @min-[36rem]/file-bar:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <IconCircle icon={FileText} tone="accent" shape="square" size="sm" />
            <div className="flex min-w-0 flex-col">
              <p className="text-small font-semibold text-ink wrap-anywhere">
                {props.fileName}
              </p>
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
      </div>
    );
  }

  return (
    <div
      {...zone}
      data-testid="drop-area"
      className={cx(
        // The empty state's one card (`ToolStates.dc.html`): the panel
        // corner, 36 pixels top and bottom. The edge stays a 2 pixel dashed
        // `border-strong`, 3:1 on `surface`, which forced colours keep.
        "flex flex-col items-center gap-4 rounded-panel border-2 px-6 py-9 text-center",
        "transition-colors",
        STATE[state],
      )}
    >
      <IconCircle icon={FileUp} tone="accent" shape="square" />

      <div className="flex flex-col gap-2">
        <p className="text-lead font-semibold text-ink">{props.title}</p>
        {props.or !== undefined && (
          <p className="text-small text-ink-muted">{props.or}</p>
        )}
      </div>

      {input}

      <Button
        ref={buttonRef}
        size="lg"
        data-testid="choose-file"
        onFocus={onWarm}
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </Button>

      {/* The caps line after the button, as the mockup draws it (spec 0026, AC-12). */}
      <p className="text-small text-ink-muted">
        <span>{props.helper}</span>
        {props.note !== undefined && (
          <>
            {/* A pause for a screen reader, a dot for the eye. */}
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span>{props.note}</span>
          </>
        )}
      </p>
    </div>
  );
}
