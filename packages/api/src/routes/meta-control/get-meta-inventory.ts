import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { readMetaInventory } from '../../services/meta-inventory.js';
import { assertAdmin } from './connection-schema.js';

export function registerMetaInventoryRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { connection_id?: string } }>(
    '/meta-control/inventory',
    async (req, reply) => {
      assertAdmin(req);
      const parsed = z
        .object({ connection_id: z.string().trim().min(1).max(128) })
        .safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'connection_required' });
      // This snapshot contains assets only; credentials never enter the local preview.
      if (parsed.data.connection_id === 'local-import' && env.NODE_ENV === 'test') {
        if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
        try {
          const status = z.enum(['Ativo', 'Desabilitado']).nullable();
          const snapshot = z.object({
            businesses: z.array(
              z.object({ id: z.string().regex(/^\d+$/), name: z.string(), status }),
            ),
            accounts: z.array(
              z.object({
                id: z.string().regex(/^act_\d+$/),
                name: z.string(),
                businessId: z.string().nullable(),
                status,
              }),
            ),
            fetchedAt: z.string().datetime(),
            coverage: z.literal('businesses_from_assigned_accounts'),
          });
          const imported = snapshot.parse(
            JSON.parse(
              await readFile(join(homedir(), '.codex/local-data/tmx/meta-inventory.json'), 'utf8'),
            ),
          );
          return reply.send({
            ...imported,
            businesses: imported.businesses.map((b) => ({
              ...b,
              // Owner confirmed this BM; other account owners are shared, not administered BMs.
              relationship: b.id === '343982344905400' ? 'managed' : 'shared',
            })),
          });
        } catch {
          return reply.code(404).send({ error: 'local_inventory_unavailable' });
        }
      }
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'inventory_unavailable' });
      const [connection] = await app.db<
        { access_token_encrypted: string; app_secret_encrypted: string }[]
      >`
      SELECT access_token_encrypted,app_secret_encrypted FROM meta_marketing_connections
      WHERE id=${parsed.data.connection_id} AND enabled=true LIMIT 1
    `;
      if (!connection) return reply.code(409).send({ error: 'meta_connection_missing' });
      try {
        return reply.send(
          await readMetaInventory({
            token: decryptSecret(connection.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY),
            appSecret: decryptSecret(connection.app_secret_encrypted, env.TRACKING_ENCRYPTION_KEY),
            version: env.META_GRAPH_API_VERSION,
          }),
        );
      } catch {
        return reply.code(502).send({
          title: 'Não foi possível importar os ativos',
          detail:
            'Confira a conexão e as permissões do System User. O inventário anterior foi preservado.',
        });
      }
    },
  );
}
