const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export function safeAdThumbnail(value: unknown) {
  if (typeof value !== 'string' || value.length > 10000) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      /\.(mp4|webm|mov)$/i.test(url.pathname)
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
