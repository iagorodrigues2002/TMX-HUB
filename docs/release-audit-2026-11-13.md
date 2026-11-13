# Pending-change recovery, 2026-11-13

Compared the live release (5eed15e) with the modified traffic-live-release checkout (233810e) and creative-roas-release checkout (e5818ee), using their respective Git bases. Changes already present or superseded in live were retained from live.

## Included

- Spy monitoring radar: new IDs, new creatives, reused media, variations and inconclusive comparisons; filtered links, grouped media cards and reference timestamps.
- Spy classification uses full-media hashes and copy, with company/owner-scoped caches, bounded downloads and explicit incomplete-history handling. Partial collections do not replace complete readings.
- Upsell identity validations rejected for missing account destinations are requeued once the matching destination exists.
- Ambiguous-front operator attribution requires consistent recent operator evidence; it does not invent a front-order link. Migration uses the next free number, 123. No historical reconciliation batch is part of deployment.
- Traffic financial overview respects the company scope. Overview requests recover from transient errors and preserve previous data.

## Deliberately excluded

- Canceled offer-summary/Vturb redesign and its top-ad endpoint changes.
- Local synthetic-only Drive/Meta workers, preview helpers, QA data, runtime files and credentials.
- Older AI, campaign controls, navigation and loading implementations superseded by current production fixes.

## Validation

Focused Spy, traffic, overview and background-refresh web tests; operator-sequence PostgreSQL tests against an isolated disposable test database; upsell requeue, company AI, attribution, finance and access tests; API typecheck/build and production web build. Live deployment and read-only checks are verified separately after publication.

Historical readings without sufficient media evidence remain inconclusive. Deploying classification does not retroactively establish novelty without evidence or run an extra paid collection.
