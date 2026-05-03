import mime from 'mime-types';
import { ulid } from 'ulid';
import type { AssetEntry, AssetManifest, DownloadedAsset } from '../types.js';
import { kindFromMime, kindFromUrl } from './url-utils.js';

export function emptyManifest(): AssetManifest {
  return { entries: [], byUrl: {} };
}

export function makeEntryFromDownloaded(asset: DownloadedAsset): AssetEntry {
  const kind = kindFromMime(asset.mime, asset.originalUrl);
  return {
    id: `ast_${ulid()}`,
    url: asset.resolvedUrl,
    originalUrl: asset.originalUrl,
    kind,
    mime: asset.mime,
    size: asset.size,
    hash: asset.hash,
    storageKey: storageKeyFor(asset.hash, asset.mime, asset.originalUrl),
  };
}

export function makeEntryFromUrl(url: string): AssetEntry {
  const guessedMime = mime.lookup(url) || 'application/octet-stream';
  return {
    id: `ast_${ulid()}`,
    url,
    originalUrl: url,
    kind: kindFromUrl(url),
    mime: guessedMime,
    size: 0,
    hash: '',
  };
}

export function storageKeyFor(hash: string, mimeType: string, urlForExt: string): string {
  let ext = mime.extension(mimeType) || '';
  if (!ext) {
    try {
      const u = new URL(urlForExt);
      const dot = u.pathname.lastIndexOf('.');
      if (dot >= 0) ext = u.pathname.slice(dot + 1).toLowerCase();
    } catch {
      // ignore
    }
  }
  return ext ? `${hash}.${ext}` : hash;
}
