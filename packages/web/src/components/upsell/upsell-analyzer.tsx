'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type CheckoutPlatform, PLATFORM_OPTIONS } from '@/lib/upsell/checkout-presets';
import { Plus, Save, Trash2, Upload } from 'lucide-react';
import { ResultsChart } from './results-chart';
import { ColumnMapper } from './upsell-analyzer-column-mapper';
import { FunnelRow } from './upsell-analyzer-funnel-row';
import { FilePicker } from './upsell-analyzer-support';
import { useUpsellAnalyzerState } from './upsell-analyzer-use-upsell-analyzer-state';

export function UpsellAnalyzer() {
  const {
    platform,
    setPlatform,
    frontSheet,
    upsellSheet,
    frontFileName,
    upsellFileName,
    frontCols,
    setFrontCols,
    upsellCols,
    setUpsellCols,
    frontConfig,
    setFrontConfig,
    steps,
    results,
    savedList,
    presetName,
    setPresetName,
    selectedPresetId,
    setSelectedPresetId,
    handleFile,
    canCalculate,
    handleCalculate,
    handleSavePreset,
    handleLoadPreset,
    handleDeletePreset,
    addStep,
    removeStep,
    updateStep,
  } = useUpsellAnalyzerState();

  return (
    <div className="space-y-6">
      {/* Section 1: Platform + Files */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">1 · Plataforma de checkout</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Selecione e suba os relatórios
          </h2>
        </header>

        <div className="space-y-2">
          <Label className="hud-label">Plataforma</Label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as CheckoutPlatform)}
            className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-white/40">
            Define os hints de auto-mapeamento das colunas e quais valores de status contam como
            "aprovado" para cada plataforma.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FilePicker
            label="Planilha Front (xlsx, xls, csv)"
            fileName={frontFileName}
            sheet={frontSheet}
            onFile={(f) => void handleFile('front', f)}
          />
          <FilePicker
            label="Planilha Upsell (única, com todos)"
            fileName={upsellFileName}
            sheet={upsellSheet}
            onFile={(f) => void handleFile('upsell', f)}
          />
        </div>
      </section>

      {/* Section 2: Column mapping */}
      {(frontSheet || upsellSheet) && (
        <section className="glass-card space-y-4 p-6">
          <header>
            <p className="hud-label">2 · Mapeamento de colunas</p>
            <h2 className="mt-1 text-[16px] font-semibold text-white">
              Ajuste se a auto-detecção errou
            </h2>
          </header>
          <div className="grid gap-6 md:grid-cols-2">
            <ColumnMapper
              title="Front"
              sheet={frontSheet}
              cols={frontCols}
              onChange={setFrontCols}
              showStatus={false}
              showDateTime
            />
            <ColumnMapper
              title="Upsell"
              sheet={upsellSheet}
              cols={upsellCols}
              onChange={setUpsellCols}
              showStatus
              showDateTime={false}
            />
          </div>
        </section>
      )}

      {/* Section 3: Funnel config */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">3 · Configuração do funil</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Defina produto + ofertas de cada etapa
          </h2>
        </header>

        <div className="space-y-2">
          <Label className="hud-label">
            Front · considerar vendas a partir de (HH:MM, opcional)
          </Label>
          <Input
            type="text"
            value={frontConfig.startTime ?? ''}
            placeholder="ex: 14:00"
            onChange={(e) => setFrontConfig({ ...frontConfig, startTime: e.target.value })}
            className="max-w-[200px]"
          />
          {frontConfig.startTime && !frontCols.dateTime && (
            <p className="text-[12px] text-amber-300">
              ⚠ Para usar filtro de horário, mapeie a coluna "Data/Hora" do Front acima.
            </p>
          )}
        </div>

        <FunnelRow
          step={frontConfig}
          onChange={(patch) => setFrontConfig({ ...frontConfig, ...patch })}
          tone="front"
        />

        {steps.map((step, i) => (
          <FunnelRow
            key={step.name}
            step={step}
            onChange={(patch) => updateStep(i, patch)}
            onRemove={steps.length > 1 ? () => removeStep(i) : undefined}
          />
        ))}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar upsell
          </Button>
          <Button type="button" onClick={handleCalculate} disabled={!canCalculate}>
            Calcular
          </Button>
        </div>
      </section>

      {/* Section 4: Results */}
      {results && (
        <section className="glass-card space-y-5 p-6">
          <header className="flex items-baseline justify-between">
            <div>
              <p className="hud-label">4 · Resultado</p>
              <h2 className="mt-1 text-[16px] font-semibold text-white">
                {results.eligibleCount.toLocaleString('pt-BR')} clientes elegíveis no Front
              </h2>
            </div>
            <span className="hud-label">As 3 taxas sempre somam 100%</span>
          </header>

          <ResultsChart results={results.steps} />

          <div className="overflow-x-auto rounded-md border border-white/[0.06]">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <tr>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Produto · Ofertas</th>
                  <th className="px-3 py-2 text-right">Aceite</th>
                  <th className="px-3 py-2 text-right">Rejeição</th>
                  <th className="px-3 py-2 text-right">Não viu</th>
                </tr>
              </thead>
              <tbody>
                {results.steps.map((s) => (
                  <tr key={s.name} className="border-t border-white/[0.04] text-white/75">
                    <td className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-white/90">
                      {s.name}
                    </td>
                    <td className="min-w-64 px-3 py-2 text-white/55">
                      {s.product || '*qualquer produto*'}
                      {s.offers.length > 0 && ` · ${s.offers.join(', ')}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {s.accepted} <span className="text-white/40">({s.rates.accepted}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-300">
                      {s.rejected} <span className="text-white/40">({s.rates.rejected}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-300">
                      {s.notSeen} <span className="text-white/40">({s.rates.notSeen}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 5: Presets */}
      <section className="glass-card space-y-3 p-6">
        <header>
          <p className="hud-label">Presets</p>
          <h2 className="mt-1 text-[14px] font-semibold text-white">Salvos no seu navegador</h2>
        </header>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Nome do preset (ex: Hotmart · Produto X · Fevereiro)"
          />
          <Button type="button" onClick={handleSavePreset} variant="outline" size="sm">
            <Save className="h-3.5 w-3.5" />
            Salvar atual
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
          >
            <option value="">— Selecione um preset salvo —</option>
            {savedList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.platform}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={handleLoadPreset}
            disabled={!selectedPresetId}
            variant="outline"
            size="sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Carregar
          </Button>
          <Button
            type="button"
            onClick={handleDeletePreset}
            disabled={!selectedPresetId}
            variant="ghost"
            size="sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </Button>
        </div>
        <p className="text-[11px] text-white/40">
          Presets guardam plataforma, mapeamento de colunas, configuração do front e dos upsells. Os
          arquivos das planilhas precisam ser carregados de novo a cada uso.
        </p>
      </section>
    </div>
  );
}
