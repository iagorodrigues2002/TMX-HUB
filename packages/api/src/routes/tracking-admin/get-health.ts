import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import { HealthAlertActionSchema, databaseUnavailable } from './pagination-schema.js';

export function registerGetHealthRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/health', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);

    const [row] = await app.db<Array<Record<string, number | string | boolean | Date | null>>>`
      SELECT p.id AS project_id, p.enabled,
        EXISTS (SELECT 1 FROM meta_pixels mp WHERE mp.project_id=p.id AND mp.enabled) AS pixel_ready,
        EXISTS (SELECT 1 FROM tracking_utmify_destinations u WHERE u.project_id=p.id AND u.enabled) AS utmify_ready,
        EXISTS (SELECT 1 FROM tracking_domains d WHERE d.project_id=p.id AND d.enabled AND d.status IN ('active','ready','verified')) AS domain_ready,
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id=p.id AND e.received_at >= now()-interval '24 hours') AS events_24h,
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id=p.id AND e.event_name='PageView' AND e.received_at >= now()-interval '7 days') AS pageviews_7d,
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id=p.id AND e.event_name='InitiateCheckout' AND e.received_at >= now()-interval '7 days') AS ics_7d,
        (SELECT count(*)::int FROM tracking_events e WHERE e.project_id=p.id AND e.event_name='InitiateCheckout' AND e.received_at >= now()-interval '7 days'
          AND COALESCE(e.source->>'ad_id', e.source->>'adId', '') <> '') AS attributed_ics_7d,
        (SELECT count(*)::int FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id
          WHERE vc.project_id=p.id AND wr.received_at >= now()-interval '7 days') AS webhooks_7d,
        (SELECT count(*)::int FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id
          WHERE vc.project_id=p.id AND wr.state='quarantined' AND wr.received_at >= now()-interval '7 days') AS quarantined_7d,
        (SELECT count(*)::int FROM tracking_orders o WHERE o.project_id=p.id AND o.occurred_at >= now()-interval '7 days') AS orders_7d,
        (SELECT count(*)::int FROM tracking_orders o WHERE o.project_id=p.id AND o.occurred_at >= now()-interval '7 days' AND NULLIF(trim(o.visitor_id),'') IS NULL) AS orphan_orders_7d,
        (SELECT count(*)::int FROM meta_deliveries md WHERE md.project_id=p.id AND md.created_at >= now()-interval '7 days') AS meta_total_7d,
        (SELECT count(*)::int FROM meta_deliveries md WHERE md.project_id=p.id AND md.created_at >= now()-interval '7 days' AND md.state='failed') AS meta_failed_7d,
        (SELECT count(*)::int FROM tracking_delivery_outbox d WHERE d.project_id=p.id AND d.destination_kind='utmify' AND d.created_at >= now()-interval '7 days') AS utmify_total_7d,
        (SELECT count(*)::int FROM tracking_delivery_outbox d WHERE d.project_id=p.id AND d.destination_kind='utmify' AND d.created_at >= now()-interval '7 days' AND d.state IN ('failed','dead')) AS utmify_failed_7d,
        (SELECT max(e.received_at) FROM tracking_events e WHERE e.project_id=p.id) AS last_event_at
      FROM tracking_projects p WHERE p.offer_id=${req.params.id}
    `;
    if (!row) throw new NotFoundError('Projeto de tracking não encontrado.');
    const n = (key: string) => Number(row[key] ?? 0);
    const ratio = (part: number, total: number) => (total > 0 ? part / total : 1);
    const attributionRate = ratio(n('attributed_ics_7d'), n('ics_7d'));
    const successRate = (failed: number, total: number) => (total > 0 ? 1 - failed / total : 1);
    const webhookSuccess = successRate(n('quarantined_7d'), n('webhooks_7d'));
    const metaSuccess = successRate(n('meta_failed_7d'), n('meta_total_7d'));
    const utmifySuccess = successRate(n('utmify_failed_7d'), n('utmify_total_7d'));
    const orderMatch = successRate(n('orphan_orders_7d'), n('orders_7d'));
    const components = [
      {
        key: 'configuration',
        label: 'Configuração',
        score:
          [row.enabled, row.pixel_ready, row.utmify_ready, row.domain_ready].filter(Boolean)
            .length * 5,
        weight: 20,
      },
      {
        key: 'capture',
        label: 'Captura',
        score: (n('pageviews_7d') > 0 ? 12 : 0) + (n('events_24h') > 0 ? 8 : 0),
        weight: 20,
      },
      {
        key: 'attribution',
        label: 'Atribuição',
        score: Math.round(attributionRate * 20),
        weight: 20,
      },
      {
        key: 'deliveries',
        label: 'Entregas',
        score: Math.round(((metaSuccess + utmifySuccess) / 2) * 25),
        weight: 25,
      },
      {
        key: 'gateway',
        label: 'Gateway',
        score: Math.round(((webhookSuccess + orderMatch) / 2) * 15),
        weight: 15,
      },
    ];
    const score = components.reduce((sum, item) => sum + item.score, 0);
    const candidates: Array<{
      key: string;
      severity: 'warning' | 'critical';
      title: string;
      detail: string;
      metric: string;
      current: number;
      threshold: number;
    }> = [];
    if (!row.pixel_ready)
      candidates.push({
        key: 'pixel_missing',
        severity: 'critical',
        title: 'Nenhum pixel Meta ativo',
        detail:
          'A oferta não consegue retroalimentar campanhas enquanto não houver um pixel ativo.',
        metric: 'pixels',
        current: 0,
        threshold: 1,
      });
    if (!row.utmify_ready)
      candidates.push({
        key: 'utmify_missing',
        severity: 'critical',
        title: 'UTMify não está ativa',
        detail: 'Configure e habilite o destino UTMify desta oferta.',
        metric: 'utmify',
        current: 0,
        threshold: 1,
      });
    if (!row.domain_ready)
      candidates.push({
        key: 'domain_unverified',
        severity: 'warning',
        title: 'Domínio de tracking não verificado',
        detail: 'Valide o CNAME tmx do domínio para usar tracking first-party.',
        metric: 'domain',
        current: 0,
        threshold: 1,
      });
    if (n('pageviews_7d') > 0 && attributionRate < 0.9)
      candidates.push({
        key: 'low_attribution',
        severity: attributionRate < 0.7 ? 'critical' : 'warning',
        title: 'ICs sem campanha identificada',
        detail: `${Math.round((1 - attributionRate) * 100)}% dos ICs dos últimos 7 dias chegaram sem ad_id.`,
        metric: 'attribution_rate',
        current: attributionRate,
        threshold: 0.9,
      });
    if (n('meta_total_7d') > 0 && metaSuccess < 0.98)
      candidates.push({
        key: 'meta_delivery',
        severity: metaSuccess < 0.9 ? 'critical' : 'warning',
        title: 'Falhas de entrega para a Meta',
        detail: `${n('meta_failed_7d')} de ${n('meta_total_7d')} entregas falharam nos últimos 7 dias.`,
        metric: 'meta_success',
        current: metaSuccess,
        threshold: 0.98,
      });
    if (n('utmify_total_7d') > 0 && utmifySuccess < 0.98)
      candidates.push({
        key: 'utmify_delivery',
        severity: utmifySuccess < 0.9 ? 'critical' : 'warning',
        title: 'Falhas de entrega para a UTMify',
        detail: `${n('utmify_failed_7d')} de ${n('utmify_total_7d')} entregas falharam nos últimos 7 dias.`,
        metric: 'utmify_success',
        current: utmifySuccess,
        threshold: 0.98,
      });
    if (n('webhooks_7d') > 0 && webhookSuccess < 0.99)
      candidates.push({
        key: 'webhook_quarantine',
        severity: 'critical',
        title: 'Webhooks em quarentena',
        detail: `${n('quarantined_7d')} webhook(s) não puderam virar pedido.`,
        metric: 'webhook_success',
        current: webhookSuccess,
        threshold: 0.99,
      });
    if (n('orders_7d') > 0 && orderMatch < 0.95)
      candidates.push({
        key: 'orphan_orders',
        severity: 'critical',
        title: 'Pedidos sem visitante',
        detail: `${n('orphan_orders_7d')} pedido(s) não foram associados à jornada original.`,
        metric: 'order_match',
        current: orderMatch,
        threshold: 0.95,
      });

    const activeKeys = candidates.map((item) => item.key);
    for (const item of candidates) {
      await app.db`
        INSERT INTO tracking_health_alerts (id, project_id, alert_key, severity, title, detail, metric, current_value, threshold_value)
        VALUES (${ulid()}, ${String(row.project_id)}, ${item.key}, ${item.severity}, ${item.title}, ${item.detail}, ${item.metric}, ${item.current}, ${item.threshold})
        ON CONFLICT (project_id, alert_key) DO UPDATE SET severity=EXCLUDED.severity, title=EXCLUDED.title,
          detail=EXCLUDED.detail, current_value=EXCLUDED.current_value, threshold_value=EXCLUDED.threshold_value,
          last_seen_at=now(), state=CASE WHEN tracking_health_alerts.state='resolved' THEN 'active' ELSE tracking_health_alerts.state END,
          resolved_at=NULL
      `;
    }
    await app.db`
      UPDATE tracking_health_alerts SET state='resolved', resolved_at=now()
      WHERE project_id=${String(row.project_id)} AND state <> 'resolved'
        AND alert_key <> ALL(${app.db.array(activeKeys.length ? activeKeys : ['__none__'])})
    `;
    const alerts = await app.db`
      SELECT id, alert_key, severity, title, detail, metric, current_value, threshold_value,
             state, first_seen_at, last_seen_at, acknowledged_at, resolved_at
      FROM tracking_health_alerts WHERE project_id=${String(row.project_id)}
      ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
               CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC
      LIMIT 50
    `;
    return {
      score,
      status:
        score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 55 ? 'attention' : 'critical',
      components,
      alerts,
      metrics: {
        attribution_rate: attributionRate,
        meta_success: metaSuccess,
        utmify_success: utmifySuccess,
        webhook_success: webhookSuccess,
        order_match: orderMatch,
        events_24h: n('events_24h'),
        last_event_at: row.last_event_at,
      },
    };
  });

  app.post<{ Params: { id: string; alertId: string }; Body: unknown }>(
    '/offers/:id/tracking/health/alerts/:alertId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const parsed = HealthAlertActionSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const state = parsed.data.action === 'acknowledge' ? 'acknowledged' : 'resolved';
      const rows = await app.db`
      UPDATE tracking_health_alerts a SET state=${state},
        acknowledged_at=CASE WHEN ${state}='acknowledged' THEN now() ELSE acknowledged_at END,
        resolved_at=CASE WHEN ${state}='resolved' THEN now() ELSE NULL END
      FROM tracking_projects p WHERE a.id=${req.params.alertId} AND a.project_id=p.id AND p.offer_id=${req.params.id}
      RETURNING a.id
    `;
      if (!rows[0]) throw new NotFoundError('Alerta não encontrado.');
      return reply.send({ ok: true, state });
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/utmify-pixel', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const [project] = await app.db<{ utmify_pixel_id: string | null }[]>`
        SELECT utmify_pixel_id
        FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
    if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');
    return reply.send({
      configured: Boolean(project.utmify_pixel_id),
      pixel_id: project.utmify_pixel_id,
    });
  });
}
