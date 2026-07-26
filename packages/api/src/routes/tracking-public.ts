import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';

const EventSchema = z.object({
  public_key: z.string().min(16).max(128),
  event_id: z.string().min(8).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128).optional(),
  event_name: z.enum(['PageView', 'ViewContent', 'InitiateCheckout']),
  event_url: z.string().url().max(4096),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  client_at: z.string().datetime().optional(),
});

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

const trackerScript = (publicKey: string) =>
  `(()=>{const K=${JSON.stringify(publicKey)},A=document.currentScript.src.replace(/\\/track\\/t\\.js.*$/,'/track/events'),C='_tmx',S='_tmx_s';let id=localStorage.getItem(C);if(!id){id=crypto.randomUUID();localStorage.setItem(C,id)}let sid=sessionStorage.getItem(S);if(!sid){sid=crypto.randomUUID();sessionStorage.setItem(S,sid)}document.cookie=C+'='+id+';path=/;max-age=31536000;SameSite=Lax';const src={};for(const [k,v] of new URL(location.href).searchParams)if(/^utm_|^(fbclid|gclid)$/.test(k))src[k]=v;for(const k of ['_fbp','_fbc']){const v=document.cookie.split('; ').find(x=>x.startsWith(k+'='))?.split('=').slice(1).join('=');if(v)src[k]=decodeURIComponent(v)}const send=(name)=>{const body=JSON.stringify({public_key:K,event_id:crypto.randomUUID(),visitor_id:id,session_id:sid,event_name:name,event_url:location.href,referrer:document.referrer||'',source:src,client_at:new Date().toISOString()});navigator.sendBeacon?navigator.sendBeacon(A,new Blob([body],{type:'application/json'})):fetch(A,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true})};send('PageView');document.addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;try{const u=new URL(a.href,location.href);if(/vendepay|checkout|pay\\./i.test(u.hostname+u.pathname)){u.searchParams.set('src',id);a.href=u.toString();send('InitiateCheckout')}}catch{}})})();`;

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { key?: string } }>('/track/t.js', async (req, reply) => {
    if (!req.query.key || !app.db) return reply.code(404).send();
    const [project] = await app.db<{ enabled: boolean }[]>`
      SELECT enabled FROM tracking_projects WHERE public_key = ${req.query.key}
    `;
    if (!project?.enabled) return reply.code(404).send();
    return reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(trackerScript(req.query.key));
  });

  app.post('/track/events', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const event = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${event.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    await app.db`
      INSERT INTO tracking_events
        (id, project_id, visitor_id, session_id, event_name, event_url, referrer, source,
         client_ip, user_agent, client_at)
      VALUES
        (${event.event_id}, ${project.id}, ${event.visitor_id}, ${event.session_id ?? null},
         ${event.event_name}, ${event.event_url}, ${event.referrer || null},
         ${app.db.json(event.source)}, ${req.ip}, ${req.headers['user-agent'] ?? null},
         ${event.client_at ?? null})
      ON CONFLICT (project_id, id) DO NOTHING
    `;
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay',
    { bodyLimit: 256 * 1024, logLevel: 'silent' },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = tokenHash(req.query.token);
      const connections = await app.db<
        Array<{ id: string; project_id: string; token_hash: string }>
      >`
        SELECT id, project_id, token_hash
        FROM vendepay_connections
        WHERE token_hash = ${candidate} AND enabled = true
        LIMIT 1
      `;
      const connection = connections[0];
      if (!connection) return reply.code(404).send({ accepted: false });

      const normalized = normalizeVendepay(req.body);
      const receiptId = ulid();
      const outcome = await app.db.begin(async (sql) => {
        const receipts = await sql<{ id: string }[]>`
          INSERT INTO webhook_receipts
            (id, connection_id, dedupe_key, payload, state, diagnostics)
          VALUES
            (${receiptId}, ${connection.id}, ${normalized.dedupeKey}, ${sql.json(req.body as never)},
             ${normalized.kind}, ${sql.json(normalized.kind === 'quarantined' ? normalized.diagnostics : [])})
          ON CONFLICT (connection_id, dedupe_key) DO NOTHING
          RETURNING id
        `;
        if (receipts.length === 0 || normalized.kind !== 'processable') {
          return { inserted: receipts.length > 0, deliveryIds: [] as string[] };
        }
        const event = normalized.event;
        const [order] = await sql<{ id: string; status: string }[]>`
          INSERT INTO tracking_orders
            (id, project_id, provider, external_id, status, amount_minor, currency,
             visitor_id, buyer, raw_status, occurred_at, paid_at)
          VALUES
            (${ulid()}, ${connection.project_id}, 'vendepay', ${event.transactionId},
             ${event.status}, ${event.amountMinor ?? null}, ${event.currency ?? null},
             ${event.trackingSrc ?? null}, ${sql.json(event.buyer)}, ${event.rawStatus ?? null},
             ${event.occurredAt}, ${event.status === 'paid' ? event.occurredAt : null})
          ON CONFLICT (project_id, provider, external_id) DO UPDATE SET
            status = CASE
              WHEN tracking_orders.status IN ('refunded', 'chargeback') THEN tracking_orders.status
              WHEN tracking_orders.status = 'paid' AND EXCLUDED.status IN ('pending', 'refused', 'unknown')
                THEN tracking_orders.status
              WHEN tracking_orders.status IN ('cancelled', 'refused') AND EXCLUDED.status IN ('pending', 'unknown')
                THEN tracking_orders.status
              ELSE EXCLUDED.status
            END,
            amount_minor = COALESCE(EXCLUDED.amount_minor, tracking_orders.amount_minor),
            currency = COALESCE(EXCLUDED.currency, tracking_orders.currency),
            visitor_id = COALESCE(EXCLUDED.visitor_id, tracking_orders.visitor_id),
            buyer = tracking_orders.buyer || EXCLUDED.buyer,
            raw_status = COALESCE(EXCLUDED.raw_status, tracking_orders.raw_status),
            occurred_at = LEAST(tracking_orders.occurred_at, EXCLUDED.occurred_at),
            paid_at = CASE
              WHEN EXCLUDED.status = 'paid' THEN COALESCE(tracking_orders.paid_at, EXCLUDED.paid_at)
              ELSE tracking_orders.paid_at
            END,
            updated_at = now()
          RETURNING id, status
        `;
        if (!order || order.status !== 'paid') return { inserted: true, deliveryIds: [] };
        const pixels = await sql<{ id: string }[]>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const deliveryIds: string[] = [];
        for (const pixel of pixels) {
          const deliveryId = ulid();
          const deliveries = await sql<{ id: string }[]>`
            INSERT INTO meta_deliveries
              (id, project_id, pixel_id, order_id, event_id)
            VALUES
              (${deliveryId}, ${connection.project_id}, ${pixel.id}, ${order.id},
               ${`vendepay:${event.transactionId}:purchase`})
            ON CONFLICT (pixel_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (deliveries[0]) deliveryIds.push(deliveries[0].id);
        }
        return { inserted: true, deliveryIds };
      });
      await Promise.allSettled(
        outcome.deliveryIds.map((deliveryId) => app.metaQueue.add('send', { deliveryId })),
      );
      return reply.code(outcome.inserted ? 202 : 200).send({
        accepted: true,
        receipt_id: receiptId,
        meta_deliveries: outcome.deliveryIds.length,
        ...(!outcome.inserted ? { duplicate: true } : {}),
      });
    },
  );
};

export default plugin;
