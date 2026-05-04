import { InspectRequestSchema } from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { zodToProblem } from '../lib/problem.js';

interface CoreInspectModule {
  fetchPage(url: string, opts: Record<string, unknown>): Promise<{ html: string; finalUrl: string; statusCode: number }>;
  inspectHtml(html: string, baseUrl: string): unknown;
}

async function loadCore(): Promise<CoreInspectModule> {
  return (await import('@page-cloner/core')) as unknown as CoreInspectModule;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/inspect', async (req, reply) => {
    const parsed = InspectRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const { url } = parsed.data;
    const core = await loadCore();

    const fetched = await core.fetchPage(url, { renderMode: 'static', timeoutMs: 20_000 });
    const result = core.inspectHtml(fetched.html, fetched.finalUrl) as Record<string, unknown>;

    return reply.send({
      ...result,
      url,
      finalUrl: fetched.finalUrl,
    });
  });
};

export default plugin;
