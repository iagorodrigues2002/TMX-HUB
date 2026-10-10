import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { parseSyzepayEvent, syzepayPurchaseAllowed, verifySyzepaySignature } from '../lib/syzepay-contract.js';
import { readTrackingTokenWithRotation } from '../lib/tracking-token.js';
import { classifySyzepayOrder, type SyzeKind } from './syzepay-classification.js';

export type SyzeExample = { projectId: string; storeId: string; providerKind: string; currency: string; amount: number; kind: SyzeKind };
/** Bounded example matching, never nearest-price guessing or self-training. */
export function matchSyzepayExample(target: Omit<SyzeExample, 'kind'>, examples: SyzeExample[]): SyzeKind | null {
  const matches = examples.filter(e => e.projectId === target.projectId && e.storeId === target.storeId &&
    e.providerKind === target.providerKind && e.currency === target.currency &&
    Math.abs(e.amount - target.amount) <= Math.max(2, e.amount * 0.005));
  const kinds = new Set(matches.map(e => e.kind));
  return kinds.size === 1 ? [...kinds][0]! : null;
}

export async function runSyzepayAutoClassification(app: FastifyInstance) {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return { processed: 0, failed: 0 };
  const key = env.TRACKING_ENCRYPTION_KEY;
  let processed = 0, failed = 0;
  const connections = await app.db<{id:string;owner_id:string;signing_secret_encrypted:string}[]>`
    SELECT id,owner_id,signing_secret_encrypted FROM syzepay_company_connections WHERE enabled AND signing_secret_encrypted IS NOT NULL`;
  for (const c of connections) {
    const secret = decryptSecret(c.signing_secret_encrypted, key);
    const decode = (r: {body_encrypted:string;headers_encrypted:string;received_at:Date}) => {
      const raw = Buffer.from(decryptSecret(r.body_encrypted, key), 'base64');
      const headers = JSON.parse(decryptSecret(r.headers_encrypted, key));
      if (!verifySyzepaySignature(raw, headers['x-syzepay-signature'], secret, new Date(r.received_at))) return null;
      const e = parseSyzepayEvent(raw);
      return syzepayPurchaseAllowed(e) ? e : null;
    };
    const seeds = await app.db<{body_encrypted:string;headers_encrypted:string;received_at:Date;project_id:string;order_kind:SyzeKind}[]>`
      SELECT r.body_encrypted,r.headers_encrypted,r.received_at,m.project_id,m.order_kind
      FROM syzepay_order_mappings m JOIN tracking_orders o ON o.syzepay_connection_id=m.connection_id AND o.external_id=m.external_order_id
      JOIN syzepay_inbox_receipts r ON r.connection_id=m.connection_id AND r.tracking_order_id=o.id AND r.state='processed'
      WHERE m.connection_id=${c.id} AND COALESCE(o.product->>'classification_mode','manual')='manual' ORDER BY m.created_at DESC LIMIT 200`;
    const examples: SyzeExample[] = [];
    for (const r of seeds) {
      try {
        const e = decode(r); if (!e) continue;
        const o = e.data.object;
        examples.push({projectId:r.project_id,storeId:o.store_id,providerKind:o.kind,currency:o.currency,amount:o.amount,kind:r.order_kind});
      } catch { /* Unsupported historical formats are not training examples. */ }
    }
    if (!examples.length) continue;
    const pending = await app.db<{body_encrypted:string;headers_encrypted:string;received_at:Date}[]>`
      SELECT body_encrypted,headers_encrypted,received_at FROM syzepay_inbox_receipts WHERE connection_id=${c.id} AND state='awaiting_mapping' ORDER BY received_at ASC LIMIT 100`;
    const seen = new Set<string>();
    for (const r of pending) {
      let e;
      try { e = decode(r); } catch { continue; }
      if (!e || seen.has(e.data.object.id)) continue;
      const o = e.data.object;
      seen.add(o.id);
      const token = o.utm?.src ? readTrackingTokenWithRotation(o.utm.src, env.WEBHOOK_SECRET, env.WEBHOOK_SECRET_PREV) : null;
      if (!token) continue;
      const kind = matchSyzepayExample({projectId:token.payload.projectId,storeId:o.store_id,providerKind:o.kind,currency:o.currency,amount:o.amount}, examples);
      if (!kind) continue;
      const [project] = await app.db<{offer_id:string}[]>`SELECT offer_id FROM tracking_projects WHERE id=${token.payload.projectId} AND enabled`;
      if (!project) continue;
      try {
        const result = await classifySyzepayOrder(app, {connectionId:c.id,ownerId:c.owner_id,orderId:o.id,offerId:project.offer_id,kind,automatic:true});
        if (!result.duplicate) processed++;
      } catch { failed++; }
    }
  }
  return { processed, failed };
}
