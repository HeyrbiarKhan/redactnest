import { cva } from "class-variance-authority";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  MouseEvent,
  ReactNode,
} from "react";

import { cx } from "@/lib/cx";

import { Spinner } from "./spinner";

/**
 * `danger` and `danger-secondary` are for destroying an account and nothing
 * else (spec 0013, INV-12): `danger` for the step that destroys it, and
 * `danger-secondary` for the button that opens that step. A failure stays a
 * `danger` callout or a `danger-ink` line, never a red button. `ghost` is a
 * quiet action with no edge until the pointer is on it (Sign in, Start over);
 * `link` is an action drawn as an underlined link (spec 0026, AC-4).
 */
export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "link" | "danger" | "danger-secondary";
export type ButtonSize = "default" | "lg" | "xl" | "icon";

interface ButtonOwnProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  /** Drawn before the label and hidden from assistive technology. */
  readonly icon?: LucideIcon;
  /** Layout only (margins, alignment, placement). Never colour or size. */
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * With a ref, so a page can move focus to the button that replaces the one
 * that just went (spec 0007, *Focus*). React 19 passes `ref` as a prop.
 */
type AsButton = Omit<ComponentPropsWithRef<"button">, keyof ButtonOwnProps> & {
  readonly href?: undefined;
  readonly reload?: undefined;
  /**
   * The button's work keeps the visitor waiting (spec 0013, AC-34). It shows
   * a spinner in place of `icon`, keeps its rest colours under the pointer,
   * and drops every press before `onClick`. It is `aria-disabled`, never
   * `disabled`, because a disabled button drops focus to the page, and the
   * visitor should stay where they pressed. The caller passes the working
   * words as `children`, so the name is what the button shows (WCAG 2.5.3).
   */
  readonly busy?: boolean;
  /**
   * The button cannot act yet, for a reason the caller says beside it and
   * names in `aria-describedby` (spec 0017, AC-18). It stays in place and in
   * the tab order, `aria-disabled` rather than `disabled`, takes the disabled
   * look every control shares, and drops every press before `onClick`.
   */
  readonly unavailable?: boolean;
};

type AsLink = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  keyof ButtonOwnProps | "href"
> & {
  readonly href: string;
  readonly reload?: undefined;
  readonly busy?: undefined;
  readonly unavailable?: undefined;
};

/**
 * A plain `a`, so following it is a real page load (spec 0003, AC-21). Typed
 * as plain anchor props, so `next/link`'s `prefetch`, `replace` and `scroll`
 * are refused here rather than silently ignored.
 */
type AsPageLoad = Omit<ComponentPropsWithoutRef<"a">, keyof ButtonOwnProps | "href"> & {
  readonly href: string;
  readonly reload: true;
  readonly busy?: undefined;
  readonly unavailable?: undefined;
};

export type ButtonProps = ButtonOwnProps & (AsButton | AsLink | AsPageLoad);

/** What the button looks like: one of the variants, or the disabled look an unavailable one takes. */
type Look = ButtonVariant | "unavailable" | "unavailable-link";

/**
 * The button's classes, by look, size and whether the pointer may change it
 * (spec 0026, AC-4). Every class is a token utility. The boxed looks share one
 * box; the edge on a filled one is transparent rather than absent, because
 * forced colours mode paints every border in a system colour, so a
 * transparent one becomes the button's outline there, where the fill it
 * relied on is gone (spec 0003, AC-17). Fill, edge and ink only fade, never
 * `transition-colors`, which also fades `outline-color` and would bring the
 * focus ring in the text colour (spec 0003, AC-6).
 */
const buttonClasses = cva("transition-[background-color,border-color,color]", {
  variants: {
    look: {
      primary: "border-transparent bg-accent text-on-accent shadow-card",
      secondary: "border-border bg-surface text-ink shadow-card",
      ghost: "border-transparent bg-transparent text-ink",
      // Always underlined, so a link is never told apart by colour alone (INV-8).
      link: "text-accent-strong underline decoration-1 underline-offset-4 disabled:text-ink-muted",
      // `danger-ink` for the fill, the edge and the words, the one danger
      // token that clears 4.5:1 as text; white words are `on-accent`, the same
      // white (spec 0013, AC-35).
      danger: "border-transparent bg-danger-ink text-on-accent",
      "danger-secondary": "border-danger-ink bg-surface text-danger-ink",
      // The disabled look without the `disabled:` prefix, since an
      // unavailable button is never `disabled` (spec 0017, AC-18).
      unavailable: "border-border bg-subtle text-ink-muted",
      "unavailable-link": "text-ink-muted underline decoration-1 underline-offset-4",
    },
    shape: {
      box: "inline-flex items-center justify-center gap-2 rounded-control border text-center font-semibold",
      text: "inline-flex items-center gap-1.5 rounded-item font-medium",
    },
    /**
     * Heights are minimums, never fixed, so a visitor's text spacing override
     * grows the button rather than clipping its label (WCAG 1.4.12). 40px and
     * 48px clear the 24px target floor with room to spare (spec 0003, AC-7).
     */
    size: {
      default: "min-h-10 text-small",
      lg: "min-h-12 text-body",
      // The home page's 50 pixel buttons, 22 pixels in from each side
      // (`Main.dc.html`): the hero's two and the closing card's.
      xl: "min-h-12.5 text-body",
      // A 40 pixel square for a button whose words are visually hidden, such
      // as the header's menu button (spec 0026, child 0001, AC-27).
      icon: "min-h-10 min-w-10 text-small",
    },
    /** Under the pointer. A busy or unavailable button keeps its rest colours (spec 0013, AC-34). */
    hover: { true: "", false: "" },
    fullWidth: { true: "w-full", false: "" },
  },
  compoundVariants: [
    // One disabled look for every boxed variant, the danger ones included (spec 0013, AC-35).
    {
      shape: "box",
      look: ["primary", "secondary", "ghost", "danger", "danger-secondary"],
      class:
        "disabled:border-border disabled:bg-subtle disabled:text-ink-muted disabled:shadow-none",
    },
    { shape: "box", size: "default", class: "px-4 py-2" },
    { shape: "box", size: "lg", class: "px-6 py-2.5" },
    { shape: "box", size: "xl", class: "px-5.5 py-2.5" },
    { shape: "box", size: "icon", class: "p-2" },
    { hover: true, look: "primary", class: "hover:bg-accent-strong" },
    { hover: true, look: ["secondary", "ghost"], class: "hover:bg-muted" },
    { hover: true, look: "link", class: "hover:decoration-2" },
    { hover: true, look: "danger", class: "hover:bg-danger-strong" },
    { hover: true, look: "danger-secondary", class: "hover:bg-danger-bg" },
  ],
});

function lookOf(variant: ButtonVariant, unavailable: boolean): Look {
  if (!unavailable) return variant;
  return variant === "link" ? "unavailable-link" : "unavailable";
}

/** A busy button's answer to every press: nothing, not even a form submit. */
function dropPress(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/**
 * A real `button`, or a real link when it navigates (INV-4). Never a `div`, and
 * never a link that acts.
 */
export function Button({
  variant = "primary",
  size = "default",
  fullWidth = false,
  icon: Icon,
  busy = false,
  unavailable = false,
  className,
  children,
  ...native
}: ButtonProps) {
  const classes = cx(
    buttonClasses({
      look: lookOf(variant, unavailable),
      shape: variant === "link" ? "text" : "box",
      size,
      hover: !busy && !unavailable,
      fullWidth,
    }),
    className,
  );

  // The spinner takes the icon's place, in the button's own text colour, so
  // it adds no colour pair (spec 0013, AC-34).
  const content = (
    <>
      {busy ? (
        <Spinner size="sm" tone="current" />
      ) : (
        Icon && <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
      )}
      {children}
    </>
  );

  if (native.reload) {
    // `reload` changes only the navigation, never the look, and it is not an
    // attribute, so it stops here rather than reaching the element.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled off so it is not spread
    const { reload: _reload, ...anchor } = native;
    return (
      <a {...anchor} className={classes}>
        {content}
      </a>
    );
  }

  if (native.href !== undefined) {
    return (
      <Link {...native} className={classes}>
        {content}
      </Link>
    );
  }

  // `type="button"` unless told otherwise, so a button inside a form never
  // submits it by accident.
  const { type = "button", onClick, ...button } = native;
  return (
    <button
      {...button}
      aria-disabled={busy || unavailable || button["aria-disabled"]}
      type={type}
      onClick={busy || unavailable ? dropPress : onClick}
      className={classes}
    >
      {content}
    </button>
  );
}
