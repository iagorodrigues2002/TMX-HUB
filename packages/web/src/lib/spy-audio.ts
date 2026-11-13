import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { safeAdMedia } from './spy-ad-preview';
import type { LibraryAd } from './spy-library-reader';
const exec = promisify(execFile);

export async function spyAudio(
  root: string,
  ad: LibraryAd,
  cachedOnly: boolean,
  fetcher: typeof fetch = fetch,
): Promise<Buffer | null> {
  const asset = ad.creativeAssets?.find((a) => a.kind === 'video');
  if (!asset || !safeAdMedia(asset.url))
    throw Error('Este anúncio não tem vídeo disponível para transcrição.');
  const key = createHash('sha256')
    .update(`audio-v1:${asset.sha256 ?? asset.url}`)
    .digest('hex');
  const file = join(root, `${key}.wav`);
  try {
    return await readFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  if (cachedOnly) return null;
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = join(root, randomUUID());
  await mkdir(temp, { mode: 0o700 });
  try {
    const response = await fetcher(asset.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (
      !response.ok ||
      !response.body ||
      !/^video\//.test(response.headers.get('content-type') ?? '')
    )
      throw Error('Vídeo expirado ou indisponível. Atualize os detalhes do anúncio.');
    if (Number(response.headers.get('content-length') ?? 0) > 32 * 1024 * 1024) {
      await response.body.cancel();
      throw Error('Vídeo acima de 32 MB.');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw Error('Vídeo acima de 32 MB.');
      chunks.push(Buffer.from(chunk));
    }
    const video = Buffer.concat(chunks);
    if (
      video.toString('ascii', 4, 8) !== 'ftyp' &&
      video.subarray(0, 4).toString('hex') !== '1a45dfa3'
    )
      throw Error('Formato de vídeo inválido.');
    if (asset.sha256 && createHash('sha256').update(video).digest('hex') !== asset.sha256)
      throw Error('O vídeo mudou desde a coleta. Atualize os detalhes.');
    const input = join(temp, 'input');
    await writeFile(input, video, { mode: 0o600 });
    const bin = process.platform === 'darwin' ? '/opt/homebrew/bin/' : '/usr/bin/';
    const probe = await exec(
      `${bin}ffprobe`,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-show_entries',
        'format=duration:stream=codec_type',
        '-of',
        'json',
        input,
      ],
      { timeout: 15000, maxBuffer: 10000 },
    );
    const info = JSON.parse(probe.stdout);
    if (!info.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio'))
      throw Error('Vídeo sem faixa de áudio.');
    const duration = Number(info.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
      throw Error('A transcrição aceita vídeos de até dez minutos.');
    const output = join(temp, 'audio.wav');
    await exec(
      `${bin}ffmpeg`,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        '-map_metadata',
        '-1',
        '-t',
        '600',
        output,
      ],
      { timeout: 30000, maxBuffer: 10000 },
    );
    const audio = await readFile(output);
    if (audio.length > 19201000) throw Error('Áudio acima do limite.');
    await rename(output, file);
    return audio;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
