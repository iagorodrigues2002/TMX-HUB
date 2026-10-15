export function safeUpsellDestination(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('URL do upsell inválida. A página não foi aberta.');
  }
  return url.toString();
}

export function auditMoney(minor: number | null, currency: string | null, isPrivate: boolean): string {
  if (isPrivate) return '****';
  if (minor === null || currency === null || !Number.isFinite(minor)) return 'Não disponível';
  try { return new Intl.NumberFormat('pt-BR', {style: 'currency', currency}).format(minor / 100); }
  catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}
