# Polar Billing Integration Research

**Date**: 2026-10-03  
**Context**: Researching Polar's billing API for a Next.js app integrating Polar as payment processor with Clerk auth.

---

## 1. Customer State API

**Endpoint/SDK**: `GET /v1/customers/external/{external_id}/state`  
**Returns**: Comprehensive customer state including:
- Active subscriptions (with product id, status, billing amount, period dates, trial dates if applicable)
- Granted benefits (by type: Discord roles, GitHub access, downloadables, license keys, feature flags, Slack, custom)
- Active meters (consumption tracking with units and balance)
- Customer record (email, creation timestamps, billing address, tax IDs)

**Trialing subscriptions**: YES, included. Status can be `"active"` or `"trialing"`.

**Recommended for entitlement checks**: YES. This endpoint consolidates subscription, benefit, and usage data in one call—ideal for live entitlement verification on each check without webhooks.

**Confidence**: High  
**URL**: https://polar.sh/docs/api-reference/customers/state-external

---

## 2. Benefits: Feature Flag Type

**Type available**: YES—`Feature Flag` benefit type designed for feature gating and entitlement markers.

**When granted/revoked**:
- **Subscriptions**: Granted at start of each subscription cycle. Automatically revoked when subscription is cancelled.
- **One-time purchases**: Granted at purchase with lifetime access.

**Details**: Supports optional key-value metadata (e.g., role, max upload size, priority). Feature Flags are purpose-built for SaaS feature access; Custom benefits (another type) are deprecated for this use case.

**Exact timing relative to "cancellation at period end" vs. immediate revocation**: Not specified in docs. Only confirmed as "revoked when cancelled" without distinguishing cancellation type.

**Confidence**: High  
**URL**: https://polar.sh/docs/features/benefits/feature-flags

---

## 3. API Rate Limits

**Production**: 500 requests per minute per organization/customer or OAuth2 Client  
**Sandbox**: 100 requests per minute per organization/customer or OAuth2 Client  
**Unauthenticated endpoints**: 3 requests per second (both environments)

**Response**: 429 Too Many Requests with `Retry-After` header. Organizations can contact support for elevated limits.

**Confidence**: High  
**URL**: https://polar.sh/docs/api-reference/2026-04/introduction

---

## 4. Checkout Sessions

**SDK call**: `checkouts.create()` with parameters:
- `external_customer_id` (ID in your system)
- `customer_email`
- `products` or `prices`
- `success_url` (with `{CHECKOUT_ID}` placeholder supported)
- Many others: `customer_id`, `seats`, `discount_id`, `custom_field_data`, `allow_trial`, `require_billing_address`

**External ID usage**: Yes. If external_id exists, order links to that customer; otherwise new customer created with this external_id.

**Duplicate email/different external_id**: Not explicitly documented. System prioritizes matching on external_id for linking.

**Preventing duplicate subscriptions to same product**: No built-in mechanism. Must implement at application level.

**Confidence**: High  
**URL**: https://polar.sh/docs/api-reference/checkouts/create-session

---

## 5. Customer Portal

**Creating sessions & URL**: 
- Default URL: `polar.sh/<your-org-slug>/portal`
- Pre-authenticated links can be generated from your app
- Transactional emails include portal links

**What customers can do**:
- View active subscriptions and purchase history
- Download and edit invoices and payment receipts
- Cancel active subscriptions
- Update default payment method
- Access earned benefits (license keys, Discord, etc.)
- Manage seats, pause/resume (if enabled), view usage

**Default cancellation behavior**: Not specified. Portal cancellation is customer-initiated; no automatic/default timing mentioned.

**Confidence**: Medium (portal capabilities confirmed, but session creation API details and cancellation timing not fully documented)  
**URL**: https://polar.sh/docs/features/customer-portal

---

## 6. Checkout Custom Fields

**Supported types**: Text, number, date, checkbox, select.

**Required checkbox**: YES. When made required, customers must check the box before checkout confirmation.

**Label with link**: Not explicitly documented. No mention of HTML or link support in field labels.

**API integration**: Fields set on product during creation/update. Prefill via `custom_field_data` parameter keyed by slug when creating checkout.

**Confidence**: High  
**URL**: https://polar.sh/docs/features/custom-fields

---

## 7. Trials

**Supported**: YES. Trials are built-in subscription feature with proration, dunning, upgrades, downgrades supported.

**Card required**: Not explicitly documented in available fetches.

**Confidence**: Medium (trials confirmed, card requirement not found)  
**URLs**: 
- https://polar.sh/docs/features/products
- Feature mentioned in comparison: https://polar.sh/resources/comparison/stripe

---

## 8. Pricing and Tax

**Merchant of Record**: YES. Polar is legal seller of record, handles all sales tax, EU VAT, Canadian GST remittance globally.

**Tax handling**: Prices shown to customer include tax calculation at checkout for supported jurisdictions.

**Polar fees**:
- Starter (free): 5% + $0.50 per transaction
- Pro ($20/mo): 3.8% + $0.40
- Growth ($100/mo): 3.6% + $0.35
- Scale ($400/mo): 3.4% + $0.30
- Non-US cards: +1.5%
- Dispute: $15

**Display**: Prices tax-inclusive or tax-added at checkout not explicitly stated; Polar calculates and collects as MoR.

**Confidence**: High on fees and MoR status; medium on tax display timing  
**URLs**: 
- https://polar.sh/docs/merchant-of-record/fees
- https://polar.sh/docs/merchant-of-record/introduction

---

## 9. What Customer Sees

**Organization name on checkout/receipts**: Not documented in available fetches.

**Statement descriptor**: Not documented in available fetches.

**Receipts and invoices**: Customers can download and edit invoices and payment receipts through portal.

**Confidence**: Low (specific branding details not found)  
**URL**: https://polar.sh/docs/features/customer-portal

---

## 10. Sandbox

**API base URL**: `https://sandbox-api.polar.sh` (production: `https://api.polar.sh`)

**Dashboard URL**: `https://sandbox.polar.sh/start` or via organization switcher

**SDK configuration**: 
- TypeScript: `environment: "sandbox"` when creating client
- Python: `environment="sandbox"` on init

**Important**: Access tokens are environment-specific; sandbox token cannot be used in production and vice versa.

**Confidence**: High  
**URL**: https://polar.sh/docs/integrate/sandbox

---

## 11. npm Package & Recommendations

**@polar-sh/sdk**:
- **Current version**: 1.0.1 (as of Oct 2026)
- **License**: MIT
- **Repository**: https://github.com/polarsource/polar-js

**@polar-sh/nextjs recommendation**: Not documented in available fetches.

**SDK directly recommended**: Not explicitly stated in available fetches.

**Confidence**: High on version/license; low on framework-specific recommendation  
**URL**: https://www.npmjs.com/package/@polar-sh/sdk

---

## 12. Privacy, Legal, Data Processing

**Polar's privacy policy URL**: Not accessible via https://polar.sh/privacy (404).

**Legal entity**: Not found in available fetches.

**Country of operation**: Not found in available fetches.

**Data processing location**: Not found in available fetches.

**Stripe underneath**: Feature comparison mentions "Payment Processor Fees Compared: Stripe, Polar..." but no explicit statement on whether Stripe processes payments underneath.

**Confidence**: Low (privacy page not fetched; legal/infrastructure details not found)  
**Attempted URL**: https://polar.sh/privacy

---

## 13. Account Review Before Payout

**Process**: Not documented in available fetches.

**Timeline**: Not documented in available fetches.

**What is reviewed**: Not documented in available fetches.

**Confidence**: Low (not found)

---

## 14. Vercel Pro Spending Cap

**Note**: Outside Polar's scope; Vercel Pro feature.

**Status**: Not researched (out of scope for Polar billing integration).

**Confidence**: N/A

---

## Summary of Findings

| Question | Found | Confidence |
|----------|-------|-----------|
| 1. Customer State API | Yes | High |
| 2. Benefits (Feature Flag) | Yes | High |
| 3. API Rate Limits | Yes | High |
| 4. Checkout Sessions | Yes | High |
| 5. Customer Portal | Partial | Medium |
| 6. Custom Fields (checkbox) | Yes | High |
| 7. Trials | Partial | Medium |
| 8. Tax & Fees | Yes | High |
| 9. Customer Sees (branding) | No | Low |
| 10. Sandbox | Yes | High |
| 11. npm & Recommendations | Partial | Mixed |
| 12. Privacy & Legal | No | Low |
| 13. Account Review | No | Low |
| 14. Vercel Spending Cap | N/A | N/A |

---

## URLs Verified

1. https://polar.sh/docs/api-reference/customers/state-external
2. https://polar.sh/docs/features/benefits/feature-flags
3. https://polar.sh/docs/api-reference/checkouts/create-session
4. https://polar.sh/docs/features/customer-portal
5. https://polar.sh/docs/features/custom-fields
6. https://polar.sh/docs/merchant-of-record/introduction
7. https://polar.sh/docs/merchant-of-record/fees
8. https://polar.sh/docs/integrate/sandbox
9. https://www.npmjs.com/package/@polar-sh/sdk
10. https://github.com/polarsource/polar-js

## Additional Resources Found

- Polar API Overview: https://polar.sh/docs/api-reference/2026-04/introduction
- Merchant Comparison: https://polar.sh/resources/comparison/stripe
- Pricing Calculators (third-party): https://makerkit.dev/pricing-calculator/polar, https://www.paritydeals.com/polar-fee-calculator/
