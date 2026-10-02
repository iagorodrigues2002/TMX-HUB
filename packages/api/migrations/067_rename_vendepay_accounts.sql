-- Public account names only. Connection ids, webhook URLs, encrypted secrets and
-- orders are intentionally untouched.
UPDATE vendepay_connections
SET name = CASE
  WHEN lower(name) LIKE '%iago%' OR lower(name) LIKE '%mainex%' THEN 'VendePay Mainex'
  WHEN lower(name) LIKE '%lucas%' OR lower(name) LIKE '%cobrak%' THEN 'VendePay Cobrak'
  ELSE name
END
WHERE lower(name) LIKE '%iago%'
   OR lower(name) LIKE '%lucas%'
   OR lower(name) LIKE '%mainex%'
   OR lower(name) LIKE '%cobrak%';
