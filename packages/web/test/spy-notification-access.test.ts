import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST } from '../src/app/api/spy-notifications/route';
import { CenterNotificationSchema } from '../src/lib/api-client/endpoints-notifications';
test('Spy notification route rejects outside preview, wrong hosts, absent sessions, cross-origin writes and oversized bodies', async () => {
  const before = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ user: { id: 'responsible-user', role: 'member' } });
  };
  try {
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'production';
    assert.equal(
      (await GET(new Request('http://localhost:3120/api/spy-notifications'))).status,
      403,
    );
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
    assert.equal(
      (
        await GET(
          new Request('https://example.com/api/spy-notifications', {
            headers: { Authorization: 'Bearer test' },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (await GET(new Request('http://localhost:3120/api/spy-notifications'))).status,
      403,
    );
    assert.equal(calls, 0);
    const fixture = await GET(
      new Request('http://localhost:3120/api/spy-notifications?fixture=1', {
        headers: { Authorization: 'Bearer test' },
      }),
    );
    assert.equal(fixture.status, 200);
    const body = await fixture.json();
    const n = CenterNotificationSchema.parse(body.notifications[0]);
    assert.equal(n.kind, 'spy');
    assert.match(n.title, /simulado/);
    assert.equal(n.unread, false);
    assert.equal(
      (
        await POST(
          new Request('http://localhost:3120/api/spy-notifications', {
            method: 'POST',
            headers: { Authorization: 'Bearer test', Origin: 'https://example.com' },
            body: '{}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await POST(
          new Request('http://localhost:3120/api/spy-notifications', {
            method: 'POST',
            headers: { Authorization: 'Bearer test', Origin: 'http://localhost:3120' },
            body: 'x'.repeat(50001),
          }),
        )
      ).status,
      400,
    );
  } finally {
    globalThis.fetch = original;
    if (before === undefined)
      Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND');
    else process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = before;
  }
});
