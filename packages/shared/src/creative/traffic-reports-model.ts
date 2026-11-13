import {
  type DateRange,
  type DateRangePreset,
  currentMonthRange,
  daysAgoIso,
  previousMonthRange,
} from './date-range.js';

export const REPORT_TODAY = '2026-11-08';
export const REPORT_START = '2026-10-01';
export const reportPresets: readonly DateRangePreset[] = [
  ...[
    [0, 'Hoje'],
    [1, 'Ontem'],
    [2, 'Anteontem'],
  ].map(([days, label]) => ({
    id: `day-${days}`,
    label: String(label),
    getRange: () => ({
      from: daysAgoIso(Number(days), REPORT_TODAY),
      to: daysAgoIso(Number(days), REPORT_TODAY),
    }),
  })),
  ...[7, 30].map((days) => ({
    id: `last-${days}`,
    label: `Últimos ${days} dias`,
    getRange: () => ({ from: daysAgoIso(days - 1, REPORT_TODAY), to: REPORT_TODAY }),
  })),
  { id: 'month', label: 'Este mês', getRange: () => currentMonthRange(REPORT_TODAY) },
  { id: 'previous-month', label: 'Mês passado', getRange: () => previousMonthRange(REPORT_TODAY) },
  { id: 'all', label: 'Período total', getRange: () => ({ from: REPORT_START, to: REPORT_TODAY }) },
];
export const gateways = ['VendePay', 'Explodely', 'Paysight'];
export interface ReportScope {
  gateway: string;
  account: string;
}
export const allReports: ReportScope = { gateway: '', account: '' };

// Valores monetários da amostra em centavos; conversão para BRL após a soma.
export interface ReportAmounts {
  spend: number;
  revenue: number;
  fees: number | null;
  refunds: number | null;
  penalties: number | null;
  reserve: number | null;
  sales: number;
  frontSales: number | null;
  checkouts: number;
  pageViews: number;
  clicks: number;
  impressions: number;
  videoImpressions: number;
  videoViews: number | null;
}
export interface ReportAd {
  id: string;
  name: string;
  campaignId: string;
  campaign: string;
  adsetId: string;
  adset: string;
  gateway: string;
  account: string;
  owner: string;
  format: 'Vídeo' | 'Imagem';
  status: 'Ativa' | 'Pausada' | 'Em análise' | 'Com reprovação';
}
export interface ReportRecord {
  date: string;
  window: number;
  ad: ReportAd;
  amounts: ReportAmounts;
}
export interface ReportMetrics {
  tmxGross: number | null;
  tmxGrossRoas: number | null;
  tmxFronts: number | null;
  tmxCpa: number | null;
  upsells: number | null;
  funnelArpu: number | null;
  naturalArpu: number | null;
  clickedArpu: number | null;
  naturalUpsells: number | null;
  clickedUpsells: number | null;
  tmxAttributedRoas: number | null;
  spend: number;
  revenue: number;
  fees: number | null;
  refunds: number | null;
  penalties: number | null;
  reserve: number | null;
  finalResult: number | null;
  afterMedia: number | null;
  sales: number;
  frontSales: number | null;
  checkouts: number;
  pageViews: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  hookRate: number | null;
  checkoutConversion: number | null;
  conversionRate: number | null;
  costCheckout: number | null;
  roas: number | null;
  roi: number | null;
  metaPurchaseValue: number | null;
  metaRoas: number | null;
  metaGrossRoi: number | null;
  metaLandingViews: number | null;
  metaLandingConversion: number | null;
  connectRate: number | null;
  videoImpressions: number | null;
  videoViews: number | null;
}
export interface ReportRow {
  unavailable?: boolean;
  missingMetrics?: ReportMetricKey[];
  id: string;
  name: string;
  subtitle: string;
  status?: string;
  metrics: ReportMetrics;
}
export type ReportLevel = 'campaigns' | 'adsets' | 'ads';
export const windowLabel = (index: number) =>
  `${String(index * 2).padStart(2, '0')}:00–${String((index + 1) * 2).padStart(2, '0')}:00`;
const weights = [3, 2, 1, 2, 6, 10, 13, 15, 16, 14, 10, 8];

export function splitReportAmount(total: number, shares = weights) {
  const denominator = shares.reduce((sum, value) => sum + value, 0);
  const parts = shares.map((value) => Math.floor((total * value) / denominator));
  parts[shares.indexOf(Math.max(...shares))]! +=
    total - parts.reduce((sum, value) => sum + value, 0);
  return parts;
}

const campaignNames = [
  'Conversão · Público amplo',
  'Escala · Criativos validados',
  'Teste · Novos vídeos',
  'Remarketing · Visitantes',
  'Aquisição · Interesse',
  'Validação · Nova abordagem',
];
export const reportAds: ReportAd[] = campaignNames.flatMap((campaign, i) =>
  [0, 1].map((j) => ({
    id: `ad-${i}-${j}`,
    name: `${[
      'UGC · Abertura direta',
      'Demonstração · Produto',
      'Depoimento · Rotina',
      'Comparativo · Benefícios',
      'Imagem · Oferta',
      'UGC · Pergunta inicial',
    ][i]!} · V0${j + 1}`,
    campaignId: `campaign-${i}`,
    campaign,
    adsetId: `adset-${i}`,
    adset: ['Público amplo · Brasil', 'Interesses · Brasil', 'Visitantes · 30 dias'][i % 3]!,
    gateway: gateways[i % 3]!,
    account: `account-${i % 2}-0-${i % 2}`,
    owner: ['Ana Martins', 'Lucas Oliveira', 'Pedro Santos'][i % 3]!,
    format: i === 4 ? 'Imagem' : 'Vídeo',
    status:
      i === 2 && j === 1
        ? 'Com reprovação'
        : i === 3
          ? 'Pausada'
          : i === 5
            ? 'Em análise'
            : 'Ativa',
  })),
);

export const reportRecords: ReportRecord[] = (() => {
  const records: ReportRecord[] = [];
  for (let date = REPORT_START, d = 0; date <= REPORT_TODAY; date = daysAgoIso(-1, date), d++) {
    for (const [i, ad] of reportAds.entries()) {
      const sales = 5 + ((i * 3 + d * 2) % 19);
      const frontSales = sales - Math.ceil(sales * 0.3);
      const revenue = sales * (13900 + (i % 4) * 1700);
      const spend = 11000 + ((i * 1703 + d * 1999) % 27000);
      const impressions = 5000 + i * 403 + (d % 7) * 307;
      const clicks = 240 + i * 23 + (d % 5) * 19;
      const amounts: ReportAmounts = {
        spend,
        revenue,
        fees: Math.round(revenue * (ad.gateway === 'VendePay' ? 0.08 : 0.095)) + sales * 149,
        refunds: d % 6 === 0 ? 13900 : 0,
        penalties: d % 13 === 0 ? 2500 : 0,
        reserve: Math.round(revenue * 0.1),
        sales,
        frontSales,
        checkouts: sales * 4 + 7,
        pageViews: clicks - 30,
        clicks,
        impressions,
        videoImpressions: ad.format === 'Vídeo' ? impressions : 0,
        videoViews:
          ad.format === 'Vídeo' ? Math.round(impressions * (0.17 + (i % 5) * 0.055)) : null,
      };
      const parts = Object.fromEntries(
        Object.entries(amounts).map(([key, value]) => [
          key,
          value === null ? null : splitReportAmount(value),
        ]),
      ) as Record<keyof ReportAmounts, number[] | null>;
      const upsellParts = splitReportAmount(sales - frontSales);
      parts.sales = parts.frontSales!.map((front, index) => front + upsellParts[index]!);
      for (let window = 0; window < 12; window++)
        records.push({
          date,
          window,
          ad,
          amounts: Object.fromEntries(
            Object.entries(parts).map(([key, values]) => [key, values?.[window] ?? null]),
          ) as unknown as ReportAmounts,
        });
    }
  }
  return records;
})();

export function selectReportRecords(scope: ReportScope, range: DateRange) {
  return reportRecords.filter(
    (row) =>
      row.date >= range.from &&
      row.date <= range.to &&
      (!scope.gateway || row.ad.gateway === scope.gateway) &&
      (!scope.account || row.ad.account === scope.account),
  );
}

export function reportMetrics(records: Pick<ReportRecord, 'amounts'>[]): ReportMetrics {
  const sum = (key: keyof ReportAmounts) =>
    records.reduce((total, row) => total + (row.amounts[key] ?? 0), 0);
  const money = (key: 'fees' | 'refunds' | 'penalties' | 'reserve') =>
    records.some((row) => row.amounts[key] === null) ? null : sum(key) / 100;
  const spend = sum('spend') / 100;
  const revenue = sum('revenue') / 100;
  const fees = money('fees');
  const refunds = money('refunds');
  const penalties = money('penalties');
  const reserve = money('reserve');
  const finalResult =
    fees === null || refunds === null || penalties === null || reserve === null
      ? null
      : (sum('revenue') - sum('fees') - sum('refunds') - sum('penalties') - sum('reserve')) / 100;
  const sales = sum('sales');
  const frontSales = records.some((row) => row.amounts.frontSales === null)
    ? null
    : sum('frontSales');
  const checkouts = sum('checkouts');
  const pageViews = sum('pageViews');
  const clicks = sum('clicks');
  const impressions = sum('impressions');
  const videoMissing = records.some(
    (row) => row.amounts.videoImpressions > 0 && row.amounts.videoViews === null,
  );
  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : null;
  return {
    tmxFronts: null,
    tmxCpa: null,
    tmxGross: null,
    tmxGrossRoas: null,
    upsells: null,
    funnelArpu: null,
    naturalArpu: null,
    clickedArpu: null,
    naturalUpsells: null,
    clickedUpsells: null,
    tmxAttributedRoas: null,
    spend,
    revenue,
    fees,
    refunds,
    penalties,
    reserve,
    finalResult,
    afterMedia: finalResult === null ? null : Math.round(finalResult * 100 - sum('spend')) / 100,
    sales,
    frontSales,
    checkouts,
    pageViews,
    clicks,
    impressions,
    cpa: frontSales === null ? null : ratio(spend, frontSales),
    cpc: ratio(spend, clicks),
    cpm: impressions ? (spend / impressions) * 1000 : null,
    ctr: ratio(clicks, impressions),
    hookRate: videoMissing ? null : ratio(sum('videoViews'), sum('videoImpressions')),
    checkoutConversion: frontSales === null ? null : ratio(frontSales, checkouts),
    conversionRate: frontSales === null ? null : ratio(frontSales, pageViews),
    costCheckout: ratio(spend, checkouts),
    roas: ratio(revenue, spend),
    roi: finalResult === null || spend <= 0 ? null : (finalResult - spend) / spend,
    metaPurchaseValue: null,
    metaRoas: null,
    metaGrossRoi: null,
    metaLandingViews: null,
    metaLandingConversion: null,
    connectRate: null,
    videoImpressions: sum('videoImpressions'),
    videoViews: videoMissing ? null : sum('videoViews'),
  };
}

export function groupReportRows(
  records: ReportRecord[],
  level: ReportLevel | 'daily' | 'windows',
): ReportRow[] {
  const groups = new Map<string, ReportRecord[]>();
  for (const record of records) {
    const key =
      level === 'daily'
        ? record.date
        : level === 'windows'
          ? String(record.window)
          : level === 'ads'
            ? record.ad.id
            : level === 'adsets'
              ? record.ad.adsetId
              : record.ad.campaignId;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups]
    .map(([id, rows]) => {
      const ad = rows[0]!.ad;
      const statuses = new Set(rows.map((row) => row.ad.status));
      const status = statuses.has('Com reprovação')
        ? 'Com reprovação'
        : statuses.size === 1
          ? ad.status
          : 'Mista';
      return {
        id,
        name:
          level === 'daily'
            ? id.split('-').reverse().join('/')
            : level === 'windows'
              ? windowLabel(Number(id))
              : level === 'ads'
                ? ad.name
                : level === 'adsets'
                  ? ad.adset
                  : ad.campaign,
        subtitle:
          level === 'daily'
            ? 'Tráfego consolidado no período'
            : level === 'windows'
              ? 'Soma da faixa nos dias selecionados'
              : level === 'ads'
                ? `${ad.campaign} · ${ad.format} · ${ad.id}`
                : `${new Set(rows.map((row) => row.ad.id)).size} anúncios · ${ad.owner}`,
        status: level === 'daily' || level === 'windows' ? undefined : status,
        metrics: reportMetrics(rows),
      };
    })
    .sort((a, b) =>
      level === 'daily'
        ? a.id.localeCompare(b.id)
        : level === 'windows'
          ? Number(a.id) - Number(b.id)
          : b.metrics.spend - a.metrics.spend,
    );
}

export function reportCoverage(range: DateRange) {
  const from = range.from < REPORT_START ? REPORT_START : range.from;
  const to = range.to > REPORT_TODAY ? REPORT_TODAY : range.to;
  return from > to ? null : { from, to, partial: from !== range.from || to !== range.to };
}

export type ReportMetricKey = keyof ReportMetrics;
export const defaultTrafficColumns: ReportMetricKey[] = [
  'spend',
  'frontSales',
  'cpa',
  'checkouts',
  'costCheckout',
  'roi',
  'cpm',
  'cpc',
  'hookRate',
];
export const reportColumns: {
  key: ReportMetricKey;
  label: string;
  kind: 'money' | 'count' | 'percent' | 'ratio';
  hint: string;
}[] = [
  {
    key: 'tmxFronts',
    label: 'Vendas · TMX',
    kind: 'count',
    hint: 'Fronts pagos no TMX com atribuição confirmada; denominador do ARPU do funil',
  },
  {
    key: 'tmxCpa',
    label: 'CPA front · TMX',
    kind: 'money',
    hint: 'Investimento ÷ fronts pagos com atribuição confirmada no TMX',
  },
  {
    key: 'upsells',
    label: 'Upsells totais · TMX',
    kind: 'count',
    hint: 'Todos os upsells pagos no período com vínculo confirmado à campanha, incluindo origem ainda não classificada',
  },
  {
    key: 'funnelArpu',
    label: 'ARPU do funil · TMX',
    kind: 'money',
    hint: 'Receita do funil no período ÷ fronts pagos no TMX, como na Visão geral Geral',
  },
  {
    key: 'naturalArpu',
    label: 'ARPU natural · TMX',
    kind: 'money',
    hint: 'Receita das vendas classificadas na Visão natural ÷ total de fronts TMX da campanha no período',
  },
  {
    key: 'clickedArpu',
    label: 'ARPU com clique registrado · TMX',
    kind: 'money',
    hint: 'Receita das vendas com clique de recuperação registrado ÷ total de fronts TMX da campanha. Não é clique no anúncio.',
  },
  {
    key: 'naturalUpsells',
    label: 'Upsells naturais · TMX',
    kind: 'count',
    hint: 'Upsells classificados como naturais pelo rastreamento, vinculados à campanha pelo front',
  },
  {
    key: 'clickedUpsells',
    label: 'Upsells com clique registrado · TMX',
    kind: 'count',
    hint: 'Upsells com clique de recuperação registrado, classificados pelo rastreamento e vinculados à campanha pelo front',
  },
  {
    key: 'tmxGross',
    label: 'Faturamento · TMX',
    kind: 'money',
    hint: 'Valor de compras de front informado pela Meta + faturamento dos upsells vinculados no TMX.',
  },
  {
    key: 'tmxGrossRoas',
    label: 'ROAS · TMX',
    kind: 'ratio',
    hint: '(Valor de compras da Meta + faturamento dos upsells vinculados no TMX) ÷ investimento.',
  },
  {
    key: 'tmxAttributedRoas',
    label: 'ROAS TMX atribuído',
    kind: 'ratio',
    hint: 'Resultado atribuído após taxas, devoluções e reserva ÷ investimento. Não altera a Meta.',
  },
  { key: 'spend', label: 'Investimento', kind: 'money', hint: 'Gasto de mídia no período' },
  {
    key: 'frontSales',
    label: 'Vendas de front',
    kind: 'count',
    hint: 'Compras de entrada (front); origem e classificação identificadas no relatório',
  },
  {
    key: 'cpa',
    label: 'CPA front',
    kind: 'money',
    hint: 'Investimento ÷ vendas de front',
  },
  { key: 'checkouts', label: 'Initiate Checkout', kind: 'count', hint: 'Checkouts iniciados (IC)' },
  {
    key: 'costCheckout',
    label: 'Custo por IC',
    kind: 'money',
    hint: 'Investimento ÷ checkouts iniciados',
  },
  {
    key: 'roi',
    label: 'ROI de mídia',
    kind: 'percent',
    hint: '(Resultado final − investimento) ÷ investimento; após taxas e reserva',
  },
  { key: 'cpm', label: 'CPM', kind: 'money', hint: 'Investimento ÷ impressões × 1.000' },
  { key: 'cpc', label: 'CPC', kind: 'money', hint: 'Investimento ÷ cliques no link' },
  {
    key: 'hookRate',
    label: 'Hook rate',
    kind: 'percent',
    hint: 'Reproduções de 3s ÷ impressões dos anúncios de vídeo; imagem não se aplica',
  },
  { key: 'roas', label: 'ROAS', kind: 'ratio', hint: 'Receita bruta ÷ investimento' },
  {
    key: 'metaPurchaseValue',
    label: 'Valor de compras · Meta',
    kind: 'money',
    hint: 'Valor de compra informado à Meta, sem conciliação de taxas e reserva no TMX',
  },
  {
    key: 'metaRoas',
    label: 'ROAS · Meta',
    kind: 'ratio',
    hint: 'Valor de compras atribuído pela Meta ÷ investimento',
  },
  {
    key: 'metaGrossRoi',
    label: 'ROI bruto · Meta',
    kind: 'percent',
    hint: '(Valor de compras informado à Meta − investimento) ÷ investimento; sem deduções do TMX',
  },
  { key: 'impressions', label: 'Impressões', kind: 'count', hint: 'Exibições do anúncio' },
  {
    key: 'metaLandingViews',
    label: 'LPV · Meta',
    kind: 'count',
    hint: 'Landing Page Views atribuídas pela Meta; não substitui o PageView do tracking TMX',
  },
  {
    key: 'metaLandingConversion',
    label: 'Conversão LPV · Meta',
    kind: 'percent',
    hint: 'Vendas de front atribuídas pela Meta ÷ Landing Page Views Meta',
  },
  { key: 'clicks', label: 'Cliques no link', kind: 'count', hint: 'Base de CPC e CTR' },
  {
    key: 'connectRate',
    label: 'Connect Rate',
    kind: 'percent',
    hint: 'Landing Page Views Meta ÷ cliques no link. Mede a proporção de cliques com carregamento da página registrado pela Meta.',
  },
  { key: 'ctr', label: 'CTR', kind: 'percent', hint: 'Cliques no link ÷ impressões' },
  { key: 'pageViews', label: 'PageView', kind: 'count', hint: 'Visualizações rastreadas' },
  {
    key: 'checkoutConversion',
    label: 'Conversão IC',
    kind: 'percent',
    hint: 'Vendas de front ÷ checkouts iniciados',
  },
  {
    key: 'conversionRate',
    label: 'Conversão da página',
    kind: 'percent',
    hint: 'Vendas de front ÷ PageViews',
  },
  {
    key: 'sales',
    label: 'Vendas totais',
    kind: 'count',
    hint: 'Fronts e upsells; não é o denominador do CPA front',
  },
  {
    key: 'finalResult',
    label: 'Resultado final',
    kind: 'money',
    hint: 'Bruto − taxas − devoluções − encargos − reserva; antes da mídia',
  },
  {
    key: 'revenue',
    label: 'Receita bruta',
    kind: 'money',
    hint: 'Base do ROAS, antes das deduções',
  },
  { key: 'fees', label: 'Taxas', kind: 'money', hint: 'Taxas do gateway' },
  { key: 'refunds', label: 'Devoluções', kind: 'money', hint: 'Reembolsos e chargebacks' },
  { key: 'penalties', label: 'Encargos', kind: 'money', hint: 'Multas e encargos de devolução' },
  {
    key: 'reserve',
    label: 'Reserva retida',
    kind: 'money',
    hint: 'Retenção temporária; não é despesa definitiva',
  },
  {
    key: 'afterMedia',
    label: 'Após mídia',
    kind: 'money',
    hint: 'Resultado final − investimento; não representa lucro contábil',
  },
];
