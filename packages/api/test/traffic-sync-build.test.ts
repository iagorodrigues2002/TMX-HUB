import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { assertTrafficEntrypoints, buildTrafficReader } from '../scripts/build-traffic-reader.mjs';

describe('permanent traffic integration deployment contract', () => {
  it('fails the official build if either production entrypoint drops the synchronizer', () => {
    const pkg = { scripts: { start: 'node scripts/traffic-sync-server.mjs' } };
    const docker = 'exec node scripts/traffic-sync-server.mjs';
    expect(() => assertTrafficEntrypoints(pkg, docker)).not.toThrow();
    expect(() =>
      assertTrafficEntrypoints({ scripts: { start: 'node dist/server.js' } }, docker),
    ).toThrow('preserve');
    expect(() => assertTrafficEntrypoints(pkg, 'exec node dist/server.js')).toThrow('preserve');
  });
  it('generates an independently loadable Meta reader from tracked API source', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'tmx-reader-build-'));
    try {
      const output = await buildTrafficReader(join(folder, 'traffic-meta-reader.mjs'));
      const source = await readFile(output, 'utf8');
      expect(source).toContain('export async function readMetaTraffic');
      expect(source).not.toContain('startLocalMetaTrafficBridge');
      const compiled = await import(pathToFileURL(output).href);
      const health = await import(pathToFileURL(join(folder, 'traffic-meta-alerts.mjs')).href);
      expect(typeof health.readMetaTrafficHealth).toBe('function');
      expect(typeof health.recordTrafficHealth).toBe('function');
      expect(compiled.validTrafficRange('2026-11-07', '2026-11-08')).toBe(true);
      expect(compiled.validTrafficRange('2026-02-30', '2026-03-01')).toBe(false);
      const attributionSource = await readFile(
        join(folder, 'traffic-attribution-reader.cjs'),
        'utf8',
      );
      const bundled = { exports: {} as typeof import('../src/services/traffic-attribution.js') };
      vi.stubEnv('JWT_SECRET', 'traffic-build-test-only-secret-32-chars');
      new Function('require', 'module', 'exports', attributionSource)(
        createRequire(import.meta.url),
        bundled,
        bundled.exports,
      );
      const order = {
        id: 'front',
        offer_id: 'offer',
        source: { utm_id: '120123456789012', utm_campaign: 'Campaign name' },
        paid: true,
        is_natural: true,
        is_clicked: false,
        order_kind: 'front',
        amount: '10000',
        provider: 'vendepay',
        settings: {},
      };
      const attributed = bundled.exports.aggregateTrafficAttribution(
        [order, { ...order, id: 'upsell', order_kind: 'upsell_1' }],
        new Map([['BRL', 1]]),
      );
      expect(attributed).toHaveLength(1);
      expect(attributed[0]).toMatchObject({
        campaignId: '120123456789012',
        fronts: 1,
        upsells: 1,
        naturalUpsells: 1,
        clickedUpsells: 0,
        naturalGrossBrlMinor: '20000',
        clickedGrossBrlMinor: '0',
      });
      const historical = bundled.exports.aggregateTrafficAttribution(
        [{ ...order, source: {}, source_url: 'https://example.test/?utm_id=120123456789012' }],
        new Map([['BRL', 1]]),
      );
      expect(historical[0]).toMatchObject({ campaignId: '120123456789012', fronts: 1 });
    } finally {
      vi.unstubAllEnvs();
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('official API build and both production entrypoints include the worker', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const docker = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
    expect(pkg.scripts.build).toMatch(/^node scripts\/build-traffic-reader\.mjs && tsup$/);
    expect(pkg.scripts.start).toContain('node scripts/traffic-sync-server.mjs');
    expect(docker).toContain('test -s packages/api/scripts/traffic-meta-reader.mjs');
    expect(docker).toContain('exec node scripts/traffic-sync-server.mjs');
  });
});
