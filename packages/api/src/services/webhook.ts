import { createHmac } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

export interface WebhookPayload {
  id: string;
  status: string;
  url: string;
  final_url?: string;
  error?: { code: string; message: string };
  created_at: string;
  updated_at: string;
}

export async function fireWebhook(webhookUrl: string, payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
  const log = logger.child({ webhook: webhookUrl, jobId: payload.id });

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pagecloner-signature': `sha256=${signature}`,
        'x-pagecloner-event': 'clone.completed',
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      log.warn({ status: res.status }, 'webhook delivery returned non-2xx');
    } else {
      log.info({ status: res.status }, 'webhook delivered');
    }
  } catch (err) {
    log.error({ err }, 'webhook delivery failed');
  }
}
