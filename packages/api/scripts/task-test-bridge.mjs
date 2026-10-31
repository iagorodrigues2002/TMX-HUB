import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function allowedTaskRequest(method, path, provided, secret) {
  if (!secret || secret.length < 32 || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let url;
  try {
    url = new URL(path, 'http://localhost');
  } catch {
    return false;
  }
  return (
    (method === 'GET' && /^\/v1\/task-automation\/(people|tasks\/lookup)$/.test(url.pathname)) ||
    (method === 'POST' &&
      /^\/v1\/task-automation\/(commands\/claim|events|commands\/[a-f0-9-]{36}\/result)$/.test(
        url.pathname,
      ))
  );
}

export function forwardTaskBody(chunks) {
  const body = Buffer.concat(chunks);
  return body.length ? { body, headers: { 'content-type': 'application/json' } } : { headers: {} };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const secret = process.env.TASK_AUTOMATION_SECRET;
  if (!secret || secret.length < 32 || process.env.NODE_ENV === 'production')
    throw Error('Local test configuration required');
  const server = createServer(async (req, res) => {
    if (!allowedTaskRequest(req.method, req.url, req.headers['x-tmx-task-secret'], secret)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 131072) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const forwarded = forwardTaskBody(chunks);
      const upstream = await fetch(`http://127.0.0.1:4000${req.url}`, {
        method: req.method,
        headers: { 'x-tmx-task-secret': secret, ...forwarded.headers },
        body: req.method === 'POST' ? forwarded.body : undefined,
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      res.writeHead(upstream.status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(await upstream.text());
    } catch {
      res.writeHead(502).end('{"error":"Local task API unavailable"}');
    }
  });
  server.listen(4101, '127.0.0.1');
  setTimeout(() => server.closeAllConnections() || server.close(), 3600000).unref();
}
