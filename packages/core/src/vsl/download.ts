import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid } from 'ulid';
import type { VslManifestKind } from '@page-cloner/shared';

export interface DownloadOptions {
  /** Override path to ffmpeg binary. Default: 'ffmpeg' (PATH lookup). */
  ffmpegPath?: string;
  /** Hard cap on the ffmpeg process (ms). Default 10 min. */
  timeoutMs?: number;
  /** Hard cap on output bytes — protects S3 + bandwidth. Default 2GB. */
  maxBytes?: number;
  /** Extra HTTP headers to forward to ffmpeg (e.g. Referer, Cookie). */
  headers?: Record<string, string>;
  /** Logger hook. */
  onLog?: (line: string) => void;
}

export interface DownloadResult {
  /** Local filesystem path where the MP4 was written. Caller must clean up. */
  filePath: string;
  bytes: number;
  /** Best-effort duration in seconds (parsed from ffmpeg stderr). */
  durationSec?: number;
}

// Headers that, if forwarded blindly to ffmpeg, will break the request
// (ffmpeg sets these itself or they're hop-by-hop).
const HEADER_DENYLIST = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  ':method',
  ':path',
  ':scheme',
  ':authority',
  'accept-encoding',
]);

function buildHeaderArg(headers: Record<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (HEADER_DENYLIST.has(key)) continue;
    if (key.startsWith(':')) continue;
    lines.push(`${k}: ${v}`);
  }
  // ffmpeg's -headers expects CRLF-separated lines, terminated with CRLF.
  return lines.length > 0 ? `${lines.join('\r\n')}\r\n` : '';
}

function parseDuration(stderrLine: string): number | undefined {
  // "Duration: 00:05:23.45, start: ..."
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/.exec(stderrLine);
  if (!m) return undefined;
  const [, hh, mm, ss, frac] = m as unknown as [string, string, string, string, string];
  return (
    Number.parseInt(hh, 10) * 3600 +
    Number.parseInt(mm, 10) * 60 +
    Number.parseInt(ss, 10) +
    Number.parseFloat(`0.${frac}`)
  );
}

/**
 * Download a remote HLS / DASH / MP4 stream and remux to a single MP4 file
 * on disk. Returns the path so the caller can stream it to S3.
 */
export async function downloadManifestToFile(
  manifestUrl: string,
  manifestKind: VslManifestKind,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const ffmpegPath = opts.ffmpegPath ?? 'ffmpeg';
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024 * 1024;
  const log = opts.onLog ?? (() => undefined);

  const outPath = join(tmpdir(), `vsl-${ulid()}.mp4`);

  const headerArg = buildHeaderArg(opts.headers ?? {});

  // -c copy = no re-encode (fast, lossless). For HLS this concatenates all
  // segments into one file; for DASH it muxes the chosen variant; for MP4 it
  // just copies. Keeping codec parameters is fine — every modern browser/OS
  // can play a copied H.264/AAC stream inside MP4.
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-stats',
    '-y', // overwrite
    ...(headerArg ? ['-headers', headerArg] : []),
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy',
    // For HLS we explicitly tell ffmpeg the format, which avoids a probe step
    // that some CDNs reject as a HEAD request.
    ...(manifestKind === 'hls' ? ['-f', 'hls'] : []),
    '-i', manifestUrl,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc', // needed when remuxing AAC-in-HLS to MP4
    '-movflags', '+faststart',
    '-fs', String(maxBytes),
    outPath,
  ];

  log(`spawn: ${ffmpegPath} ${args.filter((a) => a !== headerArg).join(' ')} (manifest=${manifestKind})`);

  return await new Promise<DownloadResult>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuffer = '';
    let durationSec: number | undefined;

    const killTimer = setTimeout(() => {
      log(`ffmpeg timeout after ${timeoutMs}ms — sending SIGKILL`);
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderrBuffer += s;
      // Keep buffer bounded so a chatty ffmpeg doesn't OOM us.
      if (stderrBuffer.length > 64 * 1024) {
        stderrBuffer = stderrBuffer.slice(-32 * 1024);
      }
      if (durationSec === undefined) {
        const d = parseDuration(s);
        if (d !== undefined) {
          durationSec = d;
          log(`detected duration: ${d}s`);
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(
        Object.assign(new Error(`ffmpeg spawn failed: ${err.message}`), {
          code: 'ffmpeg_spawn_failed',
        }),
      );
    });

    child.on('close', async (code, signal) => {
      clearTimeout(killTimer);
      if (signal === 'SIGKILL') {
        await fs.unlink(outPath).catch(() => undefined);
        reject(
          Object.assign(new Error('ffmpeg killed: download exceeded time budget.'), {
            code: 'download_timeout',
          }),
        );
        return;
      }
      if (code !== 0) {
        await fs.unlink(outPath).catch(() => undefined);
        const tail = stderrBuffer.split('\n').slice(-15).join('\n').trim();
        reject(
          Object.assign(new Error(`ffmpeg exited ${code}: ${tail || 'no stderr'}`), {
            code: 'ffmpeg_failed',
            stderr: tail,
          }),
        );
        return;
      }
      try {
        const stat = await fs.stat(outPath);
        if (stat.size === 0) {
          await fs.unlink(outPath).catch(() => undefined);
          reject(
            Object.assign(new Error('ffmpeg produced an empty file.'), {
              code: 'empty_output',
            }),
          );
          return;
        }
        log(`download done: ${stat.size} bytes -> ${outPath}`);
        resolve({ filePath: outPath, bytes: stat.size, durationSec });
      } catch (err) {
        reject(
          Object.assign(new Error(`stat failed: ${(err as Error).message}`), {
            code: 'stat_failed',
          }),
        );
      }
    });
  });
}
