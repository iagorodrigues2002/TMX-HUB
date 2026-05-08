import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'bullmq';
import type { Logger } from 'pino';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { SHIELD_QUEUE_NAME, type ShieldJobData } from '../queues/index.js';
import type { NicheStore } from '../services/niche-store.js';
import type { ShieldJobStore } from '../services/shield-job-store.js';
import type { StorageService } from '../services/storage.js';

interface FfmpegArgs {
  inputVideo: string;
  whiteAudio: string;
  output: string;
  whiteVolumeDb: number;
  compression: 'none' | 'lossless' | 'balanced' | 'small';
}

/**
 * Phase-cancellation pipeline:
 *  - Mono'd original audio goes to L (normal) and R (phase-inverted, gain=-1).
 *  - When a bot downmixes L+R → mono, the original audio cancels to zero.
 *  - Niche white audio (looped + low gain) is mixed into BOTH channels —
 *    so it survives the bot's downmix and is what the AI transcribes.
 *  - Stereo listener (humans) hears the original audio normally with a
 *    "wide" feel (no phantom center) plus the white track barely audible.
 *  - Metadata stripped (-map_metadata -1) to remove fingerprints.
 */
function buildFilterComplex(whiteVolumeDb: number): string {
  return [
    '[0:a]aformat=channel_layouts=mono[origMono]',
    '[origMono]asplit=2[Lsrc][Rsrc]',
    '[Rsrc]volume=-1.0[Rinv]',
    `[1:a]aloop=loop=-1:size=2e+09,aformat=channel_layouts=mono,volume=${whiteVolumeDb}dB[whiteSrc]`,
    '[whiteSrc]asplit=2[whiteL][whiteR]',
    '[Lsrc][whiteL]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1[Lmix]',
    '[Rinv][whiteR]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1[Rmix]',
    '[Lmix][Rmix]join=inputs=2:channel_layout=stereo[outA]',
  ].join(';');
}

function videoCompressionArgs(mode: FfmpegArgs['compression']): string[] {
  // Presets escolhidos pra velocidade: 'veryfast' é ~3x mais rápido que 'medium'
  // com aumento de tamanho típico de 5-10% só. Pra ads de 30-90s isso é irrelevante.
  // 'fast' fica entre os dois quando precisamos qualidade extra (lossless).
  switch (mode) {
    case 'none':
      // Stream-copy video — fastest, no quality loss, but file size unchanged.
      return ['-c:v', 'copy'];
    case 'lossless':
      // Visually lossless — preset 'fast' (era 'slow') reduz tempo ~5x mantendo CRF 18.
      return ['-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'];
    case 'balanced':
      // Standard ad-quality — preset 'veryfast' (era 'medium') reduz tempo ~3x.
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
    case 'small':
      // Aggressive size — preset 'veryfast' (era 'medium').
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p'];
  }
}

function runFfmpeg(args: FfmpegArgs, log: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffArgs = [
      '-y',
      '-hide_banner',
      '-loglevel', 'warning',
      '-i', args.inputVideo,
      '-i', args.whiteAudio,
      '-filter_complex', buildFilterComplex(args.whiteVolumeDb),
      '-map', '0:v',
      '-map', '[outA]',
      ...videoCompressionArgs(args.compression),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-map_metadata', '-1',
      '-shortest',
      args.output,
    ];

    log.info({ cmd: 'ffmpeg', args: ffArgs.join(' ') }, 'spawning ffmpeg');
    const proc = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      const line = d.toString();
      stderr += line;
      log.debug({ line: line.trim() }, 'ffmpeg');
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Run AssemblyAI on the protected file. Returns the transcript text
 * (often gibberish + the white script content if the protection works).
 * Polls every 3s up to 5 min.
 */
async function verifyWithAssemblyAi(filePath: string): Promise<string> {
  const apiKey = env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not configured.');

  // 1. Upload audio to AssemblyAI temp storage.
  const buf = await fs.readFile(filePath);
  const upRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream',
    },
    body: buf,
  });
  if (!upRes.ok) {
    const detail = await upRes.text().catch(() => '');
    throw new Error(`AssemblyAI upload failed: HTTP ${upRes.status} ${detail.slice(0, 200)}`);
  }
  const upJson = (await upRes.json()) as { upload_url: string };

  // 2. Request transcription. Use language_detection so PT/EN/ES all funcionam.
  const txRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      audio_url: upJson.upload_url,
      language_detection: true,
    }),
  });
  if (!txRes.ok) {
    const detail = await txRes.text().catch(() => '');
    throw new Error(
      `AssemblyAI transcript request failed: HTTP ${txRes.status} ${detail.slice(0, 200)}`,
    );
  }
  const txJson = (await txRes.json()) as { id: string };

  // 3. Poll until done.
  const start = Date.now();
  while (Date.now() - start < 5 * 60_000) {
    await new Promise((r) => setTimeout(r, 3000));
    const polRes = await fetch(`https://api.assemblyai.com/v2/transcript/${txJson.id}`, {
      headers: { authorization: apiKey },
    });
    if (!polRes.ok) throw new Error(`AssemblyAI poll failed: ${polRes.status}`);
    const pol = (await polRes.json()) as {
      status: string;
      text?: string;
      error?: string;
    };
    if (pol.status === 'completed') return pol.text ?? '';
    if (pol.status === 'error') throw new Error(`AssemblyAI: ${pol.error ?? 'unknown error'}`);
  }
  throw new Error('AssemblyAI timed out after 5 minutes.');
}

export function createShieldWorker(args: {
  redisUrl: string;
  jobStore: ShieldJobStore;
  nicheStore: NicheStore;
  storage: StorageService;
}): Worker<ShieldJobData> {
  const { redisUrl, jobStore, nicheStore, storage } = args;
  const connection = makeRedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const log = logger.child({ component: 'shield-worker' });

  const worker = new Worker<ShieldJobData>(
    SHIELD_QUEUE_NAME,
    async (job) => {
      const { jobId } = job.data;
      const jobLog = log.child({ jobId });
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `shield-${jobId}-`));
      const localInput = path.join(tmpDir, 'input.mp4');
      const localWhite = path.join(tmpDir, 'white.mp3');
      const localOutput = path.join(tmpDir, 'output.mp4');

      try {
        const meta = await jobStore.get(jobId);
        await jobStore.setStatus(jobId, 'processing');

        // Resolve white audio storage key from the niche.
        const niche = await nicheStore.get(meta.nicheId);
        const white = niche.whites.find((w) => w.id === meta.whiteId);
        if (!white) {
          throw new Error(
            `White audio "${meta.whiteId}" not found in niche "${niche.name}".`,
          );
        }

        jobLog.info({ niche: niche.name, white: white.filename }, 'downloading inputs');

        // Download both source files locally.
        const [inputObj, whiteObj] = await Promise.all([
          storage.get(meta.inputStorageKey),
          storage.get(white.storageKey),
        ]);
        await fs.writeFile(localInput, inputObj.body);
        await fs.writeFile(localWhite, whiteObj.body);

        await runFfmpeg(
          {
            inputVideo: localInput,
            whiteAudio: localWhite,
            output: localOutput,
            whiteVolumeDb: meta.whiteVolumeDb,
            compression: meta.compression,
          },
          jobLog,
        );

        const outBuf = await fs.readFile(localOutput);
        const outKey = jobStore.outputKey(jobId);
        const baseName = meta.inputFilename.replace(/\.[^.]+$/, '');
        const outFilename = `${baseName}_shielded.mp4`;
        await storage.put(outKey, outBuf, { contentType: 'video/mp4' });

        // If verification was requested, attempt AssemblyAI now.
        let transcript: string | undefined;
        let transcriptStatus: 'done' | 'failed' | 'skipped' = 'skipped';
        let transcriptError: string | undefined;
        if (meta.verifyTranscript) {
          await jobStore.setStatus(jobId, 'verifying', {
            outputStorageKey: outKey,
            outputFilename: outFilename,
            outputBytes: outBuf.length,
          });
          if (!env.ASSEMBLYAI_API_KEY) {
            jobLog.warn('verifyTranscript requested but ASSEMBLYAI_API_KEY missing — skipping');
            transcriptStatus = 'skipped';
          } else {
            try {
              transcript = await verifyWithAssemblyAi(localOutput);
              transcriptStatus = 'done';
            } catch (err) {
              jobLog.error({ err }, 'AssemblyAI verification failed');
              transcriptStatus = 'failed';
              transcriptError = err instanceof Error ? err.message : String(err);
            }
          }
        }

        await jobStore.setStatus(jobId, 'ready', {
          outputStorageKey: outKey,
          outputFilename: outFilename,
          outputBytes: outBuf.length,
          ...(transcript ? { transcript } : {}),
          ...(meta.verifyTranscript ? { transcriptStatus } : {}),
          ...(transcriptError ? { transcriptError } : {}),
        });

        jobLog.info(
          { outputBytes: outBuf.length, transcriptStatus },
          'shield job complete',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jobLog.error({ err }, 'shield job failed');
        await jobStore.setStatus(jobId, 'failed', { errorMessage: message });
        throw err;
      } finally {
        // Clean tmp.
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    // Concurrency 3: cada ffmpeg usa ~1 core e ~300MB RAM. Em Railway 8vCPU/8GB
    // sobra folga. Triplica throughput em batches.
    { connection, concurrency: 3 },
  );

  worker.on('error', (err) => log.error({ err }, 'shield worker error'));
  return worker;
}
