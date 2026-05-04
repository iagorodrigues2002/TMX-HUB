import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { zodToProblem } from '../lib/problem.js';

const DiffRequestSchema = z
  .object({
    url_a: z.string().url(),
    url_b: z.string().url(),
    /** 'static' uses undici (fast); 'js' uses Playwright (heavier, sees SPAs). */
    render_mode: z.enum(['static', 'js']).default('js'),
  })
  .strict();

interface CoreDiffModule {
  fetchPage(
    url: string,
    opts: Record<string, unknown>,
  ): Promise<{ html: string; finalUrl: string; statusCode: number }>;
  extractVisibleText(html: string): string[];
  diffLines(
    a: string[],
    b: string[],
  ): {
    entries: Array<{ op: 'equal' | 'add' | 'remove'; text: string }>;
    summary: { added: number; removed: number; unchanged: number };
  };
}

async function loadCore(): Promise<CoreDiffModule> {
  return (await import('@page-cloner/core')) as unknown as CoreDiffModule;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/page-diff', async (req, reply) => {
    const parsed = DiffRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { url_a, url_b, render_mode } = parsed.data;
    const core = await loadCore();
    const t0 = Date.now();

    // Fetch both URLs in parallel.
    const [a, b] = await Promise.all([
      core.fetchPage(url_a, { renderMode: render_mode, timeoutMs: 60_000 }),
      core.fetchPage(url_b, { renderMode: render_mode, timeoutMs: 60_000 }),
    ]);

    const linesA = core.extractVisibleText(a.html);
    const linesB = core.extractVisibleText(b.html);
    const result = core.diffLines(linesA, linesB);

    return reply.send({
      url_a: { input: url_a, final: a.finalUrl, status: a.statusCode, lines: linesA.length },
      url_b: { input: url_b, final: b.finalUrl, status: b.statusCode, lines: linesB.length },
      render_mode,
      duration_ms: Date.now() - t0,
      summary: result.summary,
      entries: result.entries,
    });
  });
};

export default plugin;
