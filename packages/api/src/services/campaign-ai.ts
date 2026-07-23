import type { Offer } from '@page-cloner/shared';
import { ulid } from 'ulid';
import type { IntradaySummary } from './intraday-store.js';
import type { OfferAiAnalysisRecord, OfferAiSecretConfig } from './offer-store.js';

export const OPENCODE_MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash · recomendado e econômico' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · análise avançada' },
  { id: 'kimi-k2.6', label: 'Kimi K2.6 · análise detalhada' },
  { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code · raciocínio avançado' },
  { id: 'kimi-k3', label: 'Kimi K3 · alta capacidade' },
  { id: 'glm-5.2', label: 'GLM 5.2 · análise avançada' },
  { id: 'grok-4.5', label: 'Grok 4.5 · alta capacidade' },
  { id: 'mimo-v2.5', label: 'MiMo V2.5 · mais econômico' },
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
  const observation = await callOpenCode(args.config, prompt);
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

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

async function callOpenCode(config: OfferAiSecretConfig, prompt: string): Promise<string> {
  const selected = OPENCODE_MODELS.find((model) => model.id === config.model);
  if (!selected) throw new Error(`Modelo OpenCode Go não suportado: ${config.model}.`);
  const url = 'https://opencode.ai/zen/go/v1/chat/completions';
  const requestBody = JSON.stringify({
    model: config.model,
    max_tokens: 3_000,
    messages: [
      { role: 'system', content: config.role },
      { role: 'user', content: prompt },
    ],
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: requestBody,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return finalizeWithMimo(
        config,
        prompt,
        'O modelo principal excedeu o tempo limite antes de produzir um rascunho.',
      );
    }
    throw new Error(
      `Não foi possível conectar à OpenCode: ${error instanceof Error ? error.message : 'falha de rede'}.`,
    );
  }

  const responseText = await response.text();
  const payload = safeJsonObject(responseText);
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'object' && payload.error
        ? String((payload.error as Record<string, unknown>).message ?? '')
        : typeof payload?.message === 'string'
          ? payload.message
          : responseText.trim().slice(0, 300);
    throw new Error(
      `${providerStatusMessage(response.status)}${detail ? ` Detalhe: ${detail}` : ''}`,
    );
  }
  const direct = extractContentText(payload?.output_text);
  if (direct) return direct;
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const messageContent = extractContentText(message?.content);
  if (messageContent) return messageContent;
  const choiceText = extractContentText(firstChoice?.text);
  if (choiceText) return choiceText;
  const reasoningContent = extractContentText(
    message?.reasoning_content ?? message?.reasoning ?? firstChoice?.reasoning_content,
  );
  const finishReason = extractContentText(firstChoice?.finish_reason);
  if (reasoningContent && finishReason === 'length') {
    return finalizeWithMimo(config, prompt, reasoningContent);
  }
  const rootContent = extractContentText(payload?.content);
  if (rootContent) return rootContent;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = extractContentText((item as Record<string, unknown>).content);
    if (content) return content;
  }
  throw new Error(
    `O OpenCode respondeu sem um texto de análise${
      finishReason ? ` (finalização: ${finishReason})` : ''
    }. Tente novamente ou selecione outro modelo do OpenCode Go.`,
  );
}

async function finalizeWithMimo(
  config: OfferAiSecretConfig,
  originalPrompt: string,
  reasoning: string,
): Promise<string> {
  const compactPrompt =
    originalPrompt.length <= 30_000
      ? originalPrompt
      : `${originalPrompt.slice(0, 10_000)}

[contexto intermediário resumido para reduzir latência]

${originalPrompt.slice(-20_000)}`;
  const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mimo-v2.5',
      max_tokens: 1_600,
      messages: [
        {
          role: 'system',
          content:
            'Você é um editor de relatórios de tráfego. Responda somente com o relatório final em português do Brasil. Não mostre raciocínio, planejamento ou cálculos intermediários.',
        },
        {
          role: 'user',
          content: `INSTRUÇÕES E DADOS ORIGINAIS
${compactPrompt}

RASCUNHO INTERNO DO PRIMEIRO MODELO
${reasoning.slice(0, 12_000)}

Transforme o conteúdo acima no relatório final solicitado. Preserve exatamente os números fornecidos e não acrescente explicações sobre esta tarefa.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const responseText = await response.text();
  const payload = safeJsonObject(responseText);
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'object' && payload.error
        ? String((payload.error as Record<string, unknown>).message ?? '')
        : responseText.trim().slice(0, 300);
    throw new Error(
      `A OpenCode não conseguiu finalizar a análise (${response.status})${
        detail ? `: ${detail}` : '.'
      }`,
    );
  }
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const text =
    extractContentText(message?.content) ||
    extractContentText(firstChoice?.text) ||
    extractContentText(payload?.content);
  if (text) return text;
  throw new Error('A OpenCode concluiu o processamento, mas não gerou o relatório final.');
}

function extractContentText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => extractContentText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!value || typeof value !== 'object') return '';
  const object = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'value', 'output_text']) {
    const text = extractContentText(object[key]);
    if (text) return text;
  }
  return '';
}

function safeJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function providerStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'A OpenCode recusou a chave API. Confira a chave salva e a conta utilizada.';
  }
  if (status === 402) {
    return 'A conta OpenCode está sem créditos ou com a cobrança pendente.';
  }
  if (status === 404) {
    return 'O modelo selecionado não está disponível na OpenCode.';
  }
  if (status === 429) {
    return 'A OpenCode atingiu o limite de requisições. Aguarde alguns instantes.';
  }
  if (status >= 500) {
    return `A OpenCode está temporariamente indisponível (HTTP ${status}).`;
  }
  return `A OpenCode recusou a análise (HTTP ${status}).`;
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
