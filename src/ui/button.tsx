import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "link";
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
};

type AsLink = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  keyof ButtonOwnProps | "href"
> & {
  readonly href: string;
  readonly reload?: undefined;
};

/**
 * A plain `a`, so following it is a real page load (spec 0003, AC-21). Typed
 * as plain anchor props, so `next/link`'s `prefetch`, `replace` and `scroll`
 * are refused here rather than silently ignored.
 */
type AsPageLoad = Omit<ComponentPropsWithoutRef<"a">, keyof ButtonOwnProps | "href"> & {
  readonly href: string;
  readonly reload: true;
};

export type ButtonProps = ButtonOwnProps & (AsButton | AsLink | AsPageLoad);

/**
 * The filled and outlined shapes share a box. The edge on `primary` is
 * transparent rather than absent, because forced colours mode paints every
 * border in a system colour: a transparent one becomes the button's outline
 * there, where the fill it relied on is gone (AC-17).
 */
const BOX = "inline-flex items-center justify-center gap-2 rounded-lg border text-center";

const VARIANT: Readonly<Record<ButtonVariant, string>> = Object.freeze({
  primary: cx(
    BOX,
    "border-transparent bg-accent text-on-accent hover:bg-accent-strong",
    "disabled:border-border disabled:bg-subtle disabled:text-ink-muted",
  ),
  secondary: cx(
    BOX,
    "border-accent bg-surface text-accent-strong hover:bg-accent-soft",
    "disabled:border-border disabled:bg-subtle disabled:text-ink-muted",
  ),
  // Always underlined, so a link is never told apart by colour alone (INV-8).
  link: cx(
    "inline-flex items-center gap-1.5 rounded-sm text-accent-strong",
    "underline decoration-1 underline-offset-4 hover:decoration-2",
    "disabled:text-ink-muted",
  ),
});

/**
 * Heights are minimums, never fixed, so a visitor's text spacing override grows
 * the button rather than clipping its label (WCAG 1.4.12). 40px and 48px clear
 * the 24px target floor with room to spare (AC-7). The padding keeps the
 * natural height under each minimum (38px at `md`, 46px at `lg`, counting the
 * border), so the minimum is the height, not a floor it outgrows.
 */
const SIZE: Readonly<Record<ButtonVariant, Readonly<Record<ButtonSize, string>>>> =
  Object.freeze({
    primary: Object.freeze({
      md: "min-h-10 px-4 py-2 text-small font-medium",
      lg: "min-h-12 px-6 py-2.5 text-body font-semibold",
    }),
    secondary: Object.freeze({
      md: "min-h-10 px-4 py-2 text-small font-medium",
      lg: "min-h-12 px-6 py-2.5 text-body font-semibold",
    }),
    // As tall as the other variants, so a link style button beside one (Start
    // over in the file bar) is as easy a target and lines up with it (AC-7).
    link: Object.freeze({
      md: "min-h-10 text-small font-medium",
      lg: "min-h-12 text-body font-medium",
    }),
  });

/**
 * A real `button`, or a real link when it navigates (INV-4). Never a `div`, and
 * never a link that acts.
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon: Icon,
  className,
  children,
  ...native
}: ButtonProps) {
  const classes = cx(
    VARIANT[variant],
    SIZE[variant][size],
    // Fill and edge only. `transition-colors` fades `outline-color` too, so the
    // focus ring would arrive in the text colour, white on a filled button (AC-6).
    "transition-[background-color,border-color] duration-150 motion-reduce:transition-none",
    fullWidth && "w-full",
    className,
  );

  const content = (
    <>
      {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />}
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
  const { type = "button", ...button } = native;
  return (
    <button {...button} type={type} className={classes}>
      {content}
    </button>
  );
}
