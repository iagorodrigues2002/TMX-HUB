import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import {
  parseSyzepayEvent,
  syzepayPurchaseAllowed,
  verifySyzepaySignature,
} from '../lib/syzepay-contract.js';
import { readTrackingTokenWithRotation } from '../lib/tracking-token.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/problem.js';
import { convertToBrlMinor } from './exchange-rate.js';

export type SyzeKind = 'front' | 'upsell' | `upsell_${number}`;
export async function ownedSyzeConnection(
  app: FastifyInstance,
  connectionId: string,
  ownerId: string,
) {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
    throw new BadRequestError('Infraestrutura SyzePay indisponível.');
  const [c] = await app.db<
    {
      id: string;
      owner_id: string;
      company_name: string;
      signing_secret_encrypted: string | null;
      enabled: boolean;
    }[]
  >`SELECT id,owner_id,company_name,signing_secret_encrypted,enabled FROM syzepay_company_connections WHERE id=${connectionId} AND owner_id=${ownerId}`;
  if (!c) throw new NotFoundError();
  return c;
}
export async function listSyzepayOrders(
  app: FastifyInstance,
  connectionId: string,
  ownerId: string,
) {
  const c = await ownedSyzeConnection(app, connectionId, ownerId);
  const offers = (await app.offerStore.listByUser(ownerId)).filter(
    (o) =>
      o.userId === ownerId &&
      o.companyName?.trim().toLowerCase() === c.company_name.trim().toLowerCase(),
  );
  const receipts = await app.db!<
    {
      id: string;
      body_encrypted: string;
      headers_encrypted: string;
      received_at: Date;
      state: string;
      tracking_order_id: string | null;
    }[]
  >`SELECT id,body_encrypted,headers_encrypted,received_at,state,tracking_order_id FROM syzepay_inbox_receipts WHERE connection_id=${c.id} ORDER BY received_at DESC LIMIT 200`;
  const groups = new Map<
    string,
    {
      order_id: string;
      store_id: string;
      amount_minor: number;
      currency: string;
      types: string[];
      receipt_ids: string[];
      signature_valid: boolean;
      status: string;
      hint_offer_id: string | null;
      tracking_order_id: string | null;
      mapping: null | { offer_id: string; order_kind: string };
    }
  >();
  const mappings = await app.db!<
    { external_order_id: string; offer_id: string; order_kind: string }[]
  >`SELECT m.external_order_id,p.offer_id,m.order_kind FROM syzepay_order_mappings m JOIN tracking_projects p ON p.id=m.project_id WHERE m.connection_id=${c.id}`;
  for (const r of receipts) {
    let event;
    const raw = Buffer.from(
      decryptSecret(r.body_encrypted, env.TRACKING_ENCRYPTION_KEY!),
      'base64',
    );
    try {
      event = parseSyzepayEvent(raw);
    } catch {
      continue;
    }
    const o = event.data.object;
    const headers = JSON.parse(decryptSecret(r.headers_encrypted, env.TRACKING_ENCRYPTION_KEY!));
    const valid =
      !!c.signing_secret_encrypted &&
      verifySyzepaySignature(
        raw,
        headers['x-syzepay-signature'],
        decryptSecret(c.signing_secret_encrypted!, env.TRACKING_ENCRYPTION_KEY!),
        new Date(r.received_at),
      );
    const token = o.utm?.src
      ? readTrackingTokenWithRotation(o.utm.src, env.WEBHOOK_SECRET, env.WEBHOOK_SECRET_PREV)
      : null;
    const [project] = token
      ? await app.db!<
          { offer_id: string }[]
        >`SELECT offer_id FROM tracking_projects WHERE id=${token.payload.projectId}`
      : [];
    const hint = project && offers.some((x) => x.id === project.offer_id) ? project.offer_id : null;
    const mapping = mappings.find((m) => m.external_order_id === o.id);
    const group = groups.get(o.id) ?? {
      order_id: o.id,
      store_id: o.store_id,
      amount_minor: o.amount,
      currency: o.currency,
      types: [],
      receipt_ids: [],
      signature_valid: true,
      status: 'awaiting_mapping',
      hint_offer_id: hint,
      tracking_order_id: null,
      mapping: mapping ? { offer_id: mapping.offer_id, order_kind: mapping.order_kind } : null,
    };
    group.types.push(event.type);
    group.receipt_ids.push(r.id);
    group.signature_valid &&= valid;
    if (r.tracking_order_id) {
      group.tracking_order_id = r.tracking_order_id;
      group.status = 'processed';
    }
    groups.set(o.id, group);
  }
  return {
    orders: [...groups.values()],
    offers: offers.map((o) => ({ id: o.id, name: o.name })),
    signing_secret_configured: !!c.signing_secret_encrypted,
  };
}

export async function classifySyzepayOrder(
  app: FastifyInstance,
  args: { connectionId: string; ownerId: string; orderId: string; offerId: string; kind: SyzeKind },
) {
  const c = await ownedSyzeConnection(app, args.connectionId, args.ownerId);
  if (!c.enabled) throw new ConflictError('Recepção desta conexão está pausada.');
  if (!c.signing_secret_encrypted)
    throw new ConflictError('Configure o secret de assinatura antes de processar.');
  const offer = await app.offerStore.assertOwner(args.offerId, args.ownerId);
  if (offer.companyName?.trim().toLowerCase() !== c.company_name.trim().toLowerCase())
    throw new ConflictError('A oferta pertence a outra empresa.');
  const [p] = await app.db!<
    { id: string }[]
  >`SELECT id FROM tracking_projects WHERE offer_id=${offer.id} AND enabled`;
  if (!p) throw new ConflictError('Ative o tracking da oferta antes de classificar.');
  const rows = await app.db!<
    { id: string; body_encrypted: string; headers_encrypted: string; received_at: Date }[]
  >`SELECT id,body_encrypted,headers_encrypted,received_at FROM syzepay_inbox_receipts WHERE connection_id=${c.id} ORDER BY received_at DESC LIMIT 1000`;
  const candidates: Array<{
    receipt: (typeof rows)[number];
    event: ReturnType<typeof parseSyzepayEvent>;
  }> = [];
  const diagnosticIds: string[] = [];
  for (const r of rows) {
    const raw = Buffer.from(
      decryptSecret(r.body_encrypted, env.TRACKING_ENCRYPTION_KEY!),
      'base64',
    );
    let event;
    try {
      event = parseSyzepayEvent(raw);
    } catch {
      try {
        const diagnostic = JSON.parse(raw.toString());
        if (diagnostic.tmx_diagnostic === true && !diagnostic.type && !diagnostic.data)
          diagnosticIds.push(r.id);
      } catch {}
      continue;
    }
    if (event.data.object.id !== args.orderId) continue;
    const headers = JSON.parse(decryptSecret(r.headers_encrypted, env.TRACKING_ENCRYPTION_KEY!));
    if (
      !verifySyzepaySignature(
        raw,
        headers['x-syzepay-signature'],
        decryptSecret(c.signing_secret_encrypted, env.TRACKING_ENCRYPTION_KEY!),
        new Date(r.received_at),
      )
    )
      throw new ConflictError('Assinatura inválida: nenhum envio foi realizado.');
    candidates.push({ receipt: r, event });
  }
  const paid = candidates.find((x) => syzepayPurchaseAllowed(x.event));
  if (!paid) throw new ConflictError('Nenhum order.paid aprovado de produção para este pedido.');
  const event = paid.event;
  const o = event.data.object;
  const token = o.utm?.src
    ? readTrackingTokenWithRotation(o.utm.src, env.WEBHOOK_SECRET, env.WEBHOOK_SECRET_PREV)
    : null;
  if (token && token.payload.projectId !== p.id)
    throw new ConflictError('O token TMX identifica outra oferta.');
  const conversion = await convertToBrlMinor(o.amount, o.currency, app.db!);
  if (!conversion) throw new ConflictError('Cotação indisponível; nenhuma venda foi criada.');
  const fee =
    o.fee_amount == null ? null : await convertToBrlMinor(o.fee_amount, o.currency, app.db!);
  const net =
    o.net_amount == null ? null : await convertToBrlMinor(o.net_amount, o.currency, app.db!);
  const outcome = await app.db!.begin(async (sql) => {
    await sql`SELECT id FROM syzepay_company_connections WHERE id=${c.id} FOR UPDATE`;
    const [mapping] = await sql<
      { project_id: string; order_kind: string }[]
    >`SELECT project_id,order_kind FROM syzepay_order_mappings WHERE connection_id=${c.id} AND external_order_id=${o.id}`;
    if (mapping && (mapping.project_id !== p.id || mapping.order_kind !== args.kind))
      throw new ConflictError(
        'Pedido já classificado. Não é permitido reenviá-lo com outra etapa/oferta.',
      );
    await sql`INSERT INTO syzepay_order_mappings(connection_id,external_order_id,project_id,order_kind,actor_id) VALUES(${c.id},${o.id},${p.id},${args.kind},${args.ownerId}) ON CONFLICT DO NOTHING`;
    const visitorId = token?.payload.visitorId ?? null;
    const [v] = visitorId
      ? await sql<
          {
            first_source: Record<string, string>;
            last_source: Record<string, string>;
            click_ids: Record<string, string>;
          }[]
        >`SELECT first_source,last_source,click_ids FROM tracking_visitors WHERE project_id=${p.id} AND visitor_id=${visitorId}`
      : [];
    const [browser] = visitorId
      ? await sql<
          {
            client_ip: string | null;
            user_agent: string | null;
            event_url: string | null;
            properties: Record<string, string>;
          }[]
        >`SELECT host(client_ip) AS client_ip,user_agent,event_url,properties FROM tracking_events WHERE project_id=${p.id} AND visitor_id=${visitorId} ORDER BY received_at DESC LIMIT 1`
      : [];
    const [identity] = visitorId
      ? await sql<
          { email: string | null; name: string | null }[]
        >`SELECT NULLIF(properties->>'email','') email,NULLIF(properties->>'name','') name FROM tracking_events WHERE project_id=${p.id} AND visitor_id=${visitorId} AND event_name IN ('Identify','Lead') AND NULLIF(properties->>'email','') IS NOT NULL ORDER BY received_at DESC LIMIT 1`
      : [];
    const source: Record<string, string> = {
      ...(v?.first_source ?? {}),
      ...(v?.last_source ?? {}),
      ...(v?.click_ids ?? {}),
      ...(Object.fromEntries(
        Object.entries(o.utm ?? {}).filter(
          ([, value]) => typeof value === 'string' && value.trim(),
        ),
      ) as Record<string, string>),
      ...(browser?.client_ip ? { client_ip: browser.client_ip } : {}),
      ...(browser?.user_agent ? { user_agent: browser.user_agent } : {}),
    };
    for (const key of ['ab_test_id', 'ab_variant_id'])
      if (typeof browser?.properties?.[key] === 'string') source[key] = browser.properties[key]!;
    if (fee) source.gateway_fee_in_cents = String(fee.brlMinor);
    if (net) source.gateway_net_in_cents = String(net.brlMinor);
    const product = {
      id: `tmx-syzepay:${p.id}:${args.kind}`,
      name: `${offer.name} · ${args.kind === 'front' ? 'Front' : args.kind}`,
      internal_classification: true,
      vendor_product_id: null,
      store_id: o.store_id,
    };
    const buyer = {
      ...(o.customer_email?.trim() || identity?.email
        ? { email: o.customer_email?.trim() || identity?.email }
        : {}),
      ...(o.customer_name?.trim() || identity?.name
        ? { name: o.customer_name?.trim() || identity?.name }
        : {}),
    };
    const [inserted] = await sql<
      { id: string }[]
    >`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,amount_minor,currency,amount_brl_minor,exchange_rate,converted_at,visitor_id,buyer,raw_status,occurred_at,paid_at,product,attribution_source,order_kind,syzepay_connection_id)
      VALUES(${ulid()},${p.id},'syzepay',${o.id},'paid',${o.amount},${o.currency},${conversion.brlMinor},${conversion.rate},now(),${visitorId},${sql.json(buyer)},${o.status},${new Date(o.created_at)},${new Date(Math.max(event.created * 1000, new Date(o.created_at).getTime()))},${sql.json(product)},${sql.json(source)},${args.kind},${c.id}) ON CONFLICT(project_id,provider,external_id) DO NOTHING RETURNING id`;
    const existing = inserted
      ? []
      : await sql<
          { id: string }[]
        >`SELECT id FROM tracking_orders WHERE project_id=${p.id} AND provider='syzepay' AND external_id=${o.id}`;
    const orderId = inserted?.id ?? existing[0]!.id;
    for (const item of candidates)
      await sql`UPDATE syzepay_inbox_receipts SET state=${item.event.type === 'order.paid' ? 'processed' : 'ignored'},authenticity='signature_verified',tracking_order_id=${orderId},event_id=${item.event.id},order_id=${o.id},processed_at=now() WHERE id=${item.receipt.id}`;
    for (const item of candidates)
      await sql`UPDATE syzepay_inbox_receipts r SET dedupe_key=${`event:${item.event.id}`} WHERE r.id=${item.receipt.id} AND NOT EXISTS(SELECT 1 FROM syzepay_inbox_receipts other WHERE other.connection_id=r.connection_id AND other.dedupe_key=${`event:${item.event.id}`} AND other.id<>r.id)`;
    if (diagnosticIds.length)
      await sql`UPDATE syzepay_inbox_receipts SET state='ignored',processed_at=now() WHERE connection_id=${c.id} AND id=ANY(${diagnosticIds}) AND state='awaiting_mapping'`;
    const empty = {
      meta: [] as string[],
      utmify: [] as string[],
      tiktok: [] as string[],
      pushcut: [] as string[],
    };
    if (!inserted) return { order_id: orderId, duplicate: true, ...empty };
    const utm = await sql<
      { id: string }[]
    >`SELECT id FROM tracking_utmify_destinations WHERE enabled AND (project_id=${p.id} OR (scope='global' AND COALESCE((SELECT enabled FROM tracking_utmify_global_offer_routes WHERE project_id=${p.id}),true)))`;
    for (const d of utm) {
      const [r] = await sql<
        { id: string }[]
      >`INSERT INTO tracking_delivery_outbox(id,project_id,destination_kind,destination_id,order_id,event_id,event_type) VALUES(${ulid()},${p.id},'utmify',${d.id},${orderId},${`syzepay:${o.id}:paid`},'order.paid') ON CONFLICT(destination_kind,destination_id,event_id) DO NOTHING RETURNING id`;
      if (r) empty.utmify.push(r.id);
    }
    const push = await sql<
      { id: string }[]
    >`SELECT id FROM tracking_pushcut_destinations WHERE project_id=${p.id} AND enabled AND CASE WHEN ${args.kind}='front' THEN NULLIF(front_notification_name,'') IS NOT NULL ELSE NULLIF(upsell_notification_name,'') IS NOT NULL END`;
    for (const d of push) {
      const [r] = await sql<
        { id: string }[]
      >`INSERT INTO tracking_delivery_outbox(id,project_id,destination_kind,destination_id,order_id,event_id,event_type,funnel_name) VALUES(${ulid()},${p.id},'pushcut',${d.id},${orderId},${`syzepay:${o.id}:paid`},${`order.${args.kind}`},${offer.name}) ON CONFLICT(destination_kind,destination_id,event_id) DO NOTHING RETURNING id`;
      if (r) empty.pushcut.push(r.id);
    }
    if (args.kind === 'front') {
      const pixels = await sql<
        { id: string }[]
      >`SELECT id FROM meta_pixels m WHERE project_id=${p.id} AND enabled AND (NOT EXISTS(SELECT 1 FROM meta_pixel_products pp WHERE pp.pixel_id=m.id) OR EXISTS(SELECT 1 FROM meta_pixel_products pp WHERE pp.pixel_id=m.id AND pp.product_id=${product.id}))`;
      for (const d of pixels) {
        const [r] = await sql<
          { id: string }[]
        >`INSERT INTO meta_deliveries(id,project_id,pixel_id,order_id,event_id) VALUES(${ulid()},${p.id},${d.id},${orderId},${`syzepay:${o.id}:purchase`}) ON CONFLICT(pixel_id,event_id) DO NOTHING RETURNING id`;
        if (r) empty.meta.push(r.id);
      }
      const pixelsTT = await sql<
        { id: string }[]
      >`SELECT id FROM tracking_tiktok_destinations WHERE project_id=${p.id} AND enabled`;
      for (const d of pixelsTT) {
        const [r] = await sql<
          { id: string }[]
        >`INSERT INTO tracking_tiktok_deliveries(id,project_id,destination_id,order_id,event_id,event_name) VALUES(${ulid()},${p.id},${d.id},${orderId},${`syzepay:${o.id}:purchase`},'Purchase') ON CONFLICT(destination_id,event_id) DO NOTHING RETURNING id`;
        if (r) empty.tiktok.push(r.id);
      }
    }
    return { order_id: orderId, duplicate: false, ...empty };
  });
  await app.invalidateAnalyticsCache({ offerId: offer.id });
  await Promise.allSettled([
    ...outcome.meta.map((id) => app.metaQueue.add('send', { deliveryId: id }, { jobId: id })),
    ...outcome.utmify.map((id) =>
      app.utmifyDeliveryQueue.add('send', { deliveryId: id }, { jobId: id }),
    ),
    ...outcome.tiktok.map((id) => app.tiktokQueue.add('send', { deliveryId: id }, { jobId: id })),
    ...outcome.pushcut.map((id) => app.pushcutQueue.add('send', { deliveryId: id }, { jobId: id })),
  ]);
  return outcome;
}
