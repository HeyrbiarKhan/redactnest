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
 * `danger` callout or a `danger-ink` line, never a red button.
 */
export type ButtonVariant =
  "primary" | "secondary" | "link" | "danger" | "danger-secondary";
export type ButtonSize = "md" | "lg";

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
};

type AsLink = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  keyof ButtonOwnProps | "href"
> & {
  readonly href: string;
  readonly reload?: undefined;
  readonly busy?: undefined;
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
};

export type ButtonProps = ButtonOwnProps & (AsButton | AsLink | AsPageLoad);

/**
 * The filled and outlined shapes share a box. The edge on `primary` is
 * transparent rather than absent, because forced colours mode paints every
 * border in a system colour: a transparent one becomes the button's outline
 * there, where the fill it relied on is gone (AC-17).
 */
const BOX = "inline-flex items-center justify-center gap-2 rounded-lg border text-center";

/** One disabled look for every boxed variant, the danger ones included (AC-35). */
const BOX_DISABLED = "disabled:border-border disabled:bg-subtle disabled:text-ink-muted";

/**
 * How each variant looks at rest and disabled. The red ones take `danger-ink`
 * for the fill, the edge and the words, the one danger token that already
 * clears 4.5:1 as text, and white words on the fill are `on-accent`, the same
 * white (spec 0013, AC-35). The focus ring stays today's, because its offset
 * puts it on the card's `surface`, never on the red.
 */
const VARIANT: Readonly<Record<ButtonVariant, string>> = Object.freeze({
  primary: cx(BOX, "border-transparent bg-accent text-on-accent", BOX_DISABLED),
  secondary: cx(BOX, "border-accent bg-surface text-accent-strong", BOX_DISABLED),
  // Always underlined, so a link is never told apart by colour alone (INV-8).
  link: cx(
    "inline-flex items-center gap-1.5 rounded-sm text-accent-strong",
    "underline decoration-1 underline-offset-4",
    "disabled:text-ink-muted",
  ),
  danger: cx(BOX, "border-transparent bg-danger-ink text-on-accent", BOX_DISABLED),
  "danger-secondary": cx(
    BOX,
    "border-danger-ink bg-surface text-danger-ink",
    BOX_DISABLED,
  ),
});

/**
 * Under the pointer, kept apart so a busy button can leave it off and keep its
 * rest colours, since it will take no press (spec 0013, AC-34).
 */
const HOVER: Readonly<Record<ButtonVariant, string>> = Object.freeze({
  primary: "hover:bg-accent-strong",
  secondary: "hover:bg-accent-soft",
  link: "hover:decoration-2",
  danger: "hover:bg-danger-strong",
  "danger-secondary": "hover:bg-danger-bg",
});

/**
 * Heights are minimums, never fixed, so a visitor's text spacing override grows
 * the button rather than clipping its label (WCAG 1.4.12). 40px and 48px clear
 * the 24px target floor with room to spare (AC-7). The padding keeps the
 * natural height under each minimum (38px at `md`, 46px at `lg`, counting the
 * border), so the minimum is the height, not a floor it outgrows.
 */
const BOXED_SIZE: Readonly<Record<ButtonSize, string>> = Object.freeze({
  md: "min-h-10 px-4 py-2 text-small font-medium",
  lg: "min-h-12 px-6 py-2.5 text-body font-semibold",
});

const SIZE: Readonly<Record<ButtonVariant, Readonly<Record<ButtonSize, string>>>> =
  Object.freeze({
    primary: BOXED_SIZE,
    secondary: BOXED_SIZE,
    // As tall as the other variants, so a link style button beside one (Start
    // over in the file bar) is as easy a target and lines up with it (AC-7).
    link: Object.freeze({
      md: "min-h-10 text-small font-medium",
      lg: "min-h-12 text-body font-medium",
    }),
    danger: BOXED_SIZE,
    "danger-secondary": BOXED_SIZE,
  });

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
  size = "md",
  fullWidth = false,
  icon: Icon,
  busy = false,
  className,
  children,
  ...native
}: ButtonProps) {
  const classes = cx(
    VARIANT[variant],
    !busy && HOVER[variant],
    SIZE[variant][size],
    // Fill and edge only. `transition-colors` fades `outline-color` too, so the
    // focus ring would arrive in the text colour, white on a filled button (AC-6).
    "transition-[background-color,border-color] duration-150 motion-reduce:transition-none",
    fullWidth && "w-full",
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
      aria-disabled={busy || button["aria-disabled"]}
      type={type}
      onClick={busy ? dropPress : onClick}
      className={classes}
    >
      {content}
    </button>
  );
}
