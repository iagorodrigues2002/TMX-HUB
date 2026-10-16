# Immutable attribution at first approval

Approved scope: new confirmations only; no historical attribution backfill or replay.

Migration 099 installs a row trigger shared by every gateway/import path. On the
first paid transition (or direct paid insert), select the last recorded PageView,
Click or InitiateCheckout for that exact project/visitor at or before paid_at.
Both server receipt and client timestamps must not be after approval. Select one
touch, not the most complete one. Copy only its attribution keys; do not inherit
missing keys from gateway UTMs, previous campaigns or the front order. If there
is no touch, leave attribution keys absent. Keep non-attribution gateway metadata
such as fees/session IDs. Store attribution_event_id and attribution_locked_at.

For all later updates, including conflict upserts, refunds and repair routes,
the trigger restores the original attribution, visitor and lock metadata. Status,
financial lifecycle, customer/product corrections continue normally. Existing
already-confirmed orders have a NULL marker and keep legacy behaviour; schema
installation does not rewrite any historical order. Previously pending orders
are eligible when they first become paid.

Meta, TikTok and UTMify delivery readers use the locked source without live
visitor/event fallbacks. Ads Intelligence does not infer locked upsells from a
parent sale. Meta delivery diagnostics use the saved touch. UTMify attribution
repair excludes locked orders. Google conversion exports already use order
attribution directly. Operator clicks in Upsell Intelligence are unrelated and
unchanged.

Validation: dedicated local PostgreSQL with synthetic fixtures, plus mocked/pure
gateway/destination regressions, API typecheck and build. Never create real
payments, replay production conversions or send provider tests to validate this.

Rollback: revert consumers first; migration rollback requires an explicit follow-up
DDL change to remove the trigger. Do not automatically drop snapshot evidence.
