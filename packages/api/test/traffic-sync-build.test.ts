import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
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
      expect(compiled.validTrafficRange('2026-11-07', '2026-11-08')).toBe(true);
      expect(compiled.validTrafficRange('2026-02-30', '2026-03-01')).toBe(false);
    } finally {
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
