-- The automated compatibility recovery deployed on 2026-08-22 promoted
-- manual `failed` classifications to `worked`. Those classifications were
-- based on the real iframe rendering and must remain authoritative.
CREATE TABLE IF NOT EXISTS tracking_upsell_manual_restore_20260822 AS
SELECT * FROM tracking_upsell_manual_test_results WHERE false;

INSERT INTO tracking_upsell_manual_restore_20260822
SELECT *
FROM tracking_upsell_manual_test_results
WHERE result='worked'
  AND checked_at >= timestamptz '2026-08-22 16:54:00-03'
  AND checked_at <  timestamptz '2026-08-22 17:04:00-03';

UPDATE tracking_upsell_manual_test_results
SET result='failed'
WHERE result='worked'
  AND checked_at >= timestamptz '2026-08-22 16:54:00-03'
  AND checked_at <  timestamptz '2026-08-22 17:04:00-03';

