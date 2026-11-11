export const creativeStatuses = [
  'Testando',
  'Em teste',
  'Validado',
  'Não validado',
  'Stand by',
] as const;
export type CreativeStatus = (typeof creativeStatuses)[number];
export const CREATIVE_HISTORY_START = '2026-08-01';
export const isFinalCreativeStatus = (status?: CreativeStatus | null) =>
  status === 'Validado' || status === 'Não validado';
export const creativeFallbackKey = (name: string, offer: string, batch: string) =>
  `unmatched:${JSON.stringify([creativeOffer(offer), batch, name.replace(/\.mp4$/i, '')])}`;
export function creativeOffer(value: string) {
  const code = value
    .replace(/^\s*\[MX\]\s*[-–—]?\s*/i, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return code === 'SLMD' ? 'SLM_DE' : code;
}
export function creativeIdentity(name: string, offer: string, ...context: string[]) {
  const code = creativeOffer(offer);
  const prefix = /^([A-Z]{2,10}[_ -](?:ENG|ESP|DE|FR|EN|ES|IT|PT|BR))(?=[_\s-])/i.exec(name)?.[1];
  if (prefix && creativeOffer(prefix) !== code) return null;
  const ads = [
    ...new Set(
      [...name.matchAll(/(?:^|[^A-Z0-9])(?:AD|RIPADO)[\s_-]*0*(\d+)(?=$|[^0-9])/gi)].map((m) =>
        Number(m[1]),
      ),
    ),
  ];
  const batches = [
    ...new Set(
      [
        ...`${name} ${context.join(' ')}`.matchAll(
          /(?:^|[^A-Z0-9])(?:LEVA|L)[\s_#-]*0*(\d+)(?=$|[^0-9])/gi,
        ),
      ].map((m) => Number(m[1])),
    ),
  ];
  if (
    ads.length !== 1 ||
    batches.length > 1 ||
    ![...ads, ...batches].every(Number.isSafeInteger) ||
    !/^[A-Z0-9_]{1,80}$/.test(code)
  )
    return null;
  const ad = ads[0]!;
  const batch = batches[0] ?? null;
  const bodyHook = /(?:^|[^A-Z0-9])B(\d+)[ _-]+H(\d+)(?=$|[^A-Z0-9])/i.exec(name);
  const variant = bodyHook ? `B${bodyHook[1]}_H${bodyHook[2]}` : '';
  const key = `${code}:AD${ad}:L${batch ?? 'PENDING'}${variant ? `:${variant}` : ''}`;
  return {
    key,
    offer: code,
    ad,
    batch,
    variant,
    name: `${code}_AD${String(ad).padStart(2, '0')}_${batch === null ? 'LEVA_PENDENTE' : `L${batch}`}${variant ? `_${variant}` : ''}`,
  };
}
