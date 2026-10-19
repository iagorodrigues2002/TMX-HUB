import { resolveCname, resolveTxt } from 'node:dns/promises';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import {
  type RailwayDnsRecord,
  deleteRailwayDomain,
  provisionRailwayDomain,
} from '../../integrations/railway/domains.js';
import { canonicalTrackingHostname } from '../../services/tracking-domain.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import {
  DomainSchema,
  GatewaySchema,
  MetaRulesSchema,
  databaseUnavailable,
  parsed,
} from './database-unavailable.js';

export function registerPostMetaPurchasesReconcileRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/meta-purchases/reconcile',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });

      const [result = { orders: 0, pixels: 0, delivery_ids: [] }] = await app.db<
        Array<{ orders: number; pixels: number; delivery_ids: string[] }>
      >`
        WITH orders AS MATERIALIZED (
          SELECT id, external_id, COALESCE(paid_at, occurred_at) AS event_at
          FROM tracking_orders
          WHERE project_id = ${p.id} AND status = 'paid' AND order_kind = 'front'
        ), pixels AS MATERIALIZED (
          SELECT id FROM meta_pixels
          WHERE project_id = ${p.id} AND enabled = true
        ), deliveries AS (
          INSERT INTO meta_deliveries AS existing
            (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
             outgoing_event_id)
          SELECT
            'meta-reconcile:' || pixel.id || ':' || orders.id,
            ${p.id}, pixel.id, orders.id,
            'vendepay:' || orders.external_id || ':purchase',
            'Purchase', orders.event_at, NULL
          FROM orders
          CROSS JOIN pixels pixel
          ON CONFLICT (pixel_id, event_id) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            event_name = 'Purchase',
            event_at = EXCLUDED.event_at,
            state = 'pending',
            attempts = 0,
            last_error = NULL
          WHERE existing.state <> 'delivered'
          RETURNING id
        )
        SELECT
          (SELECT count(*)::integer FROM orders) AS orders,
          (SELECT count(*)::integer FROM pixels) AS pixels,
          COALESCE((SELECT array_agg(id) FROM deliveries), ARRAY[]::text[]) AS delivery_ids
      `;

      await Promise.allSettled(
        result.delivery_ids.map((id) =>
          app.metaQueue.add('send', { deliveryId: id }, { jobId: `${id}-reconcile-${Date.now()}` }),
        ),
      );
      return reply.code(202).send({
        orders_found: result.orders,
        pixels_enabled: result.pixels,
        purchases_queued: result.delivery_ids.length,
      });
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/domains', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(DomainSchema, req.body);
    const kind = body.kind ?? 'source';
    const hostname = kind === 'tracking' ? canonicalTrackingHostname(body.hostname) : body.hostname;
    if (!hostname) {
      return reply.code(400).send({
        error: 'invalid_tracking_domain',
        detail: 'Informe um domínio público válido, como suaempresa.com.',
      });
    }
    const provision = kind === 'tracking' ? await provisionRailwayDomain(hostname) : null;
    if (kind === 'tracking' && !provision) {
      return reply.code(503).send({
        error: 'custom_domain_provisioning_unavailable',
        detail:
          'Configure RAILWAY_PROJECT_TOKEN no serviço da API para ativar domínios first-party com SSL automático.',
      });
    }
    const records = provision?.dnsRecords ?? [];
    const target =
      records.find((record) => !record.requiredValue.includes('verify'))?.requiredValue ??
      (kind === 'tracking' ? cnameTarget : null);
    const [row] = await app.db`
      INSERT INTO tracking_domains
        (id, project_id, hostname, kind, dns_target, provider_domain_id, dns_records)
      VALUES (${ulid()}, ${p.id}, ${hostname}, ${kind},
        ${target}, ${provision?.id ?? null}, ${app.db.json(records as never)})
      ON CONFLICT (project_id, hostname) DO UPDATE SET enabled=true, kind=excluded.kind,
        dns_target=excluded.dns_target, provider_domain_id=excluded.provider_domain_id,
        dns_records=excluded.dns_records
      RETURNING id, hostname, kind, dns_target, dns_records, enabled, status, created_at`;
    return reply.code(201).send(row);
  });

  app.post<{ Params: { id: string; domainId: string } }>(
    '/offers/:id/tracking/domains/:domainId/verify',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const [row] = await app.db<
        Array<{
          hostname: string;
          kind: 'source' | 'tracking';
          dns_target: string | null;
          dns_records: RailwayDnsRecord[];
        }>
      >`
        SELECT hostname, kind, dns_target, dns_records FROM tracking_domains
        WHERE id=${req.params.domainId} AND project_id=${p.id}`;
      if (!row) return reply.code(404).send({ error: 'domain_not_found' });
      if (row.kind === 'tracking') {
        const checks = await Promise.all(
          row.dns_records.map(async (record) => {
            const recordName =
              record.hostlabel === '@' || record.hostlabel === row.hostname
                ? row.hostname
                : record.hostlabel.endsWith(row.hostname)
                  ? record.hostlabel
                  : `${record.hostlabel}.${row.hostname}`;
            const expected = record.requiredValue.replace(/\.$/, '').toLowerCase();
            try {
              if (expected.includes('verify')) {
                const values = (await resolveTxt(recordName)).flat();
                return values.some((value) => value.toLowerCase() === expected);
              }
              const aliases = await resolveCname(recordName);
              return aliases.some((alias) => alias.replace(/\.$/, '').toLowerCase() === expected);
            } catch {
              return false;
            }
          }),
        );
        const dnsReady = checks.length > 0 && checks.every(Boolean);
        const seen = await app.db<Array<{ ok: boolean }>>`
          SELECT EXISTS(
            SELECT 1 FROM tracking_events
            WHERE project_id=${p.id}
              AND lower(event_url) LIKE ${`%://${row.hostname}/%`}
          ) AS ok`;
        const live = dnsReady && Boolean(seen[0]?.ok);
        const status = live ? 'live' : dnsReady ? 'dns_verified' : 'pending_dns';
        const detail = live
          ? 'DNS confirmado e domínio recebendo eventos.'
          : dnsReady
            ? 'DNS confirmado. Instale o script usando este domínio e abra a página uma vez.'
            : 'Configure todos os registros CNAME e TXT exibidos pelo TMX.';
        await app.db`UPDATE tracking_domains SET status=${status},
          dns_verified_at=${dnsReady ? new Date() : null}, last_checked_at=now(),
          last_error=${live ? null : detail}
          WHERE id=${req.params.domainId}`;
        return { status, detail, dns_records: row.dns_records };
      }
      const seen = await app.db<Array<{ ok: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM tracking_events
          WHERE project_id=${p.id}
            AND lower(event_url) LIKE ${`%://${row.hostname}/%`}
        ) AS ok`;
      const status = seen[0]?.ok ? 'live' : 'pending';
      await app.db`UPDATE tracking_domains SET status=${status}, last_checked_at=now(),
        last_error=${status === 'live' ? null : 'Aguardando o primeiro evento deste domínio.'}
        WHERE id=${req.params.domainId}`;
      return {
        status,
        detail:
          status === 'live'
            ? 'Domínio recebendo eventos.'
            : 'Instale o código e abra a página uma vez.',
      };
    },
  );

  app.delete<{ Params: { id: string; domainId: string } }>(
    '/offers/:id/tracking/domains/:domainId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (p) {
        const domains = await app.db<Array<{ provider_domain_id: string | null }>>`
          SELECT provider_domain_id FROM tracking_domains
          WHERE id=${req.params.domainId} AND project_id=${p.id}
        `;
        if (domains[0]?.provider_domain_id) {
          await deleteRailwayDomain(domains[0].provider_domain_id);
        }
        await app.db`DELETE FROM tracking_domains WHERE id=${req.params.domainId} AND project_id=${p.id}`;
      }
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { id: string } }>('/offers/:id/tracking/meta-rules', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const body = parsed(MetaRulesSchema, req.body);
    const [row] = await app.db`
      INSERT INTO tracking_meta_rules(project_id, attributed_only, minimum_amount_minor)
      VALUES (${p.id}, ${body.attributed_only}, ${body.minimum_amount_minor})
      ON CONFLICT(project_id) DO UPDATE SET attributed_only=excluded.attributed_only,
        minimum_amount_minor=excluded.minimum_amount_minor, updated_at=now()
      RETURNING attributed_only, minimum_amount_minor, updated_at`;
    return row;
  });

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/gateways', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const body = parsed(GatewaySchema, req.body);
    const [row] = await app.db`
      INSERT INTO tracking_gateway_connections(id, project_id, provider, propagation_param)
      VALUES (${ulid()}, ${p.id}, ${body.provider}, ${body.propagation_param ?? 'src'})
      ON CONFLICT(project_id, provider) DO UPDATE SET enabled=true,
        propagation_param=excluded.propagation_param
      RETURNING id, provider, propagation_param, enabled, created_at`;
    return reply.code(201).send(row);
  });
}
