import { conversionRate } from '@page-cloner/shared/traffic-campaigns-model';
import type { AiData } from './ai-preview-model.js';
import type { authorizedAiContext } from './ai-preview-access.js';
import { learnedPatterns } from './ai-optimization-learning.js';

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);

export function questionScope(question: string, now = new Date()) {
  const text = normalize(question), today = day(now);
  const [year, month] = today.split('-').map(Number);
  const current = today.slice(0, 7) + '-01';
  const previous = new Date(Date.UTC(year!, month! - 2, 1)).toISOString().slice(0, 10);
  const lastMonth = /mes passado|ultimo mes/.test(text);
  const thisMonth = /este mes|esse mes|mes atual/.test(text);
  const days = text.match(/ultimos? (\d{1,3}) dias?/);
  let from: string, to = today;
  if (lastMonth) { from = previous; if (!thisMonth && !/hoje/.test(text)) to = shift(current, -1); }
  else if (thisMonth) from = current;
  else if (days && Number(days[1]) >= 1 && Number(days[1]) <= 365) from = shift(today, 1 - Number(days[1]));
  else if (/anteontem/.test(text)) from = to = shift(today, -2);
  else if (/ontem/.test(text)) from = to = shift(today, -1);
  else if (/hoje/.test(text)) from = today;
  else return undefined;
  return { from, to, offer: '', query: '', level: 'campaigns' as const };
}

type Context = ReturnType<typeof authorizedAiContext>;
const internal = new Set(['fees', 'penalties', 'reserve', 'finalResult', 'afterMedia']);
const permittedMetrics = (metrics: object | null) => metrics === null ? null :
  Object.fromEntries(Object.entries(metrics).filter(([key]) => !internal.has(key)));

export function questionContext(raw: AiData, context: Context, question: string, now = new Date()) {
  const text = normalize(question);
  const reversalsOnly = /reembolso|refund|chargeback/.test(text) && !/campanha|anuncio|\bads?\b|roas|cpa|investimento|faturamento|vendas|upsell/.test(text);
  const target = /dolar|\busd\b|us\$/.test(text) ? 'USD' : 'BRL';
  const today = day(now), current = today.slice(0, 7) + '-01';
  const [year, month] = today.split('-').map(Number);
  const previous = new Date(Date.UTC(year!, month! - 2, 1)).toISOString().slice(0, 10);
  const allowed = new Set(context.offers.map(o => o.id));
  const rows = context.availableAreas.reversals ? raw.reversals.filter(r => allowed.has(r.offer_id) &&
    r.date && r.date >= context.scope.from && r.date <= context.scope.to) : [];
  const quotes = new Map<string, { rate: number; fetchedAt: string }>();
  function rate(currency: string) {
    if (currency === target) return 1;
    const source = currency === 'BRL' ? { rate: 1, fetchedAt: '' } : raw.exchangeRates?.[currency];
    const destination = target === 'BRL' ? { rate: 1, fetchedAt: '' } : raw.exchangeRates?.[target];
    if (source && destination) {
      const quote = { rate: source.rate / destination.rate, fetchedAt: [source.fetchedAt, destination.fetchedAt].filter(Boolean).sort()[0] ?? '' };
      quotes.set(currency, quote);
      return quote.rate;
    }
    const value = conversionRate(raw.snapshot, currency, target, today);
    if (value !== null) quotes.set(currency, { rate: value, fetchedAt: raw.snapshot.fx?.fetchedAt ?? '' });
    return value;
  }
  function summarize(from: string, to: string, kind: 'refund' | 'chargeback' | 'all') {
    const selected = rows.filter(r => (kind === 'all' || r.kind === kind) && r.date! >= from && r.date! <= to);
    let amount = 0, count = 0;
    const missing = new Set<string>();
    for (const row of selected) {
      count += row.count;
      const quote = rate(row.currency), minor = row.amount_minor === null ? null : Number(row.amount_minor);
      if (quote === null || minor === null || !Number.isSafeInteger(minor)) missing.add(row.currency);
      else amount += minor * quote;
    }
    const days = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
    const complete = from >= context.scope.from && to <= context.scope.to && days > 0 && context.availableAreas.reversals;
    const amountMinor = complete && !missing.size && Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
    return { from, to, days, complete, count: complete ? count : null, amountMinor,
      averageDailyCount: complete ? count / days : null,
      averageDailyAmountMinor: amountMinor === null ? null : amountMinor / days,
      missingCurrencies: [...missing] };
  }
  const reversalAnalysis = context.availableAreas.reversals ? {
    currency: target, unit: 'minor units (100 = 1 monetary unit)',
    reportingDate: today, timeZone: 'America/Sao_Paulo',
    interpretation: 'Na visão geral TMX, devoluções incluem reembolsos e chargebacks. Para uma pergunta geral sobre a média de reembolsos, apresente combined com o rótulo "reembolsos e chargebacks", identificando a composição. Só restrinja a refund ou chargeback quando solicitado explicitamente. Datas fetchedAt são instantes UTC: hoje é reportingDate no fuso informado, não o dia UTC da coleta.',
    basis: 'Todos os reembolsos autorizados somados após conversão pela cotação armazenada atual; não é taxa histórica de cada venda. Dias sem registros entram no divisor. Hoje é parcial e não entra na média dos dias completos.',
    combined: { previousMonth: summarize(previous, shift(current, -1), 'all'),
      currentMonthClosedDays: summarize(current, shift(today, -1), 'all'),
      today: summarize(today, today, 'all'), period: summarize(context.scope.from, context.scope.to, 'all') },
    refund: { previousMonth: summarize(previous, shift(current, -1), 'refund'),
      currentMonthClosedDays: summarize(current, shift(today, -1), 'refund'),
      today: summarize(today, today, 'refund'), period: summarize(context.scope.from, context.scope.to, 'refund') },
    chargeback: { previousMonth: summarize(previous, shift(current, -1), 'chargeback'),
      currentMonthClosedDays: summarize(current, shift(today, -1), 'chargeback'),
      today: summarize(today, today, 'chargeback'), period: summarize(context.scope.from, context.scope.to, 'chargeback') },
    daily: [...new Set(rows.map(r => r.date!))].sort().map(date => ({ date, refund: summarize(date, date, 'refund'), chargeback: summarize(date, date, 'chargeback') })),
    undatedExcludedCount: raw.reversals.filter(r => allowed.has(r.offer_id) && r.date === null).reduce((n,r) => n+r.count, 0),
    quotes: Object.fromEntries(quotes),
  } : null;
  const cleanRows = context.rows.map(r => ({ ...r, metrics: permittedMetrics(r.metrics) }));
  const metricColumns = [...new Set(cleanRows.flatMap(r => Object.keys(r.metrics ?? {})))];
  return {
    ...context,
    learning: undefined,
    learnedPatterns: reversalsOnly ? [] : learnedPatterns(context.learning),
    learningPolicy: 'Use learnedPatterns como experiência acumulada da empresa para fundamentar recomendações da oferta correspondente. Informe casos favoráveis e contrários; amostra insuficiente não valida uma regra. Não afirme treinamento dos pesos, aprendizado fora do TMX ou resultados ainda não observados.',
    rows: reversalsOnly ? [] : cleanRows.map(r => ({ ...r, metrics: r.metrics === null ? null : metricColumns.map(key => r.metrics![key] ?? null) })),
    metricColumns: reversalsOnly ? [] : metricColumns,
    metricEncoding: 'Each metrics array follows metricColumns, exactly; null means unavailable, never zero.',
    totals: reversalsOnly ? null : permittedMetrics(context.totals),
    sales: reversalsOnly ? [] : context.sales,
    reversals: [], undatedReversals: [], reversalAnalysis,
    history: reversalsOnly ? [] : context.history.map(e => ({ ...e, beforeMetrics: permittedMetrics(e.beforeMetrics), afterMetrics: permittedMetrics(e.afterMetrics) })),
    warnings: [...context.warnings, 'Use reversalAnalysis para o total geral convertido; não apresente moedas originais como análises separadas. Cotação ausente deixa o valor consolidado indisponível, nunca zero.',
      ...(reversalsOnly ? ['Pergunta sobre devoluções: métricas Meta, vendas e otimizações foram omitidas por irrelevância; isso não altera as permissões.'] : [])],
  };
}
