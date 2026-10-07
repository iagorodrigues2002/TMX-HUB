-- Índices críticos pra queries do dashboard sob volume (pjr_eng = 145k events).
-- Diagnóstico: pane-40 encontrou Seq Scan nas 3 queries principais.
-- O schema real chama o tipo do evento de event_name (não event_type).

CREATE INDEX IF NOT EXISTS idx_tracking_events_project_event_received
  ON tracking_events(project_id, event_name, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_events_project_visitor_received
  ON tracking_events(project_id, visitor_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_orders_project_visitor_occurred
  ON tracking_orders(project_id, visitor_id, occurred_at DESC);
