import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeAdThumbnail } from './spy-ad-preview';
import type { LibraryAd } from './spy-library-reader';
const limit = 2 * 1024 * 1024;
const pending = new Map<string, { at: number; value: Promise<string | undefined> }>();
let downloads = 0;
const downloadWaiters: (() => void)[] = [];
async function acquireDownload() {
  if (downloads >= 32) await new Promise<void>((resolve) => downloadWaiters.push(resolve));
  else downloads++;
}
function releaseDownload() {
  const next = downloadWaiters.shift();
  if (next) next();
  else downloads--;
}
function sameResource(next: string | undefined, previous: string | undefined) {
  if (!next) return true;
  try {
    return !!previous && new URL(next).pathname === new URL(previous).pathname;
  } catch {
    return false;
  }
}
const folder = (root: string, owner: string) =>
  join(root, 'media', createHash('sha256').update(owner).digest('hex'));
export function retainSpyMedia(ads: LibraryAd[], previous: LibraryAd[]) {
  const byId = new Map(previous.map((ad) => [ad.id, ad]));
  const byPage = new Map(previous.filter((ad) => ad.pagePictureKey).map((ad) => [ad.pageId, ad]));
  for (const ad of ads) {
    const old = byId.get(ad.id);
    const page = byPage.get(ad.pageId);
    if (sameResource(ad.thumbnailUrl, old?.thumbnailUrl)) ad.thumbnailKey ??= old?.thumbnailKey;
    if (sameResource(ad.pagePictureUrl, page?.pagePictureUrl))
      ad.pagePictureKey ??= page?.pagePictureKey;
    ad.pagePictureUrl ??= page?.pagePictureUrl;
  }
  return ads;
}
export function spyImageType(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.length > limit) return undefined;
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6))) return 'image/gif';
  return undefined;
}
export async function readSpyImage(root: string, owner: string, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  try {
    const bytes = await readFile(join(folder(root, owner), key));
    const type = spyImageType(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return null;
  }
}
async function saveImage(root: string, owner: string, raw: string, fetcher: typeof fetch) {
  const url = safeAdThumbnail(raw);
  if (!url) return undefined;
  const key = createHash('sha256').update(url).digest('hex');
  if (await readSpyImage(root, owner, key)) return key;
  await acquireDownload();
  try {
    const r = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!r.ok || !r.body || Number(r.headers.get('content-length') ?? 0) > limit) return undefined;
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (!spyImageType(bytes)) return undefined;
    const dir = folder(root, owner);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = join(dir, `${key}.${randomUUID()}.tmp`);
    await writeFile(temp, bytes, { mode: 0o600 });
    await rename(temp, join(dir, key));
    return key;
  } catch {
    return undefined;
  } finally {
    releaseDownload();
  }
}
export async function persistSpyMedia(
  root: string,
  owner: string,
  ads: LibraryAd[],
  fetcher: typeof fetch = fetch,
) {
  let index = 0;
  async function cache(url: string) {
    const id = `${root}:${owner}:${url}`;
    let entry = pending.get(id);
    if (!entry || Date.now() - entry.at > 600000) {
      if (pending.size > 10000) pending.clear();
      entry = { at: Date.now(), value: saveImage(root, owner, url, fetcher) };
      pending.set(id, entry);
    }
    return entry.value;
  }
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < ads.length) {
        const ad = ads[index++]!;
        if (ad.thumbnailUrl && !ad.thumbnailKey) ad.thumbnailKey = await cache(ad.thumbnailUrl);
        if (ad.pagePictureUrl && !ad.pagePictureKey)
          ad.pagePictureKey = await cache(ad.pagePictureUrl);
      }
    }),
  );
  return ads;
}
