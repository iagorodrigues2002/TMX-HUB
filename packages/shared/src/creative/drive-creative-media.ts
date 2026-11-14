import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export function creativeFrameTimes(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) throw Error('Duração inválida.');
  if (duration <= 60) {
    const end = Math.max(0, duration - 0.15);
    return [...new Set([0, Math.min(2,end), Math.min(4.9,end), Math.max(0,end-4.85), Math.max(0,end-1.85), end].map(v=>Number(v.toFixed(2))))].sort((a,b)=>a-b);
  }
  return [0, 2, 4.9, 10, 20, Number((duration - 0.15).toFixed(2))];
}
export function safeDriveDownload(value: string) {
  const u = new URL(value);
  return (
    u.protocol === 'https:' &&
    !u.username &&
    !u.password &&
    !u.port &&
    ['drive.google.com', 'drive.usercontent.google.com'].includes(u.hostname)
  );
}
export async function driveCreativeMedia(root: string, fileId: string, fetcher = fetch) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw Error('Arquivo inválido.');
  let url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  let response: Response | undefined;
  for (let i = 0; i < 4; i++) {
    if (!safeDriveDownload(url)) throw Error('Destino do Drive não autorizado.');
    response = await fetcher(url, { redirect: 'manual', headers: { Range: 'bytes=0-', Connection: 'close' }, signal: AbortSignal.timeout(600000) });
    if (response.status < 300 || response.status >= 400) break;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next) throw Error('Download indisponível.');
    url = new URL(next, url).href;
  }
  if (!response?.ok || !response.body)
    throw Error('O Drive não liberou o arquivo. Confira o compartilhamento.');
  const max = 1024 * 1024 * 1024;
  const range = response.status === 206 ? /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '') : null;
  if (response.status === 206 && (!range || Number(range[1]) + 1 !== Number(range[2]))) {
    await response.body.cancel();
    throw Error('O Drive retornou apenas parte do arquivo.');
  }
  if (Number(response.headers.get('content-length')) > max || (range && Number(range[2]) > max)) {
    await response.body.cancel();
    throw Error('Use a versão comprimida, até 1 GB.');
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < max + 256 * 1024 * 1024) {
    await response.body.cancel();
    throw Error('Espaço temporário insuficiente para analisar o vídeo.');
  }
  const temp = join(root, randomUUID());
  await mkdir(temp, { mode: 0o700 });
  const input = join(temp, 'video');
  const digest = createHash('sha256').update('creative-opening-v2:');
  let header = Buffer.alloc(0);
  let size = 0;
  try {
    if (fetcher === fetch) {
      await response.body.cancel();
      await writeFile(input, '', { mode: 0o600 });
      const headers = join(temp, 'headers');
      const downloaded = await exec('/usr/bin/curl', ['--silent', '--show-error', '--globoff', '--proto', '=https', '--max-time', '600', '--max-filesize', String(max), '--range', '0-', '--dump-header', headers, '--output', input, '--write-out', '%{http_code}', url], { timeout: 620000, maxBuffer: 10000 });
      size = (await stat(input)).size;
      const receivedRange = [...(await readFile(headers, 'utf8')).matchAll(/^content-range:\s*(.+)$/gmi)].at(-1)?.[1]?.trim();
      const received = receivedRange ? /^bytes 0-(\d+)\/(\d+)$/.exec(receivedRange) : null;
      if (!['200','206'].includes(downloaded.stdout.trim()) || size > max || (downloaded.stdout.trim() === '206' && (!received || Number(received[1]) + 1 !== size || Number(received[2]) !== size)))
        throw Error('Download do Drive incompleto.');
    } else {
    const output = await open(input, 'wx', 0o600);
    try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > max) throw Error('Use a versão comprimida, até 1 GB.');
      await output.writeFile(chunk);
    }
    } finally { await output.close(); }
    }
  for await (const chunk of createReadStream(input)) {
    if (header.length < 12) header = Buffer.concat([header, chunk.subarray(0, 12 - header.length)]);
    digest.update(chunk);
  }
  if (range && size !== Number(range[2])) throw Error('Download do Drive incompleto.');
  if (
    header.toString('ascii', 4, 8) !== 'ftyp' &&
    header.subarray(0, 4).toString('hex') !== '1a45dfa3'
  )
    throw Error('Arquivo sem vídeo MP4/WebM válido.');
  const hash = digest.digest('hex');
  const cached = join(root, `${hash}.json`);
  try {
    return JSON.parse(await readFile(cached, 'utf8')) as {
      hash: string;
      frames: { second: number; image: string }[];
      audio: string | null;
      duration: number;
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const bin = process.platform === 'darwin' ? '/opt/homebrew/bin/' : '/usr/bin/';
    const probe = await exec(
      `${bin}ffprobe`,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-show_entries',
        'format=duration:stream=codec_type,duration',
        '-of',
        'json',
        input,
      ],
      { timeout: 20000, maxBuffer: 10000 },
    );
    const info = JSON.parse(probe.stdout),
      duration = Number(info.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1800)
      throw Error('A análise aceita vídeos de até trinta minutos.');
    const frames = [];
    // Audio can outlast the video stream; sampling that tail produces no frame.
    const videoDuration = Number(info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')?.duration);
    const frameDuration = Number.isFinite(videoDuration) && videoDuration > 0 ? Math.min(videoDuration, duration) : duration;
    for (const second of creativeFrameTimes(frameDuration)) {
      const path = join(temp, `${second}.jpg`);
      await exec(
        `${bin}ffmpeg`,
        [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file',
          '-ss',
          String(second),
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          'scale=512:512:force_original_aspect_ratio=decrease,format=yuvj420p',
          '-q:v',
          '4',
          path,
        ],
        { timeout: 20000, maxBuffer: 10000 },
      );
      const image = `data:image/jpeg;base64,${(await readFile(path)).toString('base64')}`;
      if (image.length > 350000) throw Error('Quadro acima do limite.');
      frames.push({ second, image });
    }
    let audio: string | null = null;
    if (info.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio')) {
      const path = join(temp, 'audio.wav');
      await exec(
        `${bin}ffmpeg`,
        [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file',
          '-i',
          input,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          path,
        ],
        { timeout: 30000, maxBuffer: 10000 },
      );
      audio = (await readFile(path)).toString('base64');
    }
    const result = { hash, frames, audio, duration },
      staging = `${cached}.${randomUUID()}`;
    await writeFile(staging, JSON.stringify(result), { mode: 0o600 });
    await rename(staging, cached);
    return result;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
