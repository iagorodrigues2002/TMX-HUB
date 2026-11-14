import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { proxyRequest } from 'next/dist/server/lib/router-utils/proxy-request.js';

test('preview keeps a slow AI response alive beyond the default 30 seconds', async () => {
  const original = process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
  process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = 'synthetic';
  const { default: preview } = await import('../next.config.mjs?preview-timeout');
  process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = '';
  const { default: production } = await import('../next.config.mjs?production-timeout');
  if (original === undefined) delete process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND;
  else process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND = original;
  assert.equal(preview.experimental.proxyTimeout, 600_000);
  assert.equal(production.experimental.proxyTimeout, undefined);
  const upstream = createServer((_req, res) => {
    setTimeout(() => res.end('saved-analysis'), 31_000);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createServer((req, res) => {
    void proxyRequest(req, res, {
      protocol: 'http:', hostname: '127.0.0.1', port: String(upstream.address().port),
      pathname: '/analysis', query: {},
    }, undefined, undefined, preview.experimental.proxyTimeout).catch(() => {
      res.statusCode = 500;
      res.end('failed');
    });
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/analysis`, { signal: AbortSignal.timeout(40_000) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'saved-analysis');
  } finally {
    proxy.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise((r) => proxy.close(r)), new Promise((r) => upstream.close(r))]);
  }
});
