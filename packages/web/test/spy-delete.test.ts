import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { POST } from '../src/app/api/spy-library/route';
import { NAV_ITEMS } from '../src/components/hub/nav-config';
import { parseSpySaved } from '../src/components/spy/spy-model';
import { deleteSpyOffer, saveSpyCatalog } from '../src/lib/spy-catalog';
import {
  changeLibraryState,
  initialLibraryState,
  publicLibraryAds,
  publicLibraryPages,
  publicLibraryState,
  readLibraryState,
  setSpyMonitoring,
  tickLibraryOwner,
} from '../src/lib/spy-library-store';
import seed from './fixtures/spy-catalog';
test('Deletion endpoint requires edit permission, same origin and current revision; another company stays intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-delete-http-'));
  const keys = ['TMX_SPY_SERVER', 'TMX_SPY_DIRECTORY', 'TMX_SPY_ORIGIN', 'API_PROXY_TARGET'];
  const env = keys.map((k) => process.env[k]);
  const original = globalThis.fetch;
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let canEdit = false;
  try {
    process.env.TMX_SPY_SERVER = '1';
    process.env.TMX_SPY_DIRECTORY = dir;
    process.env.TMX_SPY_ORIGIN = 'https://app.example.test';
    process.env.API_PROXY_TARGET = 'https://api.example.test';
    globalThis.fetch = async (url) => {
      assert.ok(String(url).startsWith('https://api.example.test/v1/spy/access'));
      return Response.json({
        owner: `company:${a}`,
        companyId: a,
        companyName: 'Synthetic A',
        userId: 'editor',
        canEdit,
        canMonitor: true,
        canConfigure: false,
        companies: [{ id: a, name: 'Synthetic A' }],
        owners: [`company:${a}`],
        users: [],
      });
    };
    const offers = parseSpySaved(JSON.stringify(seed.slice(0, 1)));
    const state = await changeLibraryState(
      `company:${a}`,
      (s) => saveSpyCatalog(s, offers, '', []),
      dir,
    );
    await changeLibraryState(`company:${b}`, (s) => saveSpyCatalog(s, offers, '', []), dir);
    const send = (revision: string | undefined, origin = 'https://app.example.test') =>
      POST(
        new Request('https://app.example.test/api/spy-library', {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic', Origin: origin },
          body: JSON.stringify({
            action: 'delete_offer',
            id: offers[0]!.id,
            baseRevision: revision,
          }),
        }),
      );
    assert.equal((await send(state.catalogRevision)).status, 403);
    canEdit = true;
    assert.equal((await send(state.catalogRevision, 'https://evil.example.test')).status, 403);
    assert.equal((await send(undefined)).status, 400);
    assert.equal((await send('stale')).status, 409);
    assert.equal((await readLibraryState(`company:${a}`, dir)).catalog.length, 1);
    assert.equal((await send(state.catalogRevision)).status, 200);
    assert.equal((await readLibraryState(`company:${a}`, dir)).catalog.length, 0);
    assert.equal((await readLibraryState(`company:${b}`, dir)).catalog.length, 1);
  } finally {
    globalThis.fetch = original;
    keys.forEach((k, i) => {
      if (env[i] === undefined) delete process.env[k];
      else process.env[k] = env[i];
    });
    await rm(dir, { recursive: true, force: true });
  }
});
test('Deleting persists catalog removal, stops collection, hides counters and preserves collected history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-delete-'));
  const owner = 'company:synthetic-delete';
  const offers = parseSpySaved(JSON.stringify(seed.slice(0, 2)));
  const state = saveSpyCatalog(initialLibraryState(owner), offers, '', []);
  state.provider = 'browser';
  const id = offers[0]!.id;
  const stamp = new Date().toISOString();
  state.jobs[id] = {
    ...state.jobs[id]!,
    optedIn: true,
    enabled: true,
    status: 'active',
    nextAt: stamp,
    snapshots: [
      {
        day: 0,
        at: stamp,
        scope: 'synthetic',
        countries: ['ALL'],
        ads: [
          {
            id: '10',
            pageId: '20',
            pageName: 'Synthetic page',
            startedAt: null,
            url: 'https://www.facebook.com/ads/library/?id=10',
          },
        ],
        added: [],
        missing: [],
        baseline: true,
      },
    ],
  };
  try {
    await changeLibraryState(owner, () => state, dir);
    const removed = await changeLibraryState(
      owner,
      (s) => deleteSpyOffer(s, id, state.catalogRevision),
      dir,
    );
    assert.equal(removed.catalog.length, 1);
    assert.equal((removed.catalog[0] as { id: string }).id, offers[1]!.id);
    assert.ok(removed.jobs[id]!.deletedAt);
    assert.equal(removed.jobs[id]!.enabled, false);
    assert.equal(removed.jobs[id]!.optedIn, false);
    assert.equal(removed.jobs[id]!.nextAt, null);
    assert.deepEqual(removed.jobs[id]!.snapshots, state.jobs[id]!.snapshots);
    assert.equal(publicLibraryState(removed).monitoringCoverage.total, 1);
    assert.equal(publicLibraryState(removed).jobs[id], undefined);
    assert.equal(publicLibraryAds(removed, id, 0), null);
    assert.equal(publicLibraryPages(removed, id, 0), null);
    assert.throws(() => setSpyMonitoring(removed, [id], true), /missing_job/);
    assert.throws(
      () => saveSpyCatalog(removed, offers, state.catalogRevision, []),
      /catalog_conflict/,
    );
    let requests = 0;
    await tickLibraryOwner(owner, {
      directory: dir,
      browserReader: async () => {
        requests++;
        return [];
      },
    });
    assert.equal(requests, 0);
    const persisted = await readLibraryState(owner, dir);
    assert.equal(persisted.catalog.length, 1);
    assert.ok(persisted.jobs[id]!.deletedAt);
    assert.equal(persisted.notices.length, 0);
    assert.throws(
      () => deleteSpyOffer(persisted, 'missing', persisted.catalogRevision),
      /missing_offer/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Spy navigation uses distinct section icons, removes pending filter and requires explicit deletion confirmation', () => {
  const children = NAV_ITEMS.find((n) => n.id === 'spy-preview')!.children!;
  assert.equal(new Set(children.map((n) => n.icon)).size, 4);
  const ui = readFileSync(
    new URL('../src/components/spy/spy-preview.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(ui, /Com pendências|scope !== 'pending'/);
  assert.match(ui, /role="alertdialog"/);
  assert.match(ui, /Acompanhamento interrompido/);
  assert.match(ui, /histórico já coletado será preservado/);
  const route = readFileSync(
    new URL('../src/app/api/spy-library/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /'save_catalog', 'enroll', 'delete_offer'/);
  assert.match(route, /access.canEdit/);
});
