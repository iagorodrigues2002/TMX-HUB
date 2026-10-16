export type UpsellLastOpening = {
  operator_id: string;
  operator_name: string | null;
  opened_at: string;
};

export function upsellLastOpeningLabel(opening: UpsellLastOpening | null | undefined): string {
  if (!opening) return 'Sem clique registrado';
  const operator = opening.operator_name?.trim() || opening.operator_id;
  const date = new Date(opening.opened_at);
  const timestamp = Number.isNaN(date.getTime())
    ? 'horário indisponível'
    : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `Último clique: ${operator} · ${timestamp}`;
}

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
