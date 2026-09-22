# Verify: Design system & UI foundation · spec 0003 · updated 2026-09-22
_Steps derived from spec 0003 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run against a production build (`pnpm build && pnpm start`, with the environment in `playwright.config.ts`), because the tool route's content security policy is looser under `next dev`.

## UI / manual

- [ ] Open `/tool`, press Tab once → "Skip to main content" appears top left in teal with a visible ring → AC-14, AC-6
- [ ] Tab again → the "RedactNest" wordmark is ringed; Tab again → "Choose a PDF" is ringed → AC-6, AC-14
- [ ] Tab once more from "Choose a PDF" → focus leaves the drop zone; it never lands on a second, hidden file control → AC-8
- [ ] Reload, Tab, Enter on the skip link → focus moves to `main` with no ring on it; the next Tab lands on "Choose a PDF" → AC-14
- [ ] Press Enter, then Space, on "Choose a PDF" → the file picker opens each time → AC-6, AC-8
- [ ] Drag a PDF over the drop zone → its edge turns solid teal and it fills pale teal; move the pointer over the button inside without leaving → it stays that way; drag out → back to the dashed grey edge → AC-8
- [ ] With `NEXT_PUBLIC_FREE_PAGE_CAP=3`, the drop zone helper reads "Up to 3 pages for now."; rebuild with `2` → it reads "Up to 2 pages for now." (value from `config.freePageCap`) → AC-12
- [ ] Choose `tests/fixtures/two-pages.pdf` → a spinner with phase text such as "Opening your document…", then a "Document opened" card reading "This document has 2 pages." and "1 of 2 have a text layer." (values from `session.summary`) → AC-12
- [ ] With a screen reader on (NVDA with Chrome, or VoiceOver with Safari), choose a file that is not a PDF → a red callout with an error icon; the screen reader says "Error" and the message exactly once, not twice → AC-11, AC-12
- [ ] Choose a PDF with more pages than the free cap → "This document has more than the 3 page limit." (from `errorText` with the entitlement frozen into the job, not the paid ceiling) → AC-12
- [ ] Disable WebAssembly (a browser policy, or the init script in `tests/e2e/support.spec.ts`) → a red callout headed "RedactNest cannot run in this browser" as a level 2 heading, one line per missing capability (from `SUPPORT_GAP_TEXT`) → AC-11, AC-12
- [ ] After a document opens, "Start over" is an outlined teal button; pressing it returns to the empty drop zone → AC-12
- [ ] Click the wordmark from `/tool` with a document open → a full page load to `/` (the network panel shows a document request), not a client side navigation → spec 0002, INV-6
- [ ] Open `/` → header with a "Redact a PDF" button; headline "Truly redact a PDF."; the lead line "The text is removed from the file itself rather than covered with a black box, and your document never leaves your machine."; a large "Redact a PDF" button; no eyebrow; tab title "RedactNest" (literal copy from AC-13) → AC-13
- [ ] On both pages the footer shows "Source code (AGPL 3.0)" in muted grey, underlined, linking to `NEXT_PUBLIC_SOURCE_URL` (from `config.sourceUrl`) → AC-14
- [ ] At a 320px wide window, both pages need no sideways scroll → AC-15
- [ ] At 200% browser text size (or `html { font-size: 200% }`) on a desktop window, nothing on either page is clipped or overlapping → AC-15
- [ ] Turn on the system's reduced motion setting, hold `/api/entitlement` (DevTools request blocking with throttling, or a slow network), choose a file → the spinner is still; hovering buttons changes colour instantly → AC-16
- [ ] In Windows High Contrast (or DevTools forced colours emulation): the focus ring, the drop zone's dashed edge, the callout edges and the edge of the filled "Choose a PDF" button all stay visible → AC-17
- [ ] DevTools network panel on `/` and `/tool`: every request is to our own origin; the Inter font file comes from `/_next/static/media/`; nothing from Google Fonts or a CDN → AC-4, AC-20
- [ ] DevTools computed styles: every text element's font family is Inter, and nothing on either page is smaller than 14px → AC-4
- [ ] Response headers for `/tool`: the content security policy is unchanged (`font-src 'self'`, `img-src 'self' data: blob:`, `connect-src 'self'`) → AC-20

## Commands

- [ ] `pnpm test` → all pass, including `tests/unit/contrast.test.ts` (every contract pair, the palette and `text-xs` wipes), the colour and `src/ui` rules in `tests/unit/engine-wall.test.ts`, and `tests/component/ui/*` → AC-1, AC-2, AC-3, AC-4, AC-5, AC-9, AC-10, AC-11, AC-18, AC-19
- [ ] Change `--color-ink-muted` in `src/app/globals.css` to `#9aa0a6`, run `pnpm test` → the contrast test fails on the `ink-muted` pairs; revert → AC-2
- [ ] Add `className="text-ink/70"` or `"bg-[#fff]"` to any file under `src/`, run `pnpm lint` → it errors; `w-1/2`, `group/row` and `aspect-[16/9]` do not → AC-3
- [ ] Add `import { config } from "@/config"` or a `dangerouslySetInnerHTML` to a file in `src/ui/`, run `pnpm lint` → it errors → AC-19
- [ ] `pnpm test:e2e` → all pass, including `tests/e2e/design-system.spec.ts` and the same origin request tests in `tests/e2e/privacy.spec.ts` → AC-4, AC-6, AC-7, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-20
- [ ] `git grep -n "Geist" src` → nothing → AC-4

## Owed to feature 8 (not verifiable in a browser yet)

- `Checkbox`, `CountBadge`, `ChecklistGroup`, `ChecklistItem` and `EmptyState` are not placed on a page, so they are proved only in jsdom. When feature 8 places them: Enter and Space on a group summary close and open it; a long unbroken email wraps inside its row; the checkbox falls back to the native control in forced colours; a screen reader reads a row as the match, then "Page N" and the context line; a compact count badge is read as "2 items". Values for rows come from the `ReviewMatch` fields and the session's tick set (spec 0002); group labels, icons and nouns from feature 6.
- The `lost` worker callout has no real browser run, because Playwright cannot kill a worker. Its component test covers it.

## Acceptance-criteria coverage

- AC-1 … contrast test (token set, palette wipe, light scheme) · AC-2 … contrast test, the mutation step · AC-3 … lint steps, `engine-wall.test.ts` · AC-4 … font network and computed style steps, contrast test, `git grep` · AC-5 … `tests/component/ui/*` · AC-6 … keyboard walk steps · AC-7 … e2e target size tests · AC-8 … tab stop and picker steps, drop zone tests · AC-9 … `checklist.test.tsx`, owed browser proof · AC-10 … `checklist.test.tsx`, owed browser proof · AC-11 … screen reader and unsupported steps, `callout.test.tsx` · AC-12 … tool page state steps, `tool-client.test.tsx` live region tests · AC-13 … home page step · AC-14 … skip link, landmarks, footer steps · AC-15 … 320px and 200% steps · AC-16 … reduced motion step · AC-17 … forced colours step · AC-18 … `pnpm test`, `pnpm test:e2e` · AC-19 … `src/ui` lint step · AC-20 … network and header steps
