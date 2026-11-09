import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { validTrafficRange } from '../../services/local-meta-traffic.js';
import { assertAdmin } from './connection-schema.js';

const minor = z
  .string()
  .regex(/^-?\d+$/)
  .refine((value) => Number.isSafeInteger(Number(value)));
const offer = z.object({
  offer_id: z.string().min(1).max(100),
  offer_name: z.string().min(1).max(300),
  owner_id: z.string().min(1).max(100),
  fees_missing_operations: z.number().int().nonnegative(),
  gross_revenue_brl_minor: minor,
  gross_revenue_usd_minor: minor,
  net_available_brl_minor: minor,
  net_available_usd_minor: minor,
});
export const localFinanceSchema = z
  .object({
    source: z.literal('https://theminex.com'),
    ownerId: z.literal('01KQSEXEWXZ9Y67V2HFK18JHJB'),
    ownerName: z.string().min(1).max(200),
    from: z.string(),
    to: z.string(),
    fetchedAt: z.string().datetime(),
    natural: z.object({ offers: z.array(offer) }),
    general: z.object({ offers: z.array(offer) }),
  })
  .refine((data) =>
    [...data.natural.offers, ...data.general.offers].every((row) => row.owner_id === data.ownerId),
  );

export function registerLocalTrafficFinanceRoutes(app: FastifyInstance) {
  app.get('/meta-control/traffic/service', async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    if (env.NODE_ENV !== 'test') return reply.code(404).send({ error: 'local_preview_only' });
    if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
    try {
      const period = z.object({
        date: z.string(),
        metaAt: z.string().nullable(),
        financeAt: z.string().nullable(),
        error: z.string().max(1000),
      });
      const state = z
        .object({
          pid: z.number().int().positive(),
          automatic: z.boolean(),
          startedAt: z.string().datetime(),
          updatedAt: z.string().datetime(),
          busy: z.boolean(),
          todayIntervalMs: z.literal(600000),
          yesterdayIntervalMs: z.literal(3600000),
          credentialStore: z.enum(['macos-keychain', 'server-environment']),
          periods: z.partialRecord(z.enum(['today', 'yesterday']), period),
          error: z.string().max(2000),
        })
        .parse(
          JSON.parse(
            await readFile(join(homedir(), '.codex/local-data/tmx/traffic-service.json'), 'utf8'),
          ),
        );
      process.kill(state.pid, 0);
      return reply.send({
        ...state,
        running: state.automatic && Math.abs(Date.now() - Date.parse(state.updatedAt)) < 90000,
      });
    } catch {
      return reply.send({ running: false, automatic: false });
    }
  });
  app.get('/meta-control/traffic/finance', async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    if (env.NODE_ENV !== 'test') return reply.code(404).send({ error: 'local_preview_only' });
    if (req.user?.sub !== 'admin') return reply.code(403).send({ error: 'preview_owner_only' });
    const range = z.object({ from: z.string(), to: z.string() }).safeParse(req.query);
    if (!range.success || !validTrafficRange(range.data.from, range.data.to))
      return reply.code(400).send({ error: 'invalid_range' });
    try {
      const config = z
        .object({
          port: z.number().int().min(1024).max(65535),
          key: z.string().regex(/^[a-f0-9]{64}$/),
          viewerUserId: z.string().min(1),
        })
        .parse(
          JSON.parse(
            await readFile(join(homedir(), '.codex/local-data/tmx/finance-bridge.json'), 'utf8'),
          ),
        );
      if (req.user?.sub !== config.viewerUserId)
        return reply.code(403).send({ error: 'finance_owner_forbidden' });
      const response = await fetch(
        `http://127.0.0.1:${config.port}/finance?${new URLSearchParams(range.data)}`,
        {
          headers: { 'x-tmx-local-key': config.key },
          signal: AbortSignal.timeout(55000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw Error('finance_unavailable');
      const data = localFinanceSchema.parse(await response.json());
      if (data.from !== range.data.from || data.to !== range.data.to) throw Error('range_mismatch');
      return reply.send(data);
    } catch {
      return reply.code(503).send({
        error: 'finance_unavailable',
        detail:
          'Não foi possível ler os resultados reais do TMX neste período. Nenhum resultado da Meta foi usado como substituto.',
      });
    }
  });
}
