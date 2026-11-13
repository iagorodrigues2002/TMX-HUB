import { spyDomain } from './spy-domains';
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export function safeAdThumbnail(value: unknown) {
  const safe = safeAdMedia(value);
  return safe && !/\.(mp4|webm|mov)$/i.test(new URL(safe).pathname) ? safe : undefined;
}
export function safeAdMedia(value: unknown) {
  if (typeof value !== 'string' || value.length > 10000) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    )
      return undefined;
    return ['fbcdn.net', 'fbsbx.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function adCreative(value: unknown) {
  const snapshot = record(value);
  const items = ['images', 'videos', 'cards', 'extra_images', 'extra_videos'].flatMap((key) =>
    Array.isArray(snapshot[key]) ? (snapshot[key] as unknown[]).map(record) : [],
  );
  const assets = items.map((item) => {
    const video = item.video_hd_url ?? item.video_sd_url;
    const url = safeAdMedia(video ?? item.original_image_url);
    return url ? { kind: video ? ('video' as const) : ('image' as const), url } : undefined;
  });
  const creativeAssets = assets.filter((a) => a !== undefined).slice(0, 30);
  const body = record(snapshot.body).text ?? snapshot.body;
  const copy =
    typeof body === 'string' || (body === null && Object.hasOwn(snapshot, 'body'))
      ? JSON.stringify([
          body ?? '',
          snapshot.title ?? '',
          snapshot.link_description ?? '',
          snapshot.cta_text ?? '',
          snapshot.caption ?? '',
          snapshot.link_url ?? '',
          items.map((item) => [
            item.body ?? '',
            item.title ?? '',
            item.link_description ?? '',
            item.link_url ?? '',
            item.cta_text ?? '',
          ]),
        ])
      : undefined;
  return {
    destinationDomains: [...new Set([snapshot.link_url, ...items.map((item) => item.link_url)].map(spyDomain).filter((v): v is string => !!v))],
    ...(creativeAssets.length ? { creativeAssets } : {}),
    creativeComplete: items.length > 0 && items.length <= 30 && assets.every(Boolean),
    ...(copy && copy.length <= 100000 ? { creativeText: copy } : {}),
  };
}
export function adPreview(value: unknown) {
  const snapshot = record(value);
  const pagePictureUrl = safeAdThumbnail(snapshot.page_profile_picture_url);
  const media = ['images', 'videos', 'cards']
    .flatMap((key) => (Array.isArray(snapshot[key]) ? (snapshot[key] as unknown[]) : []))
    .map(record);
  const thumbnailUrl = media
    .flatMap((item) => [
      item.resized_image_url,
      item.video_preview_image_url,
      item.original_image_url,
    ])
    .map(safeAdThumbnail)
    .find(Boolean);
  const title =
    text(snapshot.title, 500) || media.map((item) => text(item.title, 500)).find(Boolean);
  const description =
    text(record(snapshot.body).text ?? snapshot.body, 10000) ||
    text(snapshot.link_description, 10000);
  return {
    ...(pagePictureUrl ? { pagePictureUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}
