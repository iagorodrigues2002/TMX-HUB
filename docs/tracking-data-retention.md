# Tracking data retention

`tracking_events` has a 180-day retention window by default. Migration 073 adds
an index on `received_at`; it does not delete any data by itself.

## Manual execution

Run from the repository root with a database URL scoped to the intended
environment:

```bash
DATABASE_URL='postgres://…' pnpm --filter @page-cloner/api purge:tracking-events
```

Override the window only when the approved retention policy requires it:

```bash
TRACKING_EVENTS_RETENTION_DAYS=90 DATABASE_URL='postgres://…' \
  pnpm --filter @page-cloner/api purge:tracking-events
```

The script accepts an integer from 1 to 3650 and deletes rows whose
`received_at` is older than that number of days.

## Cron example

Production scheduling is intentionally not enabled by this change. An operator
can later schedule the same command daily, for example at 03:20:

```cron
20 3 * * * cd /srv/tmx-hub && TRACKING_EVENTS_RETENTION_DAYS=180 DATABASE_URL='postgres://…' pnpm --filter @page-cloner/api purge:tracking-events
```

Store `DATABASE_URL` in the scheduler's secret store, not in the crontab.
