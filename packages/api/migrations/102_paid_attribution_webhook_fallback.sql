-- Preserve the first approval's webhook when no eligible browser touch exists.
-- Existing snapshots remain immutable; historical recovery is a separate operation.
CREATE OR REPLACE FUNCTION freeze_paid_order_attribution() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  touch record;
  cutoff timestamptz;
  attribution_keys text[] := ARRAY[
    'utm_source','utm_medium','utm_campaign','utm_content','utm_term',
    'campaign_id','campaign_name','adset_id','adset_name','ad_id','ad_name',
    'placement','site_source_name','fbclid','fbc','fbp','_fbc','_fbp',
    'gclid','gbraid','wbraid','ttclid','ttp','_ttp','twclid','msclkid',
    'src','sck','vtid','sid','subid','xcod','ab_test_id','ab_variant_id',
    '_fbclid_ts','cck','tck','gck','cr','adid','adname','adset','cname',
    'sub1','sub2','sub3','sub4','sub5','sub6','sub7','sub8','sub9','sub10',
    'sub11','sub12','sub13','sub14','sub15','sub16','sub17','sub18','sub19','sub20'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.attribution_locked_at IS NOT NULL THEN
      NEW.attribution_source := OLD.attribution_source;
      NEW.visitor_id := OLD.visitor_id;
      NEW.attribution_event_id := OLD.attribution_event_id;
      NEW.attribution_locked_at := OLD.attribution_locked_at;
      RETURN NEW;
    END IF;
    IF OLD.paid_at IS NOT NULL OR OLD.status IN ('paid','refunded','chargeback') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  cutoff := COALESCE(NEW.paid_at, NEW.occurred_at, now());
  SELECT e.id, e.source || COALESCE(e.click_ids,'{}'::jsonb) AS source
  INTO touch FROM tracking_events e
  WHERE e.project_id=NEW.project_id AND e.visitor_id=NEW.visitor_id
    AND e.received_at <= cutoff
    AND (e.client_at IS NULL OR e.client_at <= cutoff)
    AND e.event_name IN ('PageView','Click','InitiateCheckout')
  ORDER BY COALESCE(e.client_at,e.received_at) DESC,e.received_at DESC,e.id DESC
  LIMIT 1;
  IF FOUND THEN
    -- Do not mix another campaign's webhook fields into an existing last touch.
    NEW.attribution_source := (COALESCE(NEW.attribution_source,'{}'::jsonb) - attribution_keys)
      || COALESCE((SELECT jsonb_object_agg(k,v)
        FROM jsonb_each(COALESCE(touch.source,'{}'::jsonb)) AS entry(k,v)
        WHERE k=ANY(attribution_keys) AND v <> 'null'::jsonb AND v <> '""'::jsonb),'{}'::jsonb);
  END IF;
  NEW.attribution_event_id := touch.id;
  NEW.attribution_locked_at := now();
  RETURN NEW;
END $$;
