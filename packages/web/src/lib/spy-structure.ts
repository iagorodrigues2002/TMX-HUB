import { z } from 'zod';
export const structureRecord = z.object({
  status: z.literal('complete'),
  companyId: z.string().uuid(),
  offerId: z.string(),
  version: z.literal('spy-structure-v1'),
  assetKey: z.string(),
  ads: z.array(z.string()).length(1),
  at: z.string(),
  costMicros: z.number(),
  costReserved: z.boolean(),
  audio: z
    .object({
      kind: z.string(),
      description: z.string(),
      musicStyle: z.string(),
      hook: z.string(),
      ending: z.string(),
      fingerprint: z.string(),
    })
    .nullable(),
  result: z.object({
    hookType: z.string(),
    hook: z.string(),
    endingType: z.string(),
    ending: z.string(),
    trophy: z.string(),
    trophyDescription: z.string(),
    limitations: z.array(z.string()),
  }),
});
export type StructureRecord = z.infer<typeof structureRecord>;
export type StructureAd = {
  id: string;
  name: string;
  available: boolean;
  video?: boolean;
  saved?: StructureRecord;
};
export const structureLabels: Record<string, string> = {
  presenter: 'Pessoa falando',
  demonstration: 'Demonstração',
  text: 'Texto na tela',
  question: 'Pergunta',
  result: 'Resultado',
  story: 'História',
  other: 'Outro',
  uncertain: 'Não conclusivo',
  trophy: 'Troféu',
  cta: 'Chamada para ação',
  product: 'Produto',
  gold_cup: 'Taça dourada',
  silver_cup: 'Taça prateada',
  crystal: 'Cristal',
  plaque: 'Placa / prêmio',
  medal: 'Medalha',
  none: 'Nenhum',
  electronic: 'Eletrônica',
  orchestral: 'Orquestral',
  pop: 'Pop',
  acoustic: 'Acústica',
  ambient: 'Ambiente',
  percussion: 'Percussão',
  speech: 'Fala',
  speech_music: 'Fala e música',
  music: 'Música',
  silence: 'Silêncio',
};
export function structureGroups(
  ads: StructureAd[],
  field: 'hookType' | 'endingType' | 'trophy' | 'musicStyle' | 'audio',
) {
  const groups = new Map<string, string[]>();
  for (const ad of new Map(ads.map((a) => [a.id, a])).values()) {
    const r = ad.saved;
    if (!r) continue;
    const value =
      field === 'audio'
        ? r.audio?.kind === 'music'
          ? r.audio.fingerprint
          : undefined
        : field === 'musicStyle'
          ? r.audio?.musicStyle
          : r.result[field];
    if (!value || value === 'none' || value === 'uncertain') continue;
    groups.set(value, [...(groups.get(value) ?? []), ad.id]);
  }
  return [...groups]
    .map(([key, ids]) => ({ key, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}
