import type { SpyOffer } from '../../src/components/spy/spy-model';
// Synthetic catalog: production research and Drive links stay in authenticated storage.
const seed: SpyOffer[] = Array.from({ length: 29 }, (_, i) => ({
  id: `fixture-${i}`,
  name: i < 5 ? 'Oferta repetida' : i === 5 ? 'Oferta com vários links' : `Oferta ${i}`,
  niche: 'Renda Extra',
  market: 'Testando',
  discoveredAt: '09/11/2026',
  domains: [`offer-${i}.example.test`],
  links: [
    {
      kind: 'library',
      label: 'Library',
      url: `https://www.facebook.com/ads/library/?q=offer-${i}.example.test`,
    },
    ...Array.from({ length: 3 }, (_, n) => ({
      kind: 'presell' as const,
      label: 'Presell',
      url: `https://offer-${i}.example.test/presell/${n}`,
    })),
    ...Array.from({ length: 2 }, (_, n) => ({
      kind: 'vsl' as const,
      label: 'VSL',
      url: `https://offer-${i}.example.test/vsl/${n}`,
    })),
    ...(i < 6
      ? [
          {
            kind: 'folder' as const,
            label: 'Drive',
            url: `https://drive.google.com/drive/folders/synthetic-${i}`,
          },
        ]
      : []),
  ],
  note: '',
  stage: 'Em pesquisa',
  favorite: false,
  owner: '',
  deadline: '',
  priority: 'Normal',
  monitorStartedAt: null,
  observations: [],
}));
export default seed;
