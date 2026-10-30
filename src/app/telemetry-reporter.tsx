"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { report } from "@/telemetry/client";
import { pageKindFor, type PageKind } from "@/telemetry/events";

/**
 * Whether an error came from a script on this page's own origin (AC-17). A
 * browser extension's script (`chrome-extension://…`) and a muted error with
 * no file name are someone else's, so they are never reported.
 */
export function isOwnScript(filename: string, origin: string): boolean {
  try {
    return new URL(filename).origin === origin;
  } catch {
    return false;
  }
}

/**
 * The root layout's reporter. Spec 0016, AC-10 and AC-17.
 *
 * A `page-view` with the page's kind on every page load and every client
 * side pathname change, from the pathname alone, never the query or the hash.
 * And a `browser-crash` for an error thrown by our own scripts or a promise
 * rejected with nobody listening. The message, file name, line and stack are
 * read only for the origin test and never sent: a report says what kind of
 * failure and on which kind of page, and nothing else (claim C15).
 *
 * Renders nothing. A file such as `/licence.txt` is served without this
 * layout, so it sends nothing.
 */
export function TelemetryReporter(): null {
  const pathname = usePathname();
  const pageRef = useRef<PageKind>(pageKindFor(pathname));

  useEffect(() => {
    const page = pageKindFor(pathname);
    pageRef.current = page;
    report({ name: "page-view", page });
  }, [pathname]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isOwnScript(event.filename, window.location.origin)) return;
      report({ name: "browser-crash", page: pageRef.current, kind: "error" });
    };
    const onRejection = () => {
      report({ name: "browser-crash", page: pageRef.current, kind: "rejection" });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
