import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { creativeDriveState, creativeOwner } from '@/lib/creative-drive-store';
import { creativeFileIdentity } from '@/lib/creative-drive-reader';
import { creativeOffer } from '@/lib/creative-identity';
import { driveCreativeMedia } from '@/lib/drive-creative-media';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const send = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handle(req: Request) {
  try {
    if (
      process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic' ||
      new URL(req.url).host !== 'localhost:3120' ||
      (req.method === 'POST' && req.headers.get('origin') !== 'http://localhost:3120')
    )
      return send({ detail: 'Disponível apenas na prévia local.' }, 403);
    const input = z
      .object({
        key: z.string().max(160),
        fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
        offer: z.string().max(80),
      })
      .strict()
      .parse(
        req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(),
      );
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return send({ detail: 'Entre no TMX.' }, 401);
    const headers = {
      authorization,
      origin: 'http://localhost:3120',
      'content-type': 'application/json',
    };
    const api = 'http://127.0.0.1:4110';
    async function call(path: string, body?: unknown) {
      const r = await fetch(`${api}${path}`, {
        headers,
        method: body ? 'POST' : 'GET',
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(115000),
      });
      const value = await r.json();
      if (!r.ok) throw Error(value.detail ?? 'Acesso ou análise indisponível.');
      return value;
    }
    const memory = await call('/v1/meta-control/traffic/ai/creative-learning');
    const offer = memory.offers.filter(
      (o: { name: string }) => creativeOffer(o.name) === creativeOffer(input.offer),
    );
    if (offer.length !== 1)
      return send({ detail: 'Oferta sem vínculo único e autorizado com a empresa.' }, 403);
    const { user } = await call('/v1/auth/me');
    const state = await creativeDriveState(creativeOwner(user.id));
    const file = state.catalog?.files.find(
      (f) =>
        f.id === input.fileId &&
        creativeOffer(f.offer) === creativeOffer(input.offer) &&
        creativeFileIdentity(f)?.key === input.key,
    );
    if (!file)
      return send({ detail: 'Arquivo não encontrado no catálogo autorizado do Drive.' }, 404);
    if (req.method === 'GET') {
      const saved = memory.records.find(
        (r: { offerId: string; creativeKey?: string; ads: string[]; version: string }) =>
          r.offerId === offer[0].id &&
          r.version === 'creative-structure-v1' &&
          r.creativeKey === input.key &&
          r.ads[0] === file.id,
      );
      if (!saved) return send({ analysis: null });
      const key = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(saved.assetKey);
      const media = JSON.parse(
        await readFile(
          join(
            homedir(),
            '.codex/local-data/tmx/ai-preview/creative-media',
            memory.companyId,
            `${key}.json`,
          ),
          'utf8',
        ),
      );
      let transcription = null;
      if (saved.audio?.fingerprint)
        transcription = JSON.parse(
          await readFile(
            join(
              homedir(),
              '.codex/local-data/tmx/ai-preview/spy-transcription',
              memory.companyId,
              `${z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .parse(saved.audio.fingerprint)}.json`,
            ),
            'utf8',
          ),
        );
      return send({
        analysis: { ...saved, cached: true },
        frames: media.frames,
        transcription,
        niche: offer[0].niche,
        file: { name: file.name, url: file.url },
        duration: media.duration,
      });
    }
    const media = await driveCreativeMedia(
      join(
        homedir(),
        '.codex/local-data/tmx/ai-preview/creative-media',
        z.string().uuid().parse(memory.companyId),
      ),
      file.id,
    );
    let audio = null,
      transcription = null;
    if (media.audio) {
      transcription = await call(
        `/v1/meta-control/traffic/ai/spy-transcription?creativeOfferId=${offer[0].id}`,
        { companyId: memory.companyId, audio: media.audio, analyze: true },
      );
      if (transcription.analysis) {
        const { text: _, ...analysis } = transcription.analysis;
        audio = { ...analysis, fingerprint: transcription.fingerprint };
      }
    }
    const analysis = await call('/v1/meta-control/traffic/ai/spy-visual', {
      kind: 'creative',
      companyId: memory.companyId,
      offerId: offer[0].id,
      creativeKey: input.key,
      assetKey: media.hash,
      ads: [{ id: file.id, text: file.name, frames: media.frames }],
      audio,
    });
    return send({
      analysis,
      frames: media.frames,
      transcription,
      niche: offer[0].niche,
      file: { name: file.name, url: file.url },
      duration: media.duration,
    });
  } catch (e) {
    return send(
      { detail: e instanceof z.ZodError ? 'Solicitação inválida.' : (e as Error).message },
      422,
    );
  }
}
export const GET = handle;
export const POST = handle;
