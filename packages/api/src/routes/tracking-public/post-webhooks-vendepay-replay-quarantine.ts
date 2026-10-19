import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { normalizeVendepay } from '../../integrations/vendepay/normalize.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { WEBHOOK_REPLAY_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  VENDEPAY_REPLAY_MAX_ATTEMPTS,
  vendepayReplayFailureTransition,
  vendepayReplaySucceeded,
} from '../../services/vendepay-replay.js';
import { tokenHash } from './webhook-security.js';

export function registerPostWebhooksVendepayReplayQuarantineRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay/replay-quarantine',
    {
      bodyLimit: 1024,
      logLevel: 'silent',
      config: { rateLimit: WEBHOOK_REPLAY_RATE_LIMIT },
    },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = tokenHash(req.query.token);
      const [connection] = await app.db<
        Array<{
          id: string;
          project_id: string;
          signing_secret_encrypted: string | null;
        }>
      >`
        SELECT id,project_id,signing_secret_encrypted
        FROM vendepay_connections
        WHERE token_hash = ${candidate} AND enabled = true
        LIMIT 1
      `;
      if (!connection) return reply.code(404).send({ accepted: false });
      const [gatewaySigning] = await app.db<Array<{ signing_secret_encrypted: string | null }>>`
        SELECT signing_secret_encrypted
        FROM tracking_gateway_connections
        WHERE provider='vendepay' AND project_id=${connection.project_id} AND enabled=true
        LIMIT 1
      `;
      const encryptedSigningSecret =
        gatewaySigning?.signing_secret_encrypted ?? connection.signing_secret_encrypted;
      if (encryptedSigningSecret && !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ accepted: false, error: 'signature_unavailable' });
      }
      let signingSecret: string | null = null;
      if (encryptedSigningSecret && env.TRACKING_ENCRYPTION_KEY) {
        try {
          signingSecret = decryptSecret(encryptedSigningSecret, env.TRACKING_ENCRYPTION_KEY);
        } catch (error) {
          req.log.error({ error }, 'VendePay replay signing secret could not be decrypted');
          return reply.code(503).send({ accepted: false, error: 'signature_unavailable' });
        }
      }

      const receipts = await app.db.begin(
        async (sql) => sql<Array<{ id: string; payload: unknown; replay_attempts: number }>>`
        WITH selected AS (
          SELECT id
          FROM webhook_receipts
          WHERE connection_id = ${connection.id}
            AND state = 'quarantined'
            AND COALESCE(replay_state, 'quarantined') = 'quarantined'
            AND replay_attempts < ${VENDEPAY_REPLAY_MAX_ATTEMPTS}
          ORDER BY received_at ASC
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        )
        UPDATE webhook_receipts receipt
        SET replay_attempts = receipt.replay_attempts + 1,
            last_replay_at = now(),
            replay_state = 'replaying'
        FROM selected
        WHERE receipt.id = selected.id
        RETURNING receipt.id, receipt.payload, receipt.replay_attempts
        `,
      );
      let replayed = 0;
      let stillQuarantined = 0;
      let failed = 0;
      for (const receipt of receipts) {
        if (normalizeVendepay(receipt.payload).kind !== 'processable') {
          const failure = vendepayReplayFailureTransition(receipt.replay_attempts - 1);
          await app.db`
            UPDATE webhook_receipts
            SET state=${failure.terminal ? 'failed' : 'quarantined'},
                replay_state=${failure.replayState},
                processed_at=CASE
                  WHEN ${failure.terminal} THEN COALESCE(processed_at,now())
                  ELSE processed_at
                END
            WHERE id=${receipt.id} AND replay_state='replaying'
          `;
          if (failure.terminal) failed += 1;
          else stillQuarantined += 1;
          continue;
        }
        const rawPayload = JSON.stringify(receipt.payload);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/webhooks/vendepay?token=${encodeURIComponent(req.query.token)}`,
          headers: {
            'content-type': 'application/json',
            ...(signingSecret
              ? {
                  'x-vendepay-signature': createHmac('sha256', signingSecret)
                    .update(rawPayload)
                    .digest('hex'),
                }
              : {}),
          },
          payload: rawPayload,
        });
        let responseBody: unknown;
        try {
          responseBody = response.json();
        } catch {
          responseBody = null;
        }
        if (vendepayReplaySucceeded(response.statusCode, responseBody)) {
          await app.db`
            UPDATE webhook_receipts
            SET state='processed', replay_state='replayed', processed_at=COALESCE(processed_at,now())
            WHERE id=${receipt.id} AND replay_state='replaying'
          `;
          replayed += 1;
        } else {
          const failure = vendepayReplayFailureTransition(receipt.replay_attempts - 1);
          await app.db`
            UPDATE webhook_receipts
            SET state=${failure.terminal ? 'failed' : 'quarantined'},
                replay_state=${failure.replayState},
                processed_at=CASE
                  WHEN ${failure.terminal} THEN COALESCE(processed_at,now())
                  ELSE processed_at
                END
            WHERE id=${receipt.id} AND replay_state='replaying'
          `;
          failed += 1;
          if (!failure.terminal) stillQuarantined += 1;
        }
      }
      return reply.send({
        accepted: true,
        inspected: receipts.length,
        replayed,
        still_quarantined: stillQuarantined,
        failed,
      });
    },
  );
}
