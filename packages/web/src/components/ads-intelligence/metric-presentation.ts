export function sourceAccountLabel(
  sources: Array<{ platform?: string; account_id?: string | null; account_name?: string | null }>,
) {
  const accounts = new Map<string, string>();
  let unknown = false;
  for (const source of sources) {
    const identity = source.account_id;
    if (identity)
      accounts.set(
        `${source.platform || 'unknown'}:${identity}`,
        source.account_name || source.account_id!,
      );
    else unknown = true;
  }
  const label =
    accounts.size > 1
      ? `${accounts.size} contas de anúncios`
      : accounts.size === 1
        ? `Conta: ${[...accounts.values()][0]}`
        : 'Conta não informada';
  return unknown && accounts.size ? `${label} + conta não informada` : label;
}

export function importErrorPresentation(state: string, error: string) {
  const legacyPartial =
    state === 'partial' &&
    error ===
      'Cobertura parcial: contas com falha estão identificadas. ROAS/ROI indisponíveis até reparar as lacunas.';
  return {
    message: legacyPartial
      ? 'Cobertura parcial: ROAS/ROI calculados com os custos conhecidos e a receita atribuída; contas com lacunas permanecem indisponíveis.'
      : error,
    warning: legacyPartial,
  };
}

export function metricPresentation(key: string, value: number | null, hidden = false) {
  if (hidden) return { tone: 'text-foreground', cue: '', description: 'Valor oculto' };
  if (value == null || !Number.isFinite(value))
    return { tone: 'text-muted-foreground', cue: '', description: 'Dado indisponível' };
  if (key === 'roas' || key === 'roi') {
    const threshold = key === 'roas' ? 1 : 0;
    const rule = key === 'roas' ? 'Equilíbrio de mídia: ROAS 1×.' : 'Equilíbrio de mídia: ROI 0%.';
    if (value > threshold)
      return {
        tone: 'text-[var(--ads-positive)]',
        cue: '▲',
        description: `Acima do equilíbrio de mídia. ${rule}`,
      };
    if (value < threshold)
      return {
        tone: 'text-[var(--ads-negative)]',
        cue: '▼',
        description: `Abaixo do equilíbrio de mídia. ${rule}`,
      };
    return {
      tone: 'text-[var(--ads-cost)]',
      cue: '=',
      description: `No equilíbrio de mídia. ${rule}`,
    };
  }
  if (key === 'spend' || key === 'cpc' || key === 'cpm')
    return {
      tone: value > 0 ? 'text-[var(--ads-cost)]' : 'text-muted-foreground',
      cue: '',
      description: 'Custo de mídia; a cor não indica desempenho',
    };
  if (key === 'revenue')
    return {
      tone: value > 0 ? 'text-[var(--ads-positive)]' : 'text-muted-foreground',
      cue: '',
      description: 'Faturamento bruto registrado no TMX; não representa lucro líquido',
    };
  if (key === 'ctr' || key === 'hook_rate')
    return {
      tone: 'text-[var(--ads-info)]',
      cue: '',
      description: 'Taxa informativa; sem classificação de desempenho',
    };
  return { tone: 'text-foreground', cue: '', description: '' };
}
