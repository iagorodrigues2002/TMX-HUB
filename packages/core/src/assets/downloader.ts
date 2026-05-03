import { createHash } from 'node:crypto';
import pLimit from 'p-limit';
import { request } from 'undici';
import type { DownloadedAsset } from '../types.js';

export interface DownloadOptions {
  maxBytes: number;
  maxConcurrency: number;
  timeoutMs: number;
  userAgent?: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export async function downloadOne(
  url: string,
  opts: DownloadOptions,
): Promise<DownloadedAsset | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const res = await request(url, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        'user-agent': opts.userAgent ?? DEFAULT_UA,
        accept: '*/*',
      },
    });
    if (res.statusCode < 200 || res.statusCode >= 400) {
      res.body.destroy?.();
      return null;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > opts.maxBytes) {
        ac.abort();
        return null;
      }
      chunks.push(buf);
    }
    const data = Buffer.concat(chunks);
    const mime =
      typeof res.headers['content-type'] === 'string'
        ? res.headers['content-type']
        : Array.isArray(res.headers['content-type'])
          ? (res.headers['content-type'][0] ?? 'application/octet-stream')
          : 'application/octet-stream';
    const hash = createHash('sha256').update(data).digest('hex');
    return {
      originalUrl: url,
      resolvedUrl: url,
      data,
      mime,
      size: data.length,
      hash,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadMany(
  urls: ReadonlyArray<string>,
  opts: DownloadOptions,
): Promise<Map<string, DownloadedAsset>> {
  const out = new Map<string, DownloadedAsset>();
  const limit = pLimit(opts.maxConcurrency);
  const unique = Array.from(new Set(urls));
  await Promise.all(
    unique.map((u) =>
      limit(async () => {
        const result = await downloadOne(u, opts);
        if (result) out.set(u, result);
      }),
    ),
  );
  return out;
}
