'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UpsellStageKey } from '@/lib/api-client';
import { Module } from './module';
import { renderUpsellIdentityFilters } from './render-upsell-identity-filters';
import { renderUpsellStages } from './render-upsell-stages';
import type { TrackingContentContext } from './tracking-content-context';
import { upsellStageLabel } from './tracking-helpers';
import { UPSELL_STAGE_OPTIONS } from './tracking-helpers';
export function renderUpsells(context: TrackingContentContext) {
  const {
    editingUpsellStageId,
    upsellStageKey,
    setUpsellStageKey,
    setUpsellStageName,
    configuredUpsellStages,
    upsellStageName,
    formId,
    upsellConnectionDestinations,
    setUpsellConnectionDestinations,
    vendepayConnections,
    canManage,
    saveUpsellStage,
    setEditingUpsellStageId,
    setUpsellDestination,
    upsellIntelligence,
  } = context;
  return (
    <Module
      title="Upsell Intelligence"
      description="Monitore cada página pelo script e configure os destinos de recuperação por gateway."
    >
      <div className="mb-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-4 text-sm leading-6 text-emerald-50/75">
        <p className="font-semibold text-emerald-200">Modo somente script</p>
        <p>
          Mantenha os links atuais do funil no gateway. Cadastre abaixo a URL que ele já abre e
          instale o script gerado nessa página. O TMX captura a visita, o identificador disponível e
          cruza tudo com os webhooks automaticamente.
        </p>
      </div>
      <div className="min-w-0 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.045] p-4 [&_input]:min-w-0 [&_input]:text-base sm:[&_input]:text-sm">
        <p className="hud-label text-cyan-200">Configurar etapa</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            aria-label="Etapa do upsell"
            disabled={Boolean(editingUpsellStageId)}
            className="h-11 w-full min-w-0 rounded-md border border-white/[0.1] bg-black/30 px-3 text-base text-white outline-none focus:border-cyan-300/40 sm:text-sm"
            value={upsellStageKey}
            onChange={(event) => {
              const value = event.target.value as UpsellStageKey;
              setUpsellStageKey(value);
              setUpsellStageName(upsellStageLabel(value));
            }}
          >
            {UPSELL_STAGE_OPTIONS.map((stageKey) => (
              <option
                key={stageKey}
                value={stageKey}
                disabled={configuredUpsellStages.has(stageKey)}
              >
                {upsellStageLabel(stageKey)}{' '}
                {configuredUpsellStages.has(stageKey) ? '— já cadastrado' : ''}
              </option>
            ))}
          </select>
          <Input
            aria-label="Nome da etapa de upsell"
            value={upsellStageName}
            onChange={(event) => setUpsellStageName(event.target.value)}
            placeholder="Nome da etapa"
          />
        </div>
        <div className="mt-4 rounded-lg border border-white/10 p-3">
          <p className="text-xs font-semibold text-white/75">URL desta etapa por gateway</p>
          <p className="mt-1 text-xs text-white/45">
            Cada compra usa somente a URL do seu gateway. Na SyzePay, o TMX confirma a sessão antes
            de liberar o link.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {(['vendepay', 'syzepay', 'paysight', 'explodely'] as const).map((gateway) => (
              <label
                key={gateway}
                htmlFor={`${formId}-upsell-${gateway}`}
                className="text-xs text-white/65"
              >
                {
                  {
                    vendepay: 'VendePay (padrão)',
                    syzepay: 'SyzePay',
                    paysight: 'Paysight',
                    explodely: 'Explodely',
                  }[gateway]
                }
                <Input
                  id={`${formId}-upsell-${gateway}`}
                  aria-label={`URL de upsell ${gateway}`}
                  value={upsellConnectionDestinations[`gateway:${gateway}`] ?? ''}
                  onChange={(e) =>
                    setUpsellConnectionDestinations((current) => {
                      const next = { ...current };
                      if (e.target.value.trim()) next[`gateway:${gateway}`] = e.target.value.trim();
                      else delete next[`gateway:${gateway}`];
                      return next;
                    })
                  }
                  placeholder="https://sua-pagina-de-upsell/"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/40">
            Paysight e Explodely: cadastro de destino disponível; recuperação autenticada depende do
            contrato de cada gateway.
          </p>
        </div>
        {vendepayConnections.length > 0 && (
          <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/20 p-3">
            <p className="text-xs font-semibold text-white/75">Links por conta VendePay</p>
            <p className="mt-1 text-[11px] leading-5 text-white/40">
              O TMX identifica a conta da compra aprovada pelo vendaId e abre automaticamente o
              destino configurado para essa conta. Contas sem URL não serão consideradas elegíveis.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {vendepayConnections.map((connection) => (
                <label
                  key={connection.id}
                  className="block min-w-0 break-words"
                  htmlFor={`upsell-destination-${connection.id}`}
                >
                  <span className="mb-1.5 block text-xs text-cyan-100/70">{connection.name}</span>
                  <Input
                    id={`upsell-destination-${connection.id}`}
                    aria-label={`Link de upsell para ${connection.name}`}
                    value={upsellConnectionDestinations[connection.id] ?? ''}
                    onChange={(event) =>
                      setUpsellConnectionDestinations((current) => {
                        const next = { ...current };
                        const value = event.target.value.trim();
                        if (value) next[connection.id] = value;
                        else delete next[connection.id];
                        return next;
                      })
                    }
                    placeholder={`URL usada pela ${connection.name}`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        {canManage && (
          <Button
            className="mt-3 h-auto min-h-11 w-full whitespace-normal sm:w-auto"
            disabled={
              upsellStageName.trim().length < 2 ||
              !Object.values(upsellConnectionDestinations).some((url) => url.startsWith('http')) ||
              (!editingUpsellStageId && configuredUpsellStages.has(upsellStageKey)) ||
              saveUpsellStage.isPending
            }
            onClick={() => saveUpsellStage.mutate()}
          >
            {saveUpsellStage.isPending
              ? 'Salvando…'
              : editingUpsellStageId
                ? 'Salvar alterações desta etapa'
                : 'Salvar e gerar script'}
          </Button>
        )}
        {editingUpsellStageId && (
          <Button
            className="mt-3 min-h-11 w-full sm:ml-2 sm:w-auto"
            variant="outline"
            onClick={() => {
              setEditingUpsellStageId('');
              setUpsellDestination('');
              setUpsellConnectionDestinations({});
            }}
          >
            Cancelar edição
          </Button>
        )}
      </div>

      {renderUpsellStages(context)}
      {!upsellIntelligence.isLoading && !upsellIntelligence.data?.stages.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/[0.1] p-5 text-sm text-white/45">
          Cadastre a URL que a Vendepay já abre para gerar o script de monitoramento.
        </p>
      )}
      <div className="mt-5 rounded-xl border border-white/[0.08] p-4 text-xs leading-6 text-white/50">
        <p className="font-semibold text-white/75">Marcação recomendada dos botões</p>
        <code className="mt-2 block overflow-x-auto text-cyan-100/75">
          {'<a data-tmx-upsell-accept href="...">Sim, quero adicionar</a>'}
        </code>
        <code className="block overflow-x-auto text-cyan-100/75">
          {'<a data-tmx-upsell-decline href="...">Não, obrigado</a>'}
        </code>
        <p className="mt-2">
          O script detecta botões automaticamente, captura scroll, saída, erros e o vendid quando
          ele estiver exposto na URL, página ou armazenamento do navegador. O Connect Rate é
          calculado pela página carregada dividida pelos compradores da etapa anterior.
        </p>
      </div>
      {renderUpsellIdentityFilters(context)}
    </Module>
  );
}
