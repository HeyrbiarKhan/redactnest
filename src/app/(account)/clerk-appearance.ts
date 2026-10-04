/**
 * Clerk's prebuilt sign in and sign up, themed from our tokens. Spec 0012,
 * AC-8, and spec 0003 (light only, Inter only).
 *
 * Every colour is one of the tokens in `src/app/globals.css`, passed as a CSS
 * variable so the tokens stay defined once (spec 0003, INV-1). Clerk derives
 * its hover and border shades from these, so the components follow the
 * product's palette without a second copy of it. Whether Clerk accepts CSS
 * variables here was task 1's check, recorded in the spec's `rationale.md`.
 */

/**
 * Clerk's text links, given the look of `Button`'s link variant. Links are
 * always underlined, so none is told apart by colour alone (spec 0003,
 * INV-8), and Clerk's are not by default.
 *
 * A style object, not utility classes: Clerk's own style is unlayered and sets
 * `text-decoration: none`, which beats anything in Tailwind's layers, while an
 * object joins Clerk's style after its own rules. The colour is
 * `accent-strong` in every state, as for all teal text, because Clerk shades
 * the primary colour lighter on hover and darker while pressed, and `accent`
 * already falls short on Clerk's `subtle` footer band (4.43:1, spec 0003's
 * contrast contract).
 */
const LINK = Object.freeze({
  color: "var(--color-accent-strong)",
  textDecorationLine: "underline",
  textDecorationThickness: "1px",
  textUnderlineOffset: "4px",
  "&:hover": Object.freeze({
    color: "var(--color-accent-strong)",
    textDecorationLine: "underline",
    textDecorationThickness: "2px",
  }),
  "&:active": Object.freeze({ color: "var(--color-accent-strong)" }),
});

export const CLERK_APPEARANCE = Object.freeze({
  variables: Object.freeze({
    colorPrimary: "var(--color-accent)",
    colorPrimaryForeground: "var(--color-on-accent)",
    colorDanger: "var(--color-danger-ink)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-ink-muted)",
    colorMuted: "var(--color-subtle)",
    colorNeutral: "var(--color-ink)",
    colorBackground: "var(--color-surface)",
    colorInput: "var(--color-surface)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-border)",
    colorRing: "var(--color-focus)",
    fontFamily: "var(--font-sans)",
    fontSize: "1rem",
    borderRadius: "0.5rem",
  }),
  // The footer's "Sign up" or "Sign in", and the code step's "Didn't receive a
  // code? Resend".
  elements: Object.freeze({
    footerActionLink: LINK,
    formResendCodeLink: LINK,
  }),
});
