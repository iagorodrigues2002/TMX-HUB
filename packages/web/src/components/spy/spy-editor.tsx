'use client';
import { Button } from '@/components/ui/button';
import { ExternalLink, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  type LinkKind,
  type SpyOffer,
  funnelTypes,
  markets,
  niches,
  safeSpyUrl,
  spyStageOptions,
  validateSpyOffer,
} from './spy-model';
import { SpySelect } from './spy-select';
import s from './spy.module.css';
function ExtraFields({
  label,
  values,
  onChange,
  type = 'url',
}: { label: string; values: string[]; onChange: (v: string[]) => void; type?: 'text' | 'url' }) {
  const [rows, setRows] = useState(() =>
    (values.length ? values : ['']).map((value) => ({ id: crypto.randomUUID(), value })),
  );
  const update = (next: typeof rows) => {
    setRows(next);
    onChange(next.map((r) => r.value).filter((v) => v.trim()));
  };
  return (
    <fieldset className={s.linkFields}>
      <legend>{label}</legend>
      {rows.map((row, i) => (
        <div className={s.linkRow} key={row.id}>
          <input
            aria-label={`${label} ${i + 1}`}
            type={type}
            value={row.value}
            placeholder={type === 'url' ? 'https://…' : 'oferta.com'}
            onChange={(e) =>
              update(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))
            }
          />
          {safeSpyUrl(row.value) && (
            <a
              href={safeSpyUrl(row.value)!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${label} ${i + 1}`}
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            type="button"
            aria-label={`Remover ${label} ${i + 1}`}
            onClick={() => update(rows.filter((r) => r.id !== row.id))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => setRows((v) => [...v, { id: crypto.randomUUID(), value: '' }])}
      >
        <Plus size={14} />
        Adicionar {label}
      </Button>
    </fieldset>
  );
}
export function SpyEditor({
  offer,
  onSave,
  onCancel,
  owners = [],
  ownersError = false,
}: {
  offer: SpyOffer;
  onSave: (o: SpyOffer) => void;
  onCancel: () => void;
  owners?: { id: string; name: string }[];
  ownersError?: boolean;
}) {
  const [draft, setDraft] = useState<SpyOffer>({
    ...offer,
    owner:
      offer.owner || owners.find((u) => u.name.trim().toLowerCase() === 'douglas riti')?.name || '',
    ownerId: offer.ownerId ?? owners.find((u) => u.name === offer.owner)?.id,
    funnelType: offer.funnelType ?? 'Não informado',
  });
  const [error, setError] = useState('');
  const [folder, setFolder] = useState(offer.links.find((l) => l.kind === 'folder')?.url ?? '');
  const field = <K extends keyof SpyOffer>(key: K, value: SpyOffer[K]) =>
    setDraft((v) => ({ ...v, [key]: value }));
  const links = (kind: LinkKind, values: string[]) =>
    field('links', [
      ...draft.links.filter((l) => l.kind !== kind),
      ...values.map((url, i) => ({ kind, label: `${kind} ${i + 1}`, url: url.trim() })),
    ]);
  const salesKind: LinkKind =
    draft.funnelType === 'Quiz' ? 'quiz' : draft.funnelType === 'TSL' ? 'tsl' : 'vsl';
  const groups: [LinkKind, string][] = [
    ['library', 'Library'],
    ['presell', 'Presell'],
    [
      salesKind,
      draft.funnelType === 'Quiz'
        ? 'Página do quiz'
        : draft.funnelType === 'TSL'
          ? 'Página da TSL'
          : 'Página da VSL',
    ],
    ['checkout', 'Checkout'],
  ];
  for (const kind of ['vsl', 'tsl', 'quiz'] as const)
    if (kind !== salesKind && draft.links.some((l) => l.kind === kind))
      groups.push([kind, `${kind.toUpperCase()} já cadastrada`]);
  return (
    <form
      className={s.editor}
      onSubmit={(e) => {
        e.preventDefault();
        const cleaned = {
          ...draft,
          driveNormalized: true,
          links: draft.links.filter((l) => l.kind !== 'folder'),
          domains: [...new Set(draft.domains.map((d) => d.trim()).filter(Boolean))],
        };
        if (folder.trim())
          cleaned.links.push({ kind: 'folder', label: 'Drive da oferta', url: folder.trim() });
        const issue = validateSpyOffer(cleaned);
        if (issue) {
          setError(issue);
          return;
        }
        onSave({
          ...cleaned,
          name: cleaned.name.trim(),
          links: cleaned.links.filter(
            (l, i, all) => all.findIndex((x) => x.kind === l.kind && x.url === l.url) === i,
          ),
        });
      }}
    >
      <div className={s.formGrid}>
        <label>
          Nome da oferta
          <input required value={draft.name} onChange={(e) => field('name', e.target.value)} />
        </label>
        <label htmlFor="spy-edit-niche">
          Nicho
          <SpySelect
            id="spy-edit-niche"
            label="Nicho"
            value={draft.niche}
            onChange={(v) => field('niche', v)}
            options={[{ value: '', label: 'Não classificado' }, ...niches]}
          />
        </label>
        <label htmlFor="spy-edit-funnel">
          Tipo de funil
          <SpySelect
            id="spy-edit-funnel"
            label="Tipo de funil"
            value={draft.funnelType ?? 'Não informado'}
            onChange={(v) => field('funnelType', v as SpyOffer['funnelType'])}
            options={[...funnelTypes]}
          />
        </label>
        <label htmlFor="spy-edit-owner">
          Responsável
          <SpySelect
            id="spy-edit-owner"
            label="Responsável"
            value={draft.ownerId ?? ''}
            onChange={(v) => {
              const selected = owners.find((u) => u.id === v);
              if (selected) setDraft((o) => ({ ...o, owner: selected.name, ownerId: selected.id }));
            }}
            options={[
              {
                value: '',
                label: draft.ownerId ? 'Selecionar usuário' : draft.owner || 'Selecionar usuário',
              },
              ...owners.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
          {ownersError && (
            <span role="alert">Não foi possível carregar os usuários cadastrados.</span>
          )}
        </label>
        <label htmlFor="spy-edit-market">
          Classificação
          <SpySelect
            id="spy-edit-market"
            label="Classificação"
            value={draft.market}
            onChange={(v) => field('market', v)}
            options={markets}
          />
        </label>
        <label htmlFor="spy-edit-stage">
          Etapa interna
          <SpySelect
            id="spy-edit-stage"
            label="Etapa interna"
            value={draft.stage}
            onChange={(v) => field('stage', v)}
            options={spyStageOptions}
          />
        </label>
        <label htmlFor="spy-edit-priority">
          Prioridade
          <SpySelect
            id="spy-edit-priority"
            label="Prioridade"
            value={draft.priority}
            onChange={(v) => field('priority', v)}
            options={['Normal', 'Alta', 'Baixa']}
          />
        </label>
      </div>
      <ExtraFields
        label="Domínio"
        values={draft.domains}
        type="text"
        onChange={(v) => field('domains', v)}
      />
      <p className={s.muted}>
        Use exemplo.com ou https://exemplo.com. Cada domínio gera seu próprio atalho da Library; o
        acompanhamento reúne os anúncios sem repetir IDs.
      </p>
      {groups.map(([kind, label]) => (
        <ExtraFields
          key={kind}
          label={label}
          values={draft.links.filter((l) => l.kind === kind).map((l) => l.url)}
          onChange={(v) => links(kind, v)}
        />
      ))}
      <section className={s.driveEditor}>
        <div className={s.sectionHeading}>
          <h3>
            <FolderOpen size={16} />
            Drive da oferta
          </h3>
          {safeSpyUrl(folder) && (
            <a href={safeSpyUrl(folder)!} target="_blank" rel="noopener noreferrer">
              Abrir Drive <ExternalLink size={14} />
            </a>
          )}
        </div>
        <label>
          Pasta única da oferta
          <input
            type="url"
            value={folder}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(e) => setFolder(e.target.value)}
          />
        </label>
        <p className={s.muted}>
          Salve os anúncios dentro desta pasta. VSL, TSL e quiz são links das páginas do funil.
        </p>
      </section>
      <label>
        Notas da pesquisa
        <textarea rows={3} value={draft.note} onChange={(e) => field('note', e.target.value)} />
      </label>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.actions}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Salvar oferta</Button>
      </div>
    </form>
  );
}
