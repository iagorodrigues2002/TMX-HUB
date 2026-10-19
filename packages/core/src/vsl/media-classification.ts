import type { VslManifestKind } from '@page-cloner/shared';
import type { ObservedMedia } from './detect.types.js';

export function classifyByExtension(u: string): VslManifestKind | 'segment' | null {
  // Strip query so foo.m3u8?token=... is still detected.
  const path = u.split('?')[0]?.toLowerCase() ?? u.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (path.endsWith('.mp4') || path.endsWith('.m4v')) return 'mp4';
  if (
    path.endsWith('.ts') ||
    path.endsWith('.m4s') ||
    path.endsWith('.aac') ||
    path.endsWith('.vtt')
  ) {
    return 'segment';
  }
  return null;
}

export function classifyByContentType(ct: string | undefined): VslManifestKind | null {
  if (!ct) return null;
  const c = ct.toLowerCase();
  if (c.includes('mpegurl') || c.includes('vnd.apple.mpegurl')) return 'hls';
  if (c.includes('dash+xml')) return 'dash';
  return null;
}

export function classifyByBody(body: string): VslManifestKind | null {
  const head = body.slice(0, 1024);
  if (head.startsWith('#EXTM3U')) return 'hls';
  if (head.includes('<MPD ') || head.includes('<MPD\n') || head.includes('xmlns="urn:mpeg:dash:')) {
    return 'dash';
  }
  return null;
}

export function pickBest(observed: ObservedMedia[]): ObservedMedia | undefined {
  // Strong preference: HLS > DASH > MP4. Segments are clues, not picks.
  return (
    observed.find((o) => o.kind === 'hls') ||
    observed.find((o) => o.kind === 'dash') ||
    observed.find((o) => o.kind === 'mp4')
  );
}
