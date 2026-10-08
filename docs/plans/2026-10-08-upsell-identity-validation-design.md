# Automatic VendePay upsell identity validation

Approved VendePay front purchases without a confirmed buyer sale id enter a
Postgres-backed validation queue. A separate worker scans current and historical
orders (90 days, bounded batches) every 10 seconds, claiming at most two jobs
with row locks and five-minute leases. Provider calls never occur inside the
public webhook request.

Candidates come from explicit vendaId fields, followed by the canonical sale
transaction UUID. Checkout configuration ids remain excluded. Each candidate
must be accepted by the VendePay intent for a configured upsell destination of
the same project and gateway connection. Account mappings never fall back to
another connection's URL. Existing confirmed identities are preserved.

Temporary failures retry up to six times with exponential delays. Definitive
rejections are visible and can be rechecked by the existing manual recovery.
Leases allow restart recovery; exhausted leases become failed. UI refreshes
every 15 seconds and distinguishes queued, processing, retry, rejected and failed.

Validation: candidate-selection regression tests, API/web typechecks, API build,
production migration and queue/identity state inspection after deployment.
