import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { BadRequestError, NotFoundError } from '../lib/problem.js';
import { decryptSecret } from '../lib/secret-box.js';
import { parseSyzepayEvent, verifySyzepaySignature } from '../lib/syzepay-contract.js';
import { readTrackingTokenWithRotation } from '../lib/tracking-token.js';

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
    let event: ReturnType<typeof parseSyzepayEvent>;
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
