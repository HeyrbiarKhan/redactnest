/**
 * The source link the browser tests build with, defined once.
 *
 * A production build refuses any link that is not one commit's tree (spec
 * 0009, AC-6), so this is a full 40 character commit on a host nothing else
 * would produce. `playwright.config.ts` builds with it and the specs assert
 * it, so a hardcoded repository link anywhere fails the footer test.
 */
export const SOURCE_URL =
  "https://example.invalid/redactnest/tree/0123456789abcdef0123456789abcdef01234567";

/**
 * A fake but complete and consistent billing set, so the browser tests build
 * with billing on and see the real shape (spec 0012, *Decided while writing*).
 * Every value passes `src/config/billing.ts`: test Clerk keys naming a
 * development host, the Polar sandbox, and a real PEM public key whose private
 * half was thrown away when it was made. Nothing here reaches Clerk or Polar,
 * because anonymous visitors make no outbound call (INV-4), and the secrets
 * open nothing. Set explicitly so `.env.local` on a developer's machine can
 * never put real keys into a test build.
 */
export const BILLING_ENV = Object.freeze({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    "pk_test_cmVkYWN0bmVzdC1lMmUtMDAuY2xlcmsuYWNjb3VudHMuZGV2JA==",
  CLERK_SECRET_KEY: "sk_test_e2e0000000000000000000000000000000000",
  CLERK_JWT_KEY: [
    "-----BEGIN PUBLIC KEY-----",
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqoEppzjgBiu7u5v56ykx",
    "xibK6Z28UK6UEDI01uCwApqrfT0/qrtJt5gm2jxA1QLPW5BVhjXJkQyhIVV2TzwB",
    "BNLbDiyLjW68FU5MpTYOM6FNcWbSpoIQFe1/pHz2Y6Tvw7WdaawtH3KPDQT6Ai7e",
    "/uoTPczKofO86m3xpXTOpVY1bhA+uOmHIQs95EI7pIBquAhoB+yB9H82NFSmjyiO",
    "DFn+5NKVJqEqKclbROjXvjTL4gBUkfF9XZThuF0DkzM9dmn3Fd54JKLCe/1apt1S",
    "506aKd0QaYtPo381E+tA0lMvOTPBOJTDcI1PHN5uhuCddfS2Q+FWIoyOE/SoY26C",
    "kQIDAQAB",
    "-----END PUBLIC KEY-----",
  ].join("\n"),
  POLAR_ACCESS_TOKEN: "polar_oat_e2e000000000000000000000000000",
  POLAR_ENVIRONMENT: "sandbox",
  POLAR_PRO_PRODUCT_ID: "00000000-0000-4000-8000-0000000e2e01",
  POLAR_PRO_BENEFIT_ID: "00000000-0000-4000-8000-0000000e2e02",
});
