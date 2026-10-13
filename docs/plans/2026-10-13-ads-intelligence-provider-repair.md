# UTMify central import: provider isolation repair

## Located cause

The authenticated UTMify UI and TMX both received HTTP 500
`COULD_NOT_CONVERT_CURRENCY` for aggregate Meta queries. Read-only requests for
2026-10-12 isolated account 1188820462954489 (Luyanda Zwane) as failing. The same
session returned HTTP 200 for Fernanda Lima Monteiro (0 rows), Jack 07.04 (30 ads),
and NAM HUY (10 ads). No UTMify settings or financial records were modified.

Successful HTTP search bodies are `{results,soldProducts,untrackedCount}`.
The frontend's `SUCCESS/data` wrapper is not the HTTP response envelope. Actual
Meta ads contain `accountId`, `campaignId`, `adsetId`, `adId` and `name`, but not
campaign/adset names. Spend is in dashboard-currency minor units.

Primary contract evidence: public UTMify application bundles
`nodes/47.BZBH8IYP.js` (Meta), `50.eH85wyRE.js` (Google),
`60.CHaHIs2L.js` (TikTok), `chunks/Dk7pMSYU.js` (Meta account catalog), and
`chunks/DWqHmGxY.js` (dashboard enabled-connection filtering).
Google grouping uses `adGroup`; TikTok grouping uses `adgroup`.

## Repair

- Authenticate once per weekly cycle; preserve the 16 offer-level opt-outs.
- Discover only the exact dashboard's selected/enabled connections. Delivery
  `DISABLED` status does not exclude historical costs. Dedupe repeated account IDs.
- Use each platform's actual endpoint/body. Empty validated profile catalogs
  mean no connection; missing catalog contracts mean incomplete coverage.
- Split only currency failures into bounded account groups. Do not turn auth,
  rate-limit, malformed-body or TikTok search-limit errors into retry storms.
- Fetch campaign/adset dictionaries in seven-day windows and join by account and
  entity IDs. Preserve original provider rows and all platform/account IDs.
- Replace daily costs transactionally only for the healthy platform/accounts;
  never delete another platform or blocked account's retained history.
- Persist partial account/date coverage. Expose healthy rows, but suppress
  ROAS/ROI while any historical gap or ambiguous mapping remains.
- Recheck a blocked account once in the next weekly cycle. Exclude continued
  failures for that cycle. On recovery, backfill from August 1 before claiming
  complete coverage. Removing an account does not erase a prior historical gap.

## Release gate

Focused unit/route/worker regressions, API typecheck/build, review, and a bounded
live read-only provider contract check precede deployment. Production import is
not resumed by tests or migration; the root task explicitly resumes the one
paused owner connection after reviewing the deployed repair.

## PostgreSQL date parser regression

The first production import exposed another TMX defect before any provider
request: PostgreSQL DATE columns are returned as JavaScript Date objects.
`String(date).slice(0,10)` produced display strings such as `Sat Aug 01`, which
PostgreSQL interpreted as year 2001. The empty paused connection's cursor/end
must be explicitly restored to 2026-08-01/2026-10-12 after the fix is published.
All worker cursor/end and route coverage/row days now use a validated UTC ISO
calendar helper. Historical bounds are validated before credentials or provider
authentication. A corrupted year pauses with safe `HISTORICAL_RANGE_INVALID`,
and no external request is made. Error reports retain whitelisted provider/DB
codes and phase only, never arbitrary upstream text, credentials or SQL bodies.

## Interrupted weekly cycle

After 1,255 committed daily rows through September 4, a Meta hierarchy request
returned HTTP 400 without a recognized machine reason. A bounded read-only
reproduction of the same healthy 41 accounts and September 5–11 range returned
HTTP 200 for both campaign (15 rows) and adset (72 rows) queries. No upstream
cause was proven, so generic HTTP 400 does not receive automatic retries.
Campaign/adset phases are recorded separately. Explicit continuation preserves
the September 5 cursor and blocked-account decisions rather than restarting
August or probing the blocked accounts again. New weekly jobs alone recheck
blocked accounts and start historical gap repair from August.

After a further production weekly-adset HTTP 400 at September 19, the exact
September 19–25 local request again returned 200 (18 rows). Railway SSH could
not be used because no key was registered; no key/access change was made.
A separately authorized single-day September 19 adset request returned 200
(6 rows, the same 41 healthy accounts). Meta hierarchy queries now use that
verified native daily contract; Google/TikTok keep bounded seven-day metadata.
This reduces request size but does not prove the source of the intermittent
production HTTP 400. Unknown 4xx errors still pause immediately, without retries.
Safe diagnostics retain only JSON/non-JSON classification, a Cloudflare boolean,
and an optional numeric Retry-After limited to 0–3600 seconds. No response body,
header strings, credential or token is persisted.
