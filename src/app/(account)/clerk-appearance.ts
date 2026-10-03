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
  // Links are always underlined, so none is told apart by colour alone (spec
  // 0003, INV-8). Clerk's own footer links ("Sign up", "Sign in") are not by
  // default, so they take the underline here, as token free utility classes.
  elements: Object.freeze({
    footerActionLink: "underline underline-offset-2",
  }),
});
