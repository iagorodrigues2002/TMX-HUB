import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { navigationTools } from '../src/components/admin/company-navigation-access';
import { visibleNavigation } from '../src/components/hub/navigation';
import { spyNoticeFeed } from '../src/lib/spy-notification-access';
test('Discovery inbox and read markers stay within authorized companies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-company-inbox-'));
  const notice = (digit: string) => ({
    id: `spy:${digit.repeat(64)}`,
    recipientId: 'member',
    createdAt: '2026-11-09T12:00:00Z',
    unread: true,
    title: 'Discovery',
    entityKeys: [],
    spy: { offerId: 'fixture', offerName: 'Fixture', newAds: 1, newPages: 0, pageNames: [] },
  });
  try {
    await changeLibraryState('company:a', (s) => ({ ...s, notices: [notice('1')] }), dir);
    await changeLibraryState('company:b', (s) => ({ ...s, notices: [notice('2')] }), dir);
    const feed = await spyNoticeFeed('member', [notice('2').id], dir, ['company:a']);
    assert.deepEqual(
      feed.notifications.map((n) => n.id),
      [notice('1').id],
    );
    assert.equal((await readLibraryState('company:b', dir)).notices[0]?.unread, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
import { parseSpySaved } from '../src/components/spy/spy-model';
import { saveSpyCatalog } from '../src/lib/spy-catalog';
import {
  changeLibraryState,
  initialLibraryState,
  readLibraryState,
} from '../src/lib/spy-library-store';
import { spySameOrigin, spyServerAccess } from '../src/lib/spy-server-access';
import seed from './fixtures/spy-catalog';
test('Spy section grants include offers and denied sections stay hidden', () => {
  const ids = ['spy-offers', 'spy-monitor', 'spy-cloning', 'spy-settings'];
  const tools = navigationTools(ids, []);
  assert.ok(tools.includes('ofertas'));
  const user = {
    id: 'member',
    name: 'Member',
    email: 'member@example.test',
    role: 'user',
    allowedTools: tools,
  };
  assert.deepEqual(
    visibleNavigation(user as never)
      .find((n) => n.id === 'spy-preview')
      ?.children?.map((n) => n.id),
    ids,
  );
  assert.equal(
    visibleNavigation({
      ...user,
      allowedTools: ['ofertas', 'nav:scoped', 'nav:offers-all'],
    } as never).some((n) => n.id === 'spy-preview'),
    false,
  );
});
test('Catalog saves persist revisions, sources and responsible; concurrent stale writes cannot overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-release-'));
  const owner = 'company:test';
  const offers = parseSpySaved(JSON.stringify(seed))
    .slice(0, 1)
    .map((o) => ({ ...o, ownerId: 'member', owner: 'Untrusted label' }));
  const users = [{ id: 'member', name: 'Registered person' }];
  try {
    const first = await changeLibraryState(owner, (s) => saveSpyCatalog(s, offers, '', users), dir);
    assert.equal((first.catalog[0] as (typeof offers)[0]).owner, 'Registered person');
    assert.equal(first.jobs[offers[0]!.id]?.responsibleId, 'member');
    await assert.rejects(
      changeLibraryState(owner, (s) => saveSpyCatalog(s, [], '', users), dir),
      /catalog_conflict/,
    );
    assert.equal((await readLibraryState(owner, dir)).catalog.length, 1);
    assert.throws(
      () => saveSpyCatalog(first, offers, first.catalogRevision, []),
      /invalid_responsible/,
    );
    assert.throws(
      () => saveSpyCatalog(initialLibraryState(owner), [offers[0], offers[0]], '', users),
      /invalid_catalog/,
    );
    const removed = saveSpyCatalog(first, [], first.catalogRevision, users);
    assert.equal(removed.jobs[offers[0]!.id]?.enabled, false);
    assert.equal(removed.jobs[offers[0]!.id]?.status, 'paused');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Production access forwards authentication only to configured API, validates company and enforces origin', async () => {
  const saved = {
    server: process.env.TMX_SPY_SERVER,
    origin: process.env.TMX_SPY_ORIGIN,
    target: process.env.API_PROXY_TARGET,
  };
  const original = globalThis.fetch;
  const id = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
  try {
    process.env.TMX_SPY_SERVER = '1';
    process.env.TMX_SPY_ORIGIN = 'https://theminex.com';
    process.env.API_PROXY_TARGET = 'https://trusted-api.example';
    let calls = 0;
    globalThis.fetch = async (url, opts) => {
      calls++;
      assert.equal(String(url), `https://trusted-api.example/v1/spy/access?company=${id}`);
      assert.equal(new Headers(opts?.headers).get('authorization'), 'Bearer synthetic');
      return Response.json({
        owner: `company:${id}`,
        companyId: id,
        companyName: 'Test',
        userId: 'member',
        canConfigure: false,
        canEdit: true,
        canMonitor: false,
        owners: [`company:${id}`],
        companies: [{ id, name: 'Test' }],
        users: [],
      });
    };
    const req = new Request('https://theminex.com/api/spy-library', {
      headers: {
        cookie: `tmx_spy_company=${id}; tmx_hub_auth_token=synthetic`,
        origin: 'https://theminex.com',
      },
    });
    assert.equal((await spyServerAccess(req))?.owner, `company:${id}`);
    assert.equal(spySameOrigin(req), true);
    assert.equal(
      spySameOrigin(new Request(req.url, { headers: { origin: 'https://evil.example' } })),
      false,
    );
    assert.equal(
      await spyServerAccess(
        new Request(req.url, {
          headers: { authorization: 'Bearer synthetic', cookie: 'tmx_spy_company=../other' },
        }),
      ),
      null,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({}, { status: 403 });
    assert.equal(await spyServerAccess(req), null);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of [
      ['TMX_SPY_SERVER', saved.server],
      ['TMX_SPY_ORIGIN', saved.origin],
      ['API_PROXY_TARGET', saved.target],
    ])
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
  }
});
test('Production image/state directory and worker survive redeploy through container startup contract', () => {
  const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const start = readFileSync(new URL('../scripts/start-server.mjs', import.meta.url), 'utf8');
  assert.match(docker, /build-spy-worker\.mjs/);
  assert.match(docker, /CMD \["node", "packages\/web\/scripts\/start-server\.mjs"\]/);
  assert.match(start, /spy-server-worker\.mjs/);
  assert.match(start, /packages\/web\/server\.js/);
  const failure = spawnSync(
    process.execPath,
    [new URL('../scripts/start-server.mjs', import.meta.url).pathname],
    {
      cwd: tmpdir(),
      env: { PATH: process.env.PATH, TMX_SPY_SERVER: '1' },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(failure.status, 1, 'Unexpected child exit must trigger the platform restart policy');
});
