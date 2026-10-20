import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { normalizeAdAttribution } from '../../lib/ad-attribution.js';
import { collectNetworkIdentifiers } from '../../lib/network-detection.js';
import { encryptSecret } from '../../lib/secret-box.js';
import { checkUpsellCompatibility } from '../../services/upsell-compatibility.js';
import { configuredUpsellPage } from '../../services/upsell-observation-policy.js';
import { findVturbConversionKeyInUrl } from '../../services/vturb.js';
import { enqueueInitiateCheckout } from './attribution.js';
import { invalidateOfferAnalytics, requestCountry } from './browser-request.js';
import { EventSchema, UpsellEventSchema } from './request-schemas.js';
import { readUpsellToken } from './upsell-token.js';

export function registerPostTrackUpsellEventsRoutes(app: FastifyInstance) {
  app.post('/track/upsell/events', { bodyLimit: 32 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = UpsellEventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const input = parsed.data;
    const token = input.token ? readUpsellToken(input.token, req) : null;
    const [stage] = await app.db<
      Array<{
        id: string;
        project_id: string;
        destination_url: string;
        connection_destinations: Record<string, string>;
      }>
    >`
      SELECT us.id,us.project_id,us.destination_url,us.connection_destinations
      FROM tracking_upsell_stages us
      JOIN tracking_projects p ON p.id=us.project_id
      WHERE p.public_key=${input.public_key} AND us.stage_key=${input.stage_key}
        AND us.enabled=true LIMIT 1
    `;
    if (!stage || (token && (token.stageId !== stage.id || token.projectId !== stage.project_id))) {
      return reply.code(404).send({ accepted: false });
    }
    const visitorId = token?.visitorId ?? input.visitor_id;
    const journeyId = token?.journeyId ?? input.journey_id;
    const receivedAt = input.client_at ? new Date(input.client_at) : new Date();
    // Analytics cannot prove that two different sale IDs identify one buyer.
    // UUID/vendaId enrichment belongs to the receipt-based validation worker.
    const [approvedFront] =
      input.vendid && token
        ? await app.db<
            Array<{
              id: string;
              visitor_id: string | null;
              vendepay_connection_id: string | null;
            }>
          >`
          SELECT id,visitor_id,vendepay_connection_id FROM tracking_orders
          WHERE project_id=${stage.project_id}
            AND order_kind='front' AND provider='vendepay' AND status='paid' AND paid_at IS NOT NULL
            AND external_id=${input.vendid} AND visitor_id=${token.visitorId}
          ORDER BY paid_at DESC
          LIMIT 1
        `
        : [];
    const connectionId = approvedFront?.vendepay_connection_id;
    const destination = connectionId
      ? stage.connection_destinations?.[connectionId] ||
        stage.connection_destinations?.['gateway:vendepay'] ||
        null
      : stage.destination_url;
    const configuredPage =
      approvedFront && destination ? configuredUpsellPage(input.event_url, [destination]) : null;
    const confirmedByVendepay =
      Boolean(input.vendid && token && configuredPage) &&
      (await checkUpsellCompatibility(configuredPage!, input.vendid!));
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_events
          (id,project_id,visitor_id,journey_id,event_name,event_category,event_url,
           source,properties,client_ip,user_agent,received_at)
        VALUES(${ulid()},${stage.project_id},${visitorId},${journeyId},${input.event_name},
          'upsell',${input.event_url},${sql.json(input.source)},
          ${sql.json({ ...input.properties, upsell_stage_id: stage.id, upsell_stage_key: input.stage_key })},
          ${req.ip},${req.headers['user-agent'] ?? null},${receivedAt})
      `;
      if (
        input.vendid &&
        token &&
        approvedFront &&
        confirmedByVendepay &&
        env.TRACKING_ENCRYPTION_KEY
      ) {
        const hash = createHash('sha256').update(input.vendid).digest('hex');
        // Recheck authority after the HTTP call without keeping a transaction open during it.
        await sql`
          INSERT INTO tracking_upsell_identities
            (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,
             vendepay_connection_id)
          SELECT ${ulid()},project_id,visitor_id,${hash},
            ${encryptSecret(input.vendid, env.TRACKING_ENCRYPTION_KEY)},id,vendepay_connection_id
          FROM tracking_orders
          WHERE id=${approvedFront.id} AND project_id=${stage.project_id}
            AND order_kind='front' AND provider='vendepay' AND status='paid' AND paid_at IS NOT NULL
            AND external_id=${input.vendid} AND visitor_id=${token.visitorId}
            AND vendepay_connection_id IS NOT DISTINCT FROM ${connectionId ?? null}
          ON CONFLICT DO NOTHING
        `;
      }
    });
    return reply.code(202).send({ accepted: true });
  });

  app.post('/track/events', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const event = parsed.data;
    const [project] = await app.db<{ id: string; offer_id: string; enabled: boolean }[]>`
      SELECT id, offer_id, enabled FROM tracking_projects WHERE public_key = ${event.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    const country = requestCountry(req.headers);
    const checkoutHref = typeof event.properties.href === 'string' ? event.properties.href : null;
    const vturbKey =
      findVturbConversionKeyInUrl(checkoutHref) ?? findVturbConversionKeyInUrl(event.event_url);
    const source = normalizeAdAttribution({
      ...event.source,
      ...(vturbKey && !Object.values(event.source).includes(vturbKey) ? { vtid: vturbKey } : {}),
      ...(country ? { country } : {}),
    });
    const clickIds = collectNetworkIdentifiers(source);
    const inserted = await app.db<{ id: string; received_at: Date }[]>`
      INSERT INTO tracking_events
        (id, project_id, visitor_id, session_id, journey_id, event_name, event_category,
         event_url, page_title, referrer, source, click_ids, properties, consent_state,
         client_ip, user_agent, client_at)
      VALUES
        (${event.event_id}, ${project.id}, ${event.visitor_id}, ${event.session_id ?? null},
         ${event.journey_id ?? null}, ${event.event_name}, ${event.event_category},
         ${event.event_url}, ${event.page_title ?? null}, ${event.referrer || null},
         ${app.db.json(source)}, ${app.db.json(clickIds)}, ${app.db.json(event.properties as never)},
         ${event.consent_state ?? null}, ${req.ip}, ${req.headers['user-agent'] ?? null},
         ${event.client_at ?? null})
      ON CONFLICT (project_id, id) DO NOTHING
      RETURNING id, received_at
    `;
    await app.db`
      INSERT INTO tracking_visitors
        (project_id, visitor_id, first_source, last_source, click_ids)
      VALUES
        (${project.id}, ${event.visitor_id}, ${app.db.json(source)}, ${app.db.json(source)},
         ${app.db.json(clickIds)})
      ON CONFLICT (project_id, visitor_id) DO UPDATE SET
        last_seen_at = now(),
        last_source = CASE
          WHEN EXCLUDED.last_source = '{}'::jsonb THEN tracking_visitors.last_source
          ELSE tracking_visitors.last_source || EXCLUDED.last_source
        END,
        click_ids = CASE
          WHEN tracking_visitors.click_ids = '{}'::jsonb THEN EXCLUDED.click_ids
          ELSE tracking_visitors.click_ids
        END
    `;
    if (event.session_id) {
      await app.db`
        INSERT INTO tracking_sessions
          (project_id, session_id, visitor_id, journey_id, landing_url, referrer, source, click_ids)
        VALUES
          (${project.id}, ${event.session_id}, ${event.visitor_id}, ${event.journey_id ?? null},
           ${event.event_url}, ${event.referrer || null}, ${app.db.json(source)},
           ${app.db.json(clickIds)})
        ON CONFLICT (project_id, session_id) DO UPDATE SET
          source = tracking_sessions.source || EXCLUDED.source,
          click_ids = tracking_sessions.click_ids || EXCLUDED.click_ids,
          last_seen_at = now()
      `;
    }
    if (event.event_name === 'InitiateCheckout' && inserted[0]) {
      await enqueueInitiateCheckout(app, {
        projectId: project.id,
        eventId: inserted[0].id,
        eventAt: inserted[0].received_at,
      });
    }
    if (inserted[0]) await invalidateOfferAnalytics(app, project.offer_id);
    return reply.code(202).send({ accepted: true });
  });
}
