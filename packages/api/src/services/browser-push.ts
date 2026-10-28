import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { z } from 'zod';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { assertSafeOutboundUrl } from '../lib/url-safety.js';

export const pushId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');
export const pushConfigured = () => !!(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);
export const pushSecret = () => env.TRACKING_ENCRYPTION_KEY ?? env.JWT_SECRET;
export function allowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      (!u.port || u.port === '443') &&
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(allowedPushEndpoint),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[\w-]{87}=?$/)
      .refine((s) => Buffer.from(s, 'base64url').length === 65),
    auth: z
      .string()
      .regex(/^[\w-]{22}={0,2}$/)
      .refine((s) => Buffer.from(s, 'base64url').length === 16),
  }),
});

type PushApp = Pick<FastifyInstance, 'db' | 'userStore' | 'offerStore' | 'log'>;
export async function runBrowserPush(app: PushApp, send = webpush.sendNotification) {
  if (!app.db || !pushConfigured()) return;
  const db = app.db;
  await db`UPDATE browser_push_deliveries d SET state='skipped'
    FROM browser_sale_events e,tracking_orders o
    WHERE d.order_id=e.order_id AND o.id=e.order_id AND d.state IN ('pending','processing')
      AND (e.created_at<=now()-interval '60 seconds' OR o.status<>'paid')`;
  // Delivery identity survives retries/restarts; registration time excludes old sales.
  await db`INSERT INTO browser_push_deliveries(order_id,subscription_id)
    SELECT e.order_id,s.id FROM browser_sale_events e
    JOIN browser_push_subscriptions s ON e.created_at>s.created_at
    WHERE e.created_at>now()-interval '60 seconds'
      AND s.updated_at>now()-interval '90 days'
    ON CONFLICT DO NOTHING`;
  const rows = await db<
    {
      order_id: string;
      subscription_id: string;
      user_id: string;
      secret_encrypted: string;
      offer_id: string;
      created_at: Date;
      attempts: number;
    }[]
  >`WITH due AS (
    SELECT d.order_id,d.subscription_id FROM browser_push_deliveries d
    WHERE d.state IN ('pending','processing') AND d.next_attempt_at<=now()
    ORDER BY d.next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE browser_push_deliveries d SET state='processing',attempts=d.attempts+1,
      next_attempt_at=now()+interval '30 seconds' FROM due
    WHERE d.order_id=due.order_id AND d.subscription_id=due.subscription_id RETURNING d.*
  ) SELECT d.*,s.user_id,s.secret_encrypted,p.offer_id,e.created_at
    FROM claimed d JOIN browser_push_subscriptions s ON s.id=d.subscription_id
    JOIN browser_sale_events e ON e.order_id=d.order_id
    JOIN tracking_orders o ON o.id=d.order_id
    JOIN tracking_projects p ON p.id=o.project_id WHERE o.status='paid'`;
  await Promise.all(
    rows.map(async (row) => {
      let state = 'skipped';
      try {
        if (Date.now() - +new Date(row.created_at) >= 60_000) return;
        const user = await app.userStore.maybeGetById(row.user_id);
        if (
          !user ||
          (user.role !== 'admin' &&
            user.allowedTools?.length &&
            !user.allowedTools.includes('ofertas'))
        )
          return;
        const offers = await app.offerStore.listAccessible(user.id, user.role === 'admin');
        if (!offers.some((offer) => offer.id === row.offer_id)) return;
        const subscription = pushSubscriptionSchema.parse(
          JSON.parse(decryptSecret(row.secret_encrypted, pushSecret())),
        );
        await assertSafeOutboundUrl(subscription.endpoint);
        // A disabled/rebound device must not receive a previously claimed delivery.
        const [active] =
          await db`SELECT id FROM browser_push_subscriptions WHERE id=${row.subscription_id}
        AND user_id=${row.user_id} AND secret_encrypted=${row.secret_encrypted}`;
        if (!active) return;
        await send(
          subscription,
          JSON.stringify({
            id: row.order_id,
            userId: row.user_id,
            createdAt: new Date(row.created_at).toISOString(),
          }),
          {
            TTL: Math.max(
              0,
              Math.floor((60_000 - (Date.now() - +new Date(row.created_at))) / 1000),
            ),
            urgency: 'high',
            timeout: 5000,
            topic: pushId(row.order_id).slice(0, 32),
            vapidDetails: {
              subject: env.WEB_PUSH_SUBJECT,
              publicKey: env.WEB_PUSH_PUBLIC_KEY!,
              privateKey: env.WEB_PUSH_PRIVATE_KEY!,
            },
          },
        );
        state = 'delivered';
        await db`UPDATE browser_push_subscriptions SET updated_at=now()
          WHERE id=${row.subscription_id} AND user_id=${row.user_id}`;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db`DELETE FROM browser_push_subscriptions WHERE id=${row.subscription_id} AND user_id=${row.user_id}`;
        state =
          row.attempts < 3 && (!status || status === 429 || status >= 500) ? 'pending' : 'dead';
        // Do not log endpoints, credentials, payloads or provider error bodies.
      } finally {
        await db`UPDATE browser_push_deliveries SET state=${state},next_attempt_at=now()+interval '5 seconds'
        WHERE order_id=${row.order_id} AND subscription_id=${row.subscription_id}`;
      }
    }),
  );
  await db`DELETE FROM browser_sale_events WHERE created_at<now()-interval '90 days'`;
  await db`DELETE FROM browser_push_subscriptions WHERE updated_at<now()-interval '90 days'`;
}

export function startBrowserPush(app: PushApp) {
  if (!pushConfigured() || !app.db) return () => {};
  let inFlight: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = runBrowserPush(app)
      .catch(() => app.log.warn('browser push cycle unavailable'))
      .finally(() => {
        inFlight = undefined;
      });
  }, 1000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await inFlight;
  };
}
