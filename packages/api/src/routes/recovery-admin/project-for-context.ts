import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { NotFoundError } from '../../lib/problem.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { hash } from './settings-schema.js';

export function createProjectForContext(app: FastifyInstance) {
  const projectFor = async (offerId: string) => {
    const [project] = await app.db!<
      { id: string }[]
    >`SELECT id FROM tracking_projects WHERE offer_id=${offerId} AND enabled=true`;
    if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');
    return project;
  };

  const setupResendWebhook = async (projectId: string) => {
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) throw new Error('recovery_unavailable');
    const [channel] = await app.db<{ id: string; credentials_encrypted: string }[]>`
      SELECT id,credentials_encrypted FROM recovery_channels WHERE project_id=${projectId} AND kind='email' AND enabled=true`;
    if (!channel) throw new NotFoundError('Canal de e-mail não configurado.');
    const credentials = JSON.parse(
      decryptSecret(channel.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
    ) as { api_key: string };
    const token = randomBytes(32).toString('base64url');
    const endpoint = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/recovery/resend?token=${encodeURIComponent(token)}`;
    const response = await fetch('https://api.resend.com/webhooks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.api_key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        events: [
          'email.sent',
          'email.delivered',
          'email.opened',
          'email.clicked',
          'email.bounced',
          'email.failed',
        ],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(`Resend recusou o webhook (${response.status}): ${JSON.stringify(result)}`);
    await app.db`UPDATE recovery_channels SET webhook_token_hash=${hash(token)},provider_webhook_id=${String((result as { id?: string }).id ?? '') || null},updated_at=now() WHERE id=${channel.id}`;
    return { ok: true, webhook_id: (result as { id?: string }).id ?? null };
  };

  const reconcileResendDeliveries = async (projectId: string) => {
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return;
    const db = app.db;
    const [channel] = await db<
      Array<{ id: string; credentials_encrypted: string }>
    >`SELECT id,credentials_encrypted FROM recovery_channels
      WHERE project_id=${projectId} AND kind='email' AND enabled=true`;
    if (!channel) return;
    let apiKey: string;
    try {
      apiKey = (
        JSON.parse(decryptSecret(channel.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY)) as {
          api_key: string;
        }
      ).api_key;
    } catch {
      return;
    }
    const pending = await db<Array<{ id: string; provider_message_id: string }>>`
      SELECT id,provider_message_id FROM recovery_messages
      WHERE channel_id=${channel.id} AND state='sent' AND delivered_at IS NULL
        AND provider_message_id IS NOT NULL AND sent_at>=now()-interval '30 days'
      ORDER BY sent_at DESC LIMIT 20`;
    await Promise.allSettled(
      pending.map(async (message) => {
        const response = await fetch(
          `https://api.resend.com/emails/${encodeURIComponent(message.provider_message_id)}`,
          {
            headers: { authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(3_000),
          },
        );
        if (!response.ok) return;
        const result = (await response.json()) as { last_event?: string };
        const lastEvent = result.last_event ?? '';
        if (['delivered', 'opened', 'clicked'].includes(lastEvent)) {
          await db`UPDATE recovery_messages SET state='delivered',
            delivered_at=COALESCE(delivered_at,now())
            WHERE id=${message.id}`;
        } else if (['bounced', 'failed', 'complained'].includes(lastEvent)) {
          await db`UPDATE recovery_messages SET state='failed',
            bounced_at=CASE WHEN ${lastEvent}='bounced' THEN COALESCE(bounced_at,now()) ELSE bounced_at END,
            last_error=${`resend:${lastEvent}`} WHERE id=${message.id}`;
        }
      }),
    );
  };
  return { projectFor, setupResendWebhook, reconcileResendDeliveries };
}
