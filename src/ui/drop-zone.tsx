"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { cx } from "@/lib/cx";

import { Button } from "./button";
import { IconCircle } from "./icon-circle";

interface DropZoneProps {
  readonly title: string;
  readonly helper: string;
  readonly buttonLabel: string;
  readonly accept: string;
  readonly onFile: (file: File) => void;
  /** Called as soon as a file looks likely, so what it needs can start loading. */
  readonly onWarm: () => void;
}

type DropState = "idle" | "dragging";

const STATE: Readonly<Record<DropState, string>> = Object.freeze({
  idle: "border-dashed border-border-strong bg-surface",
  dragging: "border-solid border-accent bg-accent-soft",
});

/**
 * Where a PDF is dropped or chosen.
 *
 * One tab stop, the visible button (AC-8). The native file input is kept out of
 * the tab order and hidden from assistive technology, because a keyboard
 * visitor landing on a second, unnamed "Choose File" control right after the
 * real one is noise. It still receives files: from the button, and
 * programmatically.
 *
 * This component owns one of spec 0002's privacy rules, which is why it is
 * called out: the input's value is cleared after every choice (spec 0002, AC-2),
 * so the page never keeps a `FileList` pointing at the visitor's file.
 */
export function DropZone({
  title,
  helper,
  buttonLabel,
  accept,
  onFile,
  onWarm,
}: DropZoneProps) {
  const [state, setState] = useState<DropState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const leave = (event: DragEvent<HTMLDivElement>) => {
    // Moving from the zone onto one of its own children fires a leave too.
    // Staying in the dragging state across that stops the edge flickering.
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setState("idle");
  };

  return (
    <div
      data-testid="drop-area"
      data-state={state}
      onPointerEnter={onWarm}
      onDragOver={(event) => {
        event.preventDefault();
        setState("dragging");
        onWarm();
      }}
      onDragLeave={leave}
      onDrop={(event) => {
        event.preventDefault();
        setState("idle");
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cx(
        "flex flex-col items-center gap-4 rounded-xl border-2 px-6 py-10 text-center sm:px-10 sm:py-12",
        "transition-colors duration-150 motion-reduce:transition-none",
        STATE[state],
      )}
    >
      <IconCircle icon={FileText} tone="accent" size="lg" />

      <div className="flex flex-col gap-1">
        <p className="text-heading text-ink">{title}</p>
        <p className="text-small text-ink-muted">{helper}</p>
      </div>

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

      <Button
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
