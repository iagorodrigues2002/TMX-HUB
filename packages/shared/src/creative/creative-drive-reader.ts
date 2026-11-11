import { creativeIdentity, creativeOffer } from './creative-identity.js';

export interface ImportedCreativeFile {
  id: string;
  name: string;
  url: string;
  thumbnail: string | null;
  offer: string;
  batch: string;
  identity: ReturnType<typeof creativeIdentity>;
  archived?: true;
}
export interface CreativeDriveCatalog {
  rootId: string;
  rootName: string;
  at: string;
  foldersRead: number;
  offers: { code: string; id: string; name: string; url: string }[];
  files: ImportedCreativeFile[];
}
export function creativeFileIdentity(file: ImportedCreativeFile) {
  if (!file.identity) return null;
  const parsed = creativeIdentity(file.name, file.offer, file.batch);
  return parsed && (parsed.key !== file.identity.key || file.identity.variant === undefined)
    ? parsed
    : file.identity;
}
const idPattern = /^[A-Za-z0-9_-]{10,200}$/;
export function driveFolderId(value: string) {
  const u = new URL(value);
  const id = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)\/?$/.exec(u.pathname)?.[1];
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'drive.google.com' ||
    u.username ||
    u.password ||
    u.port ||
    !id ||
    !idPattern.test(id)
  )
    throw Error('Use um link válido de pasta do Google Drive.');
  return id;
}
function decode(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#\d+|#x[0-9a-f]+);/gi, (item) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&lt;': '<',
      '&gt;': '>',
    };
    if (named[item.toLowerCase()]) return named[item.toLowerCase()]!;
    const n =
      item[2]?.toLowerCase() === 'x'
        ? Number.parseInt(item.slice(3, -1), 16)
        : Number(item.slice(2, -1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
export function parseDriveListing(html: string) {
  if (!html.includes('class="flip-entries"') || /nextPageToken|loadMore|pagination/i.test(html))
    throw Error('Leitura do Drive indisponível ou incompleta. O catálogo anterior foi preservado.');
  const markers = [...html.matchAll(/<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"/g)];
  // shortcut: public embedded listings are accepted only below 100 entries; use the OAuth API for larger/private folders.
  if (markers.length >= 100)
    throw Error('Esta pasta exige a API autenticada para garantir a paginação completa.');
  const entries = markers.map((match, i) => {
    const chunk = html.slice(match.index, markers[i + 1]?.index ?? html.length);
    const name = /class="flip-entry-title">([^<]*)<\/div>/.exec(chunk)?.[1];
    const href = /<a href="([^"]+)"/.exec(chunk)?.[1];
    const id = match[1]!;
    if (!name || !href || !idPattern.test(id))
      throw Error('O formato da listagem do Drive mudou. Catálogo preservado.');
    const u = new URL(decode(href));
    const folder = u.pathname.includes('/drive/folders/');
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'drive.google.com' ||
      u.username ||
      u.password ||
      u.port ||
      !(folder ? u.pathname === `/drive/folders/${id}` : u.pathname === `/file/d/${id}/view`)
    )
      throw Error('Link inválido na listagem do Drive.');
    const image = /class="flip-entry-thumb"><img src="([^"]+)"/.exec(chunk)?.[1];
    let thumbnail: string | null = null;
    if (image) {
      const t = new URL(decode(image));
      if (
        t.protocol === 'https:' &&
        /^lh\d+\.googleusercontent\.com$/.test(t.hostname) &&
        !t.username &&
        !t.password &&
        !t.port
      )
        thumbnail = t.href;
    }
    return {
      id,
      name: decode(name),
      folder,
      thumbnail,
      url: `https://drive.google.com/${folder ? 'drive/folders/' : 'file/d/'}${id}${folder ? '' : '/view'}`,
    };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    throw Error('Listagem duplicada do Drive. Catálogo preservado.');
  return { name: decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? 'Drive'), entries };
}
export async function readDriveFolder(id: string, fetcher: typeof fetch = fetch) {
  if (!idPattern.test(id)) throw Error('Pasta inválida.');
  const r = await fetcher(`https://drive.google.com/embeddedfolderview?id=${id}`, {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok || !r.body)
    throw Error('O Drive não permitiu ler a pasta compartilhada. Catálogo preservado.');
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const v = await reader.read();
    if (v.done) break;
    size += v.value.length;
    if (size > 4_000_000) {
      await reader.cancel();
      throw Error('Listagem do Drive maior que o limite seguro.');
    }
    chunks.push(v.value);
  }
  return parseDriveListing(Buffer.concat(chunks).toString('utf8'));
}
export async function readCreativeDrive(
  rootUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<CreativeDriveCatalog> {
  const rootId = driveFolderId(rootUrl);
  const root = await readDriveFolder(rootId, fetcher);
  const offers = root.entries
    .filter((e) => e.folder)
    .map((e) => ({ code: creativeOffer(e.name), id: e.id, name: e.name, url: e.url }));
  if (
    !offers.length ||
    offers.some((o) => !/^[A-Z0-9_]{1,80}$/.test(o.code)) ||
    new Set(offers.map((o) => o.code)).size !== offers.length
  )
    throw Error(
      'Revise a pasta principal: cada oferta precisa ter uma pasta identificável e única.',
    );
  const queue = offers.map((o) => ({ id: o.id, offer: o.code, context: [] as string[] }));
  const seen = new Set<string>([rootId]);
  const files: ImportedCreativeFile[] = [];
  let read = 1;
  while (queue.length) {
    const batch = queue.splice(0, 4);
    const results = await Promise.all(
      batch.map(async (item) => ({ item, listing: await readDriveFolder(item.id, fetcher) })),
    );
    for (const { item, listing } of results) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      read++;
      if (seen.size > 1000)
        throw Error('Árvore do Drive muito extensa. Nenhum catálogo parcial foi salvo.');
      const context = [...item.context, listing.name];
      for (const e of listing.entries) {
        if (e.folder) {
          if (!seen.has(e.id)) queue.push({ id: e.id, offer: item.offer, context });
          continue;
        }
        if (!/\.mp4$/i.test(e.name) || files.some((f) => f.id === e.id)) continue;
        const identity = creativeIdentity(e.name, item.offer, ...context);
        files.push({
          id: e.id,
          name: e.name,
          url: e.url,
          thumbnail: e.thumbnail,
          offer: item.offer,
          batch: identity?.batch == null ? 'Sem leva' : `Leva ${identity.batch}`,
          identity,
        });
        if (files.length > 20000)
          throw Error('Catálogo muito extenso. Nenhum resultado parcial foi salvo.');
      }
    }
  }
  return {
    rootId,
    rootName: root.name,
    offers,
    files,
    foldersRead: read,
    at: new Date().toISOString(),
  };
}
