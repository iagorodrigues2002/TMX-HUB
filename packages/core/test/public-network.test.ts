import { Agent, type MockAgent } from 'undici';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { downloadOne } from '../src/assets/downloader.js';
import { resolveAssets } from '../src/assets/resolve.js';
import { buildSingleHtml } from '../src/bundle/single-html.js';
import { fetchPage } from '../src/fetch/fetch-page.js';
import { publicFetch, publicRequest } from '../src/fetch/public-network.js';

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  const agent = new actual.MockAgent();
  agent.disableNetConnect();
  return { ...actual, Agent: vi.fn(() => agent) };
});

// Keep the real HTTP implementations and replace only their network dispatcher.
const agent: MockAgent = vi.mocked(Agent).mock.results[0]!.value;
const origin = 'https://8.8.8.8';
const otherOrigin = 'https://1.1.1.1';

afterEach(() => {
  try {
    agent.assertNoPendingInterceptors();
  } finally {
    agent.get(origin).cleanMocks();
    agent.get(otherOrigin).cleanMocks();
  }
});
afterAll(() => agent.close());

describe('public network redirects', () => {
  it('resolves relative page assets against the final redirect URL', async () => {
    agent
      .get(origin)
      .intercept({ path: '/old' })
      .reply(302, '', {
        headers: { location: '/new/page.html' },
      });
    agent.get(origin).intercept({ path: '/new/page.html' }).reply(200, '<img src="asset.png">');

    const page = await fetchPage(`${origin}/old`, { renderMode: 'static' });
    expect(page.finalUrl).toBe(`${origin}/new/page.html`);
    const assets = await resolveAssets(page.html, page.finalUrl, { download: false });
    expect(assets.html).toContain(`${origin}/new/asset.png`);
  });

  it('records the final asset URL while retaining its original lookup URL', async () => {
    agent
      .get(origin)
      .intercept({ path: '/old.png' })
      .reply(307, '', {
        headers: { location: `${otherOrigin}/new.png` },
      });
    agent
      .get(otherOrigin)
      .intercept({ path: '/new.png' })
      .reply(200, 'image', {
        headers: { 'content-type': 'image/png' },
      });

    const asset = await downloadOne(`${origin}/old.png`, {
      maxBytes: 1024,
      maxConcurrency: 1,
      timeoutMs: 1000,
    });
    expect(asset).toMatchObject({
      originalUrl: `${origin}/old.png`,
      resolvedUrl: `${otherOrigin}/new.png`,
      data: Buffer.from('image'),
    });
  });

  it('downloads CSS references relative to the redirected stylesheet', async () => {
    agent
      .get(origin)
      .intercept({ path: '/old.css' })
      .reply(302, '', {
        headers: { location: `${otherOrigin}/theme/style.css` },
      });
    agent
      .get(otherOrigin)
      .intercept({ path: '/theme/style.css' })
      .reply(200, '.a { background: url("image.png"); }', {
        headers: { 'content-type': 'text/css' },
      });
    agent
      .get(otherOrigin)
      .intercept({ path: '/theme/image.png' })
      .reply(200, 'image', {
        headers: { 'content-type': 'image/png' },
      });

    const result = await resolveAssets('<link rel="stylesheet" href="/old.css">', origin, {
      download: true,
    });
    expect(result.assets.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalUrl: `${origin}/old.css`,
          url: `${otherOrigin}/theme/style.css`,
        }),
        expect.objectContaining({ url: `${otherOrigin}/theme/image.png`, size: 5 }),
      ]),
    );
  });

  it('inlines CSS images relative to the redirected stylesheet', async () => {
    agent
      .get(origin)
      .intercept({ path: '/inline.css' })
      .reply(302, '', {
        headers: { location: `${otherOrigin}/inline/style.css` },
      });
    agent
      .get(otherOrigin)
      .intercept({ path: '/inline/style.css' })
      .reply(200, '.a { background: url("image.png"); }', {
        headers: { 'content-type': 'text/css' },
      });
    agent
      .get(otherOrigin)
      .intercept({ path: '/inline/image.png' })
      .reply(200, 'image', {
        headers: { 'content-type': 'image/png' },
      });

    const result = await buildSingleHtml(
      {
        jobId: 'fixture-job',
        sourceUrl: origin,
        finalUrl: origin,
        status: 'ready',
        html: `<link rel="stylesheet" href="${origin}/inline.css">`,
        assets: { entries: [], byUrl: {} },
        forms: [],
        links: [],
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      },
      { applyEdits: false, inlineAssets: true },
    );
    expect(result.toString()).toContain('data:image/png;base64,aW1hZ2U=');
  });

  it.each(['request', 'fetch'] as const)(
    '%s rejects a redirect to a private address',
    async (kind) => {
      agent
        .get(origin)
        .intercept({ path: '/private' })
        .reply(302, '', {
          headers: { location: 'http://127.0.0.1/private' },
        });
      const pending =
        kind === 'request' ? publicRequest(`${origin}/private`) : publicFetch(`${origin}/private`);
      await expect(pending).rejects.toThrow('Destination must be a public HTTP(S) URL.');
    },
  );

  it.each(['request', 'fetch'] as const)(
    '%s strips credentials on a cross-origin redirect',
    async (kind) => {
      agent
        .get(origin)
        .intercept({ path: '/credentials' })
        .reply(302, '', {
          headers: { location: `${otherOrigin}/target` },
        });
      agent
        .get(otherOrigin)
        .intercept({
          path: '/target',
          headers: (headers) =>
            headers.authorization === undefined &&
            headers.cookie === undefined &&
            headers['proxy-authorization'] === undefined &&
            headers.host === undefined &&
            headers['x-public'] === 'keep',
        })
        .reply(200, 'safe');
      const headers = {
        Authorization: 'fixture-token',
        Cookie: 'fixture-cookie',
        'Proxy-Authorization': 'fixture-proxy-token',
        Host: 'fixture.invalid',
        'x-public': 'keep',
      };
      const body =
        kind === 'request'
          ? await (await publicRequest(`${origin}/credentials`, { headers })).body.text()
          : await (await publicFetch(`${origin}/credentials`, { headers })).text();
      expect(body).toBe('safe');
    },
  );

  it.each(['request', 'fetch'] as const)(
    '%s retains credentials on a same-origin redirect',
    async (kind) => {
      agent
        .get(origin)
        .intercept({ path: '/same-origin' })
        .reply(302, '', {
          headers: { location: '/same-origin-target' },
        });
      agent
        .get(origin)
        .intercept({
          path: '/same-origin-target',
          headers: { authorization: 'fixture-token', cookie: 'fixture-cookie' },
        })
        .reply(200, 'authenticated');
      const headers = { authorization: 'fixture-token', cookie: 'fixture-cookie' };
      const body =
        kind === 'request'
          ? await (await publicRequest(`${origin}/same-origin`, { headers })).body.text()
          : await (await publicFetch(`${origin}/same-origin`, { headers })).text();
      expect(body).toBe('authenticated');
    },
  );

  it.each(['request', 'fetch'] as const)(
    '%s stops redirect loops after five hops',
    async (kind) => {
      agent
        .get(origin)
        .intercept({ path: '/loop' })
        .reply(302, '', {
          headers: { location: '/loop' },
        })
        .times(6);
      const pending =
        kind === 'request' ? publicRequest(`${origin}/loop`) : publicFetch(`${origin}/loop`);
      await expect(pending).rejects.toThrow(/redirect/i);
    },
  );
});
