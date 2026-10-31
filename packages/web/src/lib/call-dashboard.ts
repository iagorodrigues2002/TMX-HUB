export function callDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function callInputDate(value: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
  return parts.replace(' ', 'T');
}

export function callStartIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Data e horário inválidos');
  const date = new Date(`${value}:00-03:00`);
  if (!Number.isFinite(date.getTime()) || callInputDate(date.toISOString()) !== value)
    throw new Error('Data e horário inválidos');
  return date.toISOString();
}

export function reminderLabel(minutes: number) {
  return minutes === 0 ? 'No horário' : `${minutes} min antes`;
}

export function parseCallReminders(value: string) {
  if (!/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(value)) throw new Error('Lembretes inválidos');
  const minutes = value.split(',').map((part) => Number(part.trim()));
  if (
    minutes.length > 10 ||
    minutes.some((m) => m > 1440) ||
    new Set(minutes).size !== minutes.length
  )
    throw new Error('Lembretes inválidos');
  return minutes;
}
