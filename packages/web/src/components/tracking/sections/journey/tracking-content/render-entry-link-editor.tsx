'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderEntryLinkActions } from './render-entry-link-actions';
import type { useEntryLinkActions } from './use-entry-link-actions';
import type { useFormState } from './use-form-state';
export function renderEntryLinkEditor({
  link,
  editingEntryLinkId,
  editingEntryLinkName,
  setEditingEntryLinkName,
  editingEntryDestination,
  setEditingEntryDestination,
  editingEntryTrafficSource,
  setEditingEntryTrafficSource,
  updateEntryLink,
  setEditingEntryLinkId,
  convertingEntryLinkId,
  entryAbName,
  setEntryAbName,
  entryAbDestinationA,
  setEntryAbDestinationA,
  entryAbDestinationB,
  setEntryAbDestinationB,
  entryAbTrafficA,
  setEntryAbTrafficA,
  convertEntryLinkToAb,
  setConvertingEntryLinkId,
  canManage,
  removeEntryLink,
}: {
  link: {
    id: string;
    name: string;
    slug: string;
    destination_url: string;
    traffic_source:
      | 'meta'
      | 'google'
      | 'tiktok'
      | 'native'
      | 'organic'
      | 'email'
      | 'other'
      | 'unknown';
    ab_test_id?: string;
    tracking_url: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  };
  editingEntryLinkId: ReturnType<typeof useFormState>['editingEntryLinkId'];
  editingEntryLinkName: ReturnType<typeof useFormState>['editingEntryLinkName'];
  setEditingEntryLinkName: ReturnType<typeof useFormState>['setEditingEntryLinkName'];
  editingEntryDestination: ReturnType<typeof useFormState>['editingEntryDestination'];
  setEditingEntryDestination: ReturnType<typeof useFormState>['setEditingEntryDestination'];
  editingEntryTrafficSource: ReturnType<typeof useFormState>['editingEntryTrafficSource'];
  setEditingEntryTrafficSource: ReturnType<typeof useFormState>['setEditingEntryTrafficSource'];
  updateEntryLink: ReturnType<typeof useEntryLinkActions>['updateEntryLink'];
  setEditingEntryLinkId: ReturnType<typeof useFormState>['setEditingEntryLinkId'];
  convertingEntryLinkId: ReturnType<typeof useFormState>['convertingEntryLinkId'];
  entryAbName: ReturnType<typeof useFormState>['entryAbName'];
  setEntryAbName: ReturnType<typeof useFormState>['setEntryAbName'];
  entryAbDestinationA: ReturnType<typeof useFormState>['entryAbDestinationA'];
  setEntryAbDestinationA: ReturnType<typeof useFormState>['setEntryAbDestinationA'];
  entryAbDestinationB: ReturnType<typeof useFormState>['entryAbDestinationB'];
  setEntryAbDestinationB: ReturnType<typeof useFormState>['setEntryAbDestinationB'];
  entryAbTrafficA: ReturnType<typeof useFormState>['entryAbTrafficA'];
  setEntryAbTrafficA: ReturnType<typeof useFormState>['setEntryAbTrafficA'];
  convertEntryLinkToAb: ReturnType<typeof useEntryLinkActions>['convertEntryLinkToAb'];
  setConvertingEntryLinkId: ReturnType<typeof useFormState>['setConvertingEntryLinkId'];
  canManage: boolean;
  removeEntryLink: ReturnType<typeof useEntryLinkActions>['removeEntryLink'];
}) {
  return (
    <div key={link.id} className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-white/85">{link.name}</p>
          <p className="mt-1 truncate text-xs text-white/40">Destino: {link.destination_url}</p>
          <p className="mt-1 text-xs text-cyan-200/70">
            Fonte: {link.traffic_source === 'unknown' ? 'não classificada' : link.traffic_source}
          </p>
        </div>
        <span className="text-xs text-emerald-300">
          {link.ab_test_id ? 'Teste A/B ativo' : 'Destino único'}
        </span>
      </div>
      {editingEntryLinkId === link.id && (
        <div className="mt-3 grid gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.03] p-3 md:grid-cols-2">
          <Input
            value={editingEntryLinkName}
            onChange={(event) => setEditingEntryLinkName(event.target.value)}
            placeholder="Nome do link"
          />
          <Input
            value={editingEntryDestination}
            onChange={(event) => setEditingEntryDestination(event.target.value)}
            placeholder="Novo destino"
          />
          <label className="text-xs text-white/60">
            Fonte de tráfego
            <select
              value={editingEntryTrafficSource}
              onChange={(event) =>
                setEditingEntryTrafficSource(event.target.value as typeof editingEntryTrafficSource)
              }
              className="mt-2 h-10 w-full rounded-md border border-white/[0.1] bg-[#06131d] px-3 text-sm text-white"
            >
              <option value="meta">Meta / Facebook</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="native">Native Ads</option>
              <option value="organic">Orgânico</option>
              <option value="email">E-mail</option>
              <option value="other">Outra fonte</option>
              <option value="unknown">Não classificada</option>
            </select>
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              size="sm"
              disabled={
                editingEntryLinkName.trim().length < 2 ||
                !editingEntryDestination.startsWith('http') ||
                updateEntryLink.isPending
              }
              onClick={() => updateEntryLink.mutate()}
            >
              Salvar sem mudar a URL TMX
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingEntryLinkId('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {convertingEntryLinkId === link.id && (
        <div className="mt-3 grid gap-2 rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.03] p-3 md:grid-cols-2">
          <Input
            className="md:col-span-2"
            value={entryAbName}
            onChange={(event) => setEntryAbName(event.target.value)}
            placeholder="Nome do teste A/B"
          />
          <Input
            value={entryAbDestinationA}
            onChange={(event) => setEntryAbDestinationA(event.target.value)}
            placeholder="Destino A"
          />
          <Input
            value={entryAbDestinationB}
            onChange={(event) => setEntryAbDestinationB(event.target.value)}
            placeholder="Destino B"
          />
          <label className="text-xs text-white/60 md:col-span-2">
            Tráfego do destino A: {entryAbTrafficA}%
            <input
              className="mt-2 w-full accent-fuchsia-300"
              type="range"
              min="10"
              max="90"
              step="5"
              value={entryAbTrafficA}
              onChange={(event) => setEntryAbTrafficA(event.target.value)}
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              size="sm"
              disabled={
                entryAbName.trim().length < 2 ||
                !entryAbDestinationA.startsWith('http') ||
                !entryAbDestinationB.startsWith('http') ||
                convertEntryLinkToAb.isPending
              }
              onClick={() => convertEntryLinkToAb.mutate()}
            >
              Ativar A/B nesta mesma URL
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConvertingEntryLinkId('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-lg bg-black/20 p-3 text-xs text-cyan-100/75">
        {link.tracking_url}
      </code>
      {renderEntryLinkActions({
        link,
        canManage,
        setConvertingEntryLinkId,
        setEditingEntryLinkId,
        setEditingEntryLinkName,
        setEditingEntryDestination,
        setEditingEntryTrafficSource,
        setEntryAbName,
        setEntryAbDestinationA,
        setEntryAbDestinationB,
        removeEntryLink,
      })}
    </div>
  );
}
