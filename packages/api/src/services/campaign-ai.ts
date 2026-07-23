import type { Offer } from '@page-cloner/shared';
import { ulid } from 'ulid';
import type { IntradaySummary } from './intraday-store.js';
import type { OfferAiAnalysisRecord, OfferAiSecretConfig } from './offer-store.js';

export const OPENCODE_MODELS = [
  { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra · equilibrado', protocol: 'responses' },
  { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol · análise avançada', protocol: 'responses' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini · econômico', protocol: 'responses' },
  { id: 'gpt-5.4-nano', label: 'GPT 5.4 Nano · mais econômico', protocol: 'responses' },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash · econômico',
    protocol: 'chat',
  },
  { id: 'kimi-k2.6', label: 'Kimi K2.6 · análise detalhada', protocol: 'chat' },
  { id: 'grok-4.5', label: 'Grok 4.5 · análise avançada', protocol: 'chat' },
] as const;

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
  now?: Date;
}): Promise<OfferAiAnalysisRecord> {
  const now = args.now ?? new Date();
  const locale = zonedDate(now);
  const currency = args.offer.currency ?? 'BRL';
  const metrics = args.summary.overall;
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
  };
  const prompt = renderTemplate(args.config.template, values);
  const observation = await callOpenCode(args.config, prompt);
  const text = formatReport({
    offer: args.offer,
    responsible: args.config.responsible,
    date: locale.date,
    time: locale.time,
    currency,
    metrics,
    observation,
  });
  return {
    id: ulid(),
    offerId: args.offer.id,
    model: args.config.model,
    text,
    observation,
    createdAt: now.toISOString(),
  };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

async function callOpenCode(config: OfferAiSecretConfig, prompt: string): Promise<string> {
  const selected = OPENCODE_MODELS.find((model) => model.id === config.model);
  if (!selected) throw new Error(`Modelo OpenCode não suportado: ${config.model}.`);
  const isChat = selected.protocol === 'chat';
  const response = await fetch(
    isChat ? 'https://opencode.ai/zen/v1/chat/completions' : 'https://opencode.ai/zen/v1/responses',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        isChat
          ? {
              model: config.model,
              max_tokens: 700,
              messages: [
                { role: 'system', content: config.role },
                { role: 'user', content: prompt },
              ],
            }
          : {
              model: config.model,
              store: false,
              max_output_tokens: 700,
              input: [
                { role: 'system', content: config.role },
                { role: 'user', content: prompt },
              ],
            },
      ),
      signal: AbortSignal.timeout(45_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'object' && payload.error
        ? String((payload.error as Record<string, unknown>).message ?? '')
        : '';
    throw new Error(
      `OpenCode recusou a análise (${response.status})${detail ? `: ${detail}` : '.'}`,
    );
  }
  const direct = payload?.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  throw new Error('O OpenCode respondeu sem um texto de análise.');
}

function formatReport(args: {
  offer: Offer;
  responsible: string;
  date: string;
  time: string;
  currency: string;
  metrics: IntradaySummary['overall'];
  observation: string;
}): string {
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
