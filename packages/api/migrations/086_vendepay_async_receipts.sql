-- Keep the minimally scrubbed receipt visible for diagnostics while preserving
-- an encrypted copy only for the asynchronous processor. This lets the public
-- webhook return before attribution/PII-dependent normalization runs.
ALTER TABLE webhook_receipts
  ADD COLUMN IF NOT EXISTS processing_payload_encrypted text;

CREATE INDEX IF NOT EXISTS webhook_receipts_pending_processing_idx
  ON webhook_receipts(received_at ASC)
  WHERE state IN ('received','failed') AND processed_at IS NULL;
