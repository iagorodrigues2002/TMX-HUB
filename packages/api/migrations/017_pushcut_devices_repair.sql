-- Repairs tracking_pushcut_destinations.devices rows that were
-- double-encoded by an early version of the create endpoint (it bound
-- JSON.stringify(devices) as a plain string parameter instead of using the
-- driver's jsonb helper, so the jsonb column ended up holding a JSON
-- *string* like "[]" instead of a real JSON array []). This broke the
-- frontend's devices.join(', ') call.
--
-- jsonb_typeof(devices) = 'string' identifies exactly the double-encoded
-- rows (a real array's typeof is 'array'). #>>'{}' unwraps the scalar
-- string's text content, which is then re-parsed as jsonb.
UPDATE tracking_pushcut_destinations
SET devices = (devices #>> '{}')::jsonb
WHERE jsonb_typeof(devices) = 'string';
