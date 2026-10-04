# Clerk Authentication Research Findings

**Date:** 2026-10-03  
**Context:** Next.js 16 App Router with strict CSP on `/tool` route (no Clerk script), same-origin `/api/entitlement` must identify visitor from cookies even with expired `__session` token.

---

## 1. Clerk Cookies in Production (Custom Frontend API Domain)

**Cookies Set:**
- `__session` - Short-lived session token, set on **app's domain** (e.g., example.com), **browser session cookie** (no persistent Max-Age/Expires), scoped strictly to prevent subdomain sharing
- `__client` - Long-lived client token, set on **Clerk FAPI domain** (e.g., clerk.example.com), HttpOnly, persists across sessions
- `__client_uat` - "Updated At" timestamp, set by Clerk FAPI, helps validate session freshness

**For Non-Signed-In Visitors:**
- Not explicitly documented in accessible sources; likely minimal cookies set until sign-in flow triggered

**Confidence:** HIGH  
**Source:** https://clerk.com/docs/guides/how-clerk-works/cookies

---

## 2. Session Token (JWT in `__session`) Lifetime

**Default Lifetime:** 60 seconds  
**Configurable:** Yes, through Clerk Dashboard  

**JWT Claims:**
- `sid` (session ID)
- `sub` (user ID / subject)
- `exp` (expiration Unix timestamp)
- `azp` (authorized party - application URL)
- `iss` (issuer - Frontend API URL)
- Additional: `iat`, `nbf`, `jti`, `fva`, `v`, `pla`, `fea`, `sts`
- Organization claims when org is active

**Confidence:** HIGH  
**Source:** https://clerk.com/docs/guides/sessions/session-tokens

---

## 3. Handshake: Document vs Non-Document Requests

**clerkMiddleware Behavior:**
- Handshake **only runs for document requests**: `GET` requests with `Sec-Fetch-Dest: document` (document navigations)
- Browser `fetch()` calls and XHR requests **do NOT trigger handshake**
- For non-document requests with expired `__session`, manual organization activation (`setActive()`) is required on the client

**Expired Token Handling:**
- `authenticateRequest` / `auth()` return varies by request type
- Not explicitly documented what it returns for expired tokens on non-document requests
- Frontend SDKs auto-refresh tokens on 50-second interval (ahead of 60-second expiry)

**Confidence:** MEDIUM  
**Source:** https://clerk.com/docs/reference/nextjs/clerk-middleware

---

## 4. Backend API: Session Statuses and Rate Limits

**Session Statuses (via `clerkClient.sessions.getSession(sessionId)`):**
- Not found in accessible documentation
- Inferred possibilities: active, ended, expired, revoked, removed, abandoned, pending (not confirmed)

**Rate Limits:**
- Not found in accessible documentation for production instances
- Backend API documentation does not expose rate limit specifics

**Confidence:** LOW (not found)  
**Attempted Source:** https://clerk.com/docs/reference/backend-api/session

---

## 5. Session Lifetime Settings

**Default Maximum Lifetime:** Not found  
**Default Inactivity Timeout:** Not found  
**Configurable Range:** Not found  

All three configurable through Clerk Dashboard, but specific defaults and allowed ranges not documented in public sources.

**Confidence:** LOW (not found)

---

## 6. @clerk/nextjs Support for Next.js 16 and proxy.ts

**Current Major Version:** v7  
**Supports Next.js 16:** YES  
**Supports proxy.ts:** YES - clerkMiddleware() works with Next.js 16 proxy.ts (renamed from middleware.ts)

**Version Requirements:**
- Next.js 16.0.10 or newer (16.0.0-16.0.9 skipped in @clerk/nextjs peer range)
- Node.js 20.9+

**NPM Licenses:**
- `@clerk/nextjs`: Not found in accessible sources
- `@clerk/backend`: Not found in accessible sources

**Confidence:** HIGH (Next.js 16/proxy.ts), LOW (npm licenses)  
**Source:** https://clerk.com/docs/reference/nextjs/clerk-middleware

---

## 7. Clerk CSP Requirements

**script-src:**
- Application's FAPI hostname
- `https://challenges.cloudflare.com` (Cloudflare bot protection / Turnstile)
- `https://*.protect.clerk.com` (Clerk abuse/fraud protection)

**connect-src:**
- Application's FAPI hostname
- `https://*.protect.clerk.com:*` (note: requires `:*` suffix for ports other than 443)

**img-src:**
- `https://img.clerk.com`

**frame-src:**
- `https://challenges.cloudflare.com` (Turnstile)
- `https://*.protect.clerk.com` (Clerk abuse/fraud protection)

**style-src:**
- Not explicitly documented

**Bot Protection (Cloudflare Turnstile):**
- Built-in and optional (can be disabled)
- Invisible for 99.9% of users

**Automatic CSP:**
- `clerkMiddleware()` supports `contentSecurityPolicy` option for automatic CSP header injection

**Confidence:** HIGH  
**Source:** https://clerk.com/docs/guides/secure/best-practices/csp-headers

---

## 8. Redirect After Sign-In (`<SignIn>`)

**Redirect Method:** Not found - whether client `router.push` or full page load not documented  
**Redirect Targets:** `forceRedirectUrl`, `fallbackRedirectUrl`, `redirect_url` parameter supported  
**Route Handlers:** Likely work but not explicitly confirmed

**Confidence:** LOW (not found)  
**Attempted Source:** https://clerk.com/docs/reference/nextjs/sign-in

---

## 9. ClerkProvider and Dynamic Pages in Next.js 15/16

**Makes Pages Dynamic:** Not found in accessible documentation  
**Route Group Layout:** Not explicitly documented whether ClerkProvider can be scoped to exclude routes

**Confidence:** LOW (not found)

---

## 10. Email Verification Code (OTP) Sign-In

**Without Passwords:** Not found - whether supported without passwords not documented  
**Free Plan Limits:** Not found - monthly active/retained user limits not documented

**Confidence:** LOW (not found)

---

## 11. Data Processing and Compliance

**Processing Location:** Not found (assumed US, not confirmed)  
**Privacy Policy URL:** Not found  
**DPA URL:** Not found  
**EU-US Data Privacy Framework:** Not found (use Status unknown)

**Confidence:** LOW (not found)

---

## 12. Keyless Mode and Telemetry

**Keyless Mode in Development:**
- Environment variable: Not found
- Setting method: Not found

**Clerk Telemetry:**
- Environment variable: Not found
- Disable method: Not found

**Confidence:** LOW (not found)

---

## Summary of Confirmations

**High Confidence (Confirmed):**
- Cookies structure and domains (Q1)
- Session token lifetime and claims (Q2)
- Handshake behavior (Q3)
- CSP requirements (Q7)
- Next.js 16 and proxy.ts support (Q6)

**Medium Confidence (Partial):**
- Handshake details (Q3)

**Low Confidence (Not Found):**
- Session statuses and rate limits (Q4)
- Session lifetime defaults (Q5)
- npm licenses (Q6)
- Redirect behavior (Q8)
- ClerkProvider dynamic behavior (Q9)
- Email OTP and free plan limits (Q10)
- Compliance details (Q11)
- Keyless/telemetry settings (Q12)

---

## URLs Confirmed to Resolve

1. https://clerk.com/docs/guides/how-clerk-works/cookies - OK
2. https://clerk.com/docs/guides/sessions/session-tokens - OK
3. https://clerk.com/docs/reference/nextjs/clerk-middleware - OK
4. https://clerk.com/docs/guides/secure/best-practices/csp-headers - OK
5. https://clerk.com/docs/reference/nextjs/sign-in - 404
6. https://clerk.com/docs/reference/backend-api/session - 404
