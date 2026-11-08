# Review, feat/telemetry (second), 2026-11-04

**Reviewed by**: Sonnet 5.5, a fresh read (author on a different model)
**Scope**: 63 files, branch vs main (merge base 9330557), with the closest read on slice 7 (`529b32c`, `9912a79`, `09d5a4b`)
**Verdict**: Approve with nits

## Summary

Slice 7 fixes the Major from the first review, and it does it well. Failure reports now go through one gate, `admitReport`, which holds each limit you stated: once an hour per report key, once per page load, and 20 page reports a day. Page reports spend a budget that server reports never touch, and the key space is closed, so memory cannot grow. I found no Blocker or Major. There is one Minor about what shares the page budget, and a few nits. Nothing about a document or a person leaves the browser or the server, and both CSPs are untouched.

## First review items

- Major (uncollapsed kinds could use up Sentry's limit): fixed. `report` in `src/telemetry/client.ts:56` sends each failure key once per page load. `admitReport` in `src/telemetry/server.ts:362` applies the one hour collapse to every error report and the 20 a day budget to page reports. `plan-check-failed` now collapses too.
- Minor (`unhandledrejection` reports everything): fixed as a decision. The page load cap and the budget bound the noise, and the reasoning is written in `src/app/telemetry-reporter.tsx`.
- Minor (unknown `routeType` filed as `render`): fixed. It is now `other` (`src/instrumentation.ts:106`, `src/telemetry/events.ts` `ROUTE_TYPES`), with its own collapse key.
- Minor (no `Content-Type` check): fixed. `isJson` in `src/app/api/telemetry/route.ts:50` runs before the body is read, and a wrong type gets the same quiet 204. The size check still comes first, and both orders are tested.
- Minor (no flood test): fixed. `tests/unit/telemetry-server.test.ts` has a "flood, on the server" group, and `tests/unit/telemetry-client.test.ts` covers the page load cap.
- Nits (DNT `"yes"`, `subscribe-started` in a render): left as they were, still nits, not raised again.

## How slice 7 holds each limit

- Hour window: `now - last < REPORT_WINDOW_MS` refuses, so a report is admitted again at exactly one hour. Tested at the edge.
- No await between check and record, so two reports that start together send once.
- A page report refused by the day budget leaves nothing in `sent` (the early return comes before `sent.set`), and a repeat the collapse refused spends no budget. Both are tested.
- Day reset: `Math.floor(now / DAY_MS)` is the UTC day, `pageDays.clear()` keeps one day at a time, and midnight is tested a millisecond either side.
- A page report cannot use a server report's budget. `isBrowserEvent` is the single test, and it is true only for the nine browser names, with `billing-failed` only as `welcome` plus `still-waiting`. `server-crash` and `plan-check-failed` are not in the list, so no forged body can reach them. The server never sends the welcome shape itself (`BILLING_FAILURES` for the server actions has no `welcome` call site).
- Closed keys: `reportKey` is built from the parsed event, which comes only from the lists. The shapes are at most 136, so `sent` cannot grow without bound. A test checks that no list value holds a space, so two events cannot share a key.
- A real crash after the budget is spent: `server-crash` never meets the budget, and a test sends one and a `plan-check-failed` after 20 page reports.
- Usage events never touch the collapse or the memory, and a throwing clock sends nothing and throws nothing.

## Minor

### 🟡 Noisy rejections and the one paid funnel report share the 20 a day, `src/telemetry/server.ts:362` (admitReport), `src/app/telemetry-reporter.tsx:57`

**Problem**: Every page report draws on one pool of 20 a day. A `rejection` is unfiltered by design, so an extension, Clerk's code or a flaky third party can make a `browser-crash` rejection on each of the 11 page kinds. Each key is admitted again every hour. So that noise alone can spend 11 reports in the first hour and the whole 20 in about two. After that, a real own script `error` report, and the `billing-failed welcome still-waiting` report (a paying customer who never got Pro), are dropped until midnight UTC.

**Why it matters**: The Sentry quota is safe, but the signal you built the budget to protect (a real page failure, a stuck paid checkout) can be hidden by the cheapest noise. You accepted that a forged report can hold back one shape for an hour. This is wider: ordinary visitors with a bad extension can empty the day.

**Suggested fix**: Keep the 20, but give `still-waiting` and `error` first claim. For example, count `rejection` reports against a smaller share of the day (say 8), or give `billing-failed` its own small share. Record the choice in AC-29 and add one test for it. If you prefer to leave it, say in the spec that rejections can empty the day, so the next reader does not assume page failures are always seen.

## Nits

- ⚪ `src/telemetry/client.ts:56`, `report(event, sent = SENT)` makes the second parameter public. A later `events.forEach(report)` would pass the index as `sent` and break the cap. Consider a private `reportWith(sent)` that the exported `report` calls.
- ⚪ `docs/specs/0016-telemetry-error-monitoring/index.md:6` and `:241`, the Updated line and build task 19 still say "once a minute" and `CRASH_WINDOW_MS` (60 seconds). Later lines (72, 246) correct this, but a reader of the top line gets the old number. Add a note on the Updated line for slice 7, or mark task 19 as replaced by task 22.

## Strengths

- One function, `admitReport`, owns all three limits, is synchronous, and changes memory only when it admits. That is what makes the edges easy to reason about and to test.
- The key comes from one place (`reportKey`), shared by the page and the server, and a test pins that no list value holds a space.
- The flood tests are the right ones: 100 identical reports send one, 20 of 24 shapes send, a server crash still sends after the budget, midnight resets exactly, and a refused report leaves nothing behind.
- The `Content-Type` fence answers the same quiet 204 instead of a 415, so a prober learns nothing.
- Privacy is intact: events are rebuilt from closed lists, no visitor header is passed on, and both CSPs are unchanged.

## Test coverage

Strong. Slice 7 added cases for the hour edge, concurrent starts, a send that fails, a schedule that throws, the clock that throws, the budget (20th admitted, 21st refused), repeats that do not spend budget, the next UTC day, the page load cap on the client, `Content-Type` variants and the key rules. The one gap is the share between rejections and `still-waiting`, which only matters if you take the Minor above.
