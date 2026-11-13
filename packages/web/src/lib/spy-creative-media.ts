import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeAdMedia } from './spy-ad-preview';
import type { LibraryAd } from './spy-library-reader';
import { readSpyImage, spyImageType } from './spy-media-cache';

const thumbnails = new Map<string, string>();
const missingThumbnails = new Map<string, number>();
export async function hydrateSpyThumbnails(root: string, owner: string, ads: LibraryAd[]) {
  let index = 0;
  // Cold starts must not read thousands of persisted thumbnails one at a time.
  await Promise.all(
    Array.from({ length: Math.min(8, ads.length) }, async () => {
      while (index < ads.length) {
        const ad = ads[index++]!;
        if (ad.thumbnailDigest || !ad.thumbnailKey) continue;
        const key = `${root}:${owner}:${ad.thumbnailKey}`;
        if ((missingThumbnails.get(key) ?? 0) > Date.now()) continue;
        let digest = thumbnails.get(key);
        if (!digest) {
          const image = await readSpyImage(root, owner, ad.thumbnailKey);
          if (!image) {
            if (missingThumbnails.size >= 10000) missingThumbnails.clear();
            missingThumbnails.set(key, Date.now() + 15000);
            continue;
          }
          missingThumbnails.delete(key);
          digest = createHash('sha256').update(image.bytes).digest('hex');
          if (thumbnails.size >= 10000) thumbnails.clear();
          thumbnails.set(key, digest);
        }
        ad.thumbnailDigest = digest;
      }
    }),
  );
}

// shortcut: exact file hashes do not identify re-encoded video; those remain unverified.
export async function fingerprintSpyCreatives(
  root: string,
  owner: string,
  ads: LibraryAd[],
  fetcher: typeof fetch,
) {
  const dir = join(root, 'creative-hashes', createHash('sha256').update(owner).digest('hex'));
  const deadline = Date.now() + 60000;
  let remaining = 128 * 1024 * 1024;
  const pending = new Map<string, Promise<string | undefined>>();
  async function fingerprint(raw: string, kind: 'image' | 'video') {
    const url = safeAdMedia(raw);
    if (!url) return undefined;
    const file = join(dir, createHash('sha256').update(`${kind}:${url}`).digest('hex'));
    try {
      const digest = await readFile(file, 'utf8');
      if (/^[a-f0-9]{64}$/.test(digest)) return digest;
    } catch {
      /* Missing cache is expected. */
    }
    if (Date.now() >= deadline || remaining <= 0) return undefined;
    try {
      const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))),
      });
      const limit = 32 * 1024 * 1024;
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith(`${kind}/`) ||
        Number(response.headers.get('content-length') || 0) > Math.min(limit, remaining)
      ) {
        await response.body?.cancel();
        return undefined;
      }
      if (!response.body) return undefined;
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      let header = Buffer.alloc(0);
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        remaining -= value.length;
        if (size > limit || remaining < 0 || Date.now() > deadline) {
          await reader.cancel();
          return undefined;
        }
        hash.update(value);
        if (header.length < 16)
          header = Buffer.concat([header, value.subarray(0, 16 - header.length)]);
      }
      if (!size) return undefined;
      if (
        kind === 'image'
          ? !spyImageType(header)
          : header.toString('ascii', 4, 8) !== 'ftyp' &&
            header.subarray(0, 4).toString('hex') !== '1a45dfa3'
      )
        return undefined;
      const digest = hash.digest('hex');
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(file, digest, { mode: 0o600 });
      return digest;
    } catch {
      return undefined;
    }
  }
  // Sequential streaming keeps media analysis out of the browser and bounds memory/network use.
  for (const ad of ads)
    for (const asset of ad.creativeAssets ?? []) {
      if (asset.sha256) continue;
      const key = `${asset.kind}:${asset.url}`;
      let result = pending.get(key);
      if (!result) {
        result = fingerprint(asset.url, asset.kind);
        pending.set(key, result);
      }
      asset.sha256 = await result;
    }
}
