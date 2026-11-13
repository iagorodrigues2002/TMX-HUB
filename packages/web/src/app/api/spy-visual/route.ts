import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyzeSpyCreatives } from '@/lib/spy-creative-analysis';
import { hydrateSpyThumbnails } from '@/lib/spy-creative-media';
import { hydrateSpyRecovery } from '@/lib/spy-creative-recovery';
import type { LibraryAd } from '@/lib/spy-library-reader';
import { readLibraryState, spyLibraryDirectory } from '@/lib/spy-library-store';
import { spySameOrigin, spyServerAccess, spyServerEnabled } from '@/lib/spy-server-access';
import { spyVisualFrames } from '@/lib/spy-visual-frames';
import { recoveredReferencesSchema, resultSchema } from '@/lib/spy-visual-results';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const root = join(homedir(), '.codex/local-data/tmx/ai-preview/spy-visual-source');
const send = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function context(req: Request) {
  const server = spyServerEnabled();
  if (
    !server &&
    (process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic' ||
      !['localhost:3120', '127.0.0.1:3120'].includes(new URL(req.url).host))
  )
    throw Error('Prévia local indisponível.');
  if ((req.method === 'POST' || req.headers.get('origin')) && !spySameOrigin(req))
    throw Error('Origem inválida.');
  const tenant = server ? await spyServerAccess(req) : null;
  if (server && !tenant) throw Error('Acesso ao Spy negado.');
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw Error('Entre no TMX.');
  const headers = {
    authorization,
    'content-type': 'application/json',
    origin: server ? process.env.TMX_SPY_ORIGIN! : 'http://localhost:3120',
  };
  const api = server ? process.env.API_PROXY_TARGET!.replace(/\/$/, '') : 'http://127.0.0.1:4110';
  const companyQuery = tenant ? `?companyId=${tenant.companyId}` : '';
  const r = await fetch(`${api}/v1/meta-control/traffic/ai/spy-visual/access${companyQuery}`, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!r.ok) throw Error('Acesso restrito ao administrador autorizado da empresa.');
  const { companyId } = z.object({ companyId: z.string().uuid() }).parse(await r.json());
  type Source = {
    companyId: string;
    job: {
      id: string;
      name: string;
      snapshots: {
        at: string;
        scope: string;
        baseline: boolean;
        ads: LibraryAd[];
        added: string[];
      }[];
    };
  };
  let source: Source;
  if (server) {
    if (tenant!.companyId !== companyId) throw Error('Empresa inválida.');
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
    const state = await readLibraryState(tenant!.owner);
    const job = state.jobs[id];
    if (!job || job.deletedAt) throw Error('Oferta não encontrada nesta empresa.');
    await hydrateSpyRecovery(spyLibraryDirectory(), tenant!.owner, job);
    await hydrateSpyThumbnails(
      spyLibraryDirectory(),
      tenant!.owner,
      job.snapshots.flatMap((s) => s.ads),
    );
    source = { companyId, job };
  } else source = JSON.parse(await readFile(join(root, companyId, 'source.json'), 'utf8'));
  if (source.companyId !== companyId) throw Error('Empresa inválida.');
  const at = new URL(req.url).searchParams.get('at');
  const snapshot = at ? source.job.snapshots.find((s) => s.at === at) : source.job.snapshots.at(-1);
  if (!snapshot) throw Error('Sem coleta.');
  const cacheRoot = server
    ? join(spyLibraryDirectory(), 'visual', companyId)
    : join(root, companyId);
  const analysis = analyzeSpyCreatives(source.job.snapshots, snapshot);
  let recovered: ReturnType<typeof recoveredReferencesSchema.parse> = {
    references: {},
    unresolved: [],
  };
  try {
    recovered = recoveredReferencesSchema.parse(
      JSON.parse(
        await readFile(
          join(cacheRoot, ...(server ? [source.job.id] : []), 'recovered-references.json'),
          'utf8',
        ),
      ),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      throw Error('Referências recuperadas inválidas.');
  }
  const references = new Map([...analysis.results].map(([id, a]) => [id, a.previous]));
  for (const [id, candidate] of Object.entries(recovered.references)) {
    const reading = source.job.snapshots.find(
      (s) =>
        s.at === candidate.at &&
        s.scope === snapshot.scope &&
        Date.parse(s.at) < Date.parse(snapshot.at),
    );
    const currentRef = references.get(id);
    const hasReferenceMedia =
      currentRef &&
      source.job.snapshots
        .find((s) => s.at === currentRef.at)
        ?.ads.find((a) => a.id === currentRef.id)?.creativeAssets?.length;
    if (
      !hasReferenceMedia &&
      analysis.results.get(id)?.status === 'unverified' &&
      reading?.ads.some((a) => a.id === candidate.id) &&
      candidate.id !== id
    )
      references.set(id, { ...candidate, sameReading: false });
  }
  return {
    headers,
    companyId,
    api,
    cacheRoot,
    ...source.job,
    snapshot,
    analysis,
    references,
    recovered,
  };
}
export async function GET(req: Request) {
  try {
    const c = await context(req);
    const response = await fetch(
      `${c.api}/v1/meta-control/traffic/ai/spy-visual/results?companyId=${c.companyId}&offerId=${c.id}`,
      {
        headers: c.headers,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw Error('Não foi possível carregar as análises salvas.');
    const saved = z
      .object({ records: z.array(resultSchema) })
      .parse(await response.json())
      .records.filter((r) => r.companyId === c.companyId && r.offerId === c.id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const ads = c.snapshot.ads
      .filter((a) => c.analysis.results.get(a.id)?.status === 'unverified')
      .map((a) => {
        const previous = c.references.get(a.id);
        const record = saved.find((r) => r.ads[0] === a.id && r.ads[1] === previous?.id);
        return {
          id: a.id,
          pageName: a.pageName,
          title: a.title,
          previous,
          reason: c.analysis.results.get(a.id)?.reason,
          recoveredReference:
            !!previous && previous.id !== c.analysis.results.get(a.id)?.previous?.id,
          recoveryNote: c.recovered.unresolved.find((r) => r.id === a.id)?.reason,
          saved: record
            ? { ...record.result, at: record.at, costMicros: record.costMicros }
            : undefined,
        };
      });
    return send({
      name: c.name,
      offerId: c.id,
      at: c.snapshot.at,
      ads,
      summary: {
        total: ads.length,
        analyzed: ads.filter((a) => a.saved).length,
        withReference: ads.filter((a) => a.previous).length,
        recovered: ads.filter((a) => a.recoveredReference).length,
        withoutReference: ads.filter((a) => !a.previous).length,
        classifications: Object.fromEntries(
          ['reused', 'variation', 'different', 'inconclusive'].map((status) => [
            status,
            ads.filter((a) => a.saved?.classification === status).length,
          ]),
        ),
        totalCostMicros: saved.reduce((sum, r) => sum + r.costMicros, 0),
      },
    });
  } catch (e) {
    return send({ detail: (e as Error).message }, 403);
  }
}
const pending = new Map<string, Promise<Response>>();
export async function POST(req: Request) {
  try {
    const c = await context(req);
    const { adId, cachedOnly } = z
      .object({ adId: z.string().regex(/^\d+$/), cachedOnly: z.boolean().optional() })
      .strict()
      .parse(await req.json());
    const analysis = c.analysis.results.get(adId);
    const ad = c.snapshot.ads.find((a) => a.id === adId);
    if (!ad || analysis?.status !== 'unverified')
      return send({ detail: 'Anúncio não confirmado não encontrado nesta coleta.' }, 404);
    const previous = c.references.get(adId);
    const reference =
      previous &&
      c.snapshots.find((s) => s.at === previous.at)?.ads.find((a) => a.id === previous.id);
    if (!reference)
      return send(
        {
          detail:
            'Sem candidato histórico confirmado para comparação. Mantido não confirmado; nenhuma chamada à OpenAI.',
        },
        422,
      );
    const lock = `${c.companyId}:${c.id}:${adId}`;
    if (pending.has(lock)) return send({ detail: 'Comparação em andamento.' }, 409);
    const work = (async () => {
      const ads = [];
      for (const a of [ad, reference])
        ads.push({
          id: a.id,
          text: (a.creativeText ?? a.description ?? '').slice(0, 6000),
          frames: await spyVisualFrames(join(c.cacheRoot, 'frames'), a),
        });
      const response = await fetch(
        `${c.api}/v1/meta-control/traffic/ai/spy-visual${cachedOnly ? '?cachedOnly=1' : ''}`,
        {
          method: 'POST',
          headers: c.headers,
          body: JSON.stringify({ companyId: c.companyId, offerId: c.id, ads }),
          signal: AbortSignal.timeout(110000),
          redirect: 'error',
        },
      );
      const result = await response.json();
      return send(
        response.ok ? { ...result, compared: ads, previousAt: previous!.at } : result,
        response.status,
      );
    })();
    pending.set(lock, work);
    try {
      return await work;
    } finally {
      pending.delete(lock);
    }
  } catch (e) {
    return send({ detail: (e as Error).message }, 422);
  }
}
