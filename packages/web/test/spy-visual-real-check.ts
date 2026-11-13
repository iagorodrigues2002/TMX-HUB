// Explicit local verification only; never part of the automatic test suite.
import assert from 'node:assert/strict';
import { GET, POST } from '../src/app/api/spy-visual/route';
process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
const login = await fetch('http://127.0.0.1:4110/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:3120' },
  body: JSON.stringify({ email: 'admin@native.tmx.test', password: 'Synthetic-preview-2026!' }),
});
assert.equal(login.status, 200);
const { token } = await login.json();
const headers = {
  authorization: `Bearer ${token}`,
  origin: 'http://localhost:3120',
  'content-type': 'application/json',
};
const list = await GET(new Request('http://localhost:3120/api/spy-visual', { headers }));
const data = await list.json();
console.log('source', {
  status: list.status,
  name: data.name,
  count: data.ads?.length,
  candidates: data.ads?.filter((a: { previous?: unknown }) => a.previous).length,
  detail: data.detail,
});
assert.equal(list.status, 200);
const selected = data.ads.filter((a: { previous?: unknown }) => a.previous).slice(0, 3);
for (const ad of selected) {
  const start = Date.now();
  const run = () =>
    POST(
      new Request('http://localhost:3120/api/spy-visual', {
        method: 'POST',
        headers,
        body: JSON.stringify({ adId: ad.id }),
      }),
    );
  const response = await run();
  const result = await response.json();
  console.log('comparison', {
    id: ad.id,
    status: response.status,
    seconds: (Date.now() - start) / 1000,
    cached: result.cached,
    classification: result.result?.classification,
    reason: result.result?.reason,
    costMicros: result.costMicros,
    costReserved: result.costReserved,
    frameCounts: result.compared?.map((a: { frames: unknown[] }) => a.frames.length),
    detail: result.detail,
  });
  if (response.ok) {
    const cached = await run();
    const repeat = await cached.json();
    assert.equal(repeat.cached, true);
    assert.deepEqual(repeat.result, result.result);
    console.log('repeat', { id: ad.id, cached: true });
  }
}
const noReference = data.ads.find((a: { previous?: unknown }) => !a.previous);
if (noReference) {
  const r = await POST(
    new Request('http://localhost:3120/api/spy-visual', {
      method: 'POST',
      headers,
      body: JSON.stringify({ adId: noReference.id }),
    }),
  );
  console.log('noReference', { status: r.status, detail: (await r.json()).detail });
  assert.equal(r.status, 422);
}
assert.equal((await GET(new Request('http://localhost:3120/api/spy-visual'))).status, 403);
