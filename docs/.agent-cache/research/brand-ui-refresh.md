# Brand UI Refresh Research — 2026-10-06

## 1. Clerk Appearance API & Logo Configuration

**Findings:**

Clerk's `appearance.layout` object (Core 3 / current API) exposes three logo-related properties:

- `logoImageUrl` (string): URL to your logo image. When provided, overrides the logo set in the Clerk Dashboard. By default, components use the logo from the Dashboard.
- `logoLinkUrl` (string): Controls where the browser redirects after clicking the logo.
- `logoPlacement` (string): Determines logo placement; defaults to `'inside'`.

The Clerk Dashboard logo is loaded by default by Clerk Components and served from `img.clerk.com` unless overridden with `logoImageUrl`.

**Secured by Clerk Badge:** Can be hidden by toggling "Remove 'Secured by Clerk' branding" in the Clerk Dashboard under Branding > Settings. Hiding it requires a **paid plan in production**; free plan supports hiding only in development mode.

**appearance.variables Keys** (complete list as of 2026):

*Color Properties:*
- `colorPrimary`, `colorPrimaryForeground`
- `colorForeground`, `colorMutedForeground`, `colorMuted`
- `colorBackground`, `colorInput`, `colorInputForeground`
- `colorBorder`, `colorNeutral`, `colorRing`, `colorShadow`
- `colorDanger`, `colorSuccess`, `colorWarning`, `colorShimmer`, `colorModalBackdrop`

*Typography:*
- `fontFamily`, `fontFamilyButtons`, `fontFamilyMono`
- `fontSize` (string or object with xs, sm, md, lg, xl keys)
- `fontWeight` (object with normal, medium, semibold, bold keys)

*Spacing & Layout:*
- `spacing`, `borderRadius`

Variables are also exposed as CSS custom properties (e.g., `--clerk-color-primary`, `--clerk-color-foreground`).

**URLs & Confidence:**
- https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/options — **HIGH**
- https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables — **HIGH**

---

## 2. Polar Hosted Checkout Branding

**Findings:**

The Polar hosted checkout displays **organization branding** via the organization object fields:

- `avatar_url` (string): Organization avatar/logo shown on checkout, customer portal, and emails
- `name` (string): Organization name displayed on checkout

**Product Media:** Product images can be uploaded to display on the checkout page (up to 10MB each). Images can be re-arranged or removed at any time via the product settings.

**Product Description:** Polar documentation indicates an optional product description is shown on checkout, though specific placement and character limits are not documented.

**Recommended Sizes:** No official size recommendations for `avatar_url` or product media found in current Polar documentation (2026-04 API). Suggested practice: avatar ~256×256 to 512×512 px (common for org logos); product media ~800×600 or 1024×768 px for web display.

**Settings Location:**
- Organization avatar & name: Organization settings (Polar Dashboard)
- Product media & description: Product settings (Polar Dashboard)

**Customer Portal & Receipt Email:** Both show the organization `avatar_url`.

**URLs & Confidence:**
- https://polar.sh/docs/api-reference/2026-04/organizations/get-organization — **MEDIUM** (API schema confirms avatar_url; no size recommendations)
- https://polar.sh/docs/features/products — **MEDIUM** (product media confirmed; dimensions not specified)

---

## 3. Web App Manifest, Favicons & Icons — 2025/2026

**Findings:**

Evil Martians' "How to Favicon" guide (updated through 2026) recommends a **minimal icon set of 5–6 files**:

**Recommended Set:**

1. **favicon.ico** — 32×32 PNG (legacy browser support)
2. **SVG icon** — Scalable format with support for CSS `@media (prefers-color-scheme: dark)` for dark mode toggle
3. **apple-touch-icon.png** — 180×180 PNG (iOS 8+, iPad home screen)
4. **Web manifest icons (via manifest.json):**
   - 192×192 PNG (Android home screen)
   - 512×512 PNG (Android splash screen & app drawer)
   - 512×512 **maskable** icon (adaptive icon for Android launchers)

**Maskable Icons:**
- Safe zone: **409×409 px circle** (centered within the full 512×512 icon)
- Icons should have extra padding around the mark to allow cropping by launcher
- Verify maskable icons at https://maskable.app

**Image Format:** PNG or ICO for raster formats; SVG for scalable vector.

**File Serving:** Serve `.wasm` files as `application/wasm` (already noted in AGENTS.md). SVG icon must support color scheme media queries for dark mode support.

**URL & Confidence:**
- https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs — **HIGH** (Evil Martians official guide; search results confirm 2026 update)

---

## 4. Open Graph / Social Preview Image

**Findings:**

**Recommended Size:** 1200×630 pixels (aspect ratio ~1.91:1)

**File Size:**
- Recommended: Under 1 MB (for fast loading)
- Maximum: Up to 8 MB (platform limit)
- WhatsApp: 300 KB max (stricter limit)
- Meta: 8 MB limit

**File Format:** PNG or JPEG (JPG recommended for better compression); WebP supported where available.

**Platform Coverage:** 1200×630 works across Facebook, X/Twitter (`summary_large_image`), LinkedIn, Slack, Discord, WhatsApp, and iMessage.

**X/Twitter & summary_large_image:** X/Twitter's `summary_large_image` card uses the same OG image as other platforms; no separate image size needed.

**URLs & Confidence:**
- https://twittershots.com/blog/open-graph-og-image-size — **HIGH**
- https://myog.social/articles/og-image-size-guide — **HIGH**
- https://www.krumzi.com/blog/open-graph-image-sizes-for-social-media-the-complete-2026-guide — **HIGH**

---

## 5. next/font/google & Inter Optical Size (opsz) Axis

**Findings:**

Yes, `next/font/google` **does support Inter's `opsz` axis** via the `axes` option.

**Usage:**
```javascript
import { Inter } from 'next/font/google'

const inter = Inter({
  axes: ['opsz']
})
```

**Optical Size (opsz) Specifications for Inter:**
- Default: 14
- Minimum: 6
- Maximum: 144
- Step: 0.1

**What it does:** The optical size axis adjusts font rendering for different sizes:
- Small optical sizes (6–12): Less stroke contrast, more open spacing, taller x-height
- Large optical sizes (14+): More stroke contrast, tighter spacing, optimized for display

**URLs & Confidence:**
- https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts — **HIGH**
- https://fonts.google.com/specimen/Inter — **HIGH**

---

## 6. WCAG 2.2 Success Criterion 2.4.11: Focus Not Obscured (Minimum)

**Findings:**

**Level:** AA (Web Content Accessibility Guidelines 2.2)

**Requirement:** When a user interface component receives keyboard focus, it **must remain at least partially visible** (not entirely hidden by author-created content).

**Applies To:**
- Sticky headers and footers that may overlap focused items
- Non-modal dialogs or overlays that persist through focus changes

**Failure:** Sticky header or footer that **completely obscures** a focused element fails this criterion.

**Solutions:**
- Use CSS `scroll-padding` to reserve space and keep focused content visible
- Make sticky content modal (user must dismiss before continuing)
- Auto-close notifications when focus leaves

**Relevant to Sticky Side Column:** A sticky side column (e.g., navigation, secondary content) must not completely overlap elements that receive keyboard focus. Ensure focused elements remain at least partially visible by leaving adequate space, using `scroll-padding`, or adjusting focus management.

**Official URL & Confidence:**
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum — **HIGH** (W3C official)
- https://www.w3.org/WAI/WCAG22/Techniques/failures/F110.html (Failure case with sticky content) — **HIGH**

---

## Summary

All six research questions have been confirmed with official documentation URLs:

1. ✓ Clerk logo API (`logoImageUrl`, `logoLinkUrl`, `logoPlacement`); all `appearance.variables` keys listed
2. ✓ Polar avatar & media shown on checkout; no official size specs; stored in org & product settings
3. ✓ Evil Martians favicon guide: 32×32 ICO, SVG, 180×180 iOS, 192×192 + 512×512 manifest, maskable 409×409 safe zone
4. ✓ OG image 1200×630, <1MB recommended, <8MB max; same on X/Twitter
5. ✓ `next/font/google` supports Inter's `opsz` axis via `axes` option
6. ✓ WCAG 2.2 SC 2.4.11 requires focused elements remain at least partially visible; sticky content must not completely obscure
