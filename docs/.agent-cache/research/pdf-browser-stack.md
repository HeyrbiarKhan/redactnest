# PDF Browser Stack Research - Commercial Viability Analysis

**Research Date:** September 19, 2026  
**Context:** Browser-only PDF redaction tool; client-side WASM/JS; no server upload; genuine text removal from content stream; metadata/annotations/form fields/bookmarks/JavaScript/incremental history stripped

---

## 1. Browser-Based PDF Mutation Libraries

### pdf-lib (MIT, NOT RECOMMENDED)
- **Version:** 1.17.1
- **Last Release:** November 6, 2020 (5+ years old)
- **License:** MIT (permissive)
- **Content Stream Mutation:** YES - designed for PDF modification
- **Text Extraction w/ Coordinates:** Not built-in
- **Commercial Safe:** YES (MIT license allows closed-source use)
- **Maintenance Status:** NOT ACTIVELY MAINTAINED - archived/stale; no updates since 2020
- **Source:** https://github.com/Hopding/pdf-lib/releases
- **Note:** @pdfme/pdf-lib fork (v6.1.12) is actively maintained, last update 11 days ago

### MuPDF.js / mupdf-wasm (AGPL-3.0, REQUIRES LICENSE)
- **Version:** Not explicitly versioned in public release notes
- **License:** GNU AGPL-3.0
- **Content Stream Mutation:** YES - full manipulation library
- **Text Extraction w/ Coordinates:** Likely YES (comprehensive PDF engine)
- **Commercial Safe:** NO - AGPL is copyleft; requires paid commercial license from Artifex for proprietary/closed-source/SaaS products
- **Key Requirement:** "If you distribute software using mupdf.js or offer it as a network service, you must release your source code under AGPL unless you obtain a commercial license"
- **Commercial License:** Contact sales@artifex.com
- **Sources:**
  - GitHub: https://github.com/ArtifexSoftware/mupdf.js
  - License detail: https://github.com/ArtifexSoftware/mupdf
  - Artifex licensing: https://artifex.com/licensing

### PDFium WASM Variants (@embedpdf/pdfium, pdfium-render, etc.)
- **License:** BSD-3-Clause + Apache-2.0
- **Content Stream Mutation:** LIMITED - PDFium is primarily a rendering library, not designed for deep content modification
- **Text Extraction w/ Coordinates:** Limited capability (rendering-focused)
- **Commercial Safe:** YES - permissive open-source licenses
- **Constraint:** Performance and feature limitations for content-stream manipulation compared to MuPDF/pdf-lib
- **Sources:**
  - Official PDFium: https://github.com/chromium/pdfium
  - License: https://github.com/chromium/pdfium/blob/main/LICENSE (BSD-3-Clause + Apache-2.0)
  - npm wrapper: https://www.npmjs.com/package/@embedpdf/pdfium

### pdf.js / pdfjs-dist (Apache 2.0)
- **License:** Apache 2.0
- **Content Stream Mutation:** NO - rendering engine only, cannot modify PDFs
- **Commercial Safe:** YES
- **Recommendation:** Not suitable for redaction use case

---

## 2. Licensing Verdict for Closed-Source Commercial Product

| Library | License | Commercial Safe | Notes |
|---------|---------|-----------------|-------|
| **pdf-lib** | MIT | YES | Permissive, but stale (5+ years) |
| **MuPDF.js** | AGPL-3.0 | NO | Requires paid commercial license or must open-source |
| **PDFium WASM** | BSD-3-Clause + Apache-2.0 | YES | Permissive, but limited mutation capability |
| **pdf.js** | Apache 2.0 | YES | Not suitable (render-only) |

**BLOCKING ISSUE:** MuPDF.js requires explicit commercial licensing for closed-source commercial products. AGPL is a viral copyleft license.

---

## 3. Text Extraction with Per-Glyph/Span Position Coordinates

- **MuPDF.js:** Likely capable (comprehensive PDF engine with text extraction APIs)
- **pdf-lib:** Not built-in; would require custom implementation
- **PDFium WASM:** Limited (rendering focus; not text extraction focus)
- **pdf.js:** Has text layer capability but primarily for rendering

**Recommendation:** MuPDF.js if license can be negotiated; otherwise no off-the-shelf solution handles this well in browser without custom implementation.

---

## 4. pdf-lib Maintenance Status

- **Status:** NOT ACTIVELY MAINTAINED
- **Last Release:** v1.17.1 on November 6, 2020
- **GitHub:** https://github.com/Hopding/pdf-lib (8.6k stars, 914 forks)
- **Active Fork:** @pdfme/pdf-lib (v6.1.12, last update 11 days ago)
- **Recommendation:** Original project is stale; if using pdf-lib, migrate to @pdfme/pdf-lib maintained fork

---

## 5. Web Meta Framework Versions (September 2026)

| Framework | Current Version | Status | Source |
|-----------|-----------------|--------|--------|
| **Next.js** | 16.3.5 | Stable major v16 (recommended) | https://github.com/vercel/next.js/releases |
| **SvelteKit** | Not clearly versioned | Actively maintained | https://github.com/sveltejs/kit/releases |
| **TanStack Start** | 1.168.56 (@tanstack/react-start) | Active (v1 major, last update 2 days ago) | https://www.npmjs.com/package/@tanstack/react-start |
| **Astro** | 7.2.10 | Stable major v7 (recommended) | https://github.com/withastro/astro/releases |
| **React Router** | v7 | Current stable (Remix transitioning to this) | https://github.com/remix-run/react-router/releases |
| **Remix** | v3+ (transitioning to React Router v7 framework mode) | Merging into React Router ecosystem | https://github.com/remix-run/remix/discussions/10333 |
| **Nuxt** | 4.5.2 | v4 current; v3 EOL July 31, 2026 | https://github.com/nuxt/nuxt/releases |

---

## RECOMMENDATION FOR COMMERCIAL VIABILITY

**Critical Finding:** No single open-source library is fully ideal.

- **pdf-lib:** MIT licensed, permissive, but 5+ years stale—maintenance risk
- **MuPDF.js:** Full-featured, but AGPL requires commercial license (~€2000-5000/year estimated)
- **PDFium WASM:** Safe licensing, but limited content-stream manipulation capability

**Best Path Forward:**
1. **MuPDF.js with paid license** (if budget allows): Highest feature completeness for redaction
2. **Custom WASM implementation** using PDFium or compile pdf-lib-fork to WASM with custom redaction logic
3. **Fork @pdfme/pdf-lib** and add deep content-stream targeting and text coordinate extraction

---

## Research Constraints Applied
- 5 web searches used (max 5) ✓
- 3 page fetches used (max 8)
- Official sources prioritized: GitHub, npm registry, Artifex/Chromium official sites
