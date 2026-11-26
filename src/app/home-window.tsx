import { countText } from "@/lib/count-text";
import { cx } from "@/lib/cx";
import { DETECTOR_LABELS } from "@/lib/detectors";
import { FOUND_ITEMS_TITLE, LOCK_LINE, redactLabel } from "@/lib/flow-text";
import { HOME_TEXT } from "@/lib/home-text";

/**
 * The hero's product window (spec 0026, AC-8, as the owner's port of
 * `Main.dc.html` amends it, 2026-11-25): the tool reviewing a made up
 * agreement, drawn in HTML in place of the screenshot. On the left the page,
 * its email and phone already blacked out and one address highlighted as the
 * tool marks a found value; on the right the Found items card, its groups
 * ticked, the Redact button and the lock line.
 *
 * One picture to assistive technology (`role="img"`, named by `shotAlt`), so
 * its drawn words are never read out one by one. The made up values come
 * from `HOME_TEXT.window`; every word the tool itself shows is the tool's own
 * (`DETECTOR_LABELS`, `FOUND_ITEMS_TITLE`, `redactLabel`, `LOCK_LINE`), so the
 * drawing says nothing the tool does not. Every word is at least 14 pixels
 * (spec 0003, INV-6), where the mockup draws 10 to 13. The black boxes are
 * `ink` fills with no words under them.
 *
 * It keeps its own colours in forced colours mode, as the screenshot it
 * replaces did: it is a picture, and there the fills would drop and take the
 * black boxes and the highlight with them.
 */
export function HomeWindow() {
  const drawn = HOME_TEXT.window;
  const found = drawn.groups.reduce((sum, group) => sum + group.count, 0);
  const ticked = drawn.groups.reduce(
    (sum, group) => sum + (group.ticked ? group.count : 0),
    0,
  );

  return (
    <div
      role="img"
      aria-label={HOME_TEXT.shotAlt}
      data-testid="home-window"
      className="@container overflow-hidden rounded-window border border-border bg-surface shadow-window forced-color-adjust-none"
    >
      <div className="flex min-h-10 items-center gap-2 border-b border-muted bg-subtle px-3.5 py-2">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2.5 shrink-0 rounded-full bg-border" />
        ))}
        <span className="ms-3 min-w-0 text-small text-ink-subtle wrap-anywhere">
          {drawn.file}
        </span>
      </div>

      {/*
        The page and the Found items card side by side once the window is
        30rem wide, as drawn at 1440 pixels (34rem); narrower, on a phone or
        at 200% text, one under the other, every word free to break, so
        nothing spills (spec 0024, AC-14).
      */}
      <div className="grid grid-cols-1 bg-muted @min-[30rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-5.5">
          <div className="flex flex-col gap-2.25 rounded-[0.375rem] bg-surface px-5 py-5.5 text-small text-ink-soft shadow-page wrap-anywhere">
            <p className="font-bold text-ink">{drawn.title}</p>
            <Bar width="w-[92%]" />
            <Bar width="w-[70%]" />
            <p className="mt-1.5">{drawn.lines.name}</p>
            <p className="flex flex-wrap items-center gap-1">
              {drawn.lines.email}
              <Blackout width="w-[6.6em]" />
            </p>
            <p className="flex flex-wrap items-center gap-1">
              {drawn.lines.phone}
              <Blackout width="w-[4.8em]" />
            </p>
            <Bar width="mt-1.5 w-[86%]" />
            <Bar width="w-[94%]" />
            <Bar width="w-[60%]" />
            <p>
              {drawn.lines.pay}{" "}
              <span className="rounded-[0.125rem] bg-accent-soft px-0.75 text-ink outline-[1.5px] outline-accent-bright">
                {drawn.found}
              </span>
            </p>
            <Bar width="w-[80%]" />
            <Bar width="w-[52%]" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-border bg-surface p-4.5 text-small wrap-anywhere @min-[30rem]:border-t-0 @min-[30rem]:border-l">
          <p className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">{FOUND_ITEMS_TITLE}</span>
            <span className="text-ink-subtle">{countText(found)}</span>
          </p>
          <ul className="flex flex-col gap-0.5">
            {drawn.groups.map((group, index) => (
              <li
                key={group.kind}
                className={cx(
                  "flex items-center gap-2 rounded-item px-2 py-1.75",
                  index === 0 && "bg-accent-faint",
                )}
              >
                <span
                  className={cx(
                    "size-3.5 shrink-0 rounded-[0.25rem]",
                    group.ticked ? "bg-accent" : "border-[1.5px] border-border-soft",
                  )}
                />
                <span
                  className={cx(
                    "min-w-0 font-medium",
                    group.ticked ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {DETECTOR_LABELS[group.kind].label}
                </span>
                <span className="ms-auto text-ink-subtle">{countText(group.count)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto flex min-h-9 items-center justify-center rounded-item bg-accent px-3 text-center font-semibold text-on-accent">
            {redactLabel(ticked)}
          </p>
          <p className="text-center text-ink-subtle">{LOCK_LINE}</p>
        </div>
      </div>
    </div>
  );
}

/** A grey line standing for a line of text on the drawn page. */
function Bar({ width }: { readonly width: string }) {
  return <span className={cx("block h-2 rounded-[0.25rem] bg-border", width)} />;
}

/** A blacked out value on the drawn page: a filled box, no words under it. */
function Blackout({ width }: { readonly width: string }) {
  return (
    <span
      className={cx(
        "inline-block h-[1.15em] max-w-full rounded-[0.125rem] bg-ink",
        width,
      )}
    />
  );
}
