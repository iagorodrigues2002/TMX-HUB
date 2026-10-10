import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const config = vi.hoisted(() => ({
  TRACKING_ENCRYPTION_KEY: 'unit-encryption-key-32-characters-long',
  WEBHOOK_SECRET: 'unit-tracking-source-secret',
  WEBHOOK_SECRET_PREV: undefined,
  LOG_LEVEL: 'error',
  NODE_ENV: 'test',
}));
vi.mock('../src/env.js', () => ({ env: config }));
vi.mock('../src/services/exchange-rate.js', () => ({
  convertToBrlMinor: vi.fn(async (minor: number) => ({ brlMinor: minor, rate: 1 })),
}));
import { encryptSecret } from '../src/lib/secret-box.js';
import { createTrackingToken } from '../src/lib/tracking-token.js';
import {
  verifySyzepaySignature,
  parseSyzepayEvent,
  syzepayPurchaseAllowed,
} from '../src/lib/syzepay-contract.js';
import { classifySyzepayOrder } from '../src/services/syzepay-classification.js';
import { buildUtmifyOrderPayload } from '../src/integrations/utmify/sales.js';
const time = new Date('2026-10-10T03:38:16Z');
const stamp = String(time.getTime() / 1000);
const key = 'unit-signing-key-not-a-real-provider-secret';
const event = (type = 'order.paid', project = 'project-a') => ({
  id: 'event-' + type,
  type,
  created: Number(stamp),
  api_version: '2026-08-11',
  data: {
    object: {
      id: 'order-a',
      store_id: 'store-a',
      status: 'succeeded',
      kind: 'sale',
      amount: 12417,
      currency: 'BRL',
      fee_amount: 1890,
      net_amount: 9745,
      customer_email: null,
      customer_name: null,
      created_at: time.toISOString(),
      utm: {
        src: createTrackingToken(
          { projectId: project, visitorId: 'visitor-a', journeyId: 'journey-a' },
          config.WEBHOOK_SECRET,
        ),
        utm_source: 'facebook',
      },
    },
  },
});
const sign = (body: Buffer, t = stamp) =>
  `t=${t},v1=${createHmac('sha256', key)
    .update(t + '.')
    .update(body)
    .digest('hex')}`;
describe('actual SyzePay envelope and signature contract', () => {
  it('verifies exact raw bytes and rejects tampering, wrong keys, expired timestamps and duplicate timestamps', () => {
    const raw = Buffer.from(JSON.stringify(event()));
    const h = sign(raw);
    expect(verifySyzepaySignature(raw, h, key, time)).toBe(true);
    expect(verifySyzepaySignature(Buffer.concat([raw, Buffer.from(' ')]), h, key, time)).toBe(
      false,
    );
    expect(verifySyzepaySignature(raw, h, 'wrong', time)).toBe(false);
    expect(verifySyzepaySignature(raw, h, key, new Date(time.getTime() + 301000))).toBe(false);
    expect(verifySyzepaySignature(raw, h + `,t=${stamp}`, key, time)).toBe(false);
  });
  it('does not treat order.created as a purchase even if its snapshot is succeeded', () => {
    expect(
      syzepayPurchaseAllowed(
        parseSyzepayEvent(Buffer.from(JSON.stringify(event('order.created')))),
      ),
    ).toBe(false);
    expect(syzepayPurchaseAllowed(parseSyzepayEvent(Buffer.from(JSON.stringify(event()))))).toBe(
      true,
    );
    expect(syzepayPurchaseAllowed({ ...event(), livemode: false } as never)).toBe(false);
  });
  it('preserves reported gateway fee and net amount in UTMify without inventing missing customer contact', () => {
    const payload = buildUtmifyOrderPayload({
      orderId: 'order-a',
      provider: 'syzepay',
      status: 'paid',
      amountMinor: 12417,
      currency: 'BRL',
      createdAt: time,
      paidAt: time,
      buyer: {},
      source: { gateway_fee_in_cents: '1890', gateway_net_in_cents: '9745' },
    });
    expect(payload.commission).toMatchObject({
      totalPriceInCents: 12417,
      gatewayFeeInCents: 1890,
      userCommissionInCents: 9745,
    });
    expect(payload.customer.email).toBe('');
  });
});
function fixture(project = 'project-a', providerKind = 'sale') {
  let inserted = false;
  let mapping: null | { project_id: string; order_kind: string } = null;
  let writes = 0;
  const records = ['order.created', 'order.paid'].map((type, index) => {
    const payload = event(type, project);
    payload.data.object.kind = providerKind;
    const body = Buffer.from(JSON.stringify(payload));
    return {
      id: 'receipt-' + index,
      received_at: time,
      body_encrypted: encryptSecret(body.toString('base64'), config.TRACKING_ENCRYPTION_KEY),
      headers_encrypted: encryptSecret(
        JSON.stringify({ 'x-syzepay-signature': sign(body) }),
        config.TRACKING_ENCRYPTION_KEY,
      ),
    };
  });
  const statements: string[] = [];
  const inputs: unknown[][] = [];
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const s = strings.join('?');
    statements.push(s);
    inputs.push(values);
    if (s.includes('SELECT id,owner_id,company_name'))
      return values[1] === 'owner-a'
        ? [
            {
              id: 'connection-a',
              owner_id: 'owner-a',
              company_name: 'TMX',
              enabled: true,
              signing_secret_encrypted: encryptSecret(key, config.TRACKING_ENCRYPTION_KEY),
            },
          ]
        : [];
    if (s.includes('SELECT id FROM tracking_projects')) return [{ id: 'project-a' }];
    if (s.includes('SELECT id,body_encrypted,headers_encrypted')) return records;
    if (s.includes('SELECT project_id,order_kind FROM syzepay_order_mappings'))
      return mapping ? [mapping] : [];
    if (s.includes('INSERT INTO syzepay_order_mappings')) {
      mapping = { project_id: 'project-a', order_kind: String(values[3]) };
      return [];
    }
    if (s.includes('INSERT INTO tracking_orders')) {
      if (inserted) return [];
      inserted = true;
      writes++;
      return [{ id: 'saved-order' }];
    }
    if (s.includes('SELECT id FROM tracking_orders')) return [{ id: 'saved-order' }];
    if (s.includes('FROM tracking_utmify_destinations'))
      return [{ id: 'utm-offer' }, { id: 'utm-global' }];
    if (s.includes('FROM meta_pixels')) return [{ id: 'pixel-a' }];
    if (s.includes('INSERT INTO meta_deliveries')) return [{ id: 'meta-delivery' }];
    if (s.includes('INSERT INTO tracking_delivery_outbox'))
      return [{ id: 'delivery-' + values[2] }];
    return [];
  };
  const db = Object.assign(query, {
    json: (value: unknown) => value,
    begin: async (fn: (sql: unknown) => Promise<unknown>) => fn(db),
  });
  const app = {
    db,
    offerStore: {
      assertOwner: vi.fn(async () => ({
        id: 'offer-a',
        name: 'Offer A',
        userId: 'owner-a',
        companyName: 'TMX',
      })),
    },
    invalidateAnalyticsCache: vi.fn(async () => {}),
    metaQueue: { add: vi.fn(async () => {}) },
    utmifyDeliveryQueue: { add: vi.fn(async () => {}) },
    tiktokQueue: { add: vi.fn(async () => {}) },
    pushcutQueue: { add: vi.fn(async () => {}) },
  };
  return { app, statements, inputs, writes: () => writes };
}
describe('SyzePay classification transaction and dispatch', () => {
  const args = {
    connectionId: 'connection-a',
    ownerId: 'owner-a',
    orderId: 'order-a',
    offerId: 'offer-a',
    kind: 'front' as const,
  };
  it('records one approved order from created+paid and queues only configured destinations once', async () => {
    const f = fixture();
    const first = await classifySyzepayOrder(f.app as never, args);
    const duplicate = await classifySyzepayOrder(f.app as never, args);
    expect(first).toMatchObject({
      duplicate: false,
      order_id: 'saved-order',
      meta: ['meta-delivery'],
    });
    expect(first.utmify).toHaveLength(2);
    expect(first.tiktok).toHaveLength(0);
    expect(duplicate.duplicate).toBe(true);
    expect(f.writes()).toBe(1);
    expect(f.app.metaQueue.add).toHaveBeenCalledTimes(1);
    expect(f.app.utmifyDeliveryQueue.add).toHaveBeenCalledTimes(2);
    expect(
      f.statements.some(
        (s) => s.includes("'syzepay'") && s.includes('INSERT INTO tracking_orders'),
      ),
    ).toBe(true);
  });
  it('rejects a different offer from the signed TMX attribution and does not create a sale', async () => {
    const f = fixture('other-project');
    await expect(classifySyzepayOrder(f.app as never, args)).rejects.toThrow('outra oferta');
    expect(f.writes()).toBe(0);
    expect(f.app.metaQueue.add).not.toHaveBeenCalled();
  });
  it('accepts approved upsells once and sends UTMify without pixel Purchase', async () => {
    const f = fixture('project-a', 'upsell');
    const upsellArgs = { ...args, kind: 'upsell_2' as const };
    const first = await classifySyzepayOrder(f.app as never, upsellArgs);
    const duplicate = await classifySyzepayOrder(f.app as never, upsellArgs);
    expect(first.utmify).toHaveLength(2);
    expect(first.meta).toEqual([]);
    expect(first.tiktok).toEqual([]);
    expect(duplicate.duplicate).toBe(true);
    expect(f.writes()).toBe(1);
    expect(f.app.metaQueue.add).not.toHaveBeenCalled();
    expect(f.app.tiktokQueue.add).not.toHaveBeenCalled();
    expect(f.app.utmifyDeliveryQueue.add).toHaveBeenCalledTimes(2);
  });
  it('does not allow a gateway upsell to be misclassified as front', async () => {
    const f = fixture('project-a', 'upsell');
    await expect(classifySyzepayOrder(f.app as never, args)).rejects.toThrow('upsell');
    expect(f.writes()).toBe(0);
  });
  it('denies another connection owner before decrypting receipts', async () => {
    const f = fixture();
    await expect(
      classifySyzepayOrder(f.app as never, { ...args, ownerId: 'intruder' }),
    ).rejects.toThrow();
    expect(f.writes()).toBe(0);
  });
});
