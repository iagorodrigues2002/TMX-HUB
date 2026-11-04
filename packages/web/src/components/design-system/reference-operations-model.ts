export interface DemoOffer {
  id: string;
  name: string;
  status: 'Ativa' | 'Pausada';
  revenue: number;
  sales: number;
}

export const demoOffers: DemoOffer[] = [
  'Aurora',
  'Atlas',
  'Horizon',
  'Nexus',
  'Orbit',
  'Pulse',
  'Summit',
  'Vela',
  'Zenith',
  'Nova',
  'Astra',
  'Meridian',
].map((name, index) => ({
  id: `DEMO-${String(index + 1).padStart(3, '0')}`,
  name: index === 6 ? `${name} · campanha internacional com nome longo` : name,
  status: index % 4 === 0 ? 'Pausada' : 'Ativa',
  revenue: 970.35 + index * 173.21,
  sales: 8 + index * 3,
}));

export function offerPage(
  rows: DemoOffer[],
  query: string,
  status: string,
  sort: 'name' | 'revenue',
  descending: boolean,
  requestedPage: number,
) {
  const needle = query.trim().toLocaleLowerCase('pt-BR');
  const filtered = rows.filter(
    (row) =>
      (!needle || `${row.name} ${row.id}`.toLocaleLowerCase('pt-BR').includes(needle)) &&
      (status === 'Todas' || row.status === status),
  );
  filtered.sort(
    (first, second) =>
      (sort === 'name'
        ? first.name.localeCompare(second.name, 'pt-BR')
        : first.revenue - second.revenue) * (descending ? -1 : 1),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 5));
  const page = Math.max(1, Math.min(pages, requestedPage));
  return { rows: filtered.slice((page - 1) * 5, page * 5), page, pages, total: filtered.length };
}

export interface DemoForm {
  name: string;
  url: string;
  notes: string;
  from: string;
  to: string;
  currency: string;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateDemoForm(form: DemoForm) {
  const errors: Partial<Record<keyof DemoForm, string>> = {};
  if (form.name.trim().length < 2 || form.name.trim().length > 80)
    errors.name = 'Use entre 2 e 80 caracteres no nome.';
  if (form.url.trim()) {
    try {
      if (new URL(form.url).protocol !== 'https:')
        errors.url = 'Informe um endereço HTTPS completo.';
    } catch {
      errors.url = 'Informe um endereço HTTPS completo, como https://exemplo.com.';
    }
  }
  if (form.notes.length > 1000) errors.notes = 'Use até 1.000 caracteres.';
  if (!validDate(form.from) || !validDate(form.to) || form.from > form.to)
    errors.from = 'Informe um período válido com início anterior ou igual ao fim.';
  if (!['BRL', 'USD'].includes(form.currency)) errors.currency = 'Selecione BRL ou USD.';
  return errors;
}

export function validateDemoFile(file: { name: string; size: number } | null) {
  if (!file) return '';
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Escolha um arquivo .csv.';
  if (file.size <= 0 || file.size > 2 * 1024 * 1024) return 'Escolha um CSV não vazio de até 2 MB.';
  return '';
}

export type JobState = {
  phase: 'idle' | 'queued' | 'processing' | 'partial' | 'ready' | 'cancelled';
  progress: number;
  retry: boolean;
};
export const initialJob: JobState = { phase: 'idle', progress: 0, retry: false };
export function jobStep(
  state: JobState,
  event: 'start' | 'tick' | 'retry' | 'cancel' | 'reset',
): JobState {
  if (event === 'reset') return initialJob;
  if (event === 'cancel' && ['queued', 'processing'].includes(state.phase))
    return { ...state, phase: 'cancelled' };
  if (event === 'start' && ['idle', 'ready', 'cancelled'].includes(state.phase))
    return { phase: 'queued', progress: 0, retry: false };
  if (event === 'retry' && state.phase === 'partial')
    return { phase: 'queued', progress: 85, retry: true };
  if (event !== 'tick') return state;
  if (state.phase === 'queued') return { ...state, phase: 'processing' };
  if (state.phase !== 'processing') return state;
  const progress = Math.min(100, state.progress + 20);
  return {
    ...state,
    progress,
    phase: progress < 100 ? 'processing' : state.retry ? 'ready' : 'partial',
  };
}
