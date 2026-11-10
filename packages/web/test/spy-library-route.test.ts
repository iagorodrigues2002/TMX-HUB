import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST } from '../src/app/api/spy-library/route';
test('Library route is unavailable outside synthetic preview and requires a real local admin session', async () => {
  const original = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
  const fetcher = globalThis.fetch;
  try {
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND');
    assert.equal((await GET(new Request('http://localhost:3120/api/spy-library'))).status, 403);
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
    assert.equal(
      (
        await GET(
          new Request('http://localhost:3120/api/spy-library?view=ads&id=offer&offset=0&at=now'),
        )
      ).status,
      403,
    );
    assert.equal(
      (await GET(new Request('http://localhost:3120/api/spy-library?view=users'))).status,
      403,
    );
    assert.equal((await GET(new Request('http://localhost:3120/api/spy-library'))).status, 403);
    globalThis.fetch = async () =>
      Response.json({ user: { id: 'isolated-test-admin', role: 'user' } });
    assert.equal(
      (
        await GET(
          new Request('http://localhost:3120/api/spy-library?view=users', {
            headers: { Authorization: 'Bearer synthetic' },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await GET(
          new Request('http://localhost:3120/api/spy-library', {
            headers: { Authorization: 'Bearer synthetic' },
          }),
        )
      ).status,
      403,
    );
    globalThis.fetch = async () =>
      Response.json({ user: { id: 'isolated-test-admin', role: 'admin' } });
    assert.equal(
      (
        await POST(
          new Request('http://localhost:3120/api/spy-library', {
            method: 'POST',
            headers: { Authorization: 'Bearer synthetic', Origin: 'https://evil.example' },
            body: '{}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await GET(
          new Request('http://other.example/api/spy-library', {
            headers: { Authorization: 'Bearer synthetic' },
          }),
        )
      ).status,
      403,
    );
  } finally {
    globalThis.fetch = fetcher;
    if (original === undefined)
      Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND');
    else process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = original;
  }
});
