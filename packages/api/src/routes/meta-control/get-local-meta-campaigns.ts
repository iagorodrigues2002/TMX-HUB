import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { validTrafficRange } from '../../services/local-meta-traffic.js';
import { assertAdmin } from './connection-schema.js';

const id = z.string().regex(/^\d+$/);
const accountId = z.string().regex(/^act_\d+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const numeric = z.string().regex(/^\d+(\.\d+)?$/);
const insight = z.object({
  campaignId: id,
  accountId,
  date,
  currency: z.string().regex(/^[A-Z]{3}$/),
  spend: numeric,
  impressions: numeric.nullable().default(null),
  linkClicks: numeric.nullable(),
  actions: z.array(z.object({ action_type: z.string(), value: numeric })),
  actionValues: z
    .array(z.object({ action_type: z.string(), value: numeric }))
    .nullable()
    .optional(),
  adsetId: id.optional(),
  adsetName: z.string().optional(),
  adId: id.optional(),
  adName: z.string().optional(),
  video: z.boolean().nullable().optional(),
  hour: z.number().int().min(0).max(23).optional(),
});
export const localCampaignSnapshotSchema = z.object({
  fetchedAt: z.string().datetime(),
  attribution: z.literal('adset').optional(),
  from: date,
  to: date,
  purchaseClassification: z.literal('front_only_user_confirmed').optional(),
  accounts: z.array(
    z.object({
      id: accountId,
      name: z.string(),
      businessId: id.nullable(),
      businessName: z.string().nullable(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
      timezone: z.string().nullable(),
    }),
  ),
  campaigns: z.array(
    z.object({
      id,
      name: z.string(),
      accountId,
      status: z.string(),
      effectiveStatus: z.string(),
      objective: z.string(),
      createdAt: z.string().nullable(),
      updatedAt: z.string().nullable(),
    }),
  ),
  insights: z.array(insight),
  hourly: z.array(insight).optional(),
  hourlyFailures: z.array(accountId).optional(),
  ads: z.array(z.object({ id, status: z.string() })).optional(),
  fx: z
    .object({
      base: z.literal('USD'),
      provider: z.string(),
      fetchedAt: z.string().datetime(),
      rates: z.record(
        date,
        z.record(z.string().regex(/^[A-Z]{3}$/), z.number().finite().positive()),
      ),
    })
    .optional(),
  failures: z.array(
    z.object({ accountId, stage: z.enum(['campaigns', 'insights']), code: z.number().nullable() }),
  ),
});

export function registerLocalMetaCampaignRoutes(app: FastifyInstance) {
  async function bridge(method: 'GET' | 'POST', body?: unknown) {
    const config = z
      .object({
        port: z.number().int().min(1024).max(65535),
        key: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(
        JSON.parse(
          await readFile(join(homedir(), '.codex/local-data/tmx/meta-bridge.json'), 'utf8'),
        ),
      );
    const response = await fetch(
      `http://127.0.0.1:${config.port}/${method === 'GET' ? 'status' : 'refresh'}`,
      {
        method,
        headers: { 'x-tmx-local-key': config.key, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw Error('Bridge indisponível');
    return response.json();
  }
  app.get('/meta-control/traffic/status', async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    if (env.NODE_ENV !== 'test') return reply.code(404).send({ error: 'local_preview_only' });
    if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
    try {
      return reply.send(await bridge('GET'));
    } catch {
      return reply.send({
        connected: false,
        busy: false,
        error:
          'Sessão local do System User desconectada. Os dados da última consulta foram preservados.',
      });
    }
  });
  app.post('/meta-control/traffic/refresh', async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    if (env.NODE_ENV !== 'test') return reply.code(404).send({ error: 'local_preview_only' });
    if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
    const range = z.object({ from: date, to: date }).safeParse(req.body);
    if (!range.success || !validTrafficRange(range.data.from, range.data.to))
      return reply.code(400).send({ error: 'invalid_range' });
    try {
      return reply.code(202).send(await bridge('POST', range.data));
    } catch {
      return reply.code(503).send({
        error: 'meta_session_unavailable',
        detail: 'Sessão local desconectada. A consulta anterior foi preservada.',
      });
    }
  });
  app.get('/meta-control/campaigns/local-import', async (req, reply) => {
    assertAdmin(req);
    if (env.NODE_ENV !== 'test') return reply.code(404).send({ error: 'local_preview_only' });
    if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
    const range = z.object({ from: date, to: date }).partial().safeParse(req.query);
    if (
      !range.success ||
      ((range.data.from || range.data.to) &&
        (!range.data.from || !range.data.to || !validTrafficRange(range.data.from, range.data.to)))
    )
      return reply.code(400).send({ error: 'invalid_range' });
    try {
      const directory = join(homedir(), '.codex/local-data/tmx');
      let raw: string;
      if (range.data.from && range.data.to) {
        try {
          raw = await readFile(
            join(directory, `meta-campaigns-${range.data.from}-${range.data.to}.json`),
            'utf8',
          );
        } catch {
          raw = await readFile(join(directory, 'meta-campaigns.json'), 'utf8');
        }
      } else raw = await readFile(join(directory, 'meta-campaigns.json'), 'utf8');
      const hourly = (req.query as { hourly?: string }).hourly !== '0';
      const snapshot = (
        hourly ? localCampaignSnapshotSchema : localCampaignSnapshotSchema.omit({ hourly: true })
      ).parse(JSON.parse(raw));
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(snapshot);
    } catch {
      return reply.code(404).send({
        error: 'local_campaigns_unavailable',
        detail: 'A consulta real ainda não está disponível. Nenhuma amostra substituiu os dados.',
      });
    }
  });
}
