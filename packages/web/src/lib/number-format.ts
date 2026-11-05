const currencies = new Map<string, Intl.NumberFormat>();
const integer = new Intl.NumberFormat('pt-BR');

export function formatCurrency(n: number | null | undefined, currency = 'BRL'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  let formatter = currencies.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
    if (currencies.size >= 32) currencies.clear();
    currencies.set(currency, formatter);
  }
  return formatter.format(n);
}

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return integer.format(Math.round(n));
}
