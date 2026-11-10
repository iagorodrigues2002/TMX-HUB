import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/lib/secret-box.js';
import { createPushcutDeliveryWorker } from '../src/workers/pushcut-delivery.worker.js';

const fixture = vi.hoisted(() => ({
  handler: null as null | ((job: { data: { deliveryId: string } }) => Promise<void>),
  query: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../src/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://fixture',
    TRACKING_ENCRYPTION_KEY: 'fixture-key',
    NODE_ENV: 'test',
    REDIS_URL: 'redis://fixture',
  },
}));
vi.mock('../src/lib/redis.js', () => ({ makeRedis: vi.fn(() => ({})) }));
vi.mock('../src/lib/logger.js', () => ({ logger: { error: vi.fn() } }));
vi.mock('postgres', () => ({
  default: () => Object.assign(fixture.query, { json: (v: unknown) => v, end: vi.fn() }),
}));
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, handler: typeof fixture.handler) {
      fixture.handler = handler;
    }
    on() {
      return this;
    }
  },
}));

describe('Pushcut worker applies the current recipient preferences before sending', () => {
  afterEach(() => vi.unstubAllGlobals());
  const base = {
    id: 'delivery',
    secret_encrypted: encryptSecret('fixture-pushcut', 'fixture-key'),
    front_notification_name: 'Front',
    upsell_notification_name: 'Upsell',
    devices: ['iPhone'],
    order_kind: 'upsell_4',
    order_kinds: ['upsell_4'],
    show_amount: false,
    buyer: { name: 'Cliente' },
    amount_brl_minor: 9990,
    currency: 'BRL',
    country: null,
    product_name: 'Produto',
    funnel_name: 'Oferta',
    platform_name: 'VendePay',
  };
  beforeEach(() => {
    fixture.query.mockReset();
    fixture.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    vi.stubGlobal('fetch', fixture.fetch);
    createPushcutDeliveryWorker();
  });
  const run = () => fixture.handler!({ data: { deliveryId: 'delivery' } });

  it('sends a selected upsell to the configured notification and devices without exposing its value', async () => {
    fixture.query.mockResolvedValueOnce([base]).mockResolvedValue([]);
    await run();
    expect(fixture.fetch).toHaveBeenCalledOnce();
    const [url, options] = fixture.fetch.mock.calls[0]!;
    expect(url).toBe('https://api.pushcut.io/fixture-pushcut/notifications/Upsell');
    expect(JSON.parse(options.body)).toEqual({
      title: 'Upsell aprovado · Oferta',
      text: 'VendePay · Cliente · Produto',
      devices: ['iPhone'],
    });
    expect(
      fixture.query.mock.calls.some(([sql]) => sql.join('').includes("state = 'delivered'")),
    ).toBe(true);
  });

  it('preserves value and first-sale routing when front is selected', async () => {
    fixture.query
      .mockResolvedValueOnce([
        { ...base, order_kind: 'front', order_kinds: ['front'], show_amount: true },
      ])
      .mockResolvedValue([]);
    await run();
    expect(fixture.fetch.mock.calls[0]![0]).toContain('/notifications/Front');
    expect(JSON.parse(fixture.fetch.mock.calls[0]![1].body).text).toContain('99,90');
  });

  it('skips queued deliveries when the stage has since been deselected', async () => {
    fixture.query
      .mockResolvedValueOnce([{ ...base, order_kinds: ['upsell_5'] }])
      .mockResolvedValue([]);
    await run();
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.query.mock.calls[1]![0].join('')).toContain("state='skipped'");
  });

  it('does not send disabled, removed or already delivered destinations excluded by the SQL read', async () => {
    fixture.query.mockResolvedValueOnce([]);
    await run();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it('respects the opt-out for legacy destinations without an upsell notification', async () => {
    fixture.query
      .mockResolvedValueOnce([{ ...base, order_kinds: null, upsell_notification_name: null }])
      .mockResolvedValue([]);
    await run();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });

  it('records a gateway failure for retry instead of marking it delivered', async () => {
    fixture.query.mockResolvedValueOnce([base]).mockResolvedValue([]);
    fixture.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => '{}' });
    await expect(run()).rejects.toThrow('Pushcut HTTP 503');
    expect(
      fixture.query.mock.calls.some(([sql]) => sql.join('').includes("THEN 'dead' ELSE 'failed'")),
    ).toBe(true);
    expect(
      fixture.query.mock.calls.some(([sql]) => sql.join('').includes("state = 'delivered'")),
    ).toBe(false);
  });
});
