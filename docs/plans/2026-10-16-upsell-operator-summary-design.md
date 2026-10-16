# Upsell approvals credited by last preapproval operator opening

User-requested business rule: credit the last authenticated operator opening
before approval of the upsell, then freeze that operator. This is operational
attribution, not proof that the operator completed the payment. Advertising
attribution from migration 099 is independent and unchanged.

Migration 100 stores one immutable credit (or explicit unmatched result) per
upsell order in a separate table. Matching is scoped to project, provider,
gateway account and stage. Origin front is resolved by exact SyzePay session,
otherwise exact known visitor, otherwise exact normalized buyer identity. More
than one eligible origin is ambiguous and remains unmatched. Never choose the
closest order simply by time. Opens after paid_at and view-only opens are not
eligible. A trigger snapshots on paid insertion/transition/classification;
ON CONFLICT preserves the result on retries and later clicks.

Existing approvals since operator auditing began are reconciled only into this
new operational table using the recorded preapproval opens. No financial order,
advertising source, webhook, delivery or payment is created/replayed.

Logs still require gateway-paid proof, excluding manual/test-only results. VendePay
receipts are normalized and checked for paid status; SyzePay requires a processed,
signature-verified paid receipt. The report covers all recorded history for the
selected offer, not a sample of the last 50 opens. Detail response arrays remain
bounded for compatibility, but the displayed table has one row per operator.
Normal users see only their own credited approvals and openings; administrators
see the offer. Choose the global winner before filtering by viewer.

Sum saved BRL conversions when available; do not query exchange rates in the
request. Unknown conversions remain separately denominated, never added across
currencies. Totals are gross approved values, not net of later refunds/chargebacks.
Missing values are not zero. Privacy masking applies to all displayed amounts.

Raw attempt records remain intact; the UI no longer repeats the per-click and
per-approval detail tables. Auto-refresh is 30 seconds while enabled. Existing
offer access rules and Douglas's administrator role are not modified by this task.

Validation uses synthetic local PostgreSQL, mocked route authorization/payment
proof tests, pure aggregation tests, static React rendering, typechecks and builds.
No real purchase, provider submission or member-account action is used as a test.
