export const trafficTabs = [
  ['overview', 'Visão geral do tráfego'],
  ['campaigns', 'Campanhas'],
  ['windows', 'Janelas e comparações'],
  ['contingency', 'Contingência'],
  ['settings', 'Configurações'],
] as const;
export type TrafficTab = (typeof trafficTabs)[number][0] | 'ads-intelligence';
export function availableTrafficTabs(
  localPreview = false,
): readonly (readonly [TrafficTab, string])[] {
  return localPreview
    ? [
        ...trafficTabs.slice(0, 2),
        ['ads-intelligence', 'Ads Intelligence'],
        ...trafficTabs.slice(2),
      ]
    : trafficTabs;
}
export function selectTrafficTab(
  requested: string | null,
  allowed: readonly TrafficTab[],
): TrafficTab | null {
  return allowed.find((id) => id === requested) ?? allowed[0] ?? null;
}
export const assetStatuses = ['Ativo', 'Desabilitado'] as const;
export const assetUsages = ['Em uso', 'Em aquecimento', 'Standby'] as const;
export type AssetStatus = (typeof assetStatuses)[number];
export type AssetUsage = (typeof assetUsages)[number];
export type AssetKind = 'bms' | 'accounts';
export interface Asset {
  id: string;
  name: string;
  external: string;
  bm: string;
  owner: string;
  supplier: string;
  status: AssetStatus | null;
  metaStatus: AssetStatus | null;
  usage: AssetUsage;
  source: 'demo' | 'meta';
  relationship?: 'managed' | 'shared' | 'unknown';
}
export interface Inventory {
  bms: Asset[];
  accounts: Asset[];
}
export type AssetMetadata = Pick<Asset, 'owner' | 'supplier' | 'status' | 'usage'>;

export function initialInventory(): Inventory {
  const db: Inventory = { bms: [], accounts: [] };
  ['Aurora', 'Boreal', 'Atlas', 'Cedro'].forEach((name, i) => {
    for (let j = 0; j < 2; j++) {
      const bm = `bm-${i}-${j}`;
      const base: Asset = {
        id: bm,
        name: `BM ${name} ${j + 1}`,
        external: `82000${i}${j}`,
        bm: '',
        owner: ['Ana Martins', 'Lucas Oliveira'][i % 2]!,
        supplier: j ? 'Fornecedor B' : 'Fornecedor A',
        status: 'Ativo',
        metaStatus: 'Ativo',
        usage: i < 2 ? 'Em uso' : i === 2 ? 'Em aquecimento' : 'Standby',
        source: 'demo',
      };
      db.bms.push(base);
      for (let k = 0; k < 2; k++)
        db.accounts.push({
          ...base,
          id: `account-${i}-${j}-${k}`,
          name: `CA ${name} ${j * 2 + k + 1}`,
          external: `act_6300${i}${j}${k}`,
          bm,
          status: i === 3 && j === 0 && k === 0 ? 'Desabilitado' : 'Ativo',
          metaStatus: i === 3 && j === 0 && k === 0 ? 'Desabilitado' : 'Ativo',
        });
    }
  });
  return db;
}

export function saveAssetMetadata(
  db: Inventory,
  kind: AssetKind,
  id: string,
  metadata: AssetMetadata,
): Inventory {
  if (!db[kind].some((asset) => asset.id === id)) throw new Error('Ativo não encontrado.');
  if (metadata.owner.trim().length > 100 || metadata.supplier.trim().length > 100)
    throw new Error('Use até 100 caracteres por campo.');
  if (metadata.status !== null && !assetStatuses.includes(metadata.status))
    throw new Error('Status inválido.');
  if (!assetUsages.includes(metadata.usage)) throw new Error('Situação de uso inválida.');
  return {
    ...db,
    [kind]: db[kind].map((asset) =>
      asset.id === id
        ? {
            ...asset,
            owner: metadata.owner.trim(),
            supplier: metadata.supplier.trim(),
            status: metadata.status,
            usage: metadata.usage,
          }
        : asset,
    ),
  };
}

export interface ImportedInventory {
  businesses: {
    id: string;
    name: string;
    status: AssetStatus | null;
    relationship?: 'managed' | 'shared' | 'unknown';
  }[];
  accounts: { id: string; name: string; businessId: string | null; status: AssetStatus | null }[];
  fetchedAt: string;
  coverage: string;
}
export function mergeImportedInventory(
  current: Inventory,
  snapshot: ImportedInventory,
  connectionId: string,
): Inventory {
  const build = (
    item: ImportedInventory['businesses'][number],
    kind: AssetKind,
    businessId = '',
  ): Asset => {
    const id = `${connectionId}:${kind}:${item.id}`;
    const existing = current[kind].find((asset) => asset.id === id);
    return {
      id,
      name: item.name,
      external: item.id,
      bm: businessId ? `${connectionId}:bms:${businessId}` : '',
      owner: existing?.owner ?? '',
      supplier: existing?.supplier ?? '',
      status: existing?.status ?? item.status,
      metaStatus: item.status,
      usage: existing?.usage ?? 'Standby',
      source: 'meta',
      relationship: item.relationship ?? 'unknown',
    };
  };
  return {
    bms: snapshot.businesses.map((item) => build(item, 'bms')),
    accounts: snapshot.accounts.map((item) => build(item, 'accounts', item.businessId ?? '')),
  };
}
