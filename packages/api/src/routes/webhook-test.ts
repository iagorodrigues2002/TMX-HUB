import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { zodToProblem } from '../lib/problem.js';

const FireSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
    headers: z.record(z.string(), z.string()).default({}),
    body: z.unknown(),
    timeout_ms: z.number().int().min(1_000).max(30_000).default(15_000),
  })
  .strict();

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/webhook-test', async (req, reply) => {
    const parsed = FireSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { url, method, headers, body, timeout_ms } = parsed.data;

    // Block private/internal targets — testing webhooks should hit the
    // user's own public endpoints, not the loopback or RFC-1918 ranges.
    // (Light filter; not a substitute for proper SSRF defense.)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reply.code(400).send({ error: 'Invalid URL.' });
    }
    if (
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname.endsWith('.localhost') ||
      /^(127\.|10\.|169\.254\.|192\.168\.)/.test(parsedUrl.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsedUrl.hostname)
    ) {
      return reply.code(400).send({
        error: 'URL aponta para um host privado/local. Use a URL pública do seu webhook.',
      });
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout_ms);
    const t0 = Date.now();
    const bodyStr =
      typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
    const finalHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...headers,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: bodyStr,
        signal: ac.signal,
      });
      // Cap response body at 256KB so a misconfigured endpoint can't OOM us.
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            total += value.byteLength;
            if (total > 256 * 1024) {
              await reader.cancel().catch(() => undefined);
              break;
            }
          }
        }
      }
      const responseBody = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      if (req.user) {
        const now = new Date().toISOString();
        await app.activityStore.record(req.user.sub, {
          kind: 'webhook',
          id: `${Date.parse(now).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          label: `${method} ${url}`,
          status: `HTTP ${res.status}`,
          createdAt: now,
        });
      }

      return reply.send({
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        duration_ms: Date.now() - t0,
        response_headers: respHeaders,
        response_body: responseBody,
        sent: { url, method, headers: finalHeaders, body: bodyStr },
      });
    } catch (err) {
      const message =
        ac.signal.aborted
          ? `Timeout: o destino não respondeu em ${timeout_ms}ms.`
          : (err as Error)?.message ?? 'Falha ao chamar o destino.';
      return reply.code(200).send({
        ok: false,
        status: 0,
        duration_ms: Date.now() - t0,
        error: message,
        sent: { url, method, headers: finalHeaders, body: bodyStr },
      });
    } finally {
      clearTimeout(timer);
    }
  });
};

export default plugin;
