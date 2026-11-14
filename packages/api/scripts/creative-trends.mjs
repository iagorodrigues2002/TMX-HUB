import { createHash, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
export const trendRequest = z
  .object({
    companyId: z.string().uuid(),
    owner: z.string().min(1).max(100),
    niche: z.string().min(1).max(80),
    query: z.string().min(1).max(160),
    region: z.enum(['BR', 'US', 'FR', 'DE', 'ES']),
  })
  .strict();
export function normalizeTrendVideos(raw, now = Date.now()) {
  const videos = [...(raw.videos ?? []), ...(raw.shorts ?? [])];
  return videos
    .flatMap((v) => {
      if (!/^[A-Za-z0-9_-]{11}$/.test(v.id ?? '') || typeof v.title !== 'string') return [];
      const published = Date.parse(v.publishedTime),
        views = v.viewCountInt == null || v.viewCountInt === '' ? NaN : Number(v.viewCountInt);
      return [
        {
          id: v.id,
          title: v.title.slice(0, 400),
          url: `https://www.youtube.com/watch?v=${v.id}`,
          views: Number.isFinite(views) && views >= 0 ? views : null,
          publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
          recentConfirmed:
            Number.isFinite(published) && published <= now && now - published <= 8 * 86400000,
        },
      ];
    })
    .slice(0, 20);
}
export async function searchCreativeTrends(
  raw,
  fetcher = fetch,
  base = join(homedir(), '.codex/local-data/tmx'),
) {
  const input = trendRequest.parse(raw);
  const company = JSON.parse(await readFile(join(base, 'ai-preview/company.json'), 'utf8'));
  if (company.companyId !== input.companyId) throw Error('Empresa não autorizada.');
  const root = join(base, 'ai-preview/creative-learning', input.companyId, 'trends');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const key = createHash('sha256')
      .update(
        JSON.stringify([
          input.niche,
          input.query,
          input.region,
          Math.floor(Date.now() / (6 * 3600000)),
        ]),
      )
      .digest('hex'),
    file = join(root, `${key}.json`);
  try {
    const old = JSON.parse(await readFile(file, 'utf8'));
    if (old.status === 'complete') return { ...old, cached: true };
    throw Error('Consulta anterior em andamento ou incerta; não repetida para evitar cobrança.');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const lib = join(base, 'spy-library');
  let state;
  for (const owner of [`company:${input.companyId}`, input.owner]) {
    try {
      const s = JSON.parse(
        await readFile(
          join(lib, `${createHash('sha256').update(owner).digest('hex')}.json`),
          'utf8',
        ),
      );
      if (s.owner === owner && s.provider === 'scrapecreators' && s.encrypted) {
        state = s;
        break;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (!state) throw Error('Configure o ScrapeCreators no Spy da prévia.');
  const [iv, tag, data] = state.encrypted.split('.'),
    secret = await readFile(join(lib, '.key'));
  const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const token = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  await writeFile(file, JSON.stringify({ status: 'pending', at: new Date().toISOString() }), {
    mode: 0o600,
    flag: 'wx',
  });
  const query = new URLSearchParams({
    query: input.query,
    region: input.region,
    uploadDate: 'this_week',
    sortBy: 'popular',
    type: 'videos',
    includeExtras: 'false',
  });
  const response = await fetcher(`https://api.scrapecreators.com/v1/youtube/search?${query}`, {
    headers: { 'x-api-key': token },
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw Error(`ScrapeCreators indisponível (${response.status}); sem repetição automática.`);
  const result = await response.json();
  if (result.success !== true) throw Error('Pesquisa não concluída; sem repetição automática.');
  const record = {
    status: 'complete',
    companyId: input.companyId,
    niche: input.niche,
    query: input.query,
    region: input.region,
    at: new Date().toISOString(),
    source: 'ScrapeCreators · YouTube · populares nesta semana',
    creditsCharged: typeof result.credits_charged === 'number' ? result.credits_charged : null,
    items: normalizeTrendVideos(result),
    limitation:
      'Resultados de busca, não ranking universal de tendências. Uma leitura não mede crescimento. Datas ausentes não confirmam recência.',
  };
  await writeFile(file, JSON.stringify(record), { mode: 0o600 });
  return { ...record, cached: false };
}
