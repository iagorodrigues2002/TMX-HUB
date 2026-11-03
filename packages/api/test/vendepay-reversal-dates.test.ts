import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { normalizeVendepay } from '../src/integrations/vendepay/normalize.js';
import { upsertVendepayOrder } from '../src/routes/tracking-public/vendepay-upsert-order.js';
import {
  firstReversalReceipts,
  repairVendepayReversalDates,
} from '../src/services/vendepay-reversal-dates.js';

const purchase = '2026-09-01T12:00:00.000Z';
const received = '2026-10-16T02:30:00.000Z';
const payload = {
  checkoutId: 'tx',
  event: 'chargeback',
  status: 2,
  paid_at: purchase,
  createdAt: purchase,
};
it('uses first receipt, not repeated payment date, and ignores mismatches and approval events', () => {
  const make = (date: string, body: unknown = payload) => ({
    order_id: 'o',
    external_id: 'tx',
    received_at: date,
    payload: body,
  });
  const result = firstReversalReceipts([
    make('2026-10-18T12:00:00Z'),
    make(received),
    make('invalid'),
    make(purchase, { ...payload, checkoutId: 'other' }),
    make(purchase, { ...payload, event: 'compra.aprovada' }),
  ]);
  expect(result.get('o')?.chargeback_at?.toISOString()).toBe(received);
  expect(result.get('o')?.refunded_at).toBeUndefined();
  expect(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      result.get('o')!.chargeback_at,
    ),
  ).toBe('2026-10-15');
});

const url = process.env.REFUNDS_TEST_DATABASE_URL;
describe.skipIf(!url)('historical receipt repair in isolated PostgreSQL schema', () => {
  it('ingests approval then reversal and replays without moving the first receipt date', async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
      throw new Error('Local test database required');
    const db = postgres(url!, { max: 1 });
    const id = `reversal-ingest-${randomUUID()}`;
    try {
      await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
      await db`INSERT INTO vendepay_connections(id,project_id,token_hash) VALUES(${id},${id},${id})`;
      for (const [suffix, event, date] of [
        ['paid', 'compra.aprovada', purchase],
        ['late', 'chargeback', '2026-10-18T12:00:00Z'],
        ['first', 'chargeback', received],
        ['replay', 'chargeback', '2026-10-19T12:00:00Z'],
      ]) {
        const body = { ...payload, event };
        const normalized = normalizeVendepay(body, new Date(date!));
        if (normalized.kind !== 'processable') throw new Error('Unexpected test payload');
        await db`INSERT INTO webhook_receipts(id,connection_id,dedupe_key,payload,state,received_at)
          VALUES(${id + suffix},${id},${suffix!},${db.json(body)},'processing',${date!})`;
        await db.begin(async (sql) =>
          upsertVendepayOrder({
            sql,
            normalized,
            receiptId: id + suffix,
            req: {} as FastifyRequest,
            connection: {
              id,
              project_id: id,
              token_hash: id,
              offer_id: id,
              name: 'Synthetic',
              payload_adapter: 'vendepay',
              signing_secret_encrypted: null,
            },
            ingestBrlMinor: 10000,
            ingestExchangeRate: 1,
            ingestConvertedAt: null,
          }),
        );
      }
      const orders =
        await db`SELECT paid_at,chargeback_at,amount_brl_minor FROM tracking_orders WHERE project_id=${id}`;
      expect(orders).toHaveLength(1);
      expect(orders[0]!.paid_at.toISOString()).toBe(purchase);
      expect(orders[0]!.chargeback_at.toISOString()).toBe(received);
      expect(Number(orders[0]!.amount_brl_minor)).toBe(10000);
    } finally {
      await db`DELETE FROM tracking_projects WHERE id=${id}`;
      await db.end();
    }
  });
  it('preserves money/purchase/status, isolates account and offer, supports dry run and is idempotent', async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
      throw new Error('Local test database required');
    const db = postgres(url!, { max: 1 });
    const schema = `refund_dates_${randomUUID().replaceAll('-', '')}`;
    try {
      await db.unsafe(`CREATE SCHEMA ${schema}`);
      await db.unsafe(`SET search_path TO ${schema}`);
      await db.unsafe(`CREATE TABLE tracking_projects(id text,offer_id text);
        CREATE TABLE vendepay_connections(id text,project_id text,payload_adapter text);
        CREATE TABLE tracking_orders(id text,project_id text,provider text,external_id text,vendepay_connection_id text,
          paid_at timestamptz,refunded_at timestamptz,chargeback_at timestamptz,amount_minor int,status text);
        CREATE TABLE webhook_receipts(id text,order_id text,connection_id text,payload jsonb,received_at timestamptz,state text);`);
      await db`INSERT INTO tracking_projects VALUES('p','offer'),('p2','other-offer')`;
      await db`INSERT INTO vendepay_connections VALUES('c','p',NULL),('c2','p2',NULL)`;
      await db`INSERT INTO tracking_orders VALUES('o','p','vendepay','tx','c',${purchase},NULL,${purchase},12345,'chargeback'),
        ('other','p2','vendepay','tx','c2',${purchase},NULL,${purchase},9876,'chargeback')`;
      await db`INSERT INTO webhook_receipts VALUES('r','o','c',${db.json(payload)},${received},'processable'),
        ('replay','o','c',${db.json(payload)},'2026-10-18T12:00Z','processed'),
        ('wrong-account','o','c2',${db.json(payload)},${purchase},'processed'),
        ('other','other','c2',${db.json(payload)},${received},'processed')`;
      expect(await repairVendepayReversalDates(db, 'offer')).toMatchObject({
        changed: 1,
        applied: false,
      });
      expect(
        (
          await db`SELECT chargeback_at FROM tracking_orders WHERE id='o'`
        )[0].chargeback_at.toISOString(),
      ).toBe(purchase);
      expect(await repairVendepayReversalDates(db, 'offer', true)).toMatchObject({
        changed: 1,
        applied: true,
      });
      const [order] = await db`SELECT * FROM tracking_orders WHERE id='o'`;
      expect(order.chargeback_at.toISOString()).toBe(received);
      expect(order.paid_at.toISOString()).toBe(purchase);
      expect(order.amount_minor).toBe(12345);
      expect(order.status).toBe('chargeback');
      expect(
        (
          await db`SELECT chargeback_at FROM tracking_orders WHERE id='other'`
        )[0].chargeback_at.toISOString(),
      ).toBe(purchase);
      expect(await repairVendepayReversalDates(db, 'offer', true)).toMatchObject({ changed: 0 });
    } finally {
      await db.unsafe('SET search_path TO public');
      await db.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });
});
