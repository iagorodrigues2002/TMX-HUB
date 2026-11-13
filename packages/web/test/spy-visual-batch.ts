// Explicit paid local run, authorized by the user; completed comparisons are reused by the API.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const GET = (request: Request) => fetch(request);
const POST = GET;
process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
const response = await fetch('http://127.0.0.1:4110/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:3120' },
  body: JSON.stringify({ email: 'admin@native.tmx.test', password: 'Synthetic-preview-2026!' }),
});
if (!response.ok) throw Error('Local login failed');
const { token } = await response.json();
const headers = {
  authorization: `Bearer ${token}`,
  origin: 'http://localhost:3120',
  'content-type': 'application/json',
};
const listed = await GET(new Request('http://localhost:3120/api/spy-visual', { headers }));
if (!listed.ok) throw Error('Source unavailable');
const data = await listed.json();
const dir = join(
  homedir(),
  '.codex/local-data/tmx/ai-preview/spy-visual-source/69706e9a-95ad-493e-b4ab-4a6de7541adc',
);
await mkdir(dir, { recursive: true, mode: 0o700 });
const file = join(dir, 'batch-results.json');
let results: Record<string, unknown> = {};
try {
  results = JSON.parse(await readFile(file, 'utf8')).results ?? {};
} catch {}
const chosen = data.ads.filter((a: { previous?: unknown }) => a.previous);
console.log(
  JSON.stringify({
    event: 'start',
    total: chosen.length,
    withoutReference: data.ads.length - chosen.length,
  }),
);
for (const [index, ad] of chosen.entries()) {
  const started = Date.now();
  const res = await POST(
    new Request('http://localhost:3120/api/spy-visual', {
      method: 'POST',
      headers,
      body: JSON.stringify({ adId: ad.id }),
    }),
  );
  const result = await res.json();
  const entry = {
    id: ad.id,
    reference: ad.previous.id,
    status: res.status,
    cached: result.cached,
    classification: result.result?.classification,
    reason: result.result?.reason,
    costMicros: result.costMicros,
    costReserved: result.costReserved,
    detail: result.detail,
    at: new Date().toISOString(),
  };
  results[ad.id] = entry;
  await writeFile(
    file + '.tmp',
    JSON.stringify({ offerId: data.offerId, at: new Date().toISOString(), results }, null, 2),
    { mode: 0o600 },
  );
  await rename(file + '.tmp', file);
  console.log(
    JSON.stringify({
      event: 'result',
      index: index + 1,
      total: chosen.length,
      seconds: Math.round((Date.now() - started) / 1000),
      ...entry,
    }),
  );
  if (res.status === 429) {
    console.log('Budget exhausted; stopped without automatic retries.');
    break;
  }
}
