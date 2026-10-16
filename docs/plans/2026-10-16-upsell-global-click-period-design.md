# Upsell operator report: global view and click-date periods

The report defaults to all authorized offers and today in America/Sao_Paulo.
Offer selection remains optional. Today, yesterday, last seven calendar days
(including today), this month and custom inclusive date ranges reuse the
existing TMX date filter component.

One authenticated global API route resolves allowed offer IDs through
direct OfferStore reads and the central canAccessOffer policy on the server,
then queries only those projects. Reading tracked offers directly avoids a full
Redis keyspace scan on every 30-second report refresh.
Normal users see only their own operator results, administrators can see others.
No client-provided project list or legacy share bypass is accepted. The existing
per-offer endpoint retains its access checks and supports the same period.

Filter approvals by the immutable credited attempt's opened_at, not paid_at or
recorded_at. A click on yesterday followed by approval today belongs to yesterday.
Never choose an older in-range attempt instead of the actual frozen winner.
Use PostgreSQL AT TIME ZONE for calendar-midnight bounds, inclusive start and
exclusive midnight after the end date. Validate real calendar dates, complete
ranges and ordering; reject invalid input before queries.

Approvals without an attributed click have no click date and are excluded from
dated views, with an explicit explanation in the UI. An undated API request
retains the previous full-history behaviour for compatibility. All reports still
require gateway-paid proof and preserve currency separation, privacy masking,
single counting per order and one row per operator across offers.

Query cache keys include offer, start and end; 30-second refresh remains enabled.
No migration, historical attribution rewrite, conversion replay or payment occurs.
Validation includes local PostgreSQL cross-offer isolation, last-winner filtering,
cross-midnight approvals, date validation, frontend preset tests, typechecks/builds.
