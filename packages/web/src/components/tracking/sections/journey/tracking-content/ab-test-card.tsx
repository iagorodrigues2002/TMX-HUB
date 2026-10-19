'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyText } from '@/lib/clipboard';
import { Pencil } from 'lucide-react';
import { renderAbTestMetrics } from './render-ab-test-metrics';
import { useAbTestCard } from './use-ab-test-card';
export function AbTestCard({
  offerId,
  from,
  to,
  test,
  canManage,
  onUpdated,
}: {
  offerId: string;
  from: string;
  to: string;
  test: {
    id: string;
    name: string;
    kind: 'checkout' | 'presell';
    status: string;
    traffic_a: number;
    redirect_url: string;
    winner_variant_id?: string;
    variants: Array<{
      id: string;
      label: string;
      destination_url?: string;
      position: number;
    }>;
  };
  canManage: boolean;
  onUpdated: () => void;
}) {
  const state0 = useAbTestCard({
    test: test,
    offerId: offerId,
    from: from,
    to: to,
    onUpdated: onUpdated,
  });
  const {
    editing,
    setEditing,
    editName,
    setEditName,
    editTrafficA,
    setEditTrafficA,
    editLabels,
    setEditLabels,
    editDestinations,
    setEditDestinations,
    metrics,
    control,
    remove,
    saveConfiguration,
  } = state0;

  return (
    <article className="rounded-2xl border border-cyan-100/[0.12] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            {test.kind} · {test.traffic_a}% / {100 - test.traffic_a}%
          </span>
          <p className="mt-1 text-base font-semibold text-white/90">{test.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={test.status === 'active' ? 'text-emerald-300' : 'text-white/55'}>
            {test.status === 'active' ? 'Em execução' : 'Pausado'}
          </span>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil className="h-3.5 w-3.5" /> {editing ? 'Cancelar' : 'Editar'}
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
          <p className="text-xs leading-5 text-cyan-100/70">
            O link TMX e as métricas existentes não mudam. Novos visitantes usarão a nova divisão;
            visitantes já atribuídos permanecem na variante original.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              aria-label="Nome do teste A/B"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Nome do teste"
            />
            <label className="text-xs text-white/55">
              Tráfego da variante A: {editTrafficA}%
              <input
                aria-label="Tráfego da variante A"
                className="mt-2 w-full accent-cyan-300"
                type="range"
                min="1"
                max="99"
                value={editTrafficA}
                onChange={(event) => setEditTrafficA(event.target.value)}
              />
            </label>
            {test.variants.map((variant, index) => (
              <div key={variant.id} className="space-y-2 rounded-lg border border-white/[0.07] p-3">
                <Input
                  aria-label={`Nome da variante ${index + 1}`}
                  value={editLabels[index] ?? ''}
                  onChange={(event) =>
                    setEditLabels((current) =>
                      current.map((value, item) => (item === index ? event.target.value : value)),
                    )
                  }
                  placeholder={`Variante ${index + 1}`}
                />
                <Input
                  aria-label={`URL da variante ${index + 1}`}
                  value={editDestinations[index] ?? ''}
                  onChange={(event) =>
                    setEditDestinations((current) =>
                      current.map((value, item) => (item === index ? event.target.value : value)),
                    )
                  }
                  placeholder="https://..."
                />
              </div>
            ))}
          </div>
          <Button
            className="mt-3 w-full"
            disabled={
              saveConfiguration.isPending ||
              editName.trim().length < 2 ||
              editLabels.some((label) => !label.trim()) ||
              editDestinations.some((url) => !url.startsWith('http'))
            }
            onClick={() => saveConfiguration.mutate()}
          >
            {saveConfiguration.isPending
              ? 'Salvando alterações…'
              : 'Salvar alterações do teste A/B'}
          </Button>
        </div>
      )}
      {renderAbTestMetrics({ test, metrics, canManage, control })}
      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
          Link do TMX para o botão de checkout
        </p>
        <code className="mt-2 block overflow-x-auto whitespace-nowrap text-xs text-white/70">
          {test.redirect_url}
        </code>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void copyText(test.redirect_url, 'Link do teste A/B copiado.')}
          >
            Copiar link
          </Button>
          {test.variants.map((variant) => (
            <Button key={variant.id} asChild size="sm" variant="outline">
              <a
                href={`${test.redirect_url}?tmx_preview=1&tmx_variant=${encodeURIComponent(variant.label)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Testar variante {variant.label}
              </a>
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/50">
          Cole esse endereço no CTA. O TMX mantém a variante do visitante, registra o checkout,
          preserva UTMs, adiciona o <code className="text-cyan-200">src</code> e redireciona para a
          Vendepay.
        </p>
      </div>
      {canManage && !test.winner_variant_id && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={control.isPending}
            onClick={() =>
              control.mutate({ action: test.status === 'active' ? 'pause' : 'resume' })
            }
          >
            {test.status === 'active' ? 'Pausar teste' : 'Retomar teste'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remover o teste A/B "${test.name}"?`)) remove.mutate();
            }}
          >
            Remover teste
          </Button>
        </div>
      )}
    </article>
  );
}
