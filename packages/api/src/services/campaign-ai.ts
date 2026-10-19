import type { Offer } from '@page-cloner/shared';
import { ulid } from 'ulid';
import { callOpenCode } from './campaign-ai-provider.js';
import type { IntradaySummary } from './intraday-store.js';
import type { OfferAiAnalysisRecord, OfferAiSecretConfig } from './offer-store.js';

export const DEFAULT_AI_ROLE = `Você é um gestor de tráfego sênior especializado em campanhas de resposta direta no Meta Ads.
Sua função é analisar dados intradiários reais, identificar tendências e escrever uma observação operacional curta, clara e responsável.
Nunca invente números, ações executadas ou causas que não estejam nos dados. Diferencie fato de hipótese e não prometa resultados.`;

export const DEFAULT_AI_TEMPLATE = `Analise a operação {{offer_name}} em {{date}} às {{time}}.

META DA OPERAÇÃO
- Responsável: {{responsible}}
- Moeda: {{currency}}
- ROAS mínimo desejado: {{min_roas}}
- Tom solicitado: {{tone}}

ACUMULADO DO DIA
- Investimento: {{spend}}
- Faturamento: {{revenue}}
- Vendas: {{sales}}
- ROAS: {{roas}}
- CPA: {{cpa}}
- IC: {{ic}}

JANELAS DE 2 HORAS
{{windows_json}}

ANÚNCIOS
{{ads_json}}

Escreva somente o texto da observação, em português do Brasil, com 2 a 5 frases.
1. Destaque a melhor e a pior janela quando houver dados suficientes.
2. Compare o ROAS acumulado com a meta.
3. Sinalize anúncios com gasto e nenhuma venda, sem ordenar cortes automáticos.
4. Não diga que orçamento foi aumentado, reduzido ou que uma campanha foi pausada, pois isso não está nos dados.
5. Se os dados forem insuficientes, diga isso objetivamente.
6. Não repita o cabeçalho nem a lista de métricas.`;

export async function generateCampaignAnalysis(args: {
  offer: Offer;
  summary: IntradaySummary;
  config: OfferAiSecretConfig;
  history?: OfferAiAnalysisRecord[];
  now?: Date;
}): Promise<OfferAiAnalysisRecord> {
  const now = args.now ?? new Date();
  const locale = zonedDate(now);
  const currency = args.offer.currency ?? 'BRL';
  const metrics = args.summary.overall;
  const funnels = isGeralGex(args.offer.name) ? buildFunnelSummaries(args.summary.overallAds) : [];
  const values: Record<string, string> = {
    offer_name: args.offer.name,
    date: locale.date,
    time: locale.time,
    responsible: args.config.responsible || 'Não informado',
    currency,
    min_roas: formatNumber(args.config.minRoas),
    tone: args.config.tone,
    spend: money(metrics.spend, currency),
    revenue: money(metrics.revenue, currency),
    sales: String(metrics.sales),
    roas: formatNumber(metrics.roas),
    cpa: money(metrics.cpa, currency),
    ic: String(metrics.ic),
    windows_json: JSON.stringify(
      args.summary.windows
        .filter((window) => window.available)
        .map((window) => ({ janela: window.label, ...window.metrics })),
    ),
    ads_json: args.config.includeAds
      ? JSON.stringify(args.summary.overallAds.slice(0, 30))
      : 'Análise por anúncio desativada.',
    funnels_json: JSON.stringify(funnels),
  };
  const history = (args.history ?? []).slice(0, 10).map((item) => ({
    data_hora: item.createdAt,
    observacao: item.observation.slice(0, 800),
    metricas_naquele_momento: item.metrics,
    feedback_do_gestor: item.feedback?.slice(0, 500),
  }));
  const learningContext = history.length
    ? `\n\nMEMÓRIA OPERACIONAL DAS ANÁLISES ANTERIORES\n${JSON.stringify(history)}\n
Use esse histórico para reconhecer padrões recorrentes e comparar a evolução dos resultados.
Não trate correlação como causa. Não repita mecanicamente conclusões antigas quando os dados atuais mudaram.
Quando houver feedback do gestor, use-o para adaptar o estilo e evitar recomendações que já se mostraram inadequadas.`
    : '\n\nAinda não há análises anteriores. Trate esta geração como a linha de base da operação.';
  const funnelInstruction = funnels.length
    ? `\n\nINSTRUÇÃO OBRIGATÓRIA — ANÁLISE POR FUNIL
Foram identificados os seguintes funis nos nomes das campanhas/anúncios:
${JSON.stringify(funnels)}

Ignore o formato de resumo geral solicitado anteriormente e entregue uma seção separada para cada funil.
Use exatamente os totais calculados acima; não recalcule nem invente valores.
Para cada funil, escreva o código, investimento, faturamento, vendas, CPA, IC, ROAS e uma análise de 2 a 4 frases.
Compare cada funil com o ROAS mínimo. Destaque no máximo três anúncios relevantes por funil.
Não apresente raciocínio interno, cálculos intermediários ou texto em inglês.
Não produza uma análise geral antes ou depois dos funis.`
    : '';
  const prompt = `${renderTemplate(args.config.template, values)}${learningContext}${funnelInstruction}`;
  const aiObservation = await callOpenCode(args.config, prompt);
  const observation =
    funnels.length > 0 && !isValidFunnelAnalysis(aiObservation, funnels)
      ? buildDeterministicFunnelAnalysis(funnels, currency, args.config.minRoas)
      : aiObservation;
  const text = formatReport({
    offer: args.offer,
    responsible: args.config.responsible,
    date: locale.date,
    time: locale.time,
    currency,
    metrics,
    funnels,
    observation,
  });
  return {
    id: ulid(),
    offerId: args.offer.id,
    model: args.config.model,
    text,
    observation,
    metrics: {
      spend: metrics.spend,
      revenue: metrics.revenue,
      sales: metrics.sales,
      ic: metrics.ic,
      cpa: metrics.cpa,
      roas: metrics.roas,
    },
    windows: args.summary.windows
      .filter((window) => window.available)
      .map((window) => ({
        label: window.label,
        spend: window.metrics.spend,
        revenue: window.metrics.revenue,
        sales: window.metrics.sales,
        cpa: window.metrics.cpa,
        roas: window.metrics.roas,
      })),
    createdAt: now.toISOString(),
  };
}

function isGeralGex(name: string): boolean {
  return (
    name
      .normalize('NFD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: This range matches individual combining marks, not a combined character.
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('pt-BR')
      .replace(/\s+/g, ' ') === 'geral gex'
  );
}

interface FunnelSummary {
  code: string;
  spend: number;
  revenue: number;
  sales: number;
  ic: number;
  cpa: number | null;
  roas: number | null;
  ads: IntradaySummary['overallAds'];
}

export function buildFunnelSummaries(ads: IntradaySummary['overallAds']): FunnelSummary[] {
  const grouped = new Map<string, IntradaySummary['overallAds']>();
  for (const ad of ads) {
    const match = /(?:^|[^a-z0-9])(f\d{2,5})(?=$|[^a-z0-9])/i.exec(ad.name);
    const code = match?.[1]?.toUpperCase();
    if (!code) continue;
    const current = grouped.get(code) ?? [];
    current.push(ad);
    grouped.set(code, current);
  }

  return [...grouped.entries()]
    .map(([code, funnelAds]) => {
      const spend = funnelAds.reduce((sum, ad) => sum + ad.spend, 0);
      const revenue = funnelAds.reduce((sum, ad) => sum + ad.revenue, 0);
      const sales = funnelAds.reduce((sum, ad) => sum + ad.sales, 0);
      const ic = funnelAds.reduce((sum, ad) => sum + ad.ic, 0);
      return {
        code,
        spend,
        revenue,
        sales,
        ic,
        cpa: sales > 0 ? spend / sales : null,
        roas: spend > 0 ? revenue / spend : null,
        ads: [...funnelAds].sort((a, b) => b.spend - a.spend).slice(0, 10),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));
}

function isValidFunnelAnalysis(text: string, funnels: FunnelSummary[]): boolean {
  if (!text.trim() || text.length > 12_000) return false;
  if (
    /\b(?:we need|need to|the user|let me|let's|must not|final answer|reasoning|provided precomputed|now wording)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return funnels.every((funnel) => new RegExp(`\\b${funnel.code}\\b`, 'i').test(text));
}

function buildDeterministicFunnelAnalysis(
  funnels: FunnelSummary[],
  currency: string,
  minRoas: number,
): string {
  return funnels
    .map((funnel) => {
      const best = [...funnel.ads]
        .filter((ad) => ad.sales > 0)
        .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.revenue - a.revenue)[0];
      const noSale = [...funnel.ads]
        .filter((ad) => ad.sales === 0 && ad.spend > 0)
        .sort((a, b) => b.spend - a.spend)
        .slice(0, best ? 2 : 3);
      const comparison =
        funnel.roas !== null && funnel.roas >= minRoas
          ? `acima da meta de ${formatNumber(minRoas)}`
          : `abaixo da meta de ${formatNumber(minRoas)}`;
      const evidence: string[] = [];
      if (best) {
        evidence.push(
          `O melhor resultado veio de ${shortAdName(best.name)}, com ${best.sales} ${
            best.sales === 1 ? 'venda' : 'vendas'
          } e ROAS ${formatNumber(best.roas)}.`,
        );
      }
      if (noSale.length > 0) {
        evidence.push(
          `${noSale
            .map((ad) => `${shortAdName(ad.name)} (${money(ad.spend, currency)})`)
            .join(' e ')} concentraram investimento sem vendas.`,
        );
      }
      if (!best && funnel.spend < 100) {
        evidence.push('A amostra ainda é pequena para uma conclusão mais firme.');
      }

      return `${funnel.code}
➡️ Investimento: ${money(funnel.spend, currency)}
➡️ Faturamento: ${money(funnel.revenue, currency)}
➡️ Vendas: ${funnel.sales}
➡️ CPA: ${money(funnel.cpa, currency)}
➡️ IC: ${funnel.ic}
✅ ROAS: ${formatNumber(funnel.roas)}

Análise: O funil está ${comparison}. ${evidence.join(' ')}`.trim();
    })
    .join('\n\n');
}

function shortAdName(name: string): string {
  const bracketed = /^\s*(\[[^\]]+\])/.exec(name)?.[1];
  return bracketed ?? name.slice(0, 80);
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

function formatReport(args: {
  offer: Offer;
  responsible: string;
  date: string;
  time: string;
  currency: string;
  metrics: IntradaySummary['overall'];
  funnels: FunnelSummary[];
  observation: string;
}): string {
  if (args.funnels.length > 0) {
    return `🟡 [${args.offer.name} {${args.date} ${args.time}} — ANÁLISE POR FUNIL] 🟡

Responsável: ${args.responsible || 'Não informado'}

${args.observation}`;
  }
  return `🟡 [${args.offer.name} {${args.date} ${args.time}} — ATUALIZAÇÃO] 🟡

Responsável: ${args.responsible || 'Não informado'}

➡️ GASTO: ${money(args.metrics.spend, args.currency)}
➡️ FATURAMENTO: ${money(args.metrics.revenue, args.currency)}
➡️ VENDAS: ${args.metrics.sales}

✅ ROAS: ${formatNumber(args.metrics.roas)}

OBS: ${args.observation}`;
}

function zonedDate(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('day')}/${get('month')}`, time: `${get('hour')}:${get('minute')}` };
}

function money(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ');
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export { OPENCODE_MODELS } from './campaign-ai-provider.js';
