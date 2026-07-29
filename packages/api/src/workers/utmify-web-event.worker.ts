import { Worker } from 'bullmq';
import postgres from 'postgres';
import { env } from '../env.js';
import {
  buildUtmifyWebEventPayload,
  isUtmifyWebEventAccepted,
} from '../integrations/utmify/web-events.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { UTMIFY_WEB_EVENT_QUEUE_NAME, type UtmifyWebEventJobData } from '../queues/index.js';

const UTMIFY_EVENTS_URL = 'https://tracking.utmify.com.br/tracking/v1/events';

export function createUtmifyWebEventWorker(): Worker<UtmifyWebEventJobData> | null {
  if (!env.DATABASE_URL) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const worker = new Worker<UtmifyWebEventJobData>(
    UTMIFY_WEB_EVENT_QUEUE_NAME,
    async (job) => {
      const [row] = await db<
        Array<{
          id: string;
          event_name: 'InitiateCheckout';
          pixel_external_id: string;
          event_url: string;
          page_title: string | null;
          source: Record<string, string>;
          client_ip: string | null;
          user_agent: string | null;
        }>
      >`
        SELECT ue.id, ue.event_name, ue.external_pixel_id AS pixel_external_id,
               te.event_url, te.page_title, te.source, te.client_ip, te.user_agent
        FROM tracking_utmify_web_events ue
        JOIN tracking_events te
          ON te.project_id = ue.project_id AND te.id = ue.event_id
        WHERE ue.id = ${job.data.deliveryId}
          AND ue.state <> 'delivered'
          AND ue.external_pixel_id IS NOT NULL
      `;
      if (!row) return;
      try {
        await db`
          UPDATE tracking_utmify_web_events
          SET state = 'processing', attempts = attempts + 1
          WHERE id = ${row.id}
        `;
        const payload = buildUtmifyWebEventPayload({
          eventName: row.event_name,
          pixelId: row.pixel_external_id,
          eventUrl: row.event_url,
          pageTitle: row.page_title,
          source: row.source,
          clientIp: row.client_ip,
          userAgent: row.user_agent,
        });
        const response = await fetch(UTMIFY_EVENTS_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tmx-event-id': job.data.deliveryId,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        const responseText = await response.text();
        const result = (() => {
          if (!responseText) return {};
          try {
            return JSON.parse(responseText) as Record<string, unknown>;
          } catch {
            return { message: responseText.slice(0, 800) };
          }
        })();
        if (!response.ok) {
          throw new Error(
            `UTMify Events HTTP ${response.status}: ${JSON.stringify(result).slice(0, 800)}`,
          );
        }
        if (!isUtmifyWebEventAccepted(result)) {
          throw new Error(
            `UTMify rejeitou o Pixel ID ou não registrou o evento: ${JSON.stringify(result).slice(0, 800)}`,
          );
        }
        const lead = result.lead as Record<string, unknown>;
        const event = result.event as Record<string, unknown>;
        await db`
          UPDATE tracking_utmify_web_events
          SET state = 'delivered', response_status = ${response.status},
              response = ${db.json(result as never)}, last_error = NULL, delivered_at = now()
          WHERE id = ${row.id}
        `;
        logger.info(
          { deliveryId: row.id, eventId: event._id, leadId: lead._id },
          'utmify web event delivered',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db`
          UPDATE tracking_utmify_web_events
          SET state = CASE WHEN attempts >= 8 THEN 'dead' ELSE 'failed' END,
              last_error = ${message},
              next_attempt_at = now() + make_interval(secs => LEAST(3600, 5 * power(2, attempts)))
          WHERE id = ${row.id}
        `;
        logger.warn({ deliveryId: row.id, error: message }, 'utmify web event failed');
        throw error;
      }
    },
    {
      connection: makeRedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
      concurrency: 5,
    },
  );
  worker.on('error', (error) => logger.error({ error }, 'utmify web event worker error'));
  worker.on('closed', () => void db.end({ timeout: 5 }));
  return worker;
}
