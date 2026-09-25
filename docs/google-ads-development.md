# Google Ads: independent destinations

## Slice 1 — local foundation

Implemented additive draft destination table, offer-scoped list/create/archive endpoints,
manager-only writes, strict input validation, and a pure purchase payload preview.
No live delivery, OAuth credentials, tracking-script changes, webhook hooks, worker,
backfill or production migration is enabled by this slice. Drafts cannot be enabled.
Payload preview only accepts approved fronts with explicit value, currency, timezone
and actual click/braid identifiers. It is not yet a full enhanced-conversions payload.

## Next slices

Slice 3 implements OAuth authorization per destination (local only): PKCE, hashed
single-use state bound to manager/offer/destination, ten-minute expiry, authenticated
callback completion, encrypted refresh-token storage and local disconnect. Connected
does not imply account/action access validation. No live delivery or refresh worker yet.

Deployment prerequisites (server-only; never NEXT_PUBLIC):
- GOOGLE_ADS_OAUTH_CLIENT_ID
- GOOGLE_ADS_OAUTH_CLIENT_SECRET
- GOOGLE_ADS_OAUTH_REDIRECT_URI=https://theminex.com/tracking/google-callback
- Existing TRACKING_ENCRYPTION_KEY and DATABASE_URL

For account discovery (optional for conversion delivery, required for the account
selector), add `GOOGLE_ADS_DEVELOPER_TOKEN` from Google Ads API Center. The OAuth
connection asks for both Data Manager and Google Ads read scopes. A connection made
before this change must be reconnected once to grant the additional Google Ads scope.

## Account selector and safe validation

The Google Ads selector uses the official Google Ads API to list directly accessible
accounts plus active clients of accessible manager accounts. The account list is never
guessed from the Google identity. The **Testar tracking** action uses the most recent
approved front purchase that already contains a captured `gclid`, `gbraid`, or
`wbraid`, calls Data Manager `events:ingest` with `validateOnly=true`, and reports the
result. It validates OAuth refresh, destination, conversion action and payload without
creating a conversion or changing existing delivery.

Register that exact redirect URI in a Google Cloud web OAuth client, enable Data Manager
API, configure audience/test users or production verification as appropriate. Missing
Google settings do not prevent API startup. Apply migrations 060 and 061 in staging
first. Real OAuth and database integration have not yet been exercised.

Slice 2 local UI is now available at Tracking > Integrations > Google Ads:
list/create/edit/archive drafts, recoverable load errors, per-offer form reset and
explicit disconnected status. PUT enforces manager access and scopes by offer;
duplicate account/action returns 409. No OAuth or live validation is available yet.
Production deployment and database migration have not been performed.

1. OAuth connection and token refresh; encrypted secrets; account/action access validation.
   Verify Data Manager access in the real Google Cloud project before enabling delivery.
2. Offer UI for independent destinations, edit/archive, authorization and validation status.
3. Versioned Google-only capture of gclid/gbraid/wbraid and consent. Preserve coherent
   dated touchpoints; test every entry/A-B/checkout redirect before enabling per offer.
4. Immutable purchase snapshot and transactional outbox per destination. Stable order ID,
   destination identity snapshot, database uniqueness, queue recovery and isolated worker.
5. Data Manager ingestion and request-status diagnostics; consent-aware normalized hashed
   identity; explicit waiting state for missing identifiers; no synthetic click IDs.
6. Reconciliation, bounded retries, permanent failure diagnostics and aggregate Google
   reporting. API acceptance must never be displayed as per-order campaign attribution.
7. Pilot with independently authorized accounts, approved front purchases, repeated webhook,
   worker restart, revoked access and missing identifiers. Expand only after verification.

## Release constraints

- Existing Meta/UTMify workers and capture remain unchanged in slice 1.
- No replay to new accounts by default; historical replay needs explicit scope and eligibility.
- Tag + API purchase deduplication is gated on Google's multi-source allowlist capability.
- Multi-account ingestion does not transfer the attribution of one account's click to another.
- Google Cloud/OAuth production configuration and actual account permissions are prerequisites.
- Apply the additive migration in a disposable/staging database before any production release.

## Sources

- https://developers.google.com/data-manager/api/devguides/events
- https://developers.google.com/data-manager/api/devguides/events/send-events
- https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access
- https://developers.google.com/data-manager/api/devguides/diagnostics
