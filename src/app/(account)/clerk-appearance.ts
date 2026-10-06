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

/**
 * Where a field shows our edge: at rest and on hover, never while focused or
 * marked invalid, so Clerk's focus ring and its `danger-ink` error edge still
 * show. The two `:not`s also outrank Clerk's own `:hover` rule, which would
 * otherwise shade the edge back to its faint grey.
 *
 * Clerk marks the two states differently on each element, as the sandbox
 * showed (spec 0013, task 26). The email field is a real `input`, so it is
 * focused when `:focus` matches. Each code box is a `div` drawn over one
 * hidden `input`, which `:focus` never matches, so Clerk marks the box it is
 * filling with `data-focus-within="true"` and rings it by that. Both carry
 * `aria-invalid`, "true" after a wrong code.
 */
export const FIELD_AT_REST = '&:not(:focus):not([aria-invalid="true"])';
export const CODE_BOX_AT_REST =
  '&:not([data-focus-within="true"]):not([aria-invalid="true"])';

/**
 * Our edge: a real 1 pixel border in `border-strong`, never a box shadow,
 * because forced colours drops shadows and would leave the field with no edge
 * at all. Clerk draws its own rest edge as a box shadow over a 0 pixel border
 * (the sandbox again), so that shadow goes in the same scope and the edge is
 * never doubled.
 */
const EDGE = Object.freeze({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--color-border-strong)",
  boxShadow: "none",
});

/**
 * Clerk's text fields and code boxes, with an edge a visitor can find them by.
 * Spec 0013, AC-31 (WCAG 2.2, 1.4.11).
 *
 * Clerk's own edge is its shade of `border`, about 1.3:1 on `surface`;
 * `border-strong` is about 3.8:1, a graphic pairing already in the contrast
 * contract. `variables.colorBorder` stays `border`, so the card's own dividers
 * stay quiet. Clerk's interface loads from Clerk's servers, so the element
 * names, the attributes and the edge property were confirmed in the sandbox
 * rather than in `node_modules`.
 */
const FIELD = Object.freeze({ [FIELD_AT_REST]: EDGE });
const CODE_BOX = Object.freeze({ [CODE_BOX_AT_REST]: EDGE });

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
  /*
   * No logo in Clerk's card (spec 0013, AC-23): the panel beside it carries the
   * brand, and the header's lockup is the way home. This Clerk (Core 3) takes
   * `options.logoPlacement`, which earlier versions called `layout`, and it
   * accepts "none", so no style has to hide a logo box. The Dashboard holds no
   * logo either (spec 0012, Go live step 6), so none is ever requested.
   */
  options: Object.freeze({ logoPlacement: "none" as const }),
  elements: Object.freeze({
    // The footer's "Sign up" or "Sign in", and the code step's "Didn't receive
    // a code? Resend".
    footerActionLink: LINK,
    formResendCodeLink: LINK,
    // The email field, and each box of the emailed code.
    formFieldInput: FIELD,
    otpCodeFieldInput: CODE_BOX,
  }),
});
