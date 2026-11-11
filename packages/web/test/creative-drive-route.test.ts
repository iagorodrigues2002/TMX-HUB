import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

test('Drive preview API requires local admin and same-origin mutations; configuration stays owner-scoped', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tmx-drive-route-test-'));
  const original = globalThis.fetch;
  const preview = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
  process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY = directory;
  process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
  let role = 'admin';
  let id = 'synthetic-route-test';
  globalThis.fetch = async (input) => {
    if (String(input).startsWith('http://127.0.0.1:4110/v1/meta-control/campaigns/local-import?'))
      return Response.json({
        from: '2026-11-10',
        to: '2026-11-10',
        fetchedAt: '2026-11-10T13:00:00Z',
        failures: [],
      });
    assert.equal(String(input), 'http://127.0.0.1:4110/v1/auth/me');
    return Response.json({ user: { id, role } });
  };
  const req = (
    body?: unknown,
    origin = 'http://localhost:3120',
    url = 'http://localhost:3120/api/creative-drive',
  ) =>
    new NextRequest(url, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer synthetic-test-only', origin },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const { GET, POST } = await import('../src/app/api/creative-drive/route');
    assert.equal(
      (await GET(new NextRequest('http://localhost:3120/api/creative-drive'))).status,
      403,
    );
    assert.equal(
      (await GET(req(undefined, undefined, 'http://evil.test/api/creative-drive'))).status,
      403,
    );
    role = 'user';
    assert.equal((await GET(req())).status, 403);
    role = 'admin';
    const configure = {
      action: 'configure',
      rootUrl: 'https://drive.google.com/drive/folders/synthetic_root_folder_123',
    };
    assert.equal((await POST(req(configure, 'http://evil.test'))).status, 403);
    assert.equal(
      (
        await POST(
          req({
            ...configure,
            rootUrl: 'https://evil.test/drive/folders/synthetic_root_folder_123',
          }),
        )
      ).status,
      400,
    );
    assert.equal((await POST(req(configure))).status, 200);
    assert.equal(
      (await POST(req({ action: 'metadata', key: 'SLM_DE:AD1:L2', status: 'Validado' }))).status,
      200,
    );
    assert.equal(
      (await POST(req({ action: 'metadata', key: 'SLM_DE:AD1:L2', status: 'nonsense' }))).status,
      400,
    );
    const incomplete = await POST(req({ action: 'classify', personal: false, mappings: {} }));
    assert.equal(incomplete.status, 409);
    assert.equal((await incomplete.json()).lowRoas, undefined);
    const state = await (await GET(req())).json();
    assert.equal(state.metadata['SLM_DE:AD1:L2'].status, 'Validado');
    assert.equal(state.metadata['SLM_DE:AD1:L2'].action, undefined);
    id = 'other-synthetic-route-test';
    assert.equal((await (await GET(req())).json()).rootUrl, '');
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'production';
    assert.equal((await GET(req())).status, 403);
  } finally {
    globalThis.fetch = original;
    if (preview === undefined) delete process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
    else process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = preview;
    delete process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY;
    await rm(directory, { recursive: true, force: true });
  }
});
