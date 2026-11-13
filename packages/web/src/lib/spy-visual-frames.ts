import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { safeAdMedia } from './spy-ad-preview';
import type { LibraryAd } from './spy-library-reader';
import { spyImageType } from './spy-media-cache';
const exec = promisify(execFile);
export const frameTimes = (duration: number) => {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
    throw Error('Duração inválida.');
  return [0, 0.1, 0.25, 0.5, 0.75, 0.95].map((f) => Number((f * duration).toFixed(2)));
};
export const storyFrameTimes = (duration: number) => {
  frameTimes(duration);
  const end = Math.max(0, duration - 0.15);
  return [
    ...new Set(
      [
        0,
        Math.min(2, end),
        Math.min(4.9, end),
        Math.max(0, end - 4.85),
        Math.max(0, end - 1.85),
        end,
      ].map((v) => Number(v.toFixed(2))),
    ),
  ].sort((a, b) => a - b);
};
export async function spyVisualFrames(
  root: string,
  ad: LibraryAd,
  fetcher: typeof fetch = fetch,
  story = false,
) {
  const asset = ad.creativeAssets?.[0];
  // shortcut: only single-asset creatives; carousels remain inconclusive until all cards can be compared.
  if (!asset || ad.creativeAssets?.length !== 1 || !safeAdMedia(asset.url))
    throw Error('Mídia única indisponível para comparação.');
  const id = createHash('sha256')
    .update(`${story ? 'story-v1' : 'frames-v1'}:${asset.kind}:${asset.sha256 ?? asset.url}`)
    .digest('hex');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const cache = join(root, `${id}.json`);
  try {
    return JSON.parse(await readFile(cache, 'utf8')) as { second: number; image: string }[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const temp = join(root, randomUUID());
  await mkdir(temp, { mode: 0o700 });
  try {
    const response = await fetcher(asset.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (
      !response.ok ||
      !response.body ||
      !/^(image|video)\//.test(response.headers.get('content-type') ?? '')
    )
      throw Error('A mídia expirou ou não está disponível.');
    if (Number(response.headers.get('content-length') ?? 0) > 32 * 1024 * 1024) {
      await response.body.cancel();
      throw Error('Mídia excede 32 MB para esta prévia.');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw Error('Mídia excede 32 MB para esta prévia.');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (
      asset.kind === 'image'
        ? !spyImageType(bytes)
        : bytes.toString('ascii', 4, 8) !== 'ftyp' &&
          bytes.subarray(0, 4).toString('hex') !== '1a45dfa3'
    )
      throw Error('Formato de mídia inválido.');
    if (asset.sha256 && createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw Error('A mídia mudou desde a coleta. Atualize os detalhes antes de comparar.');
    const input = join(temp, 'input');
    await writeFile(input, bytes, { mode: 0o600 });
    let times = [0];
    if (asset.kind === 'video') {
      const probe = await exec(
        process.platform === 'darwin' ? '/opt/homebrew/bin/ffprobe' : '/usr/bin/ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file',
          '-show_entries',
          'stream=duration:format=duration',
          '-select_streams',
          'v:0',
          '-of',
          'json',
          input,
        ],
        { timeout: 15000, maxBuffer: 10000 },
      );
      const metadata = JSON.parse(probe.stdout);
      times = (story ? storyFrameTimes : frameTimes)(
        Number(metadata.streams?.[0]?.duration ?? metadata.format.duration),
      );
    }
    const frames = [];
    for (const [i, second] of times.entries()) {
      const output = join(temp, `${i}.jpg`);
      await exec(
        process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : '/usr/bin/ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file',
          ...(asset.kind === 'video' ? ['-ss', String(second)] : []),
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          'scale=512:512:force_original_aspect_ratio=decrease,format=yuvj420p',
          '-q:v',
          '4',
          output,
        ],
        { timeout: 15000, maxBuffer: 10000 },
      );
      const image = `data:image/jpeg;base64,${(await readFile(output)).toString('base64')}`;
      if (image.length > 350000) throw Error('Quadro grande demais.');
      frames.push({ second, image });
    }
    const target = `${cache}.${randomUUID()}`;
    await writeFile(target, JSON.stringify(frames), { mode: 0o600 });
    await rename(target, cache);
    return frames;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
