# Purchase/reversal date evidence

Read-only production inspection confirmed a Vendepay approved receipt and a later
chargeback receipt containing the identical original `createdAt`. That field was
previously stored for both purchase and chargeback, manufacturing zero-day delays.

The refund report now joins processed receipts to their exact order, Vendepay
connection and project. Approved-receipt timestamps establish the purchase date.
Only explicit refund/chargeback fields establish the effective reversal date.
Generic `createdAt`/`updated_at` on reversals are not evidence. Ambiguous timestamps
without a timezone are excluded.

The first received reversal notification is tracked separately. Its interval is
an operational metric that can include provider delays and historical replays,
not an estimate of the actual reversal date. Later replays cannot replace it.

No financial lifecycle timestamps, amounts, provider normalizers, delivery queues,
Meta/TikTok/UTMify payloads or stored historical records are changed. The report's
financial-period selection remains its existing ledger basis. Orders without
provable dates remain financially counted but are excluded from effective-delay
statistics. Other gateways without established date evidence also remain unknown.

UI exposes purchase date, effective reversal date and first notification date.
The operational distribution is separate and explicitly labelled. Privacy mode
masks dates, counts, intervals and distribution values.
