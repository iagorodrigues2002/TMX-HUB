export const niches = ['Renda Extra', 'Emagrecimento', 'ED', 'Relacionamento', 'Prosperidade'];
export const funnelTypes = ['Não informado', 'Quiz', 'TSL', 'VSL'] as const;
export const spySections = [
  ['offers', 'Ofertas'],
  ['monitor', 'Acompanhamento'],
  ['analysis', 'Análise com IA'],
  ['cloning', 'Clonagem'],
  ['settings', 'Configurações'],
] as const;
export const spyDays = ['Inicial', 'Dia 1', 'Dia 2', 'Dia 3', 'Dia 4', 'Dia 5', 'Dia 6', 'Dia 7'];
export const markets = ['Sem classificação', 'Testando', 'Pré-escala', 'Escalando', 'Escalado'];
export const stages = [
  'Em pesquisa',
  'Acompanhando',
  'Selecionada',
  'Em clonagem',
  'Em revisão',
  'Concluída',
  'Arquivada',
];
export const spyStageLabel = (stage: string) =>
  stage === 'Acompanhando' ? 'Em acompanhamento' : stage;
export function syncSpyMonitoringStages(
  offers: SpyOffer[],
  jobs: Record<string, { optedIn: boolean }>,
) {
  return offers.map((o) => {
    const job = jobs[o.id];
    if (!job) return o;
    const stage =
      job.optedIn && o.stage === 'Em pesquisa'
        ? 'Acompanhando'
        : !job.optedIn && o.stage === 'Acompanhando'
          ? 'Em pesquisa'
          : o.stage;
    return stage === o.stage ? o : { ...o, stage };
  });
}
export const spyStageOptions = stages.map((value) => ({ value, label: spyStageLabel(value) }));
export const linkKinds = {
  library: 'Library',
  domain: 'Domínio',
  presell: 'Presell',
  vsl: 'VSL',
  quiz: 'Quiz',
  tsl: 'TSL',
  ads: 'Ads',
  checkout: 'Checkout',
  folder: 'Drive da oferta',
};
export type LinkKind = keyof typeof linkKinds;
export interface SpyLink {
  kind: LinkKind;
  label: string;
  url: string;
}
export interface SpyOffer {
  id: string;
  name: string;
  niche: string;
  market: string;
  discoveredAt: string;
  domains: string[];
  links: SpyLink[];
  note: string;
  stage: string;
  favorite: boolean;
  owner: string;
  ownerId?: string;
  deadline: string;
  priority: string;
  funnelType?: (typeof funnelTypes)[number];
  driveNormalized?: boolean;
  monitorStartedAt: string | null;
  observations: { date: string; ads: number }[];
}
export function assignSpyRegisteredOwners(
  offers: SpyOffer[],
  users: { id: string; name: string }[],
) {
  const defaultOwner = users.find(
    (u) => u.name.trim().toLocaleLowerCase('pt-BR') === 'douglas riti',
  );
  return offers.map((o) => {
    const registered = o.ownerId
      ? users.find((u) => u.id === o.ownerId)
      : (users.find((u) => u.name === o.owner) ??
        (!o.owner || o.owner === 'Douglas Hit' ? defaultOwner : undefined));
    return registered && (o.ownerId !== registered.id || o.owner !== registered.name)
      ? { ...o, owner: registered.name, ownerId: registered.id }
      : o;
  });
}
export function safeSpyUrl(value: string) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export function spySourceType(url: string) {
  try {
    const u = new URL(url);
    return u.searchParams.has('view_all_page_id')
      ? 'Página anunciante'
      : u.searchParams.has('q')
        ? 'Busca por domínio / termo'
        : 'Library';
  } catch {
    return 'Link inválido';
  }
}
export function spyPending(offer: SpyOffer) {
  return [
    !offer.niche && 'Nicho',
    offer.name === 'Oferta sem nome' && 'Nome',
    !offer.links.some((l) => l.kind === 'library' && safeSpyUrl(l.url)) && 'Library',
    !offer.links.some((l) => l.kind === 'checkout' && safeSpyUrl(l.url)) && 'Checkout',
  ].filter(Boolean) as string[];
}
export function validateSpyOffer(offer: SpyOffer) {
  if (!offer.name.trim()) return 'Informe o nome da oferta.';
  if (offer.funnelType && !funnelTypes.includes(offer.funnelType))
    return 'Confira o tipo de funil.';
  if (offer.links.some((l) => !safeSpyUrl(l.url)))
    return 'Use links completos iniciados por https:// ou http://.';
  for (const link of offer.links.filter((l) => l.kind === 'folder')) {
    const url = new URL(link.url);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'drive.google.com' ||
      !url.pathname.includes('/folders/')
    )
      return 'Informe o link de uma pasta do Google Drive.';
  }
  if (!stages.includes(offer.stage) || !markets.includes(offer.market))
    return 'Confira a classificação e a etapa.';
  return null;
}
export function parseSpySaved(raw: string): SpyOffer[] {
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    !data.every(
      (o) =>
        o &&
        typeof o.id === 'string' &&
        typeof o.name === 'string' &&
        typeof o.niche === 'string' &&
        typeof o.note === 'string' &&
        typeof o.owner === 'string' &&
        typeof o.priority === 'string' &&
        typeof o.deadline === 'string' &&
        typeof o.discoveredAt === 'string' &&
        typeof o.favorite === 'boolean' &&
        (o.monitorStartedAt === null || typeof o.monitorStartedAt === 'string') &&
        Array.isArray(o.domains) &&
        o.domains.every((s: unknown) => typeof s === 'string') &&
        Array.isArray(o.links) &&
        o.links.every(
          (l: SpyLink) =>
            l &&
            Object.hasOwn(linkKinds, l.kind) &&
            typeof l.label === 'string' &&
            typeof l.url === 'string' &&
            safeSpyUrl(l.url),
        ) &&
        Array.isArray(o.observations) &&
        o.observations.every(
          (v: { date: string; ads: number }) =>
            v && typeof v.date === 'string' && Number.isInteger(v.ads) && v.ads >= 0,
        ) &&
        !validateSpyOffer(o),
    )
  )
    throw Error('Cadastro local inválido');
  return data.map((o) => ({
    ...o,
    owner: o.owner || 'Douglas Hit',
    funnelType: o.funnelType ?? 'Não informado',
    links:
      !o.driveNormalized &&
      !o.links.some((l: SpyLink) => l.kind === 'folder') &&
      o.links.some((l: SpyLink) => l.kind === 'ads')
        ? [
            ...o.links,
            {
              kind: 'folder',
              label: 'Drive da oferta',
              url: o.links.find((l: SpyLink) => l.kind === 'ads')!.url,
            },
          ]
        : o.links,
    driveNormalized: true,
  }));
}
