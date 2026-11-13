export interface BudgetFx {
  id: string;
  fetchedAt: string;
  quotedAt: string;
  rates: Record<string, number>;
}
export function convertBudget(minor: number, from: string, to: string, quote: BudgetFx): number {
  const source = quote.rates[from];
  const target = quote.rates[to];
  if (!Number.isSafeInteger(minor) || minor < 0 || !source || !target || !Number.isFinite(source / target))
    throw Error('Cotação ou orçamento inválido.');
  const result = Math.round(minor * source / target);
  if (!Number.isSafeInteger(result)) throw Error('Orçamento fora do limite.');
  return result;
}
export const freshBudgetFx = (quote: BudgetFx) =>
  Date.now() - Date.parse(quote.fetchedAt) < 120000 && Date.parse(quote.fetchedAt) <= Date.now() + 5000;
