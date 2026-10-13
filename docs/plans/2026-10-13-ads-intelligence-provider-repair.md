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
