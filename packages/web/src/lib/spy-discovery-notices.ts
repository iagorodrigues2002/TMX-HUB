import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LibraryJob, LibrarySnapshot } from './spy-library-store';
import { spyAdDomains } from './spy-domains';
export const spyNoticeSchema = z.object({
  id: z.string(),
  recipientId: z.string(),
  createdAt: z.string(),
  unread: z.boolean(),
  title: z.string(),
  entityKeys: z.array(z.string()),
  spy: z.object({
    offerId: z.string(),
    offerName: z.string(),
    newAds: z.number().int().nonnegative(),
    newPages: z.number().int().nonnegative(),
    pageNames: z.array(z.string()),
    newDomains: z.number().int().nonnegative().optional(),
    domains: z.array(z.string()).optional(),
  }),
});
export type SpyDiscoveryNotice = z.infer<typeof spyNoticeSchema>;
const entityKey = (owner: string, offer: string, scope: string, kind: string, id: string) =>
  createHash('sha256').update(`${owner}:${offer}:${scope}:${kind}:${id}`).digest('hex');
export function spyDiscoverySeen(owner: string, job: LibraryJob, snapshot: LibrarySnapshot) {
  return [
    ...new Set([
      ...job.discoverySeen,
      ...[...job.snapshots.filter((v) => v.scope === snapshot.scope), snapshot].flatMap((v) =>
        v.ads.flatMap((ad) => [
          entityKey(owner, job.id, v.scope, 'ad', ad.id),
          entityKey(owner, job.id, v.scope, 'page', ad.pageId),
          ...spyAdDomains(ad).map((host) => entityKey(owner, job.id, v.scope, 'domain', host)),
        ]),
      ),
    ]),
  ];
}
export function spyDiscoveryNotice(
  owner: string,
  job: LibraryJob,
  snapshot: LibrarySnapshot,
  notices: SpyDiscoveryNotice[],
): SpyDiscoveryNotice | null {
  if (!job.responsibleId) return null;
  const history = job.snapshots.filter((v) => v.scope === snapshot.scope);
  if (!history.length) return null;
  const oldAds = new Set(history.flatMap((v) => v.ads.map((a) => a.id)));
  const oldPages = new Set(history.flatMap((v) => v.ads.map((a) => a.pageId)));
  const oldDomains = new Set(history.flatMap((v) => v.ads.flatMap(spyAdDomains)));
  const delivered = new Set([...job.discoverySeen, ...notices.flatMap((n) => n.entityKeys)]);
  const key = (kind: string, id: string) => entityKey(owner, job.id, snapshot.scope, kind, id);
  const newAds = [
    ...new Set(
      snapshot.ads
        .filter((a) => !oldAds.has(a.id) && !delivered.has(key('ad', a.id)))
        .map((a) => a.id),
    ),
  ];
  const pages = new Map(
    snapshot.ads
      .filter((a) => !oldPages.has(a.pageId) && !delivered.has(key('page', a.pageId)))
      .map((a) => [a.pageId, a.pageName]),
  );
  const domains = [...new Set(snapshot.ads.flatMap(spyAdDomains))].filter((host) => !oldDomains.has(host) && !delivered.has(key('domain', host)));
  if (!newAds.length && !pages.size && !domains.length) return null;
  const entityKeys = [
    ...newAds.map((id) => key('ad', id)),
    ...[...pages.keys()].map((id) => key('page', id)),
    ...domains.map((host) => key('domain', host)),
  ].sort();
  return {
    id: `spy:${createHash('sha256').update(entityKeys.join(':')).digest('hex')}`,
    recipientId: job.responsibleId,
    createdAt: snapshot.at,
    unread: true,
    title: `${job.name}: novidades no acompanhamento`,
    entityKeys,
    spy: {
      offerId: job.id,
      offerName: job.name,
      newAds: newAds.length,
      newPages: pages.size,
      pageNames: [...pages.values()].slice(0, 10),
      newDomains: domains.length,
      domains,
    },
  };
}
export function visibleSpyNotices(notices: SpyDiscoveryNotice[], recipientId: string) {
  return notices
    .filter((n) => n.recipientId === recipientId)
    .map(({ id, createdAt, unread, title, spy }) => ({
      id,
      createdAt,
      unread,
      title,
      spy,
      kind: 'spy' as const,
    }));
}
