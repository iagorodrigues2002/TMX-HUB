# Unified reversals analytics

Approved scope: general and offer overviews show refunds and chargebacks as one
metric, its share of period gross revenue, and total impact including configured
gateway penalties. The refunds page adds timeline/moving average, previous-period
comparison, purchase-month cohorts, offer/gateway/product rankings and reversal
delay distribution. No webhook replays, order mutations or destination deliveries.

## Accounting

- One reversed principal per order, on its first financial reversal timestamp.
  Refund wins ties. Replays never move the lifecycle date.
- Gross includes all approved orders in the purchase window, including orders
  subsequently reversed. The denominator is gross, not retained revenue.
- Period flow is reversals occurring during the selected window divided by gross
  purchases in that window. It can exceed 100% due to older purchases.
- Cohorts instead group by purchase month and observe reversals through report
  time. Recent cohorts are explicitly immature, not directly comparable.
- Amounts use BRL snapshots or identified cached conversions. Missing conversions
  and missing fee configuration must be visible rather than silently assumed zero.
- Unified total impact = reversed principal + applicable configured penalty.
  Operational gateway fees and reserves are not reversal penalties.
- Percentages with a zero denominator are unavailable, not zero. Combined rates
  use summed numerators and denominators, not averages of offer percentages.

## Presentation and safety

Reuse the current theme, date/month filters and privacy mode. Show accessible
responsive charts and textual summaries with no reliance on color alone. Expose
only owner-authorized offers (or administrator scope). Rankings and graph filters
must share the same scope and accounting basis. Compare equal-length prior
windows; percentage changes from zero are unavailable. Calendar periods use
America/Sao_Paulo. Report aging measures explicitly exclude unknown/invalid dates.

## Validation

Unit tests for weighted rates, previous-period comparisons, bucket/calendar
boundaries, zero and missing data, fee separation and cohorts. Disposable local
PostgreSQL tests exercise actual route SQL, first-reversal dedupe and tenant
isolation. API/web typechecks and builds before deployment; verify exact deployed
revision and health without making production financial writes.
