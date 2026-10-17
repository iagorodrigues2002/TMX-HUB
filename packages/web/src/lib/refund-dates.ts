const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function formatRefundDate(value: string | null | undefined, hidden: boolean) {
  if (hidden) return '****';
  if (!value || !Number.isFinite(Date.parse(value))) return 'Não identificada';
  return dateFormatter.format(new Date(value));
}

export function formatRefundElapsed(
  purchase: string | null | undefined,
  reversal: string | null | undefined,
  hidden: boolean,
) {
  if (hidden) return '****';
  if (!purchase || !reversal) return 'Sem datas suficientes';
  const elapsed = Date.parse(reversal) - Date.parse(purchase);
  if (!Number.isFinite(elapsed)) return 'Sem datas suficientes';
  if (elapsed < 0) return 'Datas inconsistentes';
  if (elapsed === 0) return 'Mesmo instante registrado';
  if (elapsed < 86400000) return 'Menos de 1 dia';
  const days = elapsed / 86400000;
  return `${days.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${days === 1 ? 'dia' : 'dias'}`;
}
