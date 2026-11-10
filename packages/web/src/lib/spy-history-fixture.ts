import { type LibraryAd, libraryDelta, libraryScope } from './spy-library-reader';
import { enrollLibraryOffers, initialLibraryState } from './spy-library-store';
export function spyHistoryFixture(day: number) {
  const source = 'https://www.facebook.com/ads/library/?country=ALL&q=tmx-demo';
  const state = enrollLibraryOffers(initialLibraryState('synthetic-history'), [
    { id: 'sheet-34', name: 'Teste de páginas', sources: [source] },
  ]);
  state.provider = 'scrapecreators';
  const scope = libraryScope([source], ['ALL'], 'scrapecreators');
  const sets = [
    ['100', '200'],
    ['100', '300'],
    ['100', '300', '400'],
    ['100', '200', '400'],
  ];
  const job = state.jobs['sheet-34']!;
  for (let i = 0; i <= day; i++) {
    const ads: LibraryAd[] = sets[i]!.map((pageId) => ({
      id: `${pageId === '300' ? 2 : pageId === '400' ? 3 : 1}${pageId}`,
      pageId,
      pageName:
        pageId === '100' && i > 0
          ? 'Página A · nome atualizado'
          : `Página ${String.fromCharCode(64 + Number(pageId) / 100)}`,
      url: `https://www.facebook.com/ads/library/?id=${pageId === '300' ? 2 : pageId === '400' ? 3 : 1}${pageId}`,
      startedAt: null,
      collationCount: (Number(pageId) / 100) * 3,
      collationId: pageId,
      thumbnailUrl: '/spy-preview/ad-sample.svg',
      title: 'Prévia ilustrativa do anúncio',
      description:
        'Conteúdo simulado para testar os cards, a primeira aparição e o histórico das páginas. Nenhuma consulta ao provedor é executada.',
    }));
    job.snapshots.push({
      day: i,
      at: new Date(Date.UTC(2026, 10, 9 + i, 15)).toISOString(),
      scope,
      countries: ['ALL'],
      ads,
      ...libraryDelta(job.snapshots.at(-1), { scope, ads }),
    });
  }
  Object.assign(job, {
    enabled: true,
    optedIn: true,
    status: 'active',
    startedAt: job.snapshots[0]!.at,
    nextAt: null,
  });
  return state;
}
