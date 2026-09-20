"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { config } from "@/config";
import { getSupport, SUPPORT_GAP_TEXT, type SupportReport } from "@/lib/support";
import { EngineError, type DocumentSummary, type ProgressPhase } from "@/worker/protocol";
import { inspect, warmEngine } from "@/worker/client";

/** Plain wording for each failure kind. Feature 8 owns the real treatment. */
const ERROR_TEXT: Record<string, string> = {
  "engine-unavailable":
    "The PDF engine could not be loaded. Check your connection and try again.",
  encrypted: "This PDF is encrypted, so its text cannot be read.",
  "password-required": "This PDF needs a password before it can be opened.",
  corrupt: "This file could not be read as a PDF.",
  unsupported: "Something went wrong opening this file.",
  "too-large": `This file is larger than the ${formatBytes(config.maxFileBytes)} limit.`,
  "too-many-pages": `This document has more than the ${config.maxPages} page limit.`,
};

const PHASE_TEXT: Record<ProgressPhase, string> = {
  "loading-engine": "Loading the PDF engine",
  opening: "Opening your document",
  inspecting: "Checking each page",
};

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Browser support cannot change while the page is open, so there is nothing to
 * subscribe to and nothing to detect on the server. */
const NEVER_CHANGES = () => () => {};
const SERVER_SNAPSHOT = () => null;

type Status =
  | { state: "idle" }
  | { state: "working"; phase: ProgressPhase }
  | { state: "done"; summary: DocumentSummary }
  | { state: "failed"; message: string };

export function ToolClient() {
  // The server snapshot is null, so the prerendered HTML shows the drop area for
  // everyone and hydration has nothing to disagree about. The real answer
  // arrives on the client, right after.
  const support = useSyncExternalStore<SupportReport | null>(
    NEVER_CHANGES,
    getSupport,
    SERVER_SNAPSHOT,
  );

  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStatus({ state: "working", phase: "loading-engine" });
    try {
      // From here the bytes belong to the worker. `arrayBuffer()` gives us a
      // fresh copy that `inspect` immediately transfers away.
      const bytes = await file.arrayBuffer();
      const summary = await inspect(bytes, {
        onProgress: (phase) => setStatus({ state: "working", phase }),
      });
      setStatus({ state: "done", summary });
    } catch (error) {
      const kind = error instanceof EngineError ? error.errorKind : "unsupported";
      setStatus({ state: "failed", message: ERROR_TEXT[kind] ?? ERROR_TEXT.unsupported });
    }
  }, []);

  if (support && !support.supported) {
    return (
      <section
        data-testid="unsupported"
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-current/20 p-6"
      >
        <h2 className="font-medium">RedactNest cannot run in this browser</h2>
        {support.missing.map((gap) => (
          <p key={gap} className="text-sm opacity-80">
            {SUPPORT_GAP_TEXT[gap]}
          </p>
        ))}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div
        data-testid="drop-area"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
          warmEngine();
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onPointerEnter={warmEngine}
        className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-current" : "border-current/30"
        }`}
      >
        <p className="text-sm opacity-80">
          Drop a PDF here, or choose one. Up to {config.freePageCap} pages for now.
        </p>

        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept="application/pdf"
          className="sr-only"
          onFocus={warmEngine}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <button
          type="button"
          data-testid="choose-file"
          onFocus={warmEngine}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-md border border-current/40 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Choose a PDF
        </button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {status.state === "working" && (
          <p data-testid="progress">{PHASE_TEXT[status.phase]}…</p>
        )}

        {status.state === "failed" && (
          <p data-testid="error" role="alert">
            {status.message}
          </p>
        )}

        {status.state === "done" && (
          <div className="flex flex-col gap-1">
            <p data-testid="page-count">
              Opened. {status.summary.pageCount}{" "}
              {status.summary.pageCount === 1 ? "page" : "pages"}.
            </p>
            <p data-testid="text-layer-count" className="opacity-80">
              {status.summary.pagesWithText.filter(Boolean).length} of{" "}
              {status.summary.pageCount} have a text layer.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
