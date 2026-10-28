import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeSaleNoticeStream } from '../src/lib/sale-notice-stream';
import { takeNewApproved } from '../src/lib/sale-notification';

test('decodes fragmented UTF-8 and multiple server messages without background-tab gating', async () => {
  const message = {
    type: 'sales',
    at: '2026-10-28T10:00:01.000Z',
    offer_ids: ['offer'],
    items: [
      {
        id: 'sale',
        status: 'paid',
        provider: 'vendepay',
        amount_minor: '2900',
        currency: 'BRL',
        occurred_at: '2026-10-28T10:00:00.500Z',
        offerId: 'offer',
        offerName: 'Visão geral',
      },
    ],
  };
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify(message)}\n\ndata: ${JSON.stringify(message)}\n\n`,
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let n = 0; n < bytes.length; n += 3) controller.enqueue(bytes.slice(n, n + 3));
      controller.close();
    },
  });
  const seen = new Set<string>();
  const delivered: string[] = [];
  await consumeSaleNoticeStream(stream, async (result) => {
    delivered.push(
      ...takeNewApproved(
        result.items,
        seen,
        Date.parse('2026-10-28T10:00:00Z'),
        Date.parse(result.at),
      ).map((row) => row.offerName),
    );
  });
  assert.deepEqual(delivered, ['Visão geral']);
});

test('rejects invalid frames rather than displaying unvalidated sale data', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('data: {"type":"sales","items":[{"amount_minor":"fake"}]}\n\n'),
      );
      controller.close();
    },
  });
  await assert.rejects(
    consumeSaleNoticeStream(stream, async () => assert.fail('invalid sale displayed')),
  );
});

test('server clock controls eligibility even when the device clock is ahead or behind', () => {
  const start = Date.parse('2026-10-28T10:00:00Z');
  const row = { id: 'clock', status: 'paid', occurred_at: new Date(start + 500).toISOString() };
  assert.equal(takeNewApproved([row], new Set(), start, start + 1000).length, 1);
  assert.equal(takeNewApproved([row], new Set(), start, start - 1000).length, 0);
});
