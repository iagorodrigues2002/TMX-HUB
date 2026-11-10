import { randomUUID } from 'node:crypto';
import { parseSpySaved } from '../components/spy/spy-model';
import { type LibraryState, enrollLibraryOffers } from './spy-library-store';
export function deleteSpyOffer(
  state: LibraryState,
  id: string,
  baseRevision: string,
  now = new Date(),
): LibraryState {
  if (state.catalogRevision !== baseRevision) throw Error('catalog_conflict');
  const offers = parseSpySaved(JSON.stringify(state.catalog));
  if (!offers.some((o) => o.id === id)) throw Error('missing_offer');
  const job = state.jobs[id];
  return {
    ...state,
    catalog: offers.filter((o) => o.id !== id),
    catalogRevision: randomUUID(),
    jobs: job
      ? {
          ...state.jobs,
          [id]: {
            ...job,
            deletedAt: now.toISOString(),
            enabled: false,
            optedIn: false,
            nextAt: null,
            partial: null,
            status: 'paused',
          },
        }
      : state.jobs,
  };
}
export function saveSpyCatalog(
  state: LibraryState,
  raw: unknown[],
  baseRevision: string,
  users: { id: string; name: string }[],
  drive?: string,
) {
  if (state.catalogRevision !== baseRevision) throw Error('catalog_conflict');
  const offers = parseSpySaved(JSON.stringify(raw));
  if (offers.length > 200 || new Set(offers.map((o) => o.id)).size !== offers.length)
    throw Error('invalid_catalog');
  for (const o of offers) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(o.id) ||
      o.name.length > 200 ||
      o.links.length > 100 ||
      o.domains.length > 20 ||
      o.links.filter((l) => l.kind === 'library').length > 20 ||
      o.links.some((l) => l.url.length > 10000)
    )
      throw Error('invalid_offer');
    const user = users.find((u) => u.id === o.ownerId);
    if (o.ownerId && !user) throw Error('invalid_responsible');
    o.owner = user?.name ?? '';
  }
  if (drive && !/^https:\/\/drive\.google\.com\/drive\/folders\/[^?#\s]+/.test(drive))
    throw Error('invalid_drive');
  const enrolled = enrollLibraryOffers(
    state,
    offers.map((o) => ({
      id: o.id,
      name: o.name,
      sources: o.links.filter((l) => l.kind === 'library').map((l) => l.url),
      domains: o.domains,
      responsibleId: o.ownerId ?? null,
    })),
  );
  const ids = new Set(offers.map((o) => o.id));
  for (const job of Object.values(enrolled.jobs))
    if (!ids.has(job.id))
      enrolled.jobs[job.id] = {
        ...job,
        deletedAt: job.deletedAt ?? new Date().toISOString(),
        enabled: false,
        optedIn: false,
        nextAt: null,
        status: 'paused',
      };
  return {
    ...enrolled,
    catalog: offers,
    catalogRevision: randomUUID(),
    drive: drive ?? state.drive,
  };
}
