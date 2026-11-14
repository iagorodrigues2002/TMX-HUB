import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RESERVE_BUDGET, SETTLE_BUDGET, budgetKey } from './ai-preview-cost.js';
import {
  AUDIO_MODEL,
  audioAnalysisCost,
  audioAnalysisRequest,
  audioAnalysisSchema,
} from './spy-audio-analysis.js';
import type { registerSpyVisualPreview } from './spy-visual-preview.js';
import { creativeAudioTransport } from './creative-audio-transport.js';

const MODEL = 'gpt-transcribe';
const inputSchema = z
  .object({
    companyId: z.string().uuid(),
    analyze: z.boolean().optional(),
    audio: z
      .string()
      .max(76810000)
      .regex(/^[A-Za-z0-9+/]+=*$/),
  })
  .strict();

export function spyWavDuration(audio: Buffer, maxSeconds = 600) {
  if (
    audio.length < 44 ||
    audio.toString('ascii', 0, 4) !== 'RIFF' ||
    audio.toString('ascii', 8, 12) !== 'WAVE' ||
    audio.readUInt32LE(4) !== audio.length - 8
  )
    throw Error('Áudio WAV inválido.');
  let format = false;
  let bytes = 0;
  for (let offset = 12; offset + 8 <= audio.length; ) {
    const kind = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > audio.length) throw Error('Áudio incompleto.');
    if (kind === 'fmt ') {
      if (
        size < 16 ||
        audio.readUInt16LE(start) !== 1 ||
        audio.readUInt16LE(start + 2) !== 1 ||
        audio.readUInt32LE(start + 4) !== 16000 ||
        audio.readUInt32LE(start + 8) !== 32000 ||
        audio.readUInt16LE(start + 12) !== 2 ||
        audio.readUInt16LE(start + 14) !== 16
      )
        throw Error('Use PCM mono 16 kHz.');
      format = true;
    }
    if (kind === 'data') bytes += size;
    offset = start + size + (size % 2);
  }
  if (!format || !bytes || bytes % 2 || bytes > maxSeconds * 32000)
    throw Error('Áudio vazio ou acima da duração permitida.');
  return bytes / 32000;
}

export function registerSpyTranscription(
  app: FastifyInstance,
  deps: Parameters<typeof registerSpyVisualPreview>[1],
) {
  app.post(
    '/meta-control/traffic/ai/spy-transcription',
    { bodyLimit: 76900000 },
    async (req, reply) => {
      const access = deps.access(req);
      const creativeOfferId = (req.query as { creativeOfferId?: string }).creativeOfferId;
      if (creativeOfferId
        ? !access?.ads || !access.offerIds.includes(creativeOfferId)
        : !access?.canManage || !access.allOffers || !access.spy)
        return reply.code(403).send({ detail: 'Acesso negado.' });
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ detail: 'Áudio inválido.' });
      if (parsed.data.companyId !== access.companyId)
        return reply.code(403).send({ detail: 'Empresa inválida.' });
      const audio = Buffer.from(parsed.data.audio, 'base64');
      let duration: number;
      try {
        duration = spyWavDuration(audio, parsed.data.analyze ? 1800 : 600);
      } catch {
        return reply.code(400).send({ detail: 'Áudio inválido ou acima da duração permitida.' });
      }
      const model = parsed.data.analyze ? AUDIO_MODEL : MODEL;
      const fingerprint = createHash('sha256').update(`${model}:v1:`).update(audio).digest('hex');
      const dir = join(deps.root, 'spy-transcription', access.companyId);
      const file = join(dir, `${fingerprint}.json`);
      if (!deps.production) await mkdir(dir, { recursive: true, mode: 0o700 });
      const read = async () => {
        if (deps.production)
          return (
            await app.db!`SELECT record FROM company_spy_transcriptions WHERE company_id=${access.companyId} AND fingerprint=${fingerprint}`
          )[0]?.record;
        try {
          return JSON.parse(await readFile(file, 'utf8'));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      };
      const publicRecord = (record: {
        status: string;
        text?: string;
        at: string;
        duration?: number;
        costMicros?: number;
        estimatedCostUsd?: number;
        costReserved?: boolean;
        analysis?: z.infer<typeof audioAnalysisSchema>;
      }) => ({
        status: record.status,
        fingerprint,
        text: record.text,
        at: record.at,
        duration: record.duration,
        model,
        analysis: record.analysis,
        costMicros: record.costMicros ?? Math.ceil((record.estimatedCostUsd ?? 0) * 1000000),
        costReserved: record.costReserved ?? false,
      });
      const existing = await read();
      if (existing) {
        if (existing.status === 'complete') return { ...publicRecord(existing), cached: true };
        return reply.code(409).send({
          detail:
            'Transcrição em andamento ou tentativa não concluída. Sem repetição automática para evitar nova cobrança.',
        });
      }
      if ((req.query as { cachedOnly?: string }).cachedOnly === '1')
        return reply.code(412).send({ detail: 'Transcrição ainda não gerada.' });
      const providerBody = parsed.data.analyze && deps.production ? await creativeAudioTransport(parsed.data.audio) : null;
      const config = await deps.config(access.companyId);
      if (!config.enabled || !config.headers.authorization)
        return reply.code(409).send({ detail: 'Configure a IA da empresa primeiro.' });
      const pending = {
        status: 'pending',
        companyId: access.companyId,
        at: new Date().toISOString(),
      };
      try {
        if (deps.production) {
          const sql = app.db!;
          const rows =
            await sql`INSERT INTO company_spy_transcriptions(company_id,fingerprint,record) VALUES(${access.companyId},${fingerprint},${sql.json(pending)}) ON CONFLICT DO NOTHING RETURNING fingerprint`;
          if (!rows.length) throw Error('pending');
        } else await writeFile(file, JSON.stringify(pending), { flag: 'wx', mode: 0o600 });
      } catch {
        return reply
          .code(409)
          .send({ detail: 'Transcrição já enviada. Aguarde o resultado salvo.' });
      }
      const save = async (record: unknown) => {
        if (deps.production) {
          const sql = app.db!;
          await sql`UPDATE company_spy_transcriptions SET record=${sql.json(JSON.parse(JSON.stringify(record)))},updated_at=now() WHERE company_id=${access.companyId} AND fingerprint=${fingerprint}`;
        } else {
          const temp = `${file}.${randomUUID()}`;
          await writeFile(temp, JSON.stringify(record), { mode: 0o600 });
          await rename(temp, file);
        }
      };
      const daily = budgetKey(access.companyId);
      const reservation = `tmx-ai:transcription:${access.companyId}:${fingerprint}`;
      // GPT-Transcribe: USD 0.0045/minute, verified 2026-11-13; reserve rounded-up seconds.
      const reserved = parsed.data.analyze
        ? Math.ceil(duration) * 3200 + 165000
        : Math.ceil(duration) * 75;
      if (
        Number(
          await app.redis.eval(
            RESERVE_BUDGET,
            2,
            daily,
            reservation,
            reserved,
            config.dailyLimitCents * 10000,
          ),
        ) !== 1
      ) {
        if (deps.production)
          await app.db!`DELETE FROM company_spy_transcriptions WHERE company_id=${access.companyId} AND fingerprint=${fingerprint} AND record->>'status'='pending'`;
        else {
          const { unlink } = await import('node:fs/promises');
          await unlink(file);
        }
        return reply.code(429).send({ detail: 'Limite diário da empresa insuficiente.' });
      }
      let receipt: { providerStatus?: number; requestId?: string; provider?: unknown; rejection?: unknown; costMicros?: number; costReserved?: boolean } = {};
      try {
        let response: Response;
        if (parsed.data.analyze) {
          response = await fetch(
            deps.production
              ? 'https://api.openai.com/v1/chat/completions'
              : 'http://127.0.0.1:4121/audio-analysis',
            {
              method: 'POST',
              headers: config.headers,
              body: JSON.stringify(providerBody ?? audioAnalysisRequest(parsed.data.audio)),
              redirect: 'error',
              signal: AbortSignal.timeout(95000),
            },
          );
        } else if (deps.production) {
          const form = new FormData();
          form.set('model', MODEL);
          form.set('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'audio.wav');
          response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { authorization: config.headers.authorization! },
            body: form,
            redirect: 'error',
            signal: AbortSignal.timeout(95000),
          });
        } else
          response = await fetch('http://127.0.0.1:4121/transcriptions', {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({ model: MODEL, audio: parsed.data.audio }),
            redirect: 'error',
            signal: AbortSignal.timeout(95000),
          });
        receipt.providerStatus = response.status;
        receipt.requestId = response.headers.get('x-request-id') ?? undefined;
        if (!response.ok) {
          receipt.rejection=await response.json().catch(()=>({error:'Unreadable rejection'}));
          throw Error('Provider rejected');
        }
        const provider = await response.json();
        // Keep a successful provider response if parsing fails: recovery must not bill again.
        receipt.provider = provider;
        const analysis = parsed.data.analyze
          ? audioAnalysisSchema.parse(
              JSON.parse(
                provider.choices?.[0]?.message?.content?.replace(/^```(?:json)?\s*|\s*```$/g, '') ??
                  '',
              ),
            )
          : undefined;
        if (parsed.data.analyze && provider.choices?.[0]?.finish_reason !== 'stop')
          throw Error('Incomplete audio analysis');
        const raw = z
          .object({
            text: z.string().max(200000),
            usage: z
              .object({ type: z.literal('duration'), seconds: z.number().nonnegative().max(601) })
              .optional(),
          })
          .parse(analysis ? { text: analysis.text } : provider);
        const actual = analysis
          ? audioAnalysisCost(provider)
          : raw.usage
            ? Math.ceil(raw.usage.seconds * 75)
            : null;
        const cost = actual ?? reserved;
        await app.redis.eval(SETTLE_BUDGET, 2, daily, reservation, cost);
        const record = {
          status: 'complete',
          companyId: access.companyId,
          fingerprint,
          model,
          analysis,
          text: raw.text,
          duration,
          at: new Date().toISOString(),
          costMicros: cost,
          costReserved: actual === null,
        };
        await save(record);
        if (!(await deps.recheck(req, access.revision)))
          return reply.code(403).send({ detail: 'Permissões alteradas durante a transcrição.' });
        return { ...publicRecord(record), cached: false };
      } catch (error) {
        await save({ ...pending, status: 'uncertain', ...receipt, error: error instanceof Error ? error.name : 'UnknownError' });
        return reply.code(502).send({
          detail:
            'Transcrição não concluída. Tentativa salva, sem repetição automática para evitar cobrança duplicada.',
        });
      }
    },
  );
}
