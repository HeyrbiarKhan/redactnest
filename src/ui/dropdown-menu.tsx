"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

/** One way out of the menu: a plain `a`, never `next/link` (spec 0012, INV-13). */
export interface DropdownMenuLink {
  readonly kind: "link";
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /**
   * Opens in a new tab, so a document open on `/tool` stays open. The words
   * are the caller's (`NEW_TAB` in `flow-text.ts`), read in brackets after the
   * label, as the plan card on `/tool` reads them.
   */
  readonly newTab?: string;
  readonly "data-testid"?: string;
}

export interface DropdownMenuSeparator {
  readonly kind: "separator";
}

export type DropdownMenuEntry = DropdownMenuLink | DropdownMenuSeparator;

interface DropdownMenuProps {
  /** What the trigger button shows, usually an `Avatar`. */
  readonly trigger: ReactNode;
  /** The trigger's accessible name, such as "Your account". */
  readonly triggerLabel: string;
  /** A block above the items, such as who is signed in and on what plan. */
  readonly header?: ReactNode;
  readonly entries: readonly DropdownMenuEntry[];
  readonly "data-testid"?: string;
}

const ITEM =
  "flex min-h-10 items-center gap-3 rounded-item px-3 py-2 text-small text-ink outline-offset-0 transition-[background-color] data-highlighted:bg-muted";

/**
 * The account menu (spec 0026, AC-4 and AC-23). Radix owns the keyboard: the
 * arrow keys, typeahead, Escape, and focus returning to the trigger on close.
 *
 * Never modal (`modal={false}`), so it never sets `aria-hidden` on the rest of
 * the page and `/tool`'s polite regions keep announcing while it is open. It
 * opens with a fade and a 4 pixel rise (`animate-rise-in`), which the one
 * reduced motion rule in `globals.css` turns into an instant change.
 *
 * Presentation only: the caller passes every word, path and icon.
 */
export function DropdownMenu({
  trigger,
  triggerLabel,
  header,
  entries,
  "data-testid": testId,
}: DropdownMenuProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={triggerLabel}
        data-testid={testId}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full"
      >
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 flex w-72 max-w-[calc(100vw-1rem)] animate-rise-in flex-col rounded-card border border-border bg-surface p-1.5 shadow-popover"
        >
          {header !== undefined && (
            <>
              <div className="px-3 py-2.5">{header}</div>
              <Menu.Separator className="mx-1.5 my-1 h-px bg-border" />
            </>
          )}
          {entries.map((entry, at) =>
            entry.kind === "separator" ? (
              <Menu.Separator
                key={`separator-${at}`}
                className="mx-1.5 my-1 h-px bg-border"
              />
            ) : (
              <Fragment key={entry.href}>
                <Menu.Item asChild>
                  <a
                    href={entry.href}
                    data-testid={entry["data-testid"]}
                    className={ITEM}
                    {...(entry.newTab !== undefined
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    <entry.icon
                      aria-hidden="true"
                      className="size-4.5 shrink-0 text-ink-muted"
                      strokeWidth={1.75}
                    />
                    <span>
                      {entry.label}
                      {entry.newTab !== undefined && (
                        <>
                          {" "}
                          <span className="sr-only">{`(${entry.newTab})`}</span>
                        </>
                      )}
                    </span>
                  </a>
                </Menu.Item>
              </Fragment>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
