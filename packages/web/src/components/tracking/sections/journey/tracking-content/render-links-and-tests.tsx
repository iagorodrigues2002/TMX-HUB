'use client';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { AbTestCard } from './ab-test-card';
import { Module } from './module';
import { renderEntryLinks } from './render-entry-links';
import type { TrackingContentContext } from './tracking-content-context';
export function renderLinksAndTests(context: TrackingContentContext) {
  const {
    section,
    canManage,
    entryLinkName,
    setEntryLinkName,
    entryDestination,
    setEntryDestination,
    entryTrafficSource,
    setEntryTrafficSource,
    createEntryLink,
    advanced,
    testName,
    setTestName,
    kind,
    setKind,
    trafficA,
    setTrafficA,
    armA,
    setArmA,
    armB,
    setArmB,
    destinationA,
    setDestinationA,
    destinationB,
    setDestinationB,
    createTest,
    offerId,
    trackingFrom,
    trackingTo,
    refresh,
  } = context;
  return (
    <Module
      title={section === 'links' ? 'Links de entrada' : 'Testes A/B'}
      description={
        section === 'links'
          ? 'Registre o clique antes do redirecionamento e preserve a origem até a compra.'
          : 'Divida o tráfego entre variantes e compare conversão e receita.'
      }
    >
      {section === 'links' && (
        <div className="mb-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
          <p className="hud-label text-emerald-200">Connect Rate · 100% TMX</p>
          <h3 className="mt-2 text-base font-semibold text-white">Link de entrada do anúncio</h3>
          <p className="mt-2 text-xs leading-5 text-white/55">
            Use este link como destino no anúncio. O TMX registra o clique antes do
            redirecionamento, preserva todos os parâmetros e confirma a conexão quando o script
            envia o PageView.
          </p>
          {canManage && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <FormField
                id="entry-link-name"
                label="Nome do link"
                error={
                  entryLinkName && entryLinkName.trim().length < 2
                    ? 'Use pelo menos dois caracteres.'
                    : undefined
                }
              >
                <Input
                  value={entryLinkName}
                  onChange={(event) => setEntryLinkName(event.target.value)}
                  placeholder="Ex.: Entrada PJR"
                />
              </FormField>
              <FormField
                id="entry-link-destination"
                label="Destino da landing page"
                error={
                  entryDestination && !entryDestination.startsWith('http')
                    ? 'Informe uma URL completa iniciada por http:// ou https://.'
                    : undefined
                }
              >
                <Input
                  value={entryDestination}
                  onChange={(event) => setEntryDestination(event.target.value)}
                  placeholder="https://..."
                />
              </FormField>
              <label className="text-xs text-white/60">
                Fonte de tráfego deste link
                <select
                  value={entryTrafficSource}
                  onChange={(event) =>
                    setEntryTrafficSource(event.target.value as typeof entryTrafficSource)
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
                </select>
              </label>
              <Button
                className="md:col-span-2"
                disabled={
                  entryLinkName.trim().length < 2 ||
                  !entryDestination.startsWith('http') ||
                  createEntryLink.isPending
                }
                onClick={() => createEntryLink.mutate()}
              >
                Criar link de entrada
              </Button>
            </div>
          )}
          {renderEntryLinks(context)}
        </div>
      )}
      {section === 'ab' && canManage && (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            className="md:col-span-2"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Nome do teste"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-10 rounded-md border border-white/[0.1] bg-[#06131d] px-3 text-sm text-white"
          >
            <option value="checkout">No checkout</option>
            <option value="presell">Na presell</option>
          </select>
          <label className="text-xs text-white/65">
            Tráfego da variante A: {trafficA}%
            <input
              className="mt-3 w-full accent-cyan-300"
              type="range"
              min="10"
              max="90"
              step="5"
              value={trafficA}
              onChange={(event) => setTrafficA(event.target.value)}
            />
          </label>
          <Input value={armA} onChange={(e) => setArmA(e.target.value)} placeholder="Braço A" />
          <Input value={armB} onChange={(e) => setArmB(e.target.value)} placeholder="Braço B" />
          <Input
            value={destinationA}
            onChange={(event) => setDestinationA(event.target.value)}
            placeholder="URL de destino da variante A"
          />
          <Input
            value={destinationB}
            onChange={(event) => setDestinationB(event.target.value)}
            placeholder="URL de destino da variante B"
          />
          <div className="md:col-span-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-xs leading-5 text-white/65">
            Cada visitante permanece na mesma variante. O TMX troca o destino dos botões de
            checkout, preserva UTMs e <code className="text-cyan-200">src</code>, e mede visitantes,
            checkouts, compras e receita.
          </div>
          <Button
            className="md:col-span-2"
            disabled={
              !testName.trim() ||
              !destinationA.startsWith('http') ||
              !destinationB.startsWith('http') ||
              createTest.isPending
            }
            onClick={() => createTest.mutate()}
          >
            Criar e ativar teste
          </Button>
        </div>
      )}
      {section === 'ab' && (
        <div className="mt-5 space-y-2">
          {advanced.data?.ab_tests?.map((test) => (
            <AbTestCard
              key={test.id}
              offerId={offerId}
              from={trackingFrom}
              to={trackingTo}
              test={test}
              canManage={canManage}
              onUpdated={() => void refresh()}
            />
          ))}
        </div>
      )}
    </Module>
  );
}
