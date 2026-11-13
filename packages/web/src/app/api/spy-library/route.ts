import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseSpySaved } from '@/components/spy/spy-model';
import { deleteSpyOffers, saveSpyCatalog } from '@/lib/spy-catalog';
import { hydrateSpyThumbnails } from '@/lib/spy-creative-media';
import { hydrateSpyRecovery } from '@/lib/spy-creative-recovery';
import { spyHistoryFixture } from '@/lib/spy-history-fixture';
import { LibraryFailure, normalizeLibrarySource } from '@/lib/spy-library-reader';
import {
  changeLibraryState,
  encryptLibraryToken,
  enrollLibraryOffers,
  prepareScrapeMonitoring,
  publicLibraryAds,
  publicLibraryNewLinks,
  publicLibraryPages,
  publicLibraryState,
  readLibraryState,
  spyLibraryDirectory,
} from '@/lib/spy-library-store';
import { setSpyMonitoring } from '@/lib/spy-library-store';
import { readSpyImage } from '@/lib/spy-media-cache';
import { readScrapeLibrary } from '@/lib/spy-scrapecreators-reader';
import { spySameOrigin, spyServerAccess, spyServerEnabled } from '@/lib/spy-server-access';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let usersCache: { at: number; users: { id: string; name: string }[] } | undefined;
let usersPending: Promise<{ id: string; name: string }[]> | undefined;
async function registeredUsers() {
  if (usersCache && Date.now() - usersCache.at < 300000) return usersCache.users;
  if (!usersPending) {
    usersPending = (async () => {
      // Read inside the trusted API container; production credentials never leave it.
      const script = `(async()=>{
        const Redis=require('ioredis'),crypto=require('node:crypto');
        const redis=new Redis(process.env.REDIS_URL,{connectTimeout:5000,maxRetriesPerRequest:0,retryStrategy:()=>null});redis.on('error',()=>{});
        let owner;try{owner=await redis.hgetall('user:01KQSEXEWXZ9Y67V2HFK18JHJB')}finally{redis.disconnect()}
        if(owner.id!=='01KQSEXEWXZ9Y67V2HFK18JHJB'||owner.role!=='admin')throw Error('owner_unavailable');
        const now=Math.floor(Date.now()/1000);
        const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner.id,email:owner.email,role:owner.role,iat:now,exp:now+60})).toString('base64url');
        const token=data+'.'+crypto.createHmac('sha256',process.env.JWT_SECRET).update(data).digest('base64url');
        const r=await fetch('http://127.0.0.1:'+(process.env.PORT||process.env.API_PORT||4000)+'/v1/users',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!r.ok)throw Error('users_unavailable');
        const body=await r.json();console.log('TMX_SPY_USERS:'+JSON.stringify(body.users.map(u=>({id:u.id,name:u.name}))));
      })().catch(()=>{console.error('TMX_SPY_USERS_FAILED');process.exitCode=1})`;
      const { stdout } = await promisify(execFile)(
        '/opt/homebrew/bin/railway',
        [
          'ssh',
          '--project',
          '3704cd93-6011-4e5f-be52-f229b499b018',
          '--environment',
          'production',
          '--service',
          '@page-cloner/api',
          '--',
          'node',
          '-e',
          script,
        ],
        { timeout: 45000, maxBuffer: 262144 },
      );
      const line = stdout.split('\n').find((v) => v.startsWith('TMX_SPY_USERS:'));
      if (!line) throw Error('users_unavailable');
      const users = z
        .array(z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(200) }))
        .max(1000)
        .parse(JSON.parse(line.slice('TMX_SPY_USERS:'.length)));
      usersCache = { at: Date.now(), users };
      return users;
    })().finally(() => {
      usersPending = undefined;
    });
  }
  return usersPending;
}
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function authorize(req: Request) {
  if (spyServerEnabled()) return (await spyServerAccess(req))?.owner ?? null;
  if (
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic' ||
    !['localhost:3120', '127.0.0.1:3120'].includes(new URL(req.url).host)
  )
    return null;
  const cookie =
    new URL(req.url).searchParams.get('view') === 'image'
      ? req.headers
          .get('cookie')
          ?.split(';')
          .map((v) => v.trim())
          .find((v) => v.startsWith('tmx_hub_auth_token='))
          ?.slice('tmx_hub_auth_token='.length)
      : undefined;
  const authorization = req.headers.get('authorization') ?? (cookie ? `Bearer ${cookie}` : null);
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    const r = await fetch('http://127.0.0.1:4110/v1/auth/me', {
      headers: { Authorization: authorization },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const body = await r.json();
    return z
      .object({ user: z.object({ id: z.string().min(1).max(100), role: z.literal('admin') }) })
      .parse(body).user.id;
  } catch {
    return null;
  }
}
async function output(owner: string) {
  let worker: unknown = null;
  try {
    worker = JSON.parse(await readFile(join(spyLibraryDirectory(), 'worker-status.json'), 'utf8'));
  } catch {}
  const parsed = z.object({ at: z.string(), running: z.boolean() }).safeParse(worker);
  const state = await readLibraryState(owner);
  const jobs = Object.values(state.jobs);
  for (let index = 0; index < jobs.length; index += 4) {
    await Promise.all(jobs.slice(index, index + 4).map(async (job) => {
      await hydrateSpyRecovery(spyLibraryDirectory(), owner, job);
      await hydrateSpyThumbnails(spyLibraryDirectory(), owner, job.snapshots.flatMap((reading) => reading.ads));
    }));
  }
  return {
    ...publicLibraryState(state),
    workerRunning:
      parsed.success && parsed.data.running && Date.now() - Date.parse(parsed.data.at) < 90000,
  };
}
export async function GET(req: Request) {
  const owner = await authorize(req);
  if (!owner) return reply({ detail: 'Entre com uma conta com acesso ao Spy.' }, 403);
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('view') === 'seed')
      return !spyServerEnabled()
        ? reply({ offers: (await readLibraryState(owner)).catalog })
        : reply({ detail: 'Não encontrado.' }, 404);
    if (url.searchParams.get('view') === 'catalog') {
      const access = await spyServerAccess(req, true);
      if (spyServerEnabled() && !access) return reply({ detail: 'Acesso não autorizado.' }, 403);
      const state = await readLibraryState(owner);
      return reply({
        offers: state.catalog,
        revision: state.catalogRevision,
        drive: state.drive,
        access,
      });
    }
    if (url.searchParams.get('view') === 'image') {
      const image = await readSpyImage(
        spyLibraryDirectory(),
        owner,
        url.searchParams.get('key') ?? '',
      );
      return image
        ? new Response(new Uint8Array(image.bytes), {
            headers: {
              'Content-Type': image.type,
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        : reply({ detail: 'Imagem não encontrada.' }, 404);
    }
    const fixture = !spyServerEnabled() && url.searchParams.get('fixture') === 'page-history';
    const fixtureDay = Number(url.searchParams.get('day') ?? 0);
    if (fixture && (!Number.isInteger(fixtureDay) || fixtureDay < 0 || fixtureDay > 3))
      return reply({ detail: 'Dia de teste inválido.' }, 400);
    const fixtureState = fixture ? spyHistoryFixture(fixtureDay) : null;
    if (['ads', 'pages', 'links'].includes(url.searchParams.get('view') ?? '')) {
      const input = z
        .object({
          id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
          offset: z.coerce.number().int().min(0).max(100000),
          at: z.string().min(1).max(100),
          creative: z.enum(['all-new', 'new', 'duplicate', 'variation', 'unverified']).optional(),
        })
        .safeParse({
          id: url.searchParams.get('id'),
          offset: url.searchParams.get('offset') ?? '0',
          at: url.searchParams.get('at'),
          creative: url.searchParams.get('creative') ?? undefined,
        });
      if (!input.success) return reply({ detail: 'Página de anúncios inválida.' }, 400);
      const state = fixtureState ?? (await readLibraryState(owner));
      const job = state.jobs[input.data.id];
      if (job && !fixtureState && url.searchParams.get('view') !== 'pages') {
        await hydrateSpyRecovery(spyLibraryDirectory(), owner, job);
        await hydrateSpyThumbnails(spyLibraryDirectory(), owner, job.snapshots.flatMap((reading) => reading.ads));
      }
      if (url.searchParams.get('view') === 'links') {
        const result = publicLibraryNewLinks(state, input.data.id);
        if (!result) return reply({ detail: 'Nenhuma leitura salva.' }, 404);
        if (result.at !== input.data.at)
          return reply({ detail: 'A leitura foi atualizada. Reabra a oferta.' }, 409);
        return reply(result);
      }
      const isPages = url.searchParams.get('view') === 'pages';
      const page = isPages
        ? publicLibraryPages(state, input.data.id, input.data.offset)
        : publicLibraryAds(
            state,
            input.data.id,
            input.data.offset,
            url.searchParams.get('highlights') === '1',
            input.data.creative,
            url.searchParams.get('grouped') === '1',
          );
      if (!page) return reply({ detail: 'Nenhuma leitura salva para esta oferta.' }, 404);
      if (page.at !== input.data.at)
        return reply({ detail: 'A leitura foi atualizada. Reabra a oferta.' }, 409);
      return reply(page);
    }
    if (new URL(req.url).searchParams.get('view') === 'users')
      return reply({
        users: spyServerEnabled()
          ? ((await spyServerAccess(req, true))?.users ?? [])
          : await registeredUsers(),
      });
    return reply(
      fixtureState
        ? {
            ...publicLibraryState(fixtureState),
            connected: true,
            workerRunning: false,
            fixture: true,
          }
        : await output(owner),
    );
  } catch {
    return reply({ detail: 'Não foi possível ler o histórico. Dados preservados.' }, 503);
  }
}
const offerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  name: z.string().min(1).max(200),
  sources: z.array(z.string().max(10000)).max(20),
  domains: z.array(z.string().max(1000)).max(20).optional(),
  ownerId: z.string().min(1).max(100).nullable().optional(),
});
const inputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delete_offers'),
    ids: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
      .min(1)
      .max(200),
    baseRevision: z.string().max(100).optional(),
  }),
  z.object({
    action: z.literal('delete_offer'),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    baseRevision: z.string().max(100).optional(),
  }),
  z.object({
    action: z.literal('save_catalog'),
    offers: z.array(z.unknown()).max(200),
    baseRevision: z.string().max(100),
    drive: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal('enroll'),
    offers: z.array(offerSchema).max(200),
    catalog: z.array(z.unknown()).max(200).optional(),
  }),
  z.object({ action: z.literal('enable_browser') }),
  z.object({ action: z.literal('prepare_scrape') }),
  z.object({
    action: z.literal('configure'),
    provider: z.literal('scrapecreators'),
    token: z.string().trim().min(20).max(4096),
    countries: z
      .array(z.string().regex(/^(ALL|[A-Z]{2})$/))
      .min(1)
      .max(1),
  }),
  z.object({ action: z.enum(['refresh', 'pause', 'resume']), id: z.string().max(100) }),
  z.object({
    action: z.literal('bulk_monitor'),
    ids: z.array(z.string().min(1).max(100)).min(1).max(100),
    enabled: z.boolean(),
  }),
]);
async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw Error('body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1048576) {
      await reader.cancel();
      throw Error('body_limit');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(req: Request) {
  const owner = await authorize(req);
  if (!owner) return reply({ detail: 'Conta com acesso ao Spy necessária.' }, 403);
  if (!spySameOrigin(req)) return reply({ detail: 'Origem inválida.' }, 403);
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await readBody(req));
  } catch {
    return reply({ detail: 'Confira os campos da Library.' }, 400);
  }
  try {
    const access = spyServerEnabled() ? await spyServerAccess(req, true) : null;
    if (spyServerEnabled() && !access) return reply({ detail: 'Acesso não autorizado.' }, 403);
    if (access) {
      const allowed = ['save_catalog', 'enroll', 'delete_offer', 'delete_offers'].includes(
        input.action,
      )
        ? access.canEdit
        : ['configure', 'prepare_scrape', 'enable_browser'].includes(input.action)
          ? access.canConfigure
          : access.canMonitor;
      if (!allowed || input.action === 'enable_browser')
        return reply({ detail: 'Ação não liberada nesta empresa.' }, 403);
    }
    if (input.action === 'delete_offer' || input.action === 'delete_offers') {
      if (spyServerEnabled() && !input.baseRevision)
        return reply({ detail: 'Atualize o catálogo antes de excluir.' }, 400);
      const saved = await changeLibraryState(owner, (s) =>
        deleteSpyOffers(
          s,
          input.action === 'delete_offer' ? [input.id] : input.ids,
          input.baseRevision ?? s.catalogRevision,
        ),
      );
      return reply({ offers: saved.catalog, revision: saved.catalogRevision, drive: saved.drive });
    }
    if (input.action === 'save_catalog') {
      const users = access?.users ?? (await registeredUsers());
      const saved = await changeLibraryState(owner, (s) =>
        saveSpyCatalog(s, input.offers, input.baseRevision, users, input.drive),
      );
      return reply({ offers: saved.catalog, revision: saved.catalogRevision, drive: saved.drive });
    }
    if (input.action === 'bulk_monitor') {
      await changeLibraryState(owner, (s) => setSpyMonitoring(s, input.ids, input.enabled));
    } else if (input.action === 'enroll') {
      if (spyServerEnabled())
        return reply({ detail: 'Salve as ofertas para registrar as fontes.' }, 400);
      const ids = new Set((access?.users ?? (await registeredUsers())).map((u) => u.id));
      if (input.offers.some((o) => o.ownerId && !ids.has(o.ownerId)))
        return reply({ detail: 'Responsável não cadastrado no TMX.' }, 400);
      const catalog = input.catalog ? parseSpySaved(JSON.stringify(input.catalog)) : undefined;
      await changeLibraryState(owner, (s) =>
        enrollLibraryOffers(
          catalog ? { ...s, catalog, catalogRevision: randomUUID() } : s,
          input.offers.map(({ ownerId, ...offer }) => ({ ...offer, responsibleId: ownerId })),
        ),
      );
    } else if (input.action === 'prepare_scrape') {
      await changeLibraryState(owner, (s) => prepareScrapeMonitoring(s));
    } else if (input.action === 'enable_browser') {
      await changeLibraryState(owner, (s) => ({
        ...s,
        provider: 'browser',
        requestBudget: 0,
        countries: ['ALL'],
        revision: randomUUID(),
        connectionError: '',
        testError: '',
        retryAfter: null,
        jobs: Object.fromEntries(
          Object.entries(s.jobs).map(([id, j]) => [
            id,
            {
              ...j,
              enabled: !!j.sources.length,
              optedIn: !!j.sources.length,
              status: j.sources.length ? 'waiting' : 'source_missing',
              nextAt: j.sources.length ? new Date().toISOString() : null,
              partial: null,
              error: '',
            },
          ]),
        ),
      }));
    } else if (input.action === 'configure') {
      if (input.countries.includes('ALL') && input.countries.length !== 1)
        return reply({ detail: 'Use ALL sozinho ou informe os países desejados.' }, 400);
      const previous = await readLibraryState(owner);
      if (!previous.paidRequestsEnabled)
        return reply({ detail: 'Consultas pagas não autorizadas nesta empresa.' }, 403);
      if (previous.testedAt && Date.now() - Date.parse(previous.testedAt) < 30000)
        return reply({ detail: 'Aguarde 30 segundos antes de testar outra credencial.' }, 429);
      await changeLibraryState(owner, (s) => ({ ...s, testedAt: new Date().toISOString() }));
      let creditsRemaining = 0;
      try {
        const result = await readScrapeLibrary(
          input.token,
          [
            'https://www.facebook.com/ads/library/?q=MADAMEJEANE.COM&search_type=keyword_exact_phrase',
          ],
          input.countries,
        );
        creditsRemaining = result.creditsRemaining;
      } catch (error) {
        const code = error instanceof LibraryFailure ? error.code : 'unavailable';
        await changeLibraryState(owner, (s) => ({ ...s, testError: code }));
        return reply(
          {
            ...(await output(owner)),
            detail: 'O ScrapeCreators não concluiu o teste. Veja o diagnóstico da conexão.',
          },
          422,
        );
      }
      const encrypted = await encryptLibraryToken(input.token);
      await changeLibraryState(owner, (s) => ({
        ...s,
        encrypted,
        provider: 'scrapecreators',
        creditsRemaining,
        requestBudget: Math.min(100, creditsRemaining),
        revision: randomUUID(),
        countries: [...new Set(input.countries)],
        connectionError: '',
        testError: '',
        retryAfter: null,
        jobs: Object.fromEntries(
          Object.entries(s.jobs).map(([id, j]) => [
            id,
            j.enabled &&
            j.status !== 'source_missing' &&
            !['complete', 'incomplete'].includes(j.status)
              ? { ...j, nextAt: new Date().toISOString(), status: 'waiting', error: '' }
              : j,
          ]),
        ),
      }));
    } else {
      await changeLibraryState(owner, (s) => {
        const job = s.jobs[input.id];
        if (!job || job.deletedAt) throw Error('missing_job');
        if (
          input.action === 'refresh' &&
          job.checkedAt &&
          Date.now() - Date.parse(job.checkedAt) < 60000
        )
          throw Error('cooldown');
        if (input.action === 'resume' && !job.sources.length) throw Error('missing_source');
        if (input.action === 'refresh' && !job.optedIn) throw Error('not_selected');
        if (input.action === 'resume')
          for (const source of job.sources) normalizeLibrarySource(source);
        return {
          ...s,
          jobs: {
            ...s.jobs,
            [input.id]: {
              ...job,
              enabled: input.action !== 'pause',
              optedIn: input.action !== 'pause',
              status: input.action === 'pause' ? 'paused' : 'waiting',
              nextAt: input.action === 'pause' ? null : new Date().toISOString(),
            },
          },
        };
      });
    }
    return reply(await output(owner));
  } catch {
    return reply(
      {
        detail:
          'Não foi possível atualizar agora. Aguarde um minuto e tente novamente. Dados anteriores preservados.',
      },
      409,
    );
  }
}
