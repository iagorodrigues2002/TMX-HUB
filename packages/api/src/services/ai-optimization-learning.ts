import { assignedOffer } from '@page-cloner/shared/traffic-campaigns-model';
import type { AiData } from './ai-preview-model.js';
import { buildAiContext } from './ai-preview-model.js';

type Observation = NonNullable<AiData['learning']>[number];
export function learnOptimizationOutcomes(data: AiData, now = new Date()): Observation[] {
  const observedDay = data.snapshot.fetchedAt.slice(0, 10);
  const events = buildAiContext(data, { from: data.snapshot.from, to: data.snapshot.to, offer: '', query: '', level: 'campaigns' }).history;
  return events.flatMap(event => {
    const before = event.beforeMetrics, after = event.afterMetrics;
    const maturedAt = Date.parse(event.at) + 4 * 86400000;
    if (!before || !after || maturedAt > now.getTime() || observedDay < new Date(maturedAt).toISOString().slice(0,10) || data.snapshot.failures.length) return [];
    const label = assignedOffer({ id: event.itemId, name: event.name }, data.classification.campaigns);
    const offerId = data.classification.links[label] ?? data.offers.find(o => o.name.toUpperCase() === label.toUpperCase())?.id;
    if (!offerId || !data.offers.some(o => o.id === offerId) || before.metaRoas === null || after.metaRoas === null ||
      before.spend === null || after.spend === null || before.spend <= 0 || after.spend <= 0) return [];
    const action = event.before.status !== event.after.status
      ? event.after.status === 'ACTIVE' ? 'activate' : event.after.status === 'PAUSED' ? 'pause' : null
      : event.before.budget !== null && event.after.budget !== null && event.after.budget !== event.before.budget
        ? event.after.budget > event.before.budget ? 'increase_budget' : 'decrease_budget' : null;
    if (!action) return [];
    return [{ eventId: event.id, offerId, action, at: event.at, observedAt: data.snapshot.fetchedAt,
      beforeRoas: before.metaRoas, afterRoas: after.metaRoas, beforeSpend: before.spend, afterSpend: after.spend }];
  });
}

export function learnedPatterns(observations: Observation[]) {
  const groups = new Map<string, { offerId: string; action: string; cases: number; improved: number; worsened: number; deltaSum: number; lastObservedAt: string }>();
  for (const value of new Map(observations.map(o => [o.eventId, o])).values()) {
    const key = JSON.stringify([value.offerId, value.action]);
    const group = groups.get(key) ?? { offerId: value.offerId, action: value.action, cases: 0, improved: 0, worsened: 0, deltaSum: 0, lastObservedAt: '' };
    const delta = value.afterRoas - value.beforeRoas;
    group.cases++; group.improved += Number(delta > 0); group.worsened += Number(delta < 0); group.deltaSum += delta;
    group.lastObservedAt = [group.lastObservedAt, value.observedAt].sort().at(-1)!;
    groups.set(key, group);
  }
  return [...groups.values()].map(({ deltaSum, ...g }) => ({ ...g, averageRoasChange: deltaSum / g.cases,
    evidence: g.cases < 3 ? 'insufficient_sample' : 'observational_pattern',
    caution: 'Comparação de 3 dias antes/depois, exclui o dia da mudança. Associação observada, sem prova de causalidade; não é regra automática.' }));
}
