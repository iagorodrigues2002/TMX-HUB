-- @concurrent
-- Ads Intelligence correlates each checkout with its latest prior PageView.
-- Keep the existing predicates and tie-break ordering; avoid scanning unrelated
-- event types or sorting every visitor history. No attribution data is changed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracking_events_previous_pageview
  ON tracking_events(project_id, visitor_id, received_at DESC, id DESC)
  WHERE event_name = 'PageView';
