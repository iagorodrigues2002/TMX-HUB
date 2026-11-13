-- Spy imports retain stable IDs such as sheet-33; existing UUIDs remain unchanged as text.
ALTER TABLE company_spy_visual_analyses ALTER COLUMN offer_id TYPE text USING offer_id::text;
