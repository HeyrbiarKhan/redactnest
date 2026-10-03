/**
 * The Clerk backend client and the Polar client, built once from the billing
 * configuration. Spec 0012, *Security model*.
 *
 * The only place the two secrets (`CLERK_SECRET_KEY`, `POLAR_ACCESS_TOKEN`)
 * are consumed. Both clients are `null` when billing is off on this build, and
 * building one makes no network call. Module level and deliberate: one client
 * of each per server instance, which is what both SDKs expect.
 */

import "server-only";

import { createClerkClient } from "@clerk/backend";
import { createPolar } from "@polar-sh/sdk/2026-10";

import { config } from "@/config";
import { billing } from "@/config/billing";

import type { BillingSeams } from "./entitlement";
import type { CheckoutRequest } from "./subscribe";

/**
 * How long the plan check waits for Polar: well inside the tool's 4 s budget,
 * cold start included, so a slow answer lands as a clear `unknown` from here
 * rather than a vaguer one from the browser's timer. A rule about
 * responsiveness, not a cap on the visitor (spec 0012, *Decided while
 * writing*). Polar's SDK takes seconds.
 */
export const OUTBOUND_TIMEOUT_MS = 1_500;

/** For the account pages' user deletion. Telemetry off, as on the provider. */
export const clerk =
  billing === null
    ? null
    : createClerkClient({
        secretKey: billing.secretKey,
        publishableKey: billing.publishableKey,
        jwtKey: billing.jwtKey,
        telemetry: { disabled: true },
      });

/** Checkout, the portal, the customer state and deletion. */
export const polar =
  billing === null
    ? null
    : createPolar({
        accessToken: billing.polarAccessToken,
        environment: billing.polarEnvironment,
      });

/**
 * What the account pages need from Polar, or `null` with billing off. These
 * calls keep the SDK's own timeout: a person waiting on Subscribe or Account
 * is waiting on that page, not on the tool's budget.
 *
 * The three customer writes and the email search are Subscribe's alone, for
 * tying the customer before checkout (AC-25). Each passes only what it is
 * given, so INV-3's test can hold that Polar sees the session's user and
 * nobody else.
 */
export function accountSeams() {
  if (billing === null || polar === null) return null;
  const client = polar;
  const site = config.siteUrl;
  return Object.freeze({
    proBenefitId: billing.proBenefitId,
    proProductId: billing.proProductId,
    siteUrl: site,
    getStateExternal: (externalId: string) =>
      client.customers.getStateExternal(externalId),
    findCustomersByEmail: (email: string) => client.customers.list({ email }),
    setExternalId: (customerId: string, externalId: string) =>
      client.customers.update(customerId, { external_id: externalId }),
    createCustomer: (body: { readonly email: string; readonly external_id: string }) =>
      client.customers.create({ email: body.email, external_id: body.external_id }),
    createCheckout: (body: CheckoutRequest) =>
      client.checkouts.create({ ...body, products: [...body.products] }),
  });
}

/**
 * What `resolveEntitlement` needs from the real world, or `null` with billing
 * off. The one outbound call is bound to `OUTBOUND_TIMEOUT_MS` here.
 */
export function entitlementSeams(): BillingSeams | null {
  if (billing === null || polar === null) return null;
  const client = polar;
  return Object.freeze({
    publishableKey: billing.publishableKey,
    jwtKey: billing.jwtKey,
    issuer: `https://${billing.frontendApi}`,
    authorizedParty: new URL(config.siteUrl).origin,
    now: Date.now,
    proBenefitId: billing.proBenefitId,
    proProductId: billing.proProductId,
    getStateExternal: (externalId: string) =>
      client.customers.getStateExternal(externalId, {
        timeout: OUTBOUND_TIMEOUT_MS / 1000,
      }),
  });
}
